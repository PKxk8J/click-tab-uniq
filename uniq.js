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

  // 重複検査キーの取得関数
  const KEY_GETTERS = {
    [KEY_URL]: (tab) => tab.url,
    [KEY_TITLE]: (tab) => tab.title
  }

  // 重複するタブを削除する
  async function run (windowId, keyGetter, progress) {
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
        continue
      }

      // 重複するタブはピン留めされてなかった
      keyToSurviveId.set(key, tab.id)
      removeIds.push(rival.id)
    }

    progress.target = removeIds.length
    // 1つずつより速いが増やすと固まる
    for (let i = 0; i < removeIds.length; i += BULK_SIZE) {
      const target = removeIds.slice(i, i + BULK_SIZE)
      await tabs.remove(target)
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
  async function wrappedRun (windowId, keyType, notification) {
    const progress = {
      done: 0
    }
    try {
      if (notification) {
        await notify(progress)
        startProgressNotification(progress)
        progress.start = new Date()
      }

      await run(windowId, KEY_GETTERS[keyType], progress)
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
