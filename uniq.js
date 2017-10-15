'use strict'

// 重複削除処理本体

var _export

{
  const {
    i18n,
    notifications,
    tabs
  } = browser
  const {
    KEY_URL,
    KEY_TITLE,
    KEY_CLOSING,
    KEY_PROGRESS,
    KEY_SUCCESS_MESSAGE,
    KEY_FAILURE_MESSAGE,
    NOTIFICATION_ID,
    NOTIFICATION_INTERVAL,
    BULK_SIZE,
    debug,
    onError,
    asleep
  } = common
  const {
    isActiveTab
  } = monitor

  // 重複検査キーの取得関数
  const KEY_GETTERS = {
    [KEY_URL]: (tab) => tab.url,
    [KEY_TITLE]: (tab) => tab.title
  }

  // 未読み込みのタブにフォーカスが移って読み込んでしまうのを防ぐために
  // 移動しないタブか末尾のタブにフォーカスする
  async function activateBest (windowId, excludedIds) {
    const moveIdSet = new Set(excludedIds)

    const tabList = await tabs.query({windowId})

    let activeTab
    let lastTab
    let notMoveTabs = []
    for (const tab of tabList) {
      const move = moveIdSet.has(tab.id)

      if (tab.active) {
        if (!move) {
          // 元から移動しないタブにフォーカスしてる
          return
        }
        activeTab = tab
      }
      if (!lastTab || tab.index > lastTab.index) {
        lastTab = tab
      }
      if (!move) {
        notMoveTabs.push(tab)
      }
    }

    // フォーカスしているタブの後ろで最も近い動かないタブ
    let nextTab
    // フォーカスしているタブの前で最も近い動かないタブ
    let prevTab
    for (const tab of notMoveTabs) {
      if (tab.index < activeTab.index) {
        if (!prevTab || tab.index > prevTab.index) {
          prevTab = tab
        }
      } else {
        if (!nextTab || tab.index < nextTab.index) {
          nextTab = tab
        }
      }
    }

    let bestTab
    if (nextTab) {
      bestTab = nextTab
    } else if (prevTab) {
      bestTab = prevTab
    } else {
      bestTab = lastTab
    }

    if (bestTab === activeTab) {
      // 全部が移動対象で activeTab が lastTab だった
      return
    } else if (activeTab.index + 1 === bestTab.index) {
      // activeTab を移動させれば自然と bestTab にフォーカスが移る
      return
    }

    await tabs.update(bestTab.id, {active: true})
    debug('Activated tab ' + bestTab.id)
  }

  // 重複するタブを削除する
  async function run (windowId, keyGetter, closePinned, progress) {
    const tabList = await tabs.query({windowId})
    progress.all = tabList.length

    const idToEntry = new Map()
    const keyToSurviveId = new Map()
    const removeIds = []
    for (const tab of tabList) {
      const key = keyGetter(tab)

      idToEntry.set(tab.id, {tab, key})
      if (!keyToSurviveId.has(key)) {
        // 重複するタブはまだ見つかってない
        keyToSurviveId.set(key, tab.id)
        continue
      }

      // 重複するタブが見つかってる

      if (!tab.pinned) {
        removeIds.push(tab.id)
        continue
      }

      // ピン留めされてる

      const rival = idToEntry.get(keyToSurviveId.get(key)).tab
      if (rival.pinned) {
        if (closePinned) {
          removeIds.push(tab.id)
        }
        continue
      }

      // 重複するタブはピン留めされてなかった
      keyToSurviveId.set(key, tab.id)
      removeIds.push(rival.id)
    }

    progress.target = removeIds.length
    // 1つずつより速いが増やすと固まる
    // 後ろから消した方が速い
    for (let i = removeIds.length; i > 0; i -= BULK_SIZE) {
      const target = removeIds.slice(Math.max(0, i - BULK_SIZE), i)

      for (let j = 0; j < target.length; j++) {
        const id = target[j]
        if (isActiveTab(id)) {
          const entry = idToEntry.get(id)
          const rival = idToEntry.get(keyToSurviveId.get(entry.key)).tab
          if (!rival.pinned || (closePinned && entry.tab.pinned)) {
            keyToSurviveId.set(entry.key, id)
            target[j] = rival.id
            break
          }
          await activateBest(entry.tab.windowId, removeIds)
          break
        }
      }

      await tabs.remove(target)
      debug('Tabs' + target + ' were closed')
      progress.done += target.length
    }
  }

  async function startProgressNotification (progress) {
    while (true) {
      await asleep(NOTIFICATION_INTERVAL)
      if (progress.end || progress.error) {
        break
      }
      notify(progress)
    }
  }

  // 通知を表示する
  async function notify (progress) {
    let message
    if (progress.error) {
      message = i18n.getMessage(KEY_FAILURE_MESSAGE, progress.error)
    } else if (progress.end) {
      const seconds = (progress.end - progress.start) / 1000
      message = i18n.getMessage(KEY_SUCCESS_MESSAGE, [seconds, progress.all, progress.done])
    } else if (progress.start && progress.target) {
      const seconds = (new Date() - progress.start) / 1000
      const percentage = Math.floor(progress.done * 100 / progress.target)
      message = i18n.getMessage(KEY_PROGRESS, [seconds, percentage])
    } else {
      message = i18n.getMessage(KEY_CLOSING)
    }
    await notifications.create(NOTIFICATION_ID, {
      'type': 'basic',
      'title': NOTIFICATION_ID,
      message
    })
  }

  // 前後処理で挟む
  async function wrappedRun (windowId, keyType, closePinned, notification) {
    const progress = {
      done: 0
    }
    try {
      if (notification) {
        await notify(progress)
        startProgressNotification(progress)
        progress.start = new Date()
      }

      await run(windowId, KEY_GETTERS[keyType], closePinned, progress)
      debug('Finished')

      if (notification) {
        progress.end = new Date()
        await notify(progress)
      }
    } catch (e) {
      onError(e)
      if (notification) {
        progress.error = e
        await notify(progress)
      }
    }
  }

  _export = Object.freeze({
    run: wrappedRun
  })
}

const uniq = _export
