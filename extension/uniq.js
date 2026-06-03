import {
  ALL_DUPLICATE_SCOPES,
  BULK_SIZE,
  KEY_ALL_TABS,
  KEY_CURRENT_HIERARCHY,
  KEY_EACH_HIERARCHY,
  KEY_IGNORE_BOUNDARIES,
  KEY_CLOSING,
  KEY_FAILURE_MESSAGE,
  KEY_PROGRESS,
  KEY_RESPECT_BOUNDARIES,
  KEY_SUCCESS_MESSAGE,
  KEY_TITLE,
  KEY_TOP_LEVEL_HIERARCHY,
  KEY_URL,
  KEY_URL_WITHOUT_HASH,
  NOTIFICATION_PERMISSION,
  NOTIFICATION_ID,
  NOTIFICATION_INTERVAL,
  debug,
  getTabGroupId,
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

function isSameHierarchy (tab, targetTab) {
  return getTabHierarchyKey(tab) === getTabHierarchyKey(targetTab)
}

function isSameGroup (tab, targetTab) {
  return isGroupedTab(tab) && isGroupedTab(targetTab) &&
    getTabGroupId(tab) === getTabGroupId(targetTab)
}

function isTopLevelHierarchyTab (tab, sourceTab) {
  if (tab.pinned) {
    return sourceTab.pinned
  }

  if (isGroupedTab(tab)) {
    return isSameGroup(tab, sourceTab)
  }

  return true
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

async function closeDuplicateTabs (windowId, keyGetter, scope, sourceTab,
  progress) {
  const allTabs = await tabs.query({ windowId })
  const tabList = filterTabsByScope(allTabs, scope, sourceTab)
  progress.all = tabList.length

  const plan = createDuplicatePlan(tabList, keyGetter, scope)
  const { removeIds } = plan

  progress.target = removeIds.length
  const removeIdSet = new Set(removeIds)
  for (let i = removeIds.length; i > 0; i -= BULK_SIZE) {
    const target = removeIds.slice(Math.max(0, i - BULK_SIZE), i)
    await keepActiveDuplicateIfPossible(windowId, target, plan, removeIdSet)

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

function getNotificationOptions (progress) {
  let message
  if (progress.error) {
    message = i18n.getMessage(KEY_FAILURE_MESSAGE, progress.error)
  } else if (progress.end) {
    const seconds = (progress.end - progress.start) / 1000
    message = i18n.getMessage(KEY_SUCCESS_MESSAGE,
      [seconds, progress.all, progress.done])
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

export async function run (windowId, keyType, closePinned, notification,
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

    const keyGetter = KEY_GETTERS[keyType]
    if (!keyGetter) {
      throw new Error('Unsupported keyType: ' + keyType)
    }

    const normalizedScope = normalizeScope(scope)
    if (!ALL_DUPLICATE_SCOPES.includes(normalizedScope) &&
        normalizedScope !== KEY_TOP_LEVEL_HIERARCHY) {
      throw new Error('Unsupported scope: ' + scope)
    }

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
