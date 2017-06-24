'use strict'

const LABEL_UNIQ = browser.i18n.getMessage('uniq')
const LABEL_TITLE = browser.i18n.getMessage('title')

const storage = browser.storage.sync

function onError (error) {
  console.error('Error: ' + error)
}

function changeSetting (result) {
  const urlOn = typeof result.url === 'undefined' || result.url
  const titleOn = typeof result.title === 'undefined' || result.title

  // 一旦、全削除してから追加する
  const removing = browser.contextMenus.removeAll()
  removing.then(() => {
    console.log('Clear items')

    if (urlOn || titleOn) {
      console.log('Add ' + LABEL_UNIQ + ' item')
      browser.contextMenus.create({
        id: 'uniq',
        title: LABEL_UNIQ,
        contexts: ['tab']
      })
    }

    function setKeyItem (on, id, title) {
      if (on) {
        browser.contextMenus.create({
          id,
          title,
          contexts: ['tab'],
          parentId: 'uniq'
        }, () => console.log('Add ' + title + ' item'))
      }
    }

    setKeyItem(urlOn, 'url', 'URL')
    setKeyItem(titleOn, 'title', LABEL_TITLE)
  }, onError)
}

const getting = storage.get()
getting.then(changeSetting, onError)
browser.storage.onChanged.addListener((changes, area) => {
  const result = {
    url: changes.url.newValue,
    title: changes.title.newValue
  }
  changeSetting(result)
})

// タブのパラメータから重複を判定するキーを取り出す関数を受け取り、
// 重複するタブを削除する関数をつくる
function makeUniqer (keyGetter) {
  return () => {
    const querying = browser.tabs.query({currentWindow: true})
    querying.then((tabs) => {
      const keys = new Set()

      // ピン留めされているタブを先に調べる
      for (let tab of tabs) {
        if (tab.pinned) {
          keys.add(keyGetter(tab))
        }
      }

      const removeIds = []
      for (let tab of tabs) {
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

      const removing = browser.tabs.remove(removeIds)
      removing.then(() => console.log('Tabs ' + removeIds + ' were removed'), onError)
    }, onError)
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
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
