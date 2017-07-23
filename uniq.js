'use strict'

const { contextMenus, i18n, notifications, runtime, storage, tabs } = browser
const storageArea = storage.sync

const KEY_DEBUG = 'debug'

const KEY_URL = 'url'
const KEY_TITLE = 'title'
const KEY_NOTIFICATION = 'notification'

const KEY_NAME = 'name'
const KEY_UNIQ = 'uniq'
const KEY_UNIQ_BY = 'uniqBy'
const KEY_CLOSING = 'closing'

const KEY_SUCCESS_MESSAGE = 'successMessage'
const KEY_FAILURE_MESSAGE = 'failureMessage'

const NOTIFICATION_ID = i18n.getMessage(KEY_NAME)
let notification = false

const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')
function debug (message) {
  if (DEBUG) {
    console.log(message)
  }
}

function onError (error) {
  console.error(error)
}

// bool が undefined でなく false のときだけ false になるように
function falseIffFalse (bool) {
  if (typeof bool === 'undefined') {
    return true
  }
  return bool
}

// 右クリックメニューに項目を追加する
function addMenuItem (id, title, parentId) {
  contextMenus.create({
    id,
    title,
    contexts: ['tab'],
    parentId
  }, () => {
    if (runtime.lastError) {
      onError(runtime.lastError)
    } else {
      debug('Added ' + title + ' menu item')
    }
  })
}

// 右クリックメニューの変更
async function changeMenu (result) {
  const menuKeys = []

  if (falseIffFalse(result[KEY_URL])) {
    menuKeys.push(KEY_URL)
  }
  if (falseIffFalse(result[KEY_TITLE])) {
    menuKeys.push(KEY_TITLE)
  }

  // 一旦、全削除してから追加する
  await contextMenus.removeAll()
  debug('Clear menu items')

  switch (menuKeys.length) {
    case 0: {
      break
    }
    case 1: {
      // 1 つだけのときはフラットメニュー
      const key = menuKeys[0]
      addMenuItem(key, i18n.getMessage(KEY_UNIQ_BY, i18n.getMessage(key)))
      break
    }
    default: {
      addMenuItem(KEY_UNIQ, i18n.getMessage(KEY_UNIQ))
      menuKeys.forEach((key) => addMenuItem(key, i18n.getMessage(key), KEY_UNIQ))
    }
  }
}

// 設定を反映させる
async function applySetting (result) {
  debug('Apply ' + JSON.stringify(result))
  notification = result[KEY_NOTIFICATION]
  await changeMenu(result)
}

// 重複するタブを削除する
async function uniq (windowId, keyGetter) {
  const tabList = await tabs.query({windowId})

  const keys = new Set()

  // ピン留めされているタブとフォーカスのあるタブを先に調べる
  let activeKey
  for (const tab of tabList) {
    if (tab.pinned) {
      keys.add(keyGetter(tab))
    }
    if (tab.active) {
      activeKey = keyGetter(tab)
    }
  }

  // 同じタブがピン留めされていないなら、フォーカスのあるタブは閉じない
  const ignoreActive = !keys.has(activeKey)
  keys.add(activeKey)

  const removeIds = []
  for (const tab of tabList) {
    if (tab.pinned) {
      continue
    }

    const key = keyGetter(tab)
    if (!keys.has(key)) {
      keys.add(key)
      continue
    } if (tab.active && ignoreActive) {
      continue
    }

    removeIds.push(tab.id)
    debug('Tab ' + tab.id + ' will be removed: ' + key)
  }

  await tabs.remove(removeIds)
  return {
    all: tabList.length,
    closed: removeIds.length
  }
}

// 通知を表示する
async function notify (message) {
  await notifications.create(NOTIFICATION_ID, {
    'type': 'basic',
    'title': NOTIFICATION_ID,
    message: message
  })
}

// 前後処理で挟む
async function wrapUniq (windowId, keyGetter) {
  if (notification) {
    await notify(i18n.getMessage(KEY_CLOSING))
  }

  const start = new Date()
  const {all, closed} = await uniq(windowId, keyGetter)
  const seconds = (new Date() - start) / 1000
  const message = i18n.getMessage(KEY_SUCCESS_MESSAGE, [seconds, all, closed])

  debug(message)
  if (notification) {
    await notify(message)
  }
}

// 初期化
(async function () {
  // リアルタイムで設定を反映させる
  storage.onChanged.addListener((changes, area) => (async function () {
    const result = {}
    Object.keys(changes).forEach((key) => { result[key] = changes[key].newValue })
    await applySetting(result)
  })().catch(onError))

  // 右クリックメニューからの入力を処理
  contextMenus.onClicked.addListener((info, tab) => (async function () {
    switch (info.menuItemId) {
      case KEY_URL: {
        await wrapUniq(tab.windowId, (tab) => tab.url)
        break
      }
      case KEY_TITLE: {
        await wrapUniq(tab.windowId, (tab) => tab.title)
        break
      }
    }
  })().catch((e) => {
    onError(e)
    if (notification) {
      notify(i18n.getMessage(KEY_FAILURE_MESSAGE, e)).catch(onError)
    }
  }))

  const result = await storageArea.get()
  await applySetting(result)
})().catch(onError)
