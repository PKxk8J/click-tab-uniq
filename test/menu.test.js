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
  menuItems: { url: ['respectBoundaries', 'ignoreBoundaries'] },
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
    map(([id]) => id)
}

test('境界がない場合は守る/無視するメニューを単一項目へ畳む', async () => {
  resetState({
    menuItems: { url: ['respectBoundaries', 'ignoreBoundaries'] },
    tabs: [
      { id: 1, windowId: 1, active: true },
      { id: 2, windowId: 1 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.equal(state.menuItems.get('uniq').title, 'uniqBy:url')
  assert.deepEqual(getChildIds('uniq'), [])
  assert.equal(state.refreshCount, 1)
})

test('畳んだ単一項目から重複タブを削除できる', async () => {
  resetState({
    menuItems: { url: ['respectBoundaries', 'ignoreBoundaries'] },
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
  await clickMenu('uniq', 2)

  assert.deepEqual(state.removed, [1])
})

test('境界がある場合は守る/無視するメニューを表示する', async () => {
  resetState({
    menuItems: { url: ['respectBoundaries', 'ignoreBoundaries'] },
    tabs: [
      { id: 1, windowId: 1, active: true, groupId: 10 },
      { id: 2, windowId: 1, groupId: 10 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.equal(state.menuItems.get('uniq').title, 'uniqBy:url')
  assert.deepEqual(getChildIds('uniq'), [
    'mode:url:respectBoundaries',
    'mode:url:ignoreBoundaries',
  ])
  assert.equal(
    state.menuItems.get('mode:url:respectBoundaries').title,
    'respectBoundariesMenu',
  )
  assert.equal(
    state.menuItems.get('mode:url:ignoreBoundaries').title,
    'ignoreBoundariesMenu',
  )
})

test('境界がある場合の葉メニューから重複タブを削除できる', async () => {
  resetState({
    menuItems: { url: ['respectBoundaries', 'ignoreBoundaries'] },
    tabs: [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: true,
        groupId: 10,
        url: 'https://example.com/duplicate',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        groupId: 20,
        url: 'https://example.com/duplicate',
      },
    ],
  })
  await rebuildMenu()
  await showMenu(1)
  await clickMenu('mode:url:ignoreBoundaries', 1)

  assert.deepEqual(state.removed, [2])
})

test('表示ごとに境界の有無へ合わせて動的メニューを描き直す', async () => {
  resetState({
    menuItems: { url: ['respectBoundaries', 'ignoreBoundaries'] },
    tabs: [
      { id: 1, windowId: 1, active: true },
      { id: 2, windowId: 2, active: true, groupId: 10 },
    ],
  })
  await rebuildMenu()
  await showMenu(2)
  await showMenu(1)

  assert.deepEqual(getChildIds('uniq'), [])
  assert.equal(state.menuItems.has('mode:url:respectBoundaries'), false)
  assert.equal(state.menuItems.has('mode:url:ignoreBoundaries'), false)
  assert.equal(state.menuItems.get('uniq').title, 'uniqBy:url')
  assert.equal(state.refreshCount, 2)
})
