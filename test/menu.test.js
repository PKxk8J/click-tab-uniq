import assert from 'node:assert/strict'
import test from 'node:test'

const state = {
  tabs: [],
  storageData: {},
  menuItems: new Map(),
  removed: [],
  refreshCount: 0,
}

function createEvent () {
  const listeners = []
  return {
    addListener: (listener) => {
      listeners.push(listener)
    },
    listeners,
  }
}

const events = {
  menusClicked: createEvent(),
  menusShown: createEvent(),
  runtimeInstalled: createEvent(),
  runtimeStartup: createEvent(),
  storageChanged: createEvent(),
}

function cloneTab (tab) {
  return { ...tab }
}

function finishMenuCallback (callback, error) {
  globalThis.browser.runtime.lastError = error
  callback?.()
  globalThis.browser.runtime.lastError = undefined
}

function removeMenuItemAndChildren (id) {
  for (const [childId, item] of [...state.menuItems]) {
    if (item.parentId === id) {
      removeMenuItemAndChildren(childId)
    }
  }
  state.menuItems.delete(id)
}

function resetState ({ menuItems, tabs }) {
  state.tabs = tabs.map((tab) => ({
    active: false,
    groupId: -1,
    index: 0,
    pinned: false,
    splitViewId: -1,
    title: 'Tab ' + tab.id,
    url: 'https://example.com/' + tab.id,
    ...tab,
  }))
  state.storageData = {
    contexts: ['tab'],
    menuItems,
  }
  state.menuItems.clear()
  state.removed = []
  state.refreshCount = 0
}

globalThis.browser = {
  i18n: {
    getMessage: (key, substitutions) => {
      if (key === 'debug') {
        return 'release'
      }
      if (Array.isArray(substitutions)) {
        return key + ':' + substitutions.join(',')
      }
      if (substitutions !== undefined) {
        return key + ':' + substitutions
      }
      return key
    },
  },
  menus: {
    create: (properties, callback) => {
      if (state.menuItems.has(properties.id)) {
        finishMenuCallback(callback, new Error('Duplicate menu id'))
        return
      }
      state.menuItems.set(properties.id, { ...properties })
      finishMenuCallback(callback)
    },
    update: (id, properties, callback) => {
      const item = state.menuItems.get(id)
      if (!item) {
        finishMenuCallback(callback, new Error('Unknown menu id'))
        return
      }
      state.menuItems.set(id, { ...item, ...properties })
      finishMenuCallback(callback)
    },
    remove: (id, callback) => {
      if (!state.menuItems.has(id)) {
        finishMenuCallback(callback, new Error('Unknown menu id'))
        return
      }
      removeMenuItemAndChildren(id)
      finishMenuCallback(callback)
    },
    removeAll: async () => {
      state.menuItems.clear()
    },
    refresh: async () => {
      state.refreshCount += 1
    },
    onClicked: events.menusClicked,
    onShown: events.menusShown,
  },
  notifications: {
    create: async () => {},
  },
  permissions: {
    contains: async () => true,
  },
  runtime: {
    lastError: undefined,
    onInstalled: events.runtimeInstalled,
    onStartup: events.runtimeStartup,
  },
  storage: {
    sync: {
      get: async (key) => {
        if (typeof key === 'string') {
          return { [key]: state.storageData[key] }
        }
        return { ...state.storageData }
      },
    },
    onChanged: events.storageChanged,
  },
  tabs: {
    SPLIT_VIEW_ID_NONE: -1,
    TAB_GROUP_ID_NONE: -1,
    query: async (query = {}) => {
      let result = state.tabs
      if (query.windowId !== undefined) {
        result = result.filter((tab) => tab.windowId === query.windowId)
      }
      if (query.currentWindow) {
        result = result.filter((tab) => tab.windowId === 1)
      }
      if (query.active !== undefined) {
        result = result.filter((tab) => tab.active === query.active)
      }
      return result.map(cloneTab)
    },
    remove: async (ids) => {
      const idList = Array.isArray(ids) ? ids : [ids]
      state.removed.push(...idList)
      state.tabs = state.tabs.filter((tab) => !idList.includes(tab.id))
    },
    update: async (id, properties) => ({ id, ...properties }),
  },
}

resetState({
  menuItems: { url: ['currentHierarchy', 'eachHierarchy', 'allTabs'] },
  tabs: [
    { id: 1, windowId: 1, active: true },
  ],
})
await import('../extension/menu.js?menu-test')

async function rebuildMenu () {
  await events.runtimeStartup.listeners[0]()
}

async function showMenu (tabId) {
  const tab = state.tabs.find((entry) => entry.id === tabId)
  await events.menusShown.listeners[0]({}, cloneTab(tab))
}

async function clickMenu (menuItemId, tabId) {
  const tab = state.tabs.find((entry) => entry.id === tabId)
  await events.menusClicked.listeners[0]({ menuItemId }, cloneTab(tab))
}

function getChildIds (parentId) {
  return [...state.menuItems.entries()].
    filter(([, item]) => item.parentId === parentId).
    filter(([, item]) => item.visible !== false).
    map(([id]) => id)
}

