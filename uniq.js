'use strict'

chrome.contextMenus.create({
  id: 'uniq',
  title: '重複削除',
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
  title: 'タイトル',
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

      for (let tab of tabs) {
        const key = keyGetter(tab)
        if (!keys.has(key)) {
          keys.add(key)
          continue
        }

        // console.log('Tab ' + tab.id + ' will be removed: ' + key)
        const removing = browser.tabs.remove([tab.id])
        removing.then(() => console.log('Tab ' + tab.id + ' was removed: ' + key), onError)
      }
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
