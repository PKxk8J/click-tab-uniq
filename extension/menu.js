import {
  ALL_MENU_ITEMS,
  KEY_IGNORE_BOUNDARIES,
  KEY_IGNORE_BOUNDARIES_MENU,
  KEY_RESPECT_BOUNDARIES,
  KEY_RESPECT_BOUNDARIES_MENU,
  DEFAULT_CONTEXTS,
  DEFAULT_NOTIFICATION,
  KEY_CONTEXTS,
  KEY_MENU_ITEMS,
  KEY_NOTIFICATION,
  KEY_UNIQ,
  KEY_UNIQ_BY,
  debug,
  getValue,
  normalizeMenuItems,
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

let rebuildMenuPromise
let rebuildMenuRequested = false

const MODE_MENU_LABEL_KEYS = {
  [KEY_RESPECT_BOUNDARIES]: KEY_RESPECT_BOUNDARIES_MENU,
  [KEY_IGNORE_BOUNDARIES]: KEY_IGNORE_BOUNDARIES_MENU,
}

function getLeafMenuId (key, mode) {
  return 'mode:' + key + ':' + mode
}

function getKeyMenuId (key) {
  return 'key:' + key
}

function parseLeafMenuId (id) {
  const parts = id.split(':')
  if (parts.length !== 3 || parts[0] !== 'mode') {
    return
  }

  const [, key, mode] = parts
  if (!ALL_MENU_ITEMS.includes(key) || !MODE_MENU_LABEL_KEYS[mode]) {
    return
  }
  return { key, mode }
}

function getModeMenuTitle (mode) {
  return i18n.getMessage(MODE_MENU_LABEL_KEYS[mode])
}

function getKeyModeTitle (key, mode) {
  const title = i18n.getMessage(key)
  if (mode !== KEY_IGNORE_BOUNDARIES) {
    return title
  }
  return title + ' (' + getModeMenuTitle(mode) + ')'
}

function getUniqByTitle (key, mode) {
  const title = i18n.getMessage(KEY_UNIQ_BY, i18n.getMessage(key))
  if (mode !== KEY_IGNORE_BOUNDARIES) {
    return title
  }
  return title + ' (' + getModeMenuTitle(mode) + ')'
}

function getMenuEntries (menuItems) {
  return ALL_MENU_ITEMS.
    filter((key) => menuItems[key]?.length > 0).
    map((key) => ({ key, modes: menuItems[key] }))
}

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
  const [contexts, storedMenuItems] = await Promise.all([
    getValue(KEY_CONTEXTS, DEFAULT_CONTEXTS),
    getValue(KEY_MENU_ITEMS),
  ])
  const menuItems = normalizeMenuItems(storedMenuItems)
  const entries = getMenuEntries(menuItems)

  await menus.removeAll()
  debug('Clear menu items')

  if (contexts.length <= 0 || entries.length <= 0) {
    return
  }

  if (entries.length === 1) {
    const [{ key, modes }] = entries
    if (modes.length === 1) {
      const mode = modes[0]
      await createMenuItem({
        id: getLeafMenuId(key, mode),
        title: getUniqByTitle(key, mode),
        contexts,
      })
      return
    }

    await createMenuItem({
      id: getKeyMenuId(key),
      title: i18n.getMessage(KEY_UNIQ_BY, i18n.getMessage(key)),
      contexts,
    })
    for (const mode of modes) {
      await createMenuItem({
        id: getLeafMenuId(key, mode),
        title: getModeMenuTitle(mode),
        contexts,
        parentId: getKeyMenuId(key),
      })
    }
    return
  }

  await createMenuItem({
    id: KEY_UNIQ,
    title: i18n.getMessage(KEY_UNIQ),
    contexts,
  })
  for (const { key, modes } of entries) {
    if (modes.length === 1) {
      const mode = modes[0]
      await createMenuItem({
        id: getLeafMenuId(key, mode),
        title: getKeyModeTitle(key, mode),
        contexts,
        parentId: KEY_UNIQ,
      })
      continue
    }

    await createMenuItem({
      id: getKeyMenuId(key),
      title: i18n.getMessage(key),
      contexts,
      parentId: KEY_UNIQ,
    })
    for (const mode of modes) {
      await createMenuItem({
        id: getLeafMenuId(key, mode),
        title: getModeMenuTitle(mode),
        contexts,
        parentId: getKeyMenuId(key),
      })
    }
  }
}

function queueRebuildMenu () {
  rebuildMenuRequested = true
  if (!rebuildMenuPromise) {
    rebuildMenuPromise = (async () => {
      while (rebuildMenuRequested) {
        rebuildMenuRequested = false
        await rebuildMenu()
      }
    })().finally(() => {
      rebuildMenuPromise = undefined
      if (rebuildMenuRequested) {
        queueRebuildMenu().catch(onError)
      }
    })
  }
  return rebuildMenuPromise
}

async function getCurrentTab () {
  const [tab] = await tabs.query({ active: true, currentWindow: true })
  return tab
}

async function handleMenuClick (info, tab) {
  const entry = parseLeafMenuId(info.menuItemId)
  if (!entry) {
    return
  }

  const targetTab = tab || await getCurrentTab()
  if (!targetTab) {
    return
  }

  const notification = await getValue(KEY_NOTIFICATION, DEFAULT_NOTIFICATION)
  await run(targetTab.windowId, entry.key, targetTab.pinned, notification,
    entry.mode)
}

runtime.onInstalled.addListener(() => {
  return queueRebuildMenu().catch(onError)
})

runtime.onStartup.addListener(() => {
  return queueRebuildMenu().catch(onError)
})

storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return
  }
  if (changes[KEY_CONTEXTS] || changes[KEY_MENU_ITEMS]) {
    return queueRebuildMenu().catch(onError)
  }
})

menus.onClicked.addListener((info, tab) => {
  return handleMenuClick(info, tab).catch(onError)
})
