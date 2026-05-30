import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

const state = {
  currentWindowId: 1,
  tabs: [],
  removed: [],
  activated: [],
  notifications: [],
  notificationError: undefined,
}

function cloneTab (tab) {
  return { ...tab }
}

function resetTabs (tabs) {
  state.tabs = tabs.map(cloneTab)
  state.removed = []
  state.activated = []
  state.notifications = []
  state.notificationError = undefined
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
    create: async (id, options) => {
      if (state.notificationError) {
        throw state.notificationError
      }
      state.notifications.push({ id, options })
      return 'notification'
    },
  },
  permissions: {
    contains: async () => true,
  },
  storage: {
    sync: {},
  },
  tabs: {
    SPLIT_VIEW_ID_NONE: -1,
    TAB_GROUP_ID_NONE: -1,
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
const {
  normalizeContexts,
  normalizeMenuItems,
  normalizeNotification,
} = await import('../extension/common.js')

test('対応しているメニューコンテキストだけを残してコンテキストを正規化する', () => {
  assert.deepEqual(normalizeContexts(undefined), ['tab'])
  assert.deepEqual(normalizeContexts(['all', 'unknown', 'tab']), ['tab', 'all'])
  assert.deepEqual(normalizeContexts('tab'), [])
})

test('旧形式のメニュー項目配列を境界維持モードに正規化する', () => {
  assert.deepEqual(normalizeMenuItems(['url', 'title']), {
    url: ['respectBoundaries'],
    title: ['respectBoundaries'],
  })
})

test('通知設定を真偽値に正規化する', () => {
  assert.equal(normalizeNotification(undefined), false)
  assert.equal(normalizeNotification(true), true)
  assert.equal(normalizeNotification('true'), false)
})

test('非アクティブな重複タブを閉じられる場合はアクティブな重複タブを残す', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: false, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: true, pinned: false, url: 'https://example.com/', title: 'Example' },
  ])

  await run(1, 'url', false, false)

  assert.deepEqual(state.removed, [1])
  assert.equal(state.tabs.find((tab) => tab.id === 2).active, true)
})

test('update API がなくても重複タブを閉じて通知を送る', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: false, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: true, pinned: false, url: 'https://example.com/', title: 'Example' },
  ])

  await run(1, 'url', false, true)

  assert.deepEqual(state.removed, [1])
  assert.equal(state.tabs.find((tab) => tab.id === 2).active, true)
  assert.equal(state.notifications.length, 1)
  assert.equal(state.notifications[0].id, 'ClickTabUniq')
  assert.equal(state.notifications[0].options.type, 'basic')
  assert.equal(state.notifications[0].options.title, 'ClickTabUniq')
  assert.equal(state.notifications[0].options.message.includes('successMessage'), true)
})

test('通知作成に失敗しても重複タブを閉じる', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: false, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: true, pinned: false, url: 'https://example.com/', title: 'Example' },
  ])
  state.notificationError = new Error('Notification unavailable')

  const errorMock = mock.method(globalThis.console, 'error', () => {})
  try {
    await run(1, 'url', false, true)
  } finally {
    errorMock.mock.restore()
  }

  assert.deepEqual(state.removed, [1])
  assert.equal(state.tabs.find((tab) => tab.id === 2).active, true)
})

test('固定タブが対象でない場合は固定タブの重複を閉じない', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: true, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: false, pinned: true, url: 'https://example.com/', title: 'Example' },
    { id: 3, windowId: 1, index: 2, active: true, pinned: false, url: 'https://other.example/', title: 'Other' },
  ])

  await run(1, 'url', false, false)

  assert.deepEqual(state.removed, [])
})

test('固定タブが対象の場合は固定タブの重複を閉じる', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: true, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: false, pinned: true, url: 'https://example.com/', title: 'Example' },
    { id: 3, windowId: 1, index: 2, active: true, pinned: false, url: 'https://other.example/', title: 'Other' },
  ])

  await run(1, 'url', true, false)

  assert.deepEqual(state.removed, [2])
})

test('urlWithoutHash では URL ハッシュ違いを重複として扱う', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: false, url: 'https://example.com/page#first', title: 'First' },
    { id: 2, windowId: 1, index: 1, active: true, pinned: false, url: 'https://example.com/page#second', title: 'Second' },
  ])

  await run(1, 'urlWithoutHash', false, false)

  assert.deepEqual(state.removed, [1])
  assert.equal(state.tabs.find((tab) => tab.id === 2).active, true)
})

test('既定では異なるタブグループの重複タブを残す', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: true, pinned: false, groupId: 1, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: false, pinned: false, groupId: 2, url: 'https://example.com/', title: 'Example' },
  ])

  await run(1, 'url', false, false)

  assert.deepEqual(state.removed, [])
})

test('境界を無視する場合はタブグループをまたいで重複タブを閉じる', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: true, pinned: false, groupId: 1, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: false, pinned: false, groupId: 2, url: 'https://example.com/', title: 'Example' },
  ])

  await run(1, 'url', false, false, 'ignoreBoundaries')

  assert.deepEqual(state.removed, [2])
})

test('既定では異なるコンテナの重複タブを残す', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: true, pinned: false, cookieStoreId: 'firefox-default', url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: false, pinned: false, cookieStoreId: 'firefox-container-1', url: 'https://example.com/', title: 'Example' },
  ])

  await run(1, 'url', false, false)

  assert.deepEqual(state.removed, [])
})

test('既定では分割ビューのタブを保護する', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: false, splitViewId: -1, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: false, pinned: false, splitViewId: 7, url: 'https://example.com/', title: 'Example' },
    { id: 3, windowId: 1, index: 2, active: true, pinned: false, splitViewId: -1, url: 'https://other.example/', title: 'Other' },
  ])

  await run(1, 'url', false, false)

  assert.deepEqual(state.removed, [1])
  assert.ok(state.tabs.find((tab) => tab.id === 2))
})

test('境界を無視する場合は分割ビュー内の重複タブも閉じられる', async () => {
  resetTabs([
    { id: 1, windowId: 1, index: 0, active: false, pinned: false, splitViewId: -1, url: 'https://example.com/', title: 'Example' },
    { id: 2, windowId: 1, index: 1, active: false, pinned: false, splitViewId: 7, url: 'https://example.com/', title: 'Example' },
    { id: 3, windowId: 1, index: 2, active: true, pinned: false, splitViewId: -1, url: 'https://other.example/', title: 'Other' },
  ])

  await run(1, 'url', false, false, 'ignoreBoundaries')

  assert.deepEqual(state.removed, [2])
})
