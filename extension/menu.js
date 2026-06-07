import {
  ALL_MENU_ITEMS,
  KEY_ALL_TABS,
  KEY_ALL_TABS_MENU,
  KEY_CURRENT_HIERARCHY,
  KEY_EACH_HIERARCHY,
  KEY_EACH_HIERARCHY_MENU,
  KEY_GROUP_SCOPE,
  KEY_TOP_LEVEL_SCOPE,
  KEY_TOP_LEVEL_HIERARCHY,
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
  countDuplicateTabs,
  run,
} from './uniq.js'

const {
  i18n,
  menus,
  runtime,
  storage,
  tabs,
} = browser

const KEY_UNIQ_ACTION = KEY_UNIQ + ':action'

let currentContexts = []
let currentEntries = []
let currentMenuActions = new Map()
let currentMenuItemIds = []
let currentMenuInstanceId = 0
let nextMenuInstanceId = 1

const SCOPE_MENU_LABEL_KEYS = {
  [KEY_TOP_LEVEL_HIERARCHY]: KEY_TOP_LEVEL_SCOPE,
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

function getActionCountKey (key, scope) {
  return key + ':' + scope
}

function joinMenuTitle (...titles) {
  return titles.filter(Boolean).join(': ')
}

function withDuplicateCount (title, key, scope, duplicateCounts) {
  const count = duplicateCounts?.get(getActionCountKey(key, scope))
  if (count === undefined) {
    return title
  }
  return title + ' (' + count + ')'
}

function getCurrentHierarchyMenuTitle (tab) {
  if (!tab.pinned && isGroupedTab(tab)) {
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

function getUniqKeyScopeTitle (key, scope, tab, duplicateCounts) {
  return withDuplicateCount(joinMenuTitle(
    i18n.getMessage(KEY_UNIQ),
    i18n.getMessage(key),
    getScopeMenuTitle(scope, tab),
  ), key, scope, duplicateCounts)
}

function getKeyScopeTitle (key, scope, tab, duplicateCounts) {
  return withDuplicateCount(
    joinMenuTitle(i18n.getMessage(key), getScopeMenuTitle(scope, tab)),
    key,
    scope,
    duplicateCounts,
  )
}

function getHierarchyCount (tabList, targetTab) {
  const hierarchyKeys = new Set(tabList.map(getTabHierarchyKey))
  if (!targetTab.pinned && isGroupedTab(targetTab)) {
    hierarchyKeys.add('topLevel')
  }
  return hierarchyKeys.size
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

function getCurrentHierarchyDisplayScopes (tab) {
  if (!tab.pinned && isGroupedTab(tab)) {
    return [KEY_CURRENT_HIERARCHY, KEY_TOP_LEVEL_HIERARCHY]
  }
  return [KEY_CURRENT_HIERARCHY]
}

function expandCurrentHierarchyScopes (scopes, tab) {
  const expanded = []
  for (const scope of scopes) {
    if (scope === KEY_CURRENT_HIERARCHY) {
      expanded.push(...getCurrentHierarchyDisplayScopes(tab))
      continue
    }
    expanded.push(scope)
  }
  return [...new Set(expanded)]
}

function getEffectiveEntries (entries, hierarchyCount, tab) {
  return entries.map(({ key, scopes }) => ({
    key,
    scopes: getEffectiveScopes(
      expandCurrentHierarchyScopes(scopes, tab),
      hierarchyCount,
    ),
  }))
}

function getPotentialEntries (entries) {
  return entries.map(({ key, scopes }) => ({
    key,
    scopes: expandCurrentHierarchyScopes(scopes, {
      groupId: 1,
      pinned: false,
    }),
  }))
}

function createLeafMenuRenderItem (key, scope, title, parentId,
  duplicateCounts) {
  return {
    action: { key, scope },
    id: getLeafMenuId(key, scope),
    parentId,
    title: withDuplicateCount(title, key, scope, duplicateCounts),
  }
}

function createKeyLeafMenuRenderItem (key, scope, tab, duplicateCounts) {
  return {
    action: { key, scope },
    id: getFlatLeafMenuId(key, scope),
    parentId: KEY_UNIQ,
    title: getKeyScopeTitle(key, scope, tab, duplicateCounts),
  }
}

function createMenuRenderPlan (visibleEntries, tab, hierarchyCount,
  duplicateCounts) {
  const effectiveEntries = getEffectiveEntries(visibleEntries, hierarchyCount,
    tab)
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
      root.title = getUniqKeyScopeTitle(key, scope, tab, duplicateCounts)
      actions.set(KEY_UNIQ, { key, scope })
      return { actions, items, root }
    }

    root.title = getUniqKeyTitle(key)
    for (const scope of scopes) {
      items.push(createLeafMenuRenderItem(
        key,
        scope,
        getScopeMenuTitle(scope, tab),
        KEY_UNIQ,
        duplicateCounts,
      ))
    }
    return { actions, items, root }
  }

  for (const { key, scopes } of effectiveEntries) {
    if (scopes.length === 1) {
      items.push(createKeyLeafMenuRenderItem(key, scopes[0], tab,
        duplicateCounts))
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
        duplicateCounts,
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
  currentMenuInstanceId = 0
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
  await createMenuItem({
    id: KEY_UNIQ_ACTION,
    title: i18n.getMessage(KEY_UNIQ),
    contexts,
    visible: false,
  })
  await createStaticMenuItems(entries, contexts)
}

function getRootRenderItemId (renderPlan) {
  const rootAction = renderPlan.actions.get(KEY_UNIQ)
  const rootIsAction = renderPlan.items.length === 0 && Boolean(rootAction)
  return rootIsAction ? KEY_UNIQ_ACTION : KEY_UNIQ
}

async function renderCurrentMenuItems (visibleEntries, tab, hierarchyCount) {
  const renderPlan = createMenuRenderPlan(visibleEntries, tab, hierarchyCount)
  const rootAction = renderPlan.actions.get(KEY_UNIQ)
  const rootIsAction = getRootRenderItemId(renderPlan) === KEY_UNIQ_ACTION

  for (const id of currentMenuItemIds) {
    await updateMenuItem(id, { visible: false }).catch(onError)
  }
  currentMenuActions = new Map(renderPlan.actions)
  currentMenuActions.delete(KEY_UNIQ)
  if (rootIsAction) {
    currentMenuActions.set(KEY_UNIQ_ACTION, rootAction)
  }
  if (rootIsAction) {
    await updateMenuItem(KEY_UNIQ_ACTION, {
      visible: renderPlan.root.visible,
      title: renderPlan.root.title,
    })
    await updateMenuItem(KEY_UNIQ, {
      visible: false,
      title: renderPlan.root.title,
    })
  } else {
    await updateMenuItem(KEY_UNIQ, {
      visible: renderPlan.root.visible,
      title: renderPlan.root.title,
    })
    await updateMenuItem(KEY_UNIQ_ACTION, {
      visible: false,
      title: renderPlan.root.title,
    })
  }

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

function isCurrentMenuInstance (menuInstanceId) {
  return menuInstanceId !== 0 && menuInstanceId === currentMenuInstanceId
}

function createMenuDuplicateCounts (visibleEntries, tab, hierarchyCount,
  tabList) {
  const counts = new Map()
  for (const { key, scopes } of getEffectiveEntries(visibleEntries,
    hierarchyCount, tab)) {
    for (const scope of scopes) {
      counts.set(getActionCountKey(key, scope),
        countDuplicateTabs(tabList, key, scope, tab))
    }
  }
  return counts
}

async function updateCurrentMenuItemTitles (renderPlan, menuInstanceId) {
  const updates = [
    [getRootRenderItemId(renderPlan), renderPlan.root.title],
    ...renderPlan.items.map((item) => [item.id, item.title]),
  ]

  if (!isCurrentMenuInstance(menuInstanceId)) {
    return
  }

  await Promise.all(updates.map(([id, title]) => {
    return updateMenuItem(id, { title }).catch(onError)
  }))

  if (isCurrentMenuInstance(menuInstanceId)) {
    await menus.refresh()
  }
}

async function updateCurrentMenuCounts (visibleEntries, tab, hierarchyCount,
  tabList, menuInstanceId) {
  if (!isCurrentMenuInstance(menuInstanceId)) {
    return
  }

  const duplicateCounts = createMenuDuplicateCounts(visibleEntries, tab,
    hierarchyCount, tabList)
  const renderPlan = createMenuRenderPlan(visibleEntries, tab, hierarchyCount,
    duplicateCounts)
  await updateCurrentMenuItemTitles(renderPlan, menuInstanceId)
}

function queueCurrentMenuCountUpdate (visibleEntries, tab, hierarchyCount,
  tabList, menuInstanceId) {
  globalThis.setTimeout(() => {
    updateCurrentMenuCounts(visibleEntries, tab, hierarchyCount, tabList,
      menuInstanceId).catch(onError)
  }, 0)
}

const runQueuedRebuildMenu = createQueuedTask(rebuildMenu)
let rebuildMenuPromise

function queueRebuildMenu () {
  const promise = runQueuedRebuildMenu()
  rebuildMenuPromise = promise
  promise.finally(() => {
    if (rebuildMenuPromise === promise) {
      rebuildMenuPromise = undefined
    }
  })
  return promise
}

async function waitForMenuRebuild () {
  if (rebuildMenuPromise) {
    await rebuildMenuPromise
  }
}

async function getCurrentTab () {
  const [tab] = await tabs.query({ active: true, currentWindow: true })
  return tab
}

async function handleMenuClick (info, tab) {
  await waitForMenuRebuild()
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
  await run(targetTab.windowId, entry.key, notification, entry.scope, targetTab)
}

async function handleMenuShown (info, tab) {
  const menuInstanceId = nextMenuInstanceId++
  currentMenuInstanceId = menuInstanceId

  await waitForMenuRebuild()
  const targetTab = tab || await getCurrentTab()
  if (!targetTab || currentContexts.length <= 0 ||
      currentEntries.length <= 0) {
    return
  }

  const tabList = await tabs.query({ windowId: targetTab.windowId })
  const hierarchyCount = getHierarchyCount(tabList, targetTab)

  await renderCurrentMenuItems(currentEntries, targetTab, hierarchyCount)
  if (!isCurrentMenuInstance(menuInstanceId)) {
    return
  }
  await menus.refresh()
  queueCurrentMenuCountUpdate(currentEntries, targetTab, hierarchyCount, tabList,
    menuInstanceId)
}

function handleMenuHidden () {
  currentMenuInstanceId = 0
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

menus.onHidden?.addListener(handleMenuHidden)

queueRebuildMenu().catch(onError)
