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
    KEY_SUCCESS_MESSAGE,
    KEY_FAILURE_MESSAGE,
    NOTIFICATION_ID,
    debug,
    onError
  } = common

  // 重複検査キーの取得関数
  const KEY_GETTERS = {
    [KEY_URL]: (tab) => tab.url,
    [KEY_TITLE]: (tab) => tab.title
  }

  // 重複するタブを削除する
  async function _uniq (windowId, keyGetter) {
    const tabList = await tabs.query({windowId})

    const keys = new Set()

    // ピン留めされているタブとフォーカスのあるタブを先に調べる
    let activeKey
    for (const tab of tabList) {
      if (tab.pinned) {
        keys.add(keyGetter(tab))
      }
      if (tab.active) {
        activeKey = keyGetter(tab)
      }
    }

    // 同じタブがピン留めされていないなら、フォーカスのあるタブは閉じない
    const ignoreActive = !keys.has(activeKey)
    keys.add(activeKey)

    const removeIds = []
    for (const tab of tabList) {
      if (tab.pinned) {
        continue
      }

      const key = keyGetter(tab)
      if (!keys.has(key)) {
        keys.add(key)
        continue
      } if (tab.active && ignoreActive) {
        continue
      }

      removeIds.push(tab.id)
      debug('Tab ' + tab.id + ' will be removed: ' + key)
    }

    await tabs.remove(removeIds)
    return {
      all: tabList.length,
      closed: removeIds.length
    }
  }

  // 通知を表示する
  async function notify (message) {
    await notifications.create(NOTIFICATION_ID, {
      'type': 'basic',
      'title': NOTIFICATION_ID,
      message: message
    })
  }

  // 前後処理で挟む
  async function wrapUniq (windowId, keyType, notification) {
    try {
      if (notification) {
        await notify(i18n.getMessage(KEY_CLOSING))
      }

      const start = new Date()
      const {all, closed} = await _uniq(windowId, KEY_GETTERS[keyType])
      const seconds = (new Date() - start) / 1000
      const message = i18n.getMessage(KEY_SUCCESS_MESSAGE, [seconds, all, closed])

      debug(message)
      if (notification) {
        await notify(message)
      }
    } catch (e) {
      onError(e)
      if (notification) {
        await notify(i18n.getMessage(KEY_FAILURE_MESSAGE, e))
      }
    }
  }

  _export = wrapUniq
}

const uniq = _export
