import assert from 'node:assert/strict'
import test from 'node:test'

const state = {
  currentWindowId: 1,
  tabs: [],
  removed: [],
  activated: [],
}

function cloneTab (tab) {
  return { ...tab }
}

function resetTabs (tabs) {
  state.tabs = tabs.map(cloneTab)
  state.removed = []
  state.activated = []
}

globalThis.browser = {
  i18n: {
    getMessage: (key) => {
      if (key === 'debug') {
        return 'release'
      }
      if (key === 'name') {
        return 'ClickTabUniq'
      }
      return key
    },
  },
  notifications: {
    create: async () => 'notification',
    update: async () => false,
  },
  permissions: {
    contains: async () => true,
  },
  storage: {
    sync: {},
  },
  tabs: {
    query: async (query) => {
      let result = state.tabs
      if (query.windowId !== undefined) {
        result = result.filter((tab) => tab.windowId === query.windowId)
      }
      if (query.currentWindow) {
        result = result.filter((tab) => tab.windowId === state.currentWindowId)
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
    update: async (id, properties) => {
      const target = state.tabs.find((tab) => tab.id === id)
      if (properties.active) {
        state.tabs.forEach((tab) => {
          if (target && tab.windowId === target.windowId) {
            tab.active = tab.id === id
          }
        })
        state.activated.push(id)
      }
      return target && cloneTab(target)
    },
  },
}

const {
  run,
} = await import('../extension/uniq.js')

test('keeps the active duplicate tab when a non-active rival can be closed', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: false, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: true, pinned: false, url: 'https://example.com/', title: 'Example' },
  ])

  await run(1, 'url', false, false)

  assert.deepEqual(state.removed, [1])
  assert.equal(state.tabs.find((tab) => tab.id === 2).active, true)
})

test('does not close pinned duplicates when pinned tabs are not requested', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: true, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: false, pinned: true, url: 'https://example.com/', title: 'Example' },
    { id: 3, windowId: 1, index: 2, active: true, pinned: false, url: 'https://other.example/', title: 'Other' },
  ])

  await run(1, 'url', false, false)

  assert.deepEqual(state.removed, [])
})

test('closes pinned duplicates when pinned tabs are requested', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: true, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: false, pinned: true, url: 'https://example.com/', title: 'Example' },
    { id: 3, windowId: 1, index: 2, active: true, pinned: false, url: 'https://other.example/', title: 'Other' },
  ])

  await run(1, 'url', true, false)

  assert.deepEqual(state.removed, [2])
})

test('treats URL hash variants as duplicates for urlWithoutHash', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: false, url: 'https://example.com/page#first', title: 'First' },
    { id: 2, windowId: 1, index: 1, active: true, pinned: false, url: 'https://example.com/page#second', title: 'Second' },
  ])

  await run(1, 'urlWithoutHash', false, false)

  assert.deepEqual(state.removed, [1])
  assert.equal(state.tabs.find((tab) => tab.id === 2).active, true)
})
