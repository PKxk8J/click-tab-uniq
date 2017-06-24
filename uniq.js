'use strict'

const { contextMenus, i18n, storage, tabs } = browser
const storageArea = storage.sync

const LABEL_UNIQ = i18n.getMessage('uniq')
const LABEL_URL = i18n.getMessage('url')
const LABEL_TITLE = i18n.getMessage('title')

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

const getting = storageArea.get()
getting.then(changeMenu, onError)
storage.onChanged.addListener((changes, area) => {
  const result = {
    url: changes.url.newValue,
    title: changes.title.newValue
  }
  changeMenu(result)
})

// タブのパラメータから重複を判定するキーを取り出す関数を受け取り、
// 重複するタブを削除する関数をつくる
function makeUniqer (keyGetter) {
  return () => {
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

      if (removeIds.length === 0) {
        return
      }

      const removing = tabs.remove(removeIds)
      removing.then(() => console.log('Tabs ' + removeIds + ' were removed'), onError)
    }, onError)
  }
}

contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'url': {
      makeUniqer((tab) => tab.url)()
      break
    }
    case 'title': {
      makeUniqer((tab) => tab.title)()
      break
    }
  }
})
