'use strict'

// 共通処理

var _export

{
  const {
    i18n,
    storage
  } = browser

  const KEY_DEBUG = 'debug'
  const KEY_NAME = 'name'

  const KEY_URL = 'url'
  const KEY_TITLE = 'title'

  const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')

  const storageArea = storage.sync

  function debug (message) {
    if (DEBUG) {
      console.log(message)
    }
  }

  // 設定値を取得する
  async function getValue (key, defaultValue) {
    const {
      [key]: value = defaultValue
    } = await storageArea.get(key)
    return value
  }

  _export = Object.freeze({
    KEY_URL,
    KEY_TITLE,
    KEY_UNIQ: 'uniq',
    KEY_UNIQ_BY: 'uniqBy',
    KEY_MENU_ITEM: 'menuItem',
    KEY_NOTIFICATION: 'notification',
    KEY_SAVE: 'save',
    KEY_CLOSING: 'closing',
    KEY_SUCCESS_MESSAGE: 'successMessage',
    KEY_FAILURE_MESSAGE: 'failureMessage',
    ALL_MENU_ITEMS: [KEY_URL, KEY_TITLE],
    DEFAULT_MENU_ITEMS: [KEY_URL, KEY_TITLE],
    DEFAULT_NOTIFICATION: false,
    NOTIFICATION_ID: i18n.getMessage(KEY_NAME),
    DEBUG,
    storageArea,
    debug,
    onError: console.error,
    getValue
  })
}

const common = _export
