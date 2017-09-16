'use strict'

const {
  contextMenus,
  i18n,
  notifications,
  runtime,
  storage,
  tabs
} = browser
const {
  storageArea,
  KEY_URL,
  KEY_TITLE,
  KEY_UNIQ,
  KEY_UNIQ_BY,
  KEY_MENU_ITEM,
  KEY_NOTIFICATION,
  KEY_CLOSING,
  KEY_SUCCESS_MESSAGE,
  KEY_FAILURE_MESSAGE,
  DEFAULT_MENU_ITEM,
  DEFAULT_NOTIFICATION,
  NOTIFICATION_ID,
  debug,
  onError
} = common

// 設定値を取得する
async function getValue (key, defaultValue) {
  const {
    [key]: value = defaultValue
  } = await storageArea.get(key)
  return value
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

// 重複検査キーの取得関数
const KEY_GETTERS = {
  [KEY_URL]: (tab) => tab.url,
  [KEY_TITLE]: (tab) => tab.title
}

// 右クリックメニューの変更
async function changeMenu (menuItem) {
  // 一旦、全削除してから追加する
  await contextMenus.removeAll()
  debug('Clear menu items')

  switch (menuItem.length) {
    case 0: {
      break
    }
    case 1: {
      // 1 つだけのときはフラットメニュー
      const key = menuItem[0]
      addMenuItem(key, i18n.getMessage(KEY_UNIQ_BY, i18n.getMessage(key)))
      break
    }
    default: {
      addMenuItem(KEY_UNIQ, i18n.getMessage(KEY_UNIQ))
      menuItem.forEach((key) => addMenuItem(key, i18n.getMessage(key), KEY_UNIQ))
    }
  }
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
async function wrapUniq (windowId, keyType, notification) {
  try {
    if (notification) {
      await notify(i18n.getMessage(KEY_CLOSING))
    }

    const start = new Date()
    const {all, closed} = await uniq(windowId, KEY_GETTERS[keyType])
    const seconds = (new Date() - start) / 1000
    const message = i18n.getMessage(KEY_SUCCESS_MESSAGE, [seconds, all, closed])

    debug(message)
    if (notification) {
      await notify(message)
    }
  } catch (e) {
    onError(e)
    if (notification) {
      await notify(i18n.getMessage(KEY_FAILURE_MESSAGE, e))
    }
  }
}

// 初期化
(async function () {
  // リアルタイムで設定を反映させる
  storage.onChanged.addListener((changes, area) => (async function () {
    const menuItem = changes[KEY_MENU_ITEM]
    if (menuItem && menuItem.newValue) {
      await changeMenu(menuItem.newValue)
    }
  })().catch(onError))

  // 右クリックメニューから実行
  contextMenus.onClicked.addListener((info, tab) => (async function () {
    switch (info.menuItemId) {
      case KEY_URL:
      case KEY_TITLE: {
        const notification = await getValue(KEY_NOTIFICATION, DEFAULT_NOTIFICATION)
        await wrapUniq(tab.windowId, info.menuItemId, notification)
        break
      }
    }
  })().catch(onError))

  // メッセージから実行
  runtime.onMessageExternal.addListener((message, sender, sendResponse) => (async function () {
    debug('Message ' + JSON.stringify(message) + ' was received')
    switch (message.type) {
      case KEY_UNIQ: {
        const {
          keyType,
          windowId,
          notification
        } = message
        await wrapUniq(windowId, keyType, notification)
      }
    }
  })().catch(onError))

  const menuItem = await getValue(KEY_MENU_ITEM, DEFAULT_MENU_ITEM)
  await changeMenu(menuItem)
})().catch(onError)