function getAllChildIds (parentId) {
  return [...state.menuItems.entries()].
    filter(([, item]) => item.parentId === parentId).
    map(([id]) => id)
}

test('表示前に必要な子メニュー候補を作成する', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy', 'eachHierarchy', 'allTabs'] },
    tabs: [
      { id: 1, windowId: 1, active: true },
      { id: 2, windowId: 1, groupId: 10 },
    ],
  })
  await rebuildMenu()

  assert.deepEqual(getAllChildIds('uniq'), [
    'scope:url:currentHierarchy',
    'scope:url:topLevelHierarchy',
    'scope:url:eachHierarchy',
    'scope:url:allTabs',
  ])
  assert.deepEqual(getChildIds('uniq'), [])
})

test('判定キーが1つだけの場合はルートに判定キー名を含める', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy', 'eachHierarchy', 'allTabs'] },
    tabs: [
      { id: 1, windowId: 1, active: true },
      { id: 2, windowId: 1, groupId: 10 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.equal(state.menuItems.get('uniq').title, 'uniq: url')
  assert.deepEqual(getChildIds('uniq'), [
    'scope:url:currentHierarchy',
    'scope:url:eachHierarchy',
    'scope:url:allTabs',
  ])
  assert.equal(
    state.menuItems.get('scope:url:currentHierarchy').title,
    'topLevelScope',
  )
  assert.equal(
    state.menuItems.get('scope:url:eachHierarchy').title,
    'eachHierarchyMenu',
  )
  assert.equal(
    state.menuItems.get('scope:url:allTabs').title,
    'allTabsMenu',
  )
  assert.equal(state.refreshCount, 1)
})

test('階層が1つだけの場合は単一の実行候補をルートに統合する', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy', 'eachHierarchy', 'allTabs'] },
    tabs: [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: false,
        url: 'https://example.com/duplicate',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        active: true,
        url: 'https://example.com/duplicate',
      },
    ],
  })
  await rebuildMenu()
  await showMenu(2)

  assert.equal(state.menuItems.get('uniq:action').title, 'uniq: url: topLevelScope')
  assert.deepEqual(getChildIds('uniq'), [])

  await clickMenu('uniq:action', 2)

  assert.deepEqual(state.removed, [1])
})

test('トップレベルタブではクリックした階層内だけの設定をルートに統合する', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy'] },
    tabs: [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: false,
        url: 'https://example.com/duplicate',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        active: true,
        url: 'https://example.com/duplicate',
      },
    ],
  })
  await rebuildMenu()
  await showMenu(2)

  assert.equal(state.menuItems.get('uniq:action').title, 'uniq: url: topLevelScope')
  assert.deepEqual(getChildIds('uniq'), [])

  await clickMenu('uniq:action', 2)

  assert.deepEqual(state.removed, [1])
})

