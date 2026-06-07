import {
  ALL_DUPLICATE_SCOPES,
  BULK_SIZE,
  KEY_ALL_TABS,
  KEY_CURRENT_HIERARCHY,
  KEY_EACH_HIERARCHY,
  KEY_IGNORE_BOUNDARIES,
  KEY_CLOSING,
  KEY_FAILURE_MESSAGE,
  KEY_GROUP_HIERARCHY_LABEL,
  KEY_GROUP_NUMBERED_HIERARCHY_LABEL,
  KEY_HIERARCHY_RESULT_HEADER,
  KEY_HIERARCHY_RESULT_LINE,
  KEY_PROGRESS,
  KEY_RESPECT_BOUNDARIES,
  KEY_SUCCESS_MESSAGE,
  KEY_TITLE,
  KEY_TOP_LEVEL_HIERARCHY,
  KEY_TOP_LEVEL_SCOPE,
  KEY_URL,
  KEY_URL_WITHOUT_HASH,
  NOTIFICATION_PERMISSION,
  NOTIFICATION_ID,
  NOTIFICATION_INTERVAL,
  debug,
  getTabHierarchy,
  getTabHierarchyKey,
  isGroupedTab,
  onError,
} from './common.js'

const {
  i18n,
  permissions,
  tabs,
} = browser

const KEY_GETTERS = {
  [KEY_URL]: (tab) => tab.url,
  [KEY_URL_WITHOUT_HASH]: (tab) => tab.url.split('#')[0],
  [KEY_TITLE]: (tab) => tab.title,
}

const LEGACY_SCOPE_MAP = {
  [KEY_RESPECT_BOUNDARIES]: KEY_EACH_HIERARCHY,
  [KEY_IGNORE_BOUNDARIES]: KEY_ALL_TABS,
}

function normalizeScope (scope) {
  return LEGACY_SCOPE_MAP[scope] || scope
}

function getKeyGetter (keyType) {
  const keyGetter = KEY_GETTERS[keyType]
  if (!keyGetter) {
    throw new Error('Unsupported keyType: ' + keyType)
  }
  return keyGetter
}

function getSupportedScope (scope) {
  const normalizedScope = normalizeScope(scope)
  if (!ALL_DUPLICATE_SCOPES.includes(normalizedScope) &&
      normalizedScope !== KEY_TOP_LEVEL_HIERARCHY) {
    throw new Error('Unsupported scope: ' + scope)
  }
  return normalizedScope
}

function isSameHierarchy (tab, targetTab) {
  return getTabHierarchyKey(tab) === getTabHierarchyKey(targetTab)
}

function isTopLevelHierarchyTab (tab) {
  return tab.pinned || !isGroupedTab(tab)
}

function getTabKey (tab, keyGetter, scope) {
  const key = keyGetter(tab)
  if (scope !== KEY_EACH_HIERARCHY) {
    return JSON.stringify([key])
  }

  return JSON.stringify([
    key,
    ...getTabHierarchy(tab),
  ])
}

function shouldPreferSurvivor (candidateTab, survivorTab) {
  return candidateTab.pinned && !survivorTab.pinned
}

function shouldKeepActiveDuplicate (activeTab, survivorTab) {
  return !(survivorTab.pinned && !activeTab.pinned)
}

async function activateBest (windowId, excludedIds) {
  const removeIdSet = new Set(excludedIds)
  const tabList = await tabs.query({ windowId })

  let activeTab
  let lastTab
  const keepTabs = []
  for (const tab of tabList) {
    const willRemove = removeIdSet.has(tab.id)

    if (tab.active) {
      if (!willRemove) {
        return
      }
      activeTab = tab
    }
    if (!lastTab || tab.index > lastTab.index) {
      lastTab = tab
    }
    if (!willRemove) {
      keepTabs.push(tab)
    }
  }

  if (!activeTab || !lastTab) {
    return
  }

  let nextTab
  let prevTab
  for (const tab of keepTabs) {
    if (tab.index < activeTab.index) {
      if (!prevTab || tab.index > prevTab.index) {
        prevTab = tab
      }
    } else if (!nextTab || tab.index < nextTab.index) {
      nextTab = tab
    }
  }

  const bestTab = nextTab || prevTab || lastTab
  if (bestTab === activeTab || activeTab.index + 1 === bestTab.index) {
    return
  }

  await tabs.update(bestTab.id, { active: true })
  debug('Activated tab ' + bestTab.id)
}

async function getActiveTabId (windowId) {
  const [activeTab] = await tabs.query({ windowId, active: true })
  return activeTab && activeTab.id
}

