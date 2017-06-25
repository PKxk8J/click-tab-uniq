'use strict'

const { contextMenus, i18n, notifications, storage, tabs } = browser
const storageArea = storage.sync

const NOTIFICATION_ID = i18n.getMessage('name')

const LABEL_UNIQ = i18n.getMessage('uniq')
const LABEL_URL = i18n.getMessage('url')
const LABEL_TITLE = i18n.getMessage('title')
const LABEL_CLOSING = i18n.getMessage('closing')

let notificationOn = false

function onError (error) {
  console.error('Error: ' + error)
}

function addMenuItem (id, title, parentId) {
  contextMenus.create({
    id,
    title,
    contexts: ['tab'],
    parentId
  }, () => console.log('Added ' + title + ' menu item'))
}

function changeMenu (result) {
  const { url: urlOn = true, title: titleOn = true } = result

  // 一旦、全削除してから追加する
  const removing = contextMenus.removeAll()
  removing.then(() => {
    console.log('Clear menu items')

    if (urlOn && titleOn) {
      addMenuItem('uniq', LABEL_UNIQ)
      addMenuItem('url', LABEL_URL, 'uniq')
      addMenuItem('title', LABEL_TITLE, 'uniq')
    } else if (urlOn) {
      addMenuItem('url', i18n.getMessage('uniqBy', LABEL_URL))
    } else if (titleOn) {
      addMenuItem('title', i18n.getMessage('uniqBy', LABEL_TITLE))
    }
  }, onError)
}

function changeSetting (result) {
  notificationOn = result.notification
  changeMenu(result)
}

const getting = storageArea.get()
getting.then(changeSetting, onError)
storage.onChanged.addListener((changes, area) => {
  const result = {
    url: changes.url.newValue,
    title: changes.title.newValue,
    notification: changes.notification.newValue
  }
  changeSetting(result)
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

      // ピン留めされているタブを先に調べる
      for (let tab of tabList) {
        if (tab.pinned) {
          keys.add(keyGetter(tab))
        }
      }

      const removeIds = []
      for (let tab of tabList) {
        if (tab.pinned) {
          continue
        }

        const key = keyGetter(tab)
        if (!keys.has(key)) {
          keys.add(key)
          continue
        }

        removeIds.push(tab.id)
        console.log('Tab ' + tab.id + ' will be removed: ' + key)
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
      console.log(message)
    })
    return
  }

  const creatingStart = notifications.create(NOTIFICATION_ID, {
    'type': 'basic',
    'title': NOTIFICATION_ID,
    message: LABEL_CLOSING
  })
  creatingStart.then(() => {
    makeUniqer(comparator)((success, nTabs, nCloseTabs) => {
      const seconds = (new Date() - start) / 1000
      const message = getResultMessage(success, seconds, nTabs, nCloseTabs)
      console.log(message)
      const creatingEnd = notifications.create(NOTIFICATION_ID, {
        'type': 'basic',
        'title': NOTIFICATION_ID,
        message
      })
      creatingEnd.then(() => console.log('End'), onError)
    })
  }, onError)
}

contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'url': {
      uniq((tab) => tab.url)
      break
    }
    case 'title': {
      uniq((tab) => tab.title)
      break
    }
  }
})