test('グループ内タブだけでもトップレベル扱いの判定範囲を表示する', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy', 'eachHierarchy', 'allTabs'] },
    tabs: [
      { id: 1, windowId: 1, active: true, groupId: 10 },
      { id: 2, windowId: 1, groupId: 10 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.deepEqual(getChildIds('uniq'), [
    'scope:url:currentHierarchy',
    'scope:url:topLevelHierarchy',
    'scope:url:eachHierarchy',
    'scope:url:allTabs',
  ])
  assert.equal(
    state.menuItems.get('scope:url:currentHierarchy').title,
    'groupScope',
  )
  assert.equal(
    state.menuItems.get('scope:url:topLevelHierarchy').title,
    'topLevelScope',
  )
})

test('ピン留めタブだけでもトップレベル扱いの判定範囲を表示する', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy', 'eachHierarchy', 'allTabs'] },
    tabs: [
      { id: 1, windowId: 1, active: true, pinned: true },
      { id: 2, windowId: 1, pinned: true },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.deepEqual(getChildIds('uniq'), [
    'scope:url:currentHierarchy',
    'scope:url:topLevelHierarchy',
    'scope:url:eachHierarchy',
    'scope:url:allTabs',
  ])
  assert.equal(
    state.menuItems.get('scope:url:currentHierarchy').title,
    'pinnedScope',
  )
  assert.equal(
    state.menuItems.get('scope:url:topLevelHierarchy').title,
    'topLevelScope',
  )
})

test('グループ内タブではクリックした階層内だけの設定でもトップレベルを表示する', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy'] },
    tabs: [
      { id: 1, windowId: 1, active: true, groupId: 10 },
      { id: 2, windowId: 1, groupId: 10 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.deepEqual(getChildIds('uniq'), [
    'scope:url:currentHierarchy',
    'scope:url:topLevelHierarchy',
  ])
  assert.equal(
    state.menuItems.get('scope:url:currentHierarchy').title,
    'groupScope',
  )
  assert.equal(
    state.menuItems.get('scope:url:topLevelHierarchy').title,
    'topLevelScope',
  )
})

test('グループ内タブではクリックした階層内をグループ内として表示する', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy', 'allTabs'] },
    tabs: [
      { id: 1, windowId: 1, active: true, groupId: 10 },
      { id: 2, windowId: 1 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.equal(
    state.menuItems.get('scope:url:currentHierarchy').title,
    'groupScope',
  )
})

test('ピン留めタブではクリックした階層内をピン留めタブ内として表示する', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy', 'allTabs'] },
    tabs: [
      { id: 1, windowId: 1, active: true, pinned: true },
      { id: 2, windowId: 1 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.equal(
    state.menuItems.get('scope:url:currentHierarchy').title,
    'pinnedScope',
  )
})

test('クリックした階層内では右クリック対象と同じ階層だけを削除する', async () => {
  resetState({
    menuItems: { url: ['currentHierarchy'] },
    tabs: [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: false,
        url: 'https://example.com/duplicate',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        active: false,
        url: 'https://example.com/duplicate',
      },
      {
        id: 3,
        windowId: 1,
        index: 2,
        active: false,
        groupId: 10,
        url: 'https://example.com/duplicate',
      },
      {
        id: 4,
        windowId: 1,
        index: 3,
        active: false,
        groupId: 10,
        url: 'https://example.com/duplicate',
      },
      {
        id: 5,
        windowId: 1,
        index: 4,
        active: true,
        url: 'https://example.com/unique',
      },
    ],
  })
  await rebuildMenu()
  await showMenu(1)
  await clickMenu('uniq:action', 1)

  assert.deepEqual(state.removed, [2])
})

test('全ての階層ごとではトップレベル・各グループ・ピン留めを別々に削除する', async () => {
  resetState({
    menuItems: { url: ['eachHierarchy'] },
    tabs: [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: false,
        url: 'https://example.com/duplicate',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        active: false,
        url: 'https://example.com/duplicate',
      },
      {
        id: 3,
        windowId: 1,
        index: 2,
        active: false,
        groupId: 10,
        url: 'https://example.com/duplicate',
      },
      {
        id: 4,
        windowId: 1,
        index: 3,
        active: false,
        groupId: 10,
        url: 'https://example.com/duplicate',
      },
      {
        id: 5,
        windowId: 1,
        index: 4,
        active: false,
        groupId: 20,
        url: 'https://example.com/duplicate',
      },
      {
        id: 6,
        windowId: 1,
        index: 5,
        active: false,
        pinned: true,
        url: 'https://example.com/duplicate',
      },
      {
        id: 7,
        windowId: 1,
        index: 6,
        active: false,
        pinned: true,
        url: 'https://example.com/duplicate',
      },
      {
        id: 8,
        windowId: 1,
        index: 7,
        active: true,
        url: 'https://example.com/unique',
      },
    ],
  })
  await rebuildMenu()
  await showMenu(1)
  await clickMenu('uniq:action', 1)

  assert.deepEqual(state.removed, [2, 4, 7])
})

test('全てのタブでは階層をまたいで重複タブを削除する', async () => {
  resetState({
    menuItems: { url: ['allTabs'] },
    tabs: [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: false,
        url: 'https://example.com/duplicate',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        active: false,
        groupId: 10,
        url: 'https://example.com/duplicate',
      },
      {
        id: 3,
        windowId: 1,
        index: 2,
        active: false,
        pinned: true,
        url: 'https://example.com/duplicate',
      },
      {
        id: 4,
        windowId: 1,
        index: 3,
        active: true,
        url: 'https://example.com/unique',
      },
    ],
  })
  await rebuildMenu()
  await showMenu(1)
  await clickMenu('uniq:action', 1)

  assert.deepEqual(state.removed, [2, 3])
})

test('複数の重複判定方法でもスコープが1つならサブメニューを作らない', async () => {
  resetState({
    menuItems: {
      url: ['currentHierarchy'],
      title: ['currentHierarchy', 'allTabs'],
    },
    tabs: [
      { id: 1, windowId: 1, active: true },
      { id: 2, windowId: 1, groupId: 10 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.deepEqual(getChildIds('uniq'), [
    'flatScope:url:currentHierarchy',
    'key:title',
  ])
  assert.equal(
    state.menuItems.get('flatScope:url:currentHierarchy').title,
    'url: topLevelScope',
  )
  assert.equal(state.menuItems.get('key:title').title, 'title')
  assert.deepEqual(getChildIds('key:title'), [
    'scope:title:currentHierarchy',
    'scope:title:allTabs',
  ])
})

test('複数の重複判定方法で畳んだ判定キー項目を直接実行できる', async () => {
  resetState({
    menuItems: {
      url: ['currentHierarchy'],
      title: ['allTabs'],
    },
    tabs: [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: true,
        url: 'https://example.com/duplicate',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        url: 'https://example.com/duplicate',
      },
      {
        id: 3,
        windowId: 1,
        index: 2,
        groupId: 10,
        url: 'https://example.com/duplicate',
      },
    ],
  })
  await rebuildMenu()
  await showMenu(1)
  await clickMenu('flatScope:url:currentHierarchy', 1)

  assert.deepEqual(state.removed, [2])
})
