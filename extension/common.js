const {
  i18n,
  storage,
  tabs,
} = browser

export const KEY_DEBUG = 'debug'
export const KEY_NAME = 'name'

export const KEY_TAB = 'tab'
export const KEY_ALL = 'all'

export const KEY_URL = 'url'
export const KEY_URL_WITHOUT_HASH = 'urlWithoutHash'
export const KEY_TITLE = 'title'
export const KEY_RESPECT_BOUNDARIES = 'respectBoundaries'
export const KEY_IGNORE_BOUNDARIES = 'ignoreBoundaries'
export const KEY_CURRENT_HIERARCHY = 'currentHierarchy'
export const KEY_TOP_LEVEL_HIERARCHY = 'topLevelHierarchy'
export const KEY_EACH_HIERARCHY = 'eachHierarchy'
export const KEY_ALL_TABS = 'allTabs'
export const KEY_TOP_LEVEL_SCOPE = 'topLevelScope'
export const KEY_GROUP_SCOPE = 'groupScope'
export const KEY_EACH_HIERARCHY_MENU = 'eachHierarchyMenu'
export const KEY_ALL_TABS_MENU = 'allTabsMenu'

export const KEY_UNIQ = 'uniq'
export const KEY_UNIQ_BY = 'uniqBy'
export const KEY_CONTEXTS = 'contexts'
export const KEY_MENU_ITEMS = 'menuItems'
export const KEY_HIERARCHY_DESCRIPTION = 'hierarchyDescription'
export const KEY_NOTIFICATION = 'notification'
export const KEY_FEEDBACK = 'feedback'
export const KEY_SETTINGS = 'settings'
export const KEY_SAVE_STATUS_FAILED = 'saveStatusFailed'
export const KEY_SAVE_STATUS_SAVED = 'saveStatusSaved'
export const KEY_SAVE_STATUS_SAVING = 'saveStatusSaving'
export const KEY_CLOSING = 'closing'
export const KEY_PROGRESS = 'progress'
export const KEY_SUCCESS_MESSAGE = 'successMessage'
export const KEY_FAILURE_MESSAGE = 'failureMessage'
export const KEY_HIERARCHY_RESULT_HEADER = 'hierarchyResultHeader'
export const KEY_HIERARCHY_RESULT_LINE = 'hierarchyResultLine'
export const KEY_GROUP_HIERARCHY_LABEL = 'groupHierarchyLabel'
export const KEY_GROUP_NUMBERED_HIERARCHY_LABEL = 'groupNumberedHierarchyLabel'

export const ALL_CONTEXTS = [KEY_TAB, KEY_ALL]
export const DEFAULT_CONTEXTS = [KEY_TAB]
export const ALL_MENU_ITEMS = [KEY_URL, KEY_URL_WITHOUT_HASH, KEY_TITLE]
export const ALL_DUPLICATE_SCOPES = [
  KEY_CURRENT_HIERARCHY,
  KEY_EACH_HIERARCHY,
  KEY_ALL_TABS,
]
export const LEGACY_MENU_MODE_TO_SCOPE = {
  [KEY_RESPECT_BOUNDARIES]: KEY_EACH_HIERARCHY,
  [KEY_IGNORE_BOUNDARIES]: KEY_ALL_TABS,
}
export const DEFAULT_MENU_ITEMS = {
  [KEY_URL]: [KEY_EACH_HIERARCHY],
  [KEY_TITLE]: [KEY_EACH_HIERARCHY],
}
export const DEFAULT_NOTIFICATION = false

export const NOTIFICATION_PERMISSION = {
  permissions: ['notifications'],
}
export const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')
export const NOTIFICATION_ID = i18n.getMessage(KEY_NAME)
export const NOTIFICATION_INTERVAL = 10 * 1000
export const BULK_SIZE = 5

export const storageArea = storage.sync

export function debug (message) {
  if (DEBUG) {
    console.log(message)
  }
}

