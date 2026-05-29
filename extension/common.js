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

export const KEY_UNIQ = 'uniq'
export const KEY_UNIQ_BY = 'uniqBy'
export const KEY_CONTEXTS = 'contexts'
export const KEY_MENU_ITEMS = 'menuItems'
export const KEY_NOTIFICATION = 'notification'
export const KEY_SAVE = 'save'
export const KEY_CLOSING = 'closing'
export const KEY_PROGRESS = 'progress'
export const KEY_SUCCESS_MESSAGE = 'successMessage'
export const KEY_FAILURE_MESSAGE = 'failureMessage'

export const ALL_CONTEXTS = [KEY_TAB, KEY_ALL]
export const DEFAULT_CONTEXTS = [KEY_TAB]
export const ALL_MENU_ITEMS = [KEY_URL, KEY_URL_WITHOUT_HASH, KEY_TITLE]
export const DEFAULT_MENU_ITEMS = [KEY_URL, KEY_TITLE]
export const DEFAULT_NOTIFICATION = false

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
