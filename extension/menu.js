import {
  ALL_MENU_ITEMS,
  DEFAULT_CONTEXTS,
  DEFAULT_MENU_ITEMS,
  DEFAULT_NOTIFICATION,
  KEY_CONTEXTS,
  KEY_MENU_ITEMS,
  KEY_NOTIFICATION,
  KEY_UNIQ,
  KEY_UNIQ_BY,
  debug,
  getValue,
  onError,
} from './common.js'
import {
  run,
} from './uniq.js'

const {
  i18n,
  menus,
  runtime,
  storage,
  tabs,
} = browser

function createMenuItem (properties) {
  return new Promise((resolve, reject) => {
    menus.create(properties, () => {
      if (runtime.lastError) {
        reject(runtime.lastError)
      } else {
        debug('Added ' + properties.title + ' menu item')
        resolve()
      }
    })
  })
}

async function rebuildMenu () {
  const [contexts, menuItems] = await Promise.all([
    getValue(KEY_CONTEXTS, DEFAULT_CONTEXTS),
    getValue(KEY_MENU_ITEMS, DEFAULT_MENU_ITEMS),
  ])

  await menus.removeAll()
  debug('Clear menu items')

  if (contexts.length <= 0 || menuItems.length <= 0) {
    return
  }

  if (menuItems.length === 1) {
    const key = menuItems[0]
    await createMenuItem({
      id: key,
      title: i18n.getMessage(KEY_UNIQ_BY, i18n.getMessage(key)),
      contexts,
    })
    return
  }

  await createMenuItem({
    id: KEY_UNIQ,
    title: i18n.getMessage(KEY_UNIQ),
    contexts,
  })
  for (const key of menuItems) {
    await createMenuItem({
      id: key,
      title: i18n.getMessage(key),
      contexts,
      parentId: KEY_UNIQ,
    })
  }
}

async function getCurrentTab () {
  const [tab] = await tabs.query({ active: true, currentWindow: true })
  return tab
}

async function handleMenuClick (info, tab) {
  if (!ALL_MENU_ITEMS.includes(info.menuItemId)) {
    return
  }

  const targetTab = tab || await getCurrentTab()
  if (!targetTab) {
    return
  }

  const notification = await getValue(KEY_NOTIFICATION, DEFAULT_NOTIFICATION)
  await run(targetTab.windowId, info.menuItemId, targetTab.pinned, notification)
}

runtime.onInstalled.addListener(() => {
  return rebuildMenu().catch(onError)
})

runtime.onStartup.addListener(() => {
  return rebuildMenu().catch(onError)
})

storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return
  }
  if (changes[KEY_CONTEXTS] || changes[KEY_MENU_ITEMS]) {
    return rebuildMenu().catch(onError)
  }
})

menus.onClicked.addListener((info, tab) => {
  return handleMenuClick(info, tab).catch(onError)
})