function createDuplicatePlan (tabList, keyGetter, scope) {
  const idToEntry = new Map()
  const keyToPlan = new Map()
  const removeIds = []

  for (const tab of tabList) {
    const key = getTabKey(tab, keyGetter, scope)
    const entry = { tab, key }
    let plan = keyToPlan.get(key)

    idToEntry.set(tab.id, entry)
    if (!plan) {
      plan = { key, survivorId: tab.id }
      keyToPlan.set(key, plan)
      continue
    }

    const survivorTab = idToEntry.get(plan.survivorId).tab
    if (shouldPreferSurvivor(tab, survivorTab)) {
      removeIds.push(plan.survivorId)
      plan.survivorId = tab.id
      continue
    }

    removeIds.push(tab.id)
  }

  return {
    idToEntry,
    keyToPlan,
    removeIds,
  }
}

async function keepActiveDuplicateIfPossible (windowId, target, plan,
  removeIdSet) {
  const activeTabId = await getActiveTabId(windowId)
  const targetIndex = target.indexOf(activeTabId)
  if (targetIndex < 0) {
    return
  }

  const activeEntry = plan.idToEntry.get(activeTabId)
  const duplicatePlan = activeEntry && plan.keyToPlan.get(activeEntry.key)
  const rival = plan.idToEntry.get(duplicatePlan?.survivorId)?.tab
  if (!activeEntry || !rival) {
    await activateBest(windowId, removeIdSet)
    return
  }

  if (!shouldKeepActiveDuplicate(activeEntry.tab, rival)) {
    await activateBest(windowId, removeIdSet)
    return
  }

  duplicatePlan.survivorId = activeTabId
  target[targetIndex] = rival.id
  removeIdSet.delete(activeTabId)
  removeIdSet.add(rival.id)
}

function filterTabsByScope (tabList, scope, sourceTab) {
  if (scope !== KEY_CURRENT_HIERARCHY &&
      scope !== KEY_TOP_LEVEL_HIERARCHY) {
    return tabList
  }

  if (!sourceTab) {
    throw new Error('sourceTab is required for hierarchy scope')
  }

  if (scope === KEY_TOP_LEVEL_HIERARCHY) {
    return tabList.filter((tab) => isTopLevelHierarchyTab(tab, sourceTab))
  }

  return tabList.filter((tab) => isSameHierarchy(tab, sourceTab))
}

function createHierarchyResults (tabList) {
  const resultByKey = new Map()
  const results = []
  let groupNumber = 0

  for (const tab of tabList) {
    const key = getTabHierarchyKey(tab)
    let result = resultByKey.get(key)
    if (!result) {
      const hierarchy = getTabHierarchy(tab)
      result = {
        all: 0,
        closed: 0,
        groupId: hierarchy[0] === 'group' ? hierarchy[1] : undefined,
        groupNumber: hierarchy[0] === 'group' ? ++groupNumber : undefined,
        key,
        order: results.length,
        type: hierarchy[0],
      }
      resultByKey.set(key, result)
      results.push(result)
    }
    result.all += 1
  }

  return {
    resultByKey,
    results: results.toSorted((left, right) => {
      if (left.type === 'topLevel') {
        return right.type === 'topLevel' ? 0 : -1
      }
      if (right.type === 'topLevel') {
        return 1
      }
      return left.order - right.order
    }),
  }
}

async function setGroupTitles (hierarchyResults) {
  if (typeof browser.tabGroups?.get !== 'function') {
    return
  }

  await Promise.all(hierarchyResults.
    filter((result) => result.groupId !== undefined).
    map(async (result) => {
      try {
        const group = await browser.tabGroups.get(result.groupId)
        const title = group?.title?.trim()
        if (title) {
          result.groupTitle = title
        }
      } catch {
        // Group names are optional in notifications; fall back to numbering.
      }
    }))
}

function countClosedByHierarchy (target, plan, hierarchyResultByKey) {
  for (const tabId of target) {
    const tab = plan.idToEntry.get(tabId)?.tab
    const result = tab && hierarchyResultByKey.get(getTabHierarchyKey(tab))
    if (result) {
      result.closed += 1
    }
  }
}

export function countDuplicateTabs (tabList, keyType,
  scope = KEY_EACH_HIERARCHY, sourceTab) {
  const keyGetter = getKeyGetter(keyType)
  const normalizedScope = getSupportedScope(scope)
  const targetTabs = filterTabsByScope(tabList, normalizedScope, sourceTab)
  return createDuplicatePlan(targetTabs, keyGetter, normalizedScope).
    removeIds.length
}

