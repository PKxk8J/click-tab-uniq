'use strict'

chrome.contextMenus.create({
  id: 'uniq',
  title: browser.i18n.getMessage('uniq'),
  contexts: ['tab']
})

chrome.contextMenus.create({
  id: 'url',
  title: 'URL',
  contexts: ['tab'],
  parentId: 'uniq'
})

chrome.contextMenus.create({
  id: 'title',
  title: browser.i18n.getMessage('title'),
  contexts: ['tab'],
  parentId: 'uniq'
})

function onError (error) {
  console.error('Error: ' + error)
}

// タブのパラメータから重複を判定するキーを取り出す関数を受け取り、
// 重複するタブを削除する関数をつくる
function makeUniqer (keyGetter) {
  return () => {
    const querying = browser.tabs.query({currentWindow: true})
    querying.then((tabs) => {
      const keys = new Set()

      const removeIds = []
      for (let tab of tabs) {
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
