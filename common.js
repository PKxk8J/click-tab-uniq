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

  const params = {
    storageArea,
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
    DEFAULT_MENU_ITEM: [KEY_URL, KEY_TITLE],
    DEFAULT_NOTIFICATION: false,
    NOTIFICATION_ID: i18n.getMessage(KEY_NAME),
    DEBUG
  }

  function debug (message) {
    if (DEBUG) {
      console.log(message)
    }
  }

  function onError (error) {
    console.error(error)
  }

  // 設定値を取得する
  async function getValue (key, defaultValue) {
    const {
      [key]: value = defaultValue
    } = await storageArea.get(key)
    return value
  }

  _export = Object.assign({
    debug,
    onError,
    getValue
  }, params)
}

const common = _export
