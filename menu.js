'use strict'

// 右クリックメニュー

{
  const {
    contextMenus,
    i18n,
    runtime,
    storage
  } = browser
  const {
    KEY_UNIQ,
    KEY_UNIQ_BY,
    KEY_MENU_ITEMS,
    KEY_NOTIFICATION,
    ALL_MENU_ITEMS,
    DEFAULT_MENU_ITEMS,
    DEFAULT_NOTIFICATION,
    debug,
    onError,
    getValue
  } = common
  const {
    run
  } = uniq

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
  async function changeMenu (menuItems) {
    // 一旦、全削除してから追加する
    await contextMenus.removeAll()
    debug('Clear menu items')

    switch (menuItems.length) {
      case 0: {
        break
      }
      case 1: {
        // 1 つだけのときはフラットメニュー
        const key = menuItems[0]
        addMenuItem(key, i18n.getMessage(KEY_UNIQ_BY, i18n.getMessage(key)))
        break
      }
      default: {
        addMenuItem(KEY_UNIQ, i18n.getMessage(KEY_UNIQ))
        menuItems.forEach((key) => addMenuItem(key, i18n.getMessage(key), KEY_UNIQ))
      }
    }
  }

  // 初期化
  (async function () {
    // リアルタイムで設定を反映させる
    storage.onChanged.addListener((changes, area) => (async function () {
      const menuItems = changes[KEY_MENU_ITEMS]
      if (menuItems && menuItems.newValue) {
        await changeMenu(menuItems.newValue)
      }
    })().catch(onError))

    // 右クリックメニューから実行
    contextMenus.onClicked.addListener((info, tab) => (async function () {
      if (ALL_MENU_ITEMS.includes(info.menuItemId)) {
        const notification = await getValue(KEY_NOTIFICATION, DEFAULT_NOTIFICATION)
        await run(tab.windowId, info.menuItemId, tab.pinned, notification)
      }
    })().catch(onError))

    const menuItems = await getValue(KEY_MENU_ITEMS, DEFAULT_MENU_ITEMS)
    await changeMenu(menuItems)
  })().catch(onError)
}
