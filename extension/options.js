import {
  ALL_CONTEXTS,
  ALL_MENU_ITEMS,
  DEFAULT_CONTEXTS,
  DEFAULT_MENU_ITEMS,
  DEFAULT_NOTIFICATION,
  KEY_CONTEXTS,
  KEY_MENU_ITEMS,
  KEY_NOTIFICATION,
  KEY_SAVE,
  debug,
  onError,
  storageArea,
} from './common.js'

const {
  i18n,
} = browser

const LABEL_KEYS = ALL_CONTEXTS.concat(ALL_MENU_ITEMS,
  [KEY_CONTEXTS, KEY_MENU_ITEMS, KEY_NOTIFICATION, KEY_SAVE])

async function restore () {
  const data = await storageArea.get()
  debug('Loaded ' + JSON.stringify(data))

  const {
    [KEY_CONTEXTS]: contexts = DEFAULT_CONTEXTS,
    [KEY_MENU_ITEMS]: menuItems = DEFAULT_MENU_ITEMS,
    [KEY_NOTIFICATION]: notification = DEFAULT_NOTIFICATION,
  } = data

  const contextSet = new Set(contexts)
  ALL_CONTEXTS.forEach((key) => {
    document.getElementById(key).checked = contextSet.has(key)
  })

  const menuItemSet = new Set(menuItems)
  ALL_MENU_ITEMS.forEach((key) => {
    document.getElementById(key).checked = menuItemSet.has(key)
  })

  document.getElementById(KEY_NOTIFICATION).checked = notification
}

async function save () {
  const contexts = []
  ALL_CONTEXTS.forEach((key) => {
    if (document.getElementById(key).checked) {
      contexts.push(key)
    }
  })

  const menuItems = []
  ALL_MENU_ITEMS.forEach((key) => {
    if (document.getElementById(key).checked) {
      menuItems.push(key)
    }
  })

  const notification = document.getElementById(KEY_NOTIFICATION).checked

  const data = {
    [KEY_CONTEXTS]: contexts,
    [KEY_MENU_ITEMS]: menuItems,
    [KEY_NOTIFICATION]: notification,
  }
  await storageArea.clear()
  await storageArea.set(data)
  debug('Saved ' + JSON.stringify(data))
}

function addCheckboxEntry (key, ul) {
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
}

async function init () {
  const contextUl = document.getElementById(KEY_CONTEXTS)
  ALL_CONTEXTS.forEach((key) => addCheckboxEntry(key, contextUl))

  const itemUl = document.getElementById(KEY_MENU_ITEMS)
  ALL_MENU_ITEMS.forEach((key) => addCheckboxEntry(key, itemUl))

  LABEL_KEYS.forEach((key) => {
    document.getElementById('label_' + key).textContent = ' ' +
      i18n.getMessage(key) + ' '
  })

  document.getElementById(KEY_SAVE).
    addEventListener('click', () => save().catch(onError))

  await restore()
}

init().catch(onError)
