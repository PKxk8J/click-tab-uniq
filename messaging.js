'use strict'

// メッセージインターフェース

{
  const {
    runtime
  } = browser
  const {
    KEY_UNIQ,
    debug,
    onError
  } = common

  function handler (message, sender, sendResponse) {
    (async function () {
      debug('Message ' + JSON.stringify(message) + ' was received')
      switch (message.type) {
        case KEY_UNIQ: {
          const {
            keyType,
            windowId,
            notification
          } = message
          await uniq(windowId, keyType, notification)
        }
      }
    })().catch(onError)
  }

  // 初期化
  (async function () {
    // メッセージから実行
    runtime.onMessageExternal.addListener(handler)
  })().catch(onError)
}
