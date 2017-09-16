'use strict'

const {
  i18n
} = browser
const {
  storageArea,
  KEY_URL,
  KEY_TITLE,
  KEY_MENU_ITEM,
  KEY_NOTIFICATION,
  KEY_SAVE,
  DEFAULT_MENU_ITEM,
  DEFAULT_NOTIFICATION,
  debug,
  onError
} = common

const MENU_ITEM_KEYS = [KEY_URL, KEY_TITLE]
const LABEL_KEYS = MENU_ITEM_KEYS.concat([KEY_MENU_ITEM, KEY_NOTIFICATION, KEY_SAVE])

/*
 * {
 *   "menuItem": ["url", "title", ...],
 *   "notification": true
 * }
 */

// 現在の設定を表示する
async function restore () {
  const data = await storageArea.get()
  debug('Loaded ' + JSON.stringify(data))

  const {
    [KEY_MENU_ITEM]: menuItem = DEFAULT_MENU_ITEM,
    [KEY_NOTIFICATION]: notification = DEFAULT_NOTIFICATION
  } = data

  const menuItemSet = new Set(menuItem)
  MENU_ITEM_KEYS.forEach((key) => {
    document.getElementById(key).checked = menuItemSet.has(key)
  })

  document.getElementById(KEY_NOTIFICATION).checked = notification
}

// 設定を保存する
async function save () {
  const menuItem = []
  MENU_ITEM_KEYS.forEach((key) => {
    if (document.getElementById(key).checked) {
      menuItem.push(key)
    }
  })

  const notification = document.getElementById(KEY_NOTIFICATION).checked

  const data = {
    [KEY_MENU_ITEM]: menuItem,
    [KEY_NOTIFICATION]: notification
  }
  // 古い形式のデータを消す
  await storageArea.clear()
  await storageArea.set(data)
  debug('Saved ' + JSON.stringify(data))
}

// 初期化
(async function () {
  const ul = document.getElementById(KEY_MENU_ITEM)
  MENU_ITEM_KEYS.forEach((key) => {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.id = key
    const span = document.createElement('span')
    span.id = 'label_' + key
    const label = document.createElement('label')
    label.appendChild(input)
    label.appendChild(span)
    const li = document.createElement('li')
    li.appendChild(label)

    ul.appendChild(li)
  })

  LABEL_KEYS.forEach((key) => {
    document.getElementById('label_' + key).textContent = ' ' + i18n.getMessage(key) + ' '
  })

  document.addEventListener('DOMContentLoaded', () => restore().catch(onError))
  document.getElementById('save').addEventListener('click', (e) => save().catch(onError))
})().catch(onError)
