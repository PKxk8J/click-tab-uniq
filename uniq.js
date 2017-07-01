'use strict'

const { contextMenus, i18n, notifications, storage, tabs } = browser
const storageArea = storage.sync

const KEY_DEBUG = 'debug'

const KEY_URL = 'url'
const KEY_TITLE = 'title'
const KEY_NOTIFICATION = 'notification'

const KEY_NAME = 'name'
const KEY_UNIQ = 'uniq'
const KEY_CLOSING = 'closing'

const NOTIFICATION_ID = i18n.getMessage(KEY_NAME)
let notificationOn = false

const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')
function debug (message) {
  if (DEBUG) {
    console.log(message)
  }
}

function onError (error) {
  console.error('Error: ' + error)
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
  }, () => debug('Added ' + title + ' menu item'))
}

// 右クリックメニューの変更
function changeMenu (result) {
  const flags = [
    { key: KEY_URL, on: falseIffFalse(result[KEY_URL]) },
    { key: KEY_TITLE, on: falseIffFalse(result[KEY_TITLE]) }
  ]

  // 一旦、全削除してから追加する
  const removing = contextMenus.removeAll()
  removing.then(() => {
    debug('Clear menu items')

    let count = 0
    let sample
    for (let flag of flags) {
      if (flag.on) {
        count++
        sample = flag
      }
    }

    switch (count) {
      case 0: {
        break
      }
      case 1: {
        // 1 つだけのときはフラットメニュー
        addMenuItem(sample.key, i18n.getMessage('uniqBy', i18n.getMessage(sample.key)))
        break
      }
      default: {
        addMenuItem(KEY_UNIQ, i18n.getMessage(KEY_UNIQ))
        for (let flag of flags) {
          if (flag.on) {
            addMenuItem(flag.key, i18n.getMessage(flag.key), KEY_UNIQ)
          }
        }
      }
    }
  }, onError)
}

// 設定を反映させる
function applySetting (result) {
  notificationOn = result[KEY_NOTIFICATION]
  changeMenu(result)
}

// リアルタイムで設定を反映させる
const getting = storageArea.get()
getting.then(applySetting, onError)
storage.onChanged.addListener((changes, area) => {
  const result = {}
  Object.keys(changes).forEach((key) => { result[key] = changes[key].newValue })
  applySetting(result)
})

// タブのパラメータから重複を判定するキーを取り出す関数を受け取り、
// 重複するタブを削除する関数をつくる
function makeUniqer (keyGetter) {
  return (callback) => {
    function onUniqError (error, nTabs, nCloseTabs) {
      onError(error)
      const success = false
      callback(success, nTabs, nCloseTabs)
    }

    const querying = tabs.query({currentWindow: true})
    querying.then((tabList) => {
      const keys = new Set()

      // ピン留めされているタブとフォーカスのあるタブを先に調べる
      let activeKey
      for (let tab of tabList) {
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
      for (let tab of tabList) {
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

      const removing = tabs.remove(removeIds)
      removing.then(() => {
        const success = true
        callback(success, tabList.length, removeIds.length)
      }, onError)
    }, (error) => {
      onUniqError(error, -1, -1)
    })
  }
}

function getResultMessage (success, seconds, nTabs, nCloseTabs) {
  const key = (success ? 'successMessage' : 'failureMessage')
  return i18n.getMessage(key, [seconds, nTabs, nCloseTabs])
}

function uniq (comparator) {
  const start = new Date()

  if (!notificationOn) {
    makeUniqer(comparator)((success, nTabs, nCloseTabs) => {
      const seconds = (new Date() - start) / 1000
      const message = getResultMessage(success, seconds, nTabs, nCloseTabs)
      debug(message)
    })
    return
  }

  const creatingStart = notifications.create(NOTIFICATION_ID, {
    'type': 'basic',
    'title': NOTIFICATION_ID,
    message: i18n.getMessage(KEY_CLOSING)
  })
  creatingStart.then(() => {
    makeUniqer(comparator)((success, nTabs, nCloseTabs) => {
      const seconds = (new Date() - start) / 1000
      const message = getResultMessage(success, seconds, nTabs, nCloseTabs)
      debug(message)
      const creatingEnd = notifications.create(NOTIFICATION_ID, {
        'type': 'basic',
        'title': NOTIFICATION_ID,
        message
      })
      creatingEnd.then(() => debug('End'), onError)
    })
  }, onError)
}

contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case KEY_URL: {
      uniq((tab) => tab.url)
      break
    }
    case KEY_TITLE: {
      uniq((tab) => tab.title)
      break
    }
  }
})
