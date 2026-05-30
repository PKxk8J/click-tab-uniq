const {
  i18n,
  storage,
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
export const KEY_RESPECT_BOUNDARIES_MENU = 'respectBoundariesMenu'
export const KEY_IGNORE_BOUNDARIES_MENU = 'ignoreBoundariesMenu'

export const KEY_UNIQ = 'uniq'
export const KEY_UNIQ_BY = 'uniqBy'
export const KEY_CONTEXTS = 'contexts'
export const KEY_MENU_ITEMS = 'menuItems'
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

export const ALL_CONTEXTS = [KEY_TAB, KEY_ALL]
export const DEFAULT_CONTEXTS = [KEY_TAB]
export const ALL_MENU_ITEMS = [KEY_URL, KEY_URL_WITHOUT_HASH, KEY_TITLE]
export const ALL_MENU_MODES = [KEY_RESPECT_BOUNDARIES, KEY_IGNORE_BOUNDARIES]
export const DEFAULT_MENU_ITEMS = {
  [KEY_URL]: [KEY_RESPECT_BOUNDARIES],
  [KEY_TITLE]: [KEY_RESPECT_BOUNDARIES],
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

export async function asleep (msec) {
  return new Promise(resolve => setTimeout(resolve, msec))
}

export async function getValue (key, defaultValue) {
  const {
    [key]: value = defaultValue,
  } = await storageArea.get(key)
  return value
}

export function cloneContexts (contexts) {
  return [...contexts]
}

export function normalizeContexts (contexts) {
  if (contexts === undefined) {
    return cloneContexts(DEFAULT_CONTEXTS)
  }

  if (!Array.isArray(contexts)) {
    return []
  }

  return ALL_CONTEXTS.filter((key) => contexts.includes(key))
}

export function cloneMenuItems (menuItems) {
  const normalized = {}
  for (const key of ALL_MENU_ITEMS) {
    const modes = menuItems[key]
    if (Array.isArray(modes) && modes.length > 0) {
      normalized[key] = [...modes]
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
        normalized[key] = [KEY_RESPECT_BOUNDARIES]
      }
    }
    return normalized
  }

  if (!menuItems || typeof menuItems !== 'object') {
    return {}
  }

  const normalized = {}
  for (const key of ALL_MENU_ITEMS) {
    const modes = menuItems[key]
    if (!Array.isArray(modes)) {
      continue
    }

    const normalizedModes = ALL_MENU_MODES.
      filter((mode) => modes.includes(mode))
    if (normalizedModes.length > 0) {
      normalized[key] = normalizedModes
    }
  }
  return normalized
}