export function onError (error) {
  console.error(error)
}

export async function getValue (key, defaultValue) {
  const {
    [key]: value = defaultValue,
  } = await storageArea.get(key)
  return value
}

export function createQueuedTask (task, { onSuccess, onFailure = onError } = {}) {
  let promise
  let requested = false

  const run = async () => {
    try {
      while (requested) {
        requested = false
        await task()
      }
      onSuccess?.()
    } catch (error) {
      onFailure(error)
    } finally {
      promise = undefined
      if (requested) {
        queue()
      }
    }
  }

  function queue () {
    requested = true
    if (!promise) {
      promise = run()
    }
    return promise
  }

  return queue
}

export function getNoGroupId () {
  return browser.tabGroups?.TAB_GROUP_ID_NONE ?? tabs.TAB_GROUP_ID_NONE ?? -1
}

export function getTabGroupId (tab) {
  return tab.groupId ?? getNoGroupId()
}

export function getTabContainerId (tab) {
  return tab.cookieStoreId ?? ''
}

export function isGroupedTab (tab) {
  return tab.groupId !== undefined && tab.groupId !== getNoGroupId()
}

export function getTabHierarchy (tab) {
  if (!tab.pinned && isGroupedTab(tab)) {
    return ['group', getTabGroupId(tab)]
  }

  return ['topLevel']
}

export function getTabHierarchyKey (tab) {
  return JSON.stringify(getTabHierarchy(tab))
}

export function isContainerTab (tab) {
  const cookieStoreId = getTabContainerId(tab)
  return cookieStoreId !== '' && cookieStoreId !== 'firefox-default'
}

export function isSplitViewTab (tab) {
  return tab.splitViewId !== undefined &&
    tab.splitViewId !== (tabs.SPLIT_VIEW_ID_NONE ?? -1)
}

export function hasTabBoundary (tab) {
  return isGroupedTab(tab) || isContainerTab(tab) || isSplitViewTab(tab)
}

export function normalizeContexts (contexts) {
  if (contexts === undefined) {
    return [...DEFAULT_CONTEXTS]
  }

  if (!Array.isArray(contexts)) {
    return []
  }

  return ALL_CONTEXTS.filter((key) => contexts.includes(key))
}

export function cloneMenuItems (menuItems) {
  const normalized = {}
  for (const key of ALL_MENU_ITEMS) {
    const scopes = menuItems[key]
    if (Array.isArray(scopes) && scopes.length > 0) {
      normalized[key] = [...scopes]
    }
  }
  return normalized
}

export function normalizeNotification (notification) {
  if (notification === undefined) {
    return DEFAULT_NOTIFICATION
  }

  return notification === true
}

export function normalizeMenuItems (menuItems) {
  if (menuItems === undefined) {
    return cloneMenuItems(DEFAULT_MENU_ITEMS)
  }

  if (Array.isArray(menuItems)) {
    const normalized = {}
    for (const key of ALL_MENU_ITEMS) {
      if (menuItems.includes(key)) {
        normalized[key] = [KEY_EACH_HIERARCHY]
      }
    }
    return normalized
  }

  if (!menuItems || typeof menuItems !== 'object') {
    return {}
  }

  const normalized = {}
  for (const key of ALL_MENU_ITEMS) {
    const scopes = menuItems[key]
    if (!Array.isArray(scopes)) {
      continue
    }

    const normalizedScopes = []
    for (const scope of scopes) {
      const normalizedScope = LEGACY_MENU_MODE_TO_SCOPE[scope] || scope
      if (ALL_DUPLICATE_SCOPES.includes(normalizedScope) &&
          !normalizedScopes.includes(normalizedScope)) {
        normalizedScopes.push(normalizedScope)
      }
    }
    if (normalizedScopes.length > 0) {
      normalized[key] = normalizedScopes
    }
  }
  return normalized
}
