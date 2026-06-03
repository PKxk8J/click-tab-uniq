import {
  ALL_MENU_ITEMS,
  KEY_ALL_TABS,
  KEY_ALL_TABS_MENU,
  KEY_CURRENT_HIERARCHY,
  KEY_EACH_HIERARCHY,
  KEY_EACH_HIERARCHY_MENU,
  KEY_GROUP_SCOPE,
  KEY_PINNED_SCOPE,
  KEY_TOP_LEVEL_SCOPE,
  KEY_CONTEXTS,
  KEY_MENU_ITEMS,
  KEY_NOTIFICATION,
  KEY_UNIQ,
  createQueuedTask,
  debug,
  getTabHierarchyKey,
  getValue,
  isGroupedTab,
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
let currentMenuItemIds = []

const SCOPE_MENU_LABEL_KEYS = {
  [KEY_EACH_HIERARCHY]: KEY_EACH_HIERARCHY_MENU,
  [KEY_ALL_TABS]: KEY_ALL_TABS_MENU,
}

function getLeafMenuId (key, scope) {
  return 'scope:' + key + ':' + scope
}

function getFlatLeafMenuId (key, scope) {
  return 'flatScope:' + key + ':' + scope
}

function getKeyMenuId (key) {
  return 'key:' + key
}

function joinMenuTitle (...titles) {
  return titles.filter(Boolean).join(': ')
}

function getCurrentHierarchyMenuTitle (tab) {
  if (tab.pinned) {
    return i18n.getMessage(KEY_PINNED_SCOPE)
  }

  if (isGroupedTab(tab)) {
    return i18n.getMessage(KEY_GROUP_SCOPE)
  }

  return i18n.getMessage(KEY_TOP_LEVEL_SCOPE)
}

function getScopeMenuTitle (scope, tab) {
  if (scope === KEY_CURRENT_HIERARCHY) {
    return getCurrentHierarchyMenuTitle(tab)
  }
  return i18n.getMessage(SCOPE_MENU_LABEL_KEYS[scope])
}

function getUniqKeyTitle (key) {
  return joinMenuTitle(i18n.getMessage(KEY_UNIQ), i18n.getMessage(key))
}

function getUniqKeyScopeTitle (key, scope, tab) {
  return joinMenuTitle(
    i18n.getMessage(KEY_UNIQ),
    i18n.getMessage(key),
    getScopeMenuTitle(scope, tab),
  )
}

function getKeyScopeTitle (key, scope, tab) {
  return joinMenuTitle(i18n.getMessage(key), getScopeMenuTitle(scope, tab))
}

async function getHierarchyCount (windowId) {
  const tabList = await tabs.query({ windowId })
  return new Set(tabList.map(getTabHierarchyKey)).size
}

function getMenuEntries (menuItems) {
  return ALL_MENU_ITEMS.
    filter((key) => menuItems[key]?.length > 0).
    map((key) => ({ key, scopes: menuItems[key] }))
}

function getEffectiveScopes (scopes, hierarchyCount) {
  if (hierarchyCount <= 1) {
    return scopes.slice(0, 1)
  }
  return scopes
}

function getEffectiveEntries (entries, hierarchyCount) {
  return entries.map(({ key, scopes }) => ({
    key,
    scopes: getEffectiveScopes(scopes, hierarchyCount),
  }))
}

function getPotentialEntries (entries) {
  return entries.map(({ key, scopes }) => ({
    key,
    scopes: [...scopes],
  }))
}

function createLeafMenuRenderItem (key, scope, title, parentId) {
  return {
    action: { key, scope },
    id: getLeafMenuId(key, scope),
    parentId,
    title,
  }
}

function createKeyLeafMenuRenderItem (key, scope, tab) {
  return {
    action: { key, scope },
    id: getFlatLeafMenuId(key, scope),
    parentId: KEY_UNIQ,
    title: getKeyScopeTitle(key, scope, tab),
  }
}

function createMenuRenderPlan (visibleEntries, tab, hierarchyCount) {
  const effectiveEntries = getEffectiveEntries(visibleEntries, hierarchyCount)
  const potentialEntries = getPotentialEntries(visibleEntries)
  const rootCanBeAction = potentialEntries.length === 1 &&
    potentialEntries[0].scopes.length === 1
  const actions = new Map()
  const items = []
  const root = {
    title: i18n.getMessage(KEY_UNIQ),
    visible: effectiveEntries.length > 0,
  }

  if (effectiveEntries.length === 1) {
    const [{ key, scopes }] = effectiveEntries
    if (scopes.length === 1) {
      const scope = scopes[0]
      if (rootCanBeAction) {
        root.title = getUniqKeyScopeTitle(key, scope, tab)
        actions.set(KEY_UNIQ, { key, scope })
        return { actions, items, root }
      }
      root.title = getUniqKeyTitle(key)
      items.push(createLeafMenuRenderItem(
        key,
        scope,
        getScopeMenuTitle(scope, tab),
        KEY_UNIQ,
      ))
      return { actions, items, root }
    }

    root.title = getUniqKeyTitle(key)
    for (const scope of scopes) {
      items.push(createLeafMenuRenderItem(
        key,
        scope,
        getScopeMenuTitle(scope, tab),
        KEY_UNIQ,
      ))
    }
    return { actions, items, root }
  }

  for (const { key, scopes } of effectiveEntries) {
    if (scopes.length === 1) {
      items.push(createKeyLeafMenuRenderItem(key, scopes[0], tab))
      continue
    }

    const parentId = getKeyMenuId(key)
    items.push({
      id: parentId,
      parentId: KEY_UNIQ,
      title: i18n.getMessage(key),
    })
    for (const scope of scopes) {
      items.push(createLeafMenuRenderItem(
        key,
        scope,
        getScopeMenuTitle(scope, tab),
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

async function createManagedMenuItem (properties) {
  await createMenuItem(properties)
  currentMenuItemIds.push(properties.id)
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

async function createStaticMenuItems (entries, contexts) {
  const potentialEntries = getPotentialEntries(entries)
  if (potentialEntries.length === 1) {
    const [{ key, scopes }] = potentialEntries
    if (scopes.length <= 1) {
      return
    }

    for (const scope of scopes) {
      await createManagedMenuItem({
        id: getLeafMenuId(key, scope),
        title: getScopeMenuTitle(scope, {}),
        contexts,
        parentId: KEY_UNIQ,
        visible: false,
      })
    }
    return
  }

  for (const { key, scopes } of potentialEntries) {
    const keyMenuId = getKeyMenuId(key)
    await createManagedMenuItem({
      id: keyMenuId,
      title: i18n.getMessage(key),
      contexts,
      parentId: KEY_UNIQ,
      visible: false,
    })

    for (const scope of scopes) {
      await createManagedMenuItem({
        id: getFlatLeafMenuId(key, scope),
        title: getKeyScopeTitle(key, scope, {}),
        contexts,
        parentId: KEY_UNIQ,
        visible: false,
      })
    }

    if (scopes.length <= 1) {
      continue
    }

    for (const scope of scopes) {
      await createManagedMenuItem({
        id: getLeafMenuId(key, scope),
        title: getScopeMenuTitle(scope, {}),
        contexts,
        parentId: keyMenuId,
        visible: false,
      })
    }
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
  currentMenuItemIds = []

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
  await createStaticMenuItems(entries, contexts)
}

async function renderCurrentMenuItems (visibleEntries, tab, hierarchyCount) {
  const renderPlan = createMenuRenderPlan(visibleEntries, tab, hierarchyCount)

  for (const id of currentMenuItemIds) {
    await updateMenuItem(id, { visible: false }).catch(onError)
  }
  currentMenuActions = renderPlan.actions
  await updateMenuItem(KEY_UNIQ, {
    visible: renderPlan.root.visible,
    title: renderPlan.root.title,
  })

  for (const item of renderPlan.items) {
    await updateMenuItem(item.id, {
      visible: true,
      title: item.title,
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
    entry.scope, targetTab)
}

async function handleMenuShown (info, tab) {
  const targetTab = tab || await getCurrentTab()
  if (!targetTab || currentContexts.length <= 0 ||
      currentEntries.length <= 0) {
    return
  }

  await renderCurrentMenuItems(currentEntries, targetTab,
    await getHierarchyCount(targetTab.windowId))
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