async function closeDuplicateTabs (windowId, keyGetter, scope, sourceTab,
  progress) {
  const allTabs = await tabs.query({ windowId })
  const tabList = filterTabsByScope(allTabs, scope, sourceTab)
  progress.all = tabList.length
  const { resultByKey, results } = createHierarchyResults(tabList)
  progress.hierarchyResults = results
  await setGroupTitles(results)

  const plan = createDuplicatePlan(tabList, keyGetter, scope)
  const { removeIds } = plan

  progress.target = removeIds.length
  const removeIdSet = new Set(removeIds)
  for (let i = removeIds.length; i > 0; i -= BULK_SIZE) {
    const target = removeIds.slice(Math.max(0, i - BULK_SIZE), i)
    await keepActiveDuplicateIfPossible(windowId, target, plan, removeIdSet)

    countClosedByHierarchy(target, plan, resultByKey)
    await tabs.remove(target)
    debug('Tabs' + target + ' were closed')
    progress.done += target.length
  }
}

function startProgressNotification (progress) {
  let timerId
  let stopped = false

  const tick = () => {
    timerId = setTimeout(() => {
      if (stopped || progress.end || progress.error) {
        return
      }
      tryNotify(progress).then((notified) => {
        if (notified && !stopped) {
          tick()
        }
      }).catch(onError)
    }, NOTIFICATION_INTERVAL)
  }

  tick()
  return () => {
    stopped = true
    globalThis.clearTimeout(timerId)
  }
}

function getHierarchyLabel (result) {
  if (result.type === 'topLevel') {
    return i18n.getMessage(KEY_TOP_LEVEL_SCOPE)
  }

  if (result.groupTitle) {
    return i18n.getMessage(KEY_GROUP_HIERARCHY_LABEL, result.groupTitle)
  }

  return i18n.getMessage(KEY_GROUP_NUMBERED_HIERARCHY_LABEL,
    result.groupNumber)
}

function getHierarchyResultMessage (hierarchyResults) {
  if (!hierarchyResults?.length) {
    return ''
  }

  const lines = hierarchyResults.
    filter((result) => result.closed > 0).
    map((result) => i18n.getMessage(
      KEY_HIERARCHY_RESULT_LINE,
      [getHierarchyLabel(result), result.all, result.closed],
    ))
  if (lines.length === 0) {
    return ''
  }

  return [
    i18n.getMessage(KEY_HIERARCHY_RESULT_HEADER),
    ...lines,
  ].join('\n')
}

function getNotificationOptions (progress) {
  let message
  if (progress.error) {
    message = i18n.getMessage(KEY_FAILURE_MESSAGE, progress.error)
  } else if (progress.end) {
    const seconds = (progress.end - progress.start) / 1000
    message = i18n.getMessage(KEY_SUCCESS_MESSAGE,
      [seconds, progress.all, progress.done])
    const hierarchyResultMessage =
      getHierarchyResultMessage(progress.hierarchyResults)
    if (hierarchyResultMessage) {
      message += '\n\n' + hierarchyResultMessage
    }
  } else if (progress.start && progress.target) {
    const seconds = (new Date() - progress.start) / 1000
    const percentage = Math.floor(progress.done * 100 / progress.target)
    message = i18n.getMessage(KEY_PROGRESS, [seconds, percentage])
  } else {
    message = i18n.getMessage(KEY_CLOSING)
  }
  return {
    type: 'basic',
    title: NOTIFICATION_ID,
    message,
  }
}

async function notify (progress) {
  const options = getNotificationOptions(progress)
  await browser.notifications.create(NOTIFICATION_ID, options)
}

async function tryNotify (progress) {
  try {
    await notify(progress)
    return true
  } catch (error) {
    onError(error)
    return false
  }
}

export async function run (windowId, keyType, notification,
  scope = KEY_EACH_HIERARCHY, sourceTab) {
  const progress = {
    done: 0,
  }
  let notifyEnabled = false
  let stopProgressNotification
  try {
    notifyEnabled = notification &&
      typeof browser.notifications?.create === 'function' &&
      await permissions.contains(NOTIFICATION_PERMISSION)
    if (notifyEnabled) {
      progress.start = new Date()
      stopProgressNotification = startProgressNotification(progress)
    }

    const keyGetter = getKeyGetter(keyType)
    const normalizedScope = getSupportedScope(scope)

    await closeDuplicateTabs(windowId, keyGetter, normalizedScope, sourceTab,
      progress)
    debug('Finished')

    if (notifyEnabled) {
      progress.end = new Date()
      stopProgressNotification?.()
      stopProgressNotification = undefined
      await tryNotify(progress)
    }
  } catch (e) {
    onError(e)
    if (notifyEnabled) {
      progress.error = e
      stopProgressNotification?.()
      stopProgressNotification = undefined
      await tryNotify(progress)
    }
  } finally {
    stopProgressNotification?.()
  }
}
