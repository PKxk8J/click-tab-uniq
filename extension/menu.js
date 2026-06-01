import {
  ALL_MENU_ITEMS,
  KEY_IGNORE_BOUNDARIES,
  KEY_IGNORE_BOUNDARIES_MENU,
  KEY_RESPECT_BOUNDARIES,
  KEY_RESPECT_BOUNDARIES_MENU,
  KEY_CONTEXTS,
  KEY_MENU_ITEMS,
  KEY_NOTIFICATION,
  KEY_UNIQ,
  KEY_UNIQ_BY,
  createQueuedTask,
  debug,
  getValue,
  hasTabBoundary,
  normalizeContexts,
  normalizeMenuItems,
  normalizeNotification,
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

let currentContexts = []
let currentEntries = []
let currentMenuActions = new Map()
let renderedMenuItemIds = []

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

async function hasBoundaryTabs (windowId) {
  const tabList = await tabs.query({ windowId })
  return tabList.some(hasTabBoundary)
}

function getVisibleEntries (entries, boundaryTabs) {
  if (boundaryTabs) {
    return entries
  }

  return entries.map((entry) => {
    if (!entry.modes.includes(KEY_RESPECT_BOUNDARIES) ||
        !entry.modes.includes(KEY_IGNORE_BOUNDARIES)) {
      return entry
    }
    return {
      key: entry.key,
      modes: [KEY_RESPECT_BOUNDARIES],
    }
  })
}

function createLeafMenuRenderItem (key, mode, title, parentId) {
  return {
    action: { key, mode },
    id: getLeafMenuId(key, mode),
    parentId,
    title,
  }
}

function createMenuRenderPlan (visibleEntries) {
  const actions = new Map()
  const items = []
  const root = {
    title: i18n.getMessage(KEY_UNIQ),
    visible: visibleEntries.length > 0,
  }

  if (visibleEntries.length === 1) {
    const [{ key, modes }] = visibleEntries
    if (modes.length === 1) {
      const mode = modes[0]
      root.title = getUniqByTitle(key, mode)
      actions.set(KEY_UNIQ, { key, mode })
      return { actions, items, root }
    }

    root.title = i18n.getMessage(KEY_UNIQ_BY, i18n.getMessage(key))
    for (const mode of modes) {
      items.push(createLeafMenuRenderItem(
        key,
        mode,
        getModeMenuTitle(mode),
        KEY_UNIQ,
      ))
    }
    return { actions, items, root }
  }

  for (const { key, modes } of visibleEntries) {
    if (modes.length === 1) {
      const mode = modes[0]
      items.push(createLeafMenuRenderItem(
        key,
        mode,
        getKeyModeTitle(key, mode),
        KEY_UNIQ,
      ))
      continue
    }

    const parentId = getKeyMenuId(key)
    items.push({
      id: parentId,
      parentId: KEY_UNIQ,
      title: i18n.getMessage(key),
    })
    for (const mode of modes) {
      items.push(createLeafMenuRenderItem(
        key,
        mode,
        getModeMenuTitle(mode),
        parentId,
      ))
    }
  }

  return { actions, items, root }
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

async function createRenderedMenuItem (properties) {
  await createMenuItem(properties)
  renderedMenuItemIds.push(properties.id)
}

function updateMenuItem (id, properties) {
  return new Promise((resolve, reject) => {
    menus.update(id, properties, () => {
      if (runtime.lastError) {
        reject(runtime.lastError)
      } else {
        resolve()
      }
    })
  })
}

function removeMenuItem (id) {
  return new Promise((resolve, reject) => {
    menus.remove(id, () => {
      if (runtime.lastError) {
        reject(runtime.lastError)
      } else {
        resolve()
      }
    })
  })
}

async function clearRenderedMenuItems () {
  const ids = [...renderedMenuItemIds].reverse()
  renderedMenuItemIds = []
  for (const id of ids) {
    await removeMenuItem(id).catch(onError)
  }
}

async function rebuildMenu () {
  const [storedContexts, storedMenuItems] = await Promise.all([
    getValue(KEY_CONTEXTS),
    getValue(KEY_MENU_ITEMS),
  ])
  const contexts = normalizeContexts(storedContexts)
  const menuItems = normalizeMenuItems(storedMenuItems)
  const entries = getMenuEntries(menuItems)

  currentContexts = contexts
  currentEntries = entries
  currentMenuActions = new Map()
  renderedMenuItemIds = []

  await menus.removeAll()
  debug('Clear menu items')

  if (contexts.length <= 0 || entries.length <= 0) {
    return
  }

  await createMenuItem({
    id: KEY_UNIQ,
    title: i18n.getMessage(KEY_UNIQ),
    contexts,
  })
}

async function renderCurrentMenuItems (visibleEntries) {
  const renderPlan = createMenuRenderPlan(visibleEntries)

  await clearRenderedMenuItems()
  currentMenuActions = renderPlan.actions
  await updateMenuItem(KEY_UNIQ, {
    visible: renderPlan.root.visible,
    title: renderPlan.root.title,
  })

  for (const item of renderPlan.items) {
    await createRenderedMenuItem({
      id: item.id,
      title: item.title,
      contexts: currentContexts,
      parentId: item.parentId,
    })
    if (item.action) {
      currentMenuActions.set(item.id, item.action)
    }
  }
}

const queueRebuildMenu = createQueuedTask(rebuildMenu)

async function getCurrentTab () {
  const [tab] = await tabs.query({ active: true, currentWindow: true })
  return tab
}

async function handleMenuClick (info, tab) {
  const entry = currentMenuActions.get(info.menuItemId)
  if (!entry) {
    return
  }

  const targetTab = tab || await getCurrentTab()
  if (!targetTab) {
    return
  }

  const notification = normalizeNotification(
    await getValue(KEY_NOTIFICATION),
  )
  await run(targetTab.windowId, entry.key, targetTab.pinned, notification,
    entry.mode)
}

async function handleMenuShown (info, tab) {
  const targetTab = tab || await getCurrentTab()
  if (!targetTab || currentContexts.length <= 0 ||
      currentEntries.length <= 0) {
    return
  }

  const visibleEntries = getVisibleEntries(
    currentEntries,
    await hasBoundaryTabs(targetTab.windowId),
  )
  await renderCurrentMenuItems(visibleEntries)
  await menus.refresh()
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

menus.onShown.addListener((info, tab) => {
  return handleMenuShown(info, tab).catch(onError)
})

queueRebuildMenu().catch(onError)
