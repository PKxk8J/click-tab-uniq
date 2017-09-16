'use strict'

let _export

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

  const params = {
    storageArea: storage.sync,
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

  _export = Object.assign({
    debug,
    onError
  }, params)
}

const common = _export
