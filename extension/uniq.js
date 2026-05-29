import {
  ALL_MENU_MODES,
  BULK_SIZE,
  KEY_IGNORE_BOUNDARIES,
  KEY_CLOSING,
  KEY_FAILURE_MESSAGE,
  KEY_PROGRESS,
  KEY_RESPECT_BOUNDARIES,
  KEY_SUCCESS_MESSAGE,
  KEY_TITLE,
  KEY_URL,
  KEY_URL_WITHOUT_HASH,
  NOTIFICATION_PERMISSION,
  NOTIFICATION_ID,
  NOTIFICATION_INTERVAL,
  asleep,
  debug,
  onError,
} from './common.js'

const {
  i18n,
  notifications,
  permissions,
  tabs,
} = browser

const KEY_GETTERS = {
  [KEY_URL]: (tab) => tab.url,
  [KEY_URL_WITHOUT_HASH]: (tab) => tab.url.split('#')[0],
  [KEY_TITLE]: (tab) => tab.title,
}

function isSplitViewTab (tab) {
  return tab.splitViewId !== undefined &&
    tab.splitViewId !== (tabs.SPLIT_VIEW_ID_NONE ?? -1)
}

function canRemoveTab (tab, closePinned, respectBoundaries) {
  if (respectBoundaries && isSplitViewTab(tab)) {
    return false
  }
  return closePinned || !tab.pinned
}

function getTabKey (tab, keyGetter, respectBoundaries) {
  const key = keyGetter(tab)
  if (!respectBoundaries) {
    return JSON.stringify([key])
  }

  return JSON.stringify([
    key,
    tab.cookieStoreId ?? '',
    tab.groupId ?? (tabs.TAB_GROUP_ID_NONE ?? -1),
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

async function closeDuplicateTabs (windowId, keyGetter, closePinned,
  respectBoundaries, progress) {
  const tabList = await tabs.query({ windowId })
  progress.all = tabList.length

  const idToEntry = new Map()
  const keyToSurviveId = new Map()
  const removeIds = []
  for (const tab of tabList) {
    const key = getTabKey(tab, keyGetter, respectBoundaries)

    idToEntry.set(tab.id, { tab, key })
    if (!keyToSurviveId.has(key)) {
      keyToSurviveId.set(key, tab.id)
      continue
    }

    const rival = idToEntry.get(keyToSurviveId.get(key)).tab
    const canRemoveTabCurrent = canRemoveTab(tab, closePinned,
      respectBoundaries)
    const canRemoveTabRival = canRemoveTab(rival, closePinned,
      respectBoundaries)

    if (!canRemoveTabCurrent) {
      if (canRemoveTabRival) {
        keyToSurviveId.set(key, tab.id)
        removeIds.push(rival.id)
      }
      continue
    }

    if (!canRemoveTabRival) {
      removeIds.push(tab.id)
      continue
    }

    removeIds.push(tab.id)
  }

  progress.target = removeIds.length
  const removeIdSet = new Set(removeIds)
  for (let i = removeIds.length; i > 0; i -= BULK_SIZE) {
    const target = removeIds.slice(Math.max(0, i - BULK_SIZE), i)
    const activeTabId = await getActiveTabId(windowId)

    for (let j = 0; j < target.length; j++) {
      const id = target[j]
      if (id !== activeTabId) {
        continue
      }

      const entry = idToEntry.get(id)
      const rival = idToEntry.get(keyToSurviveId.get(entry.key))?.tab
      if (!rival) {
        break
      }

      if (canRemoveTab(rival, closePinned, respectBoundaries)) {
        keyToSurviveId.set(entry.key, id)
        target[j] = rival.id
        removeIdSet.delete(id)
        removeIdSet.add(rival.id)
        break
      }

      await activateBest(entry.tab.windowId, removeIdSet)
      break
    }

    await tabs.remove(target)
    debug('Tabs' + target + ' were closed')
    progress.done += target.length
  }
}

async function startProgressNotification (progress) {
  while (true) {
    await asleep(NOTIFICATION_INTERVAL)
    if (progress.end || progress.error) {
      break
    }
    await notify(progress)
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
  if (await notifications.update(NOTIFICATION_ID, options)) {
    return
  }
  await notifications.create(NOTIFICATION_ID, options)
}

export async function run (windowId, keyType, closePinned, notification,
  mode = KEY_RESPECT_BOUNDARIES) {
  const progress = {
    done: 0,
  }
  let notifyEnabled = false
  try {
    notifyEnabled = notification &&
      await permissions.contains(NOTIFICATION_PERMISSION)
    if (notifyEnabled) {
      await notify(progress)
      startProgressNotification(progress).catch(onError)
      progress.start = new Date()
    }

    const keyGetter = KEY_GETTERS[keyType]
    if (!keyGetter) {
      throw new Error('Unsupported keyType: ' + keyType)
    }
    if (!ALL_MENU_MODES.includes(mode)) {
      throw new Error('Unsupported mode: ' + mode)
    }

    const respectBoundaries = mode !== KEY_IGNORE_BOUNDARIES
    await closeDuplicateTabs(windowId, keyGetter, closePinned,
      respectBoundaries, progress)
    debug('Finished')

    if (notifyEnabled) {
      progress.end = new Date()
      await notify(progress)
    }
  } catch (e) {
    onError(e)
    if (notifyEnabled) {
      progress.error = e
      await notify(progress)
    }
  }
}
