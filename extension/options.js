import {
  ALL_CONTEXTS,
  ALL_MENU_ITEMS,
  ALL_MENU_MODES,
  DEFAULT_CONTEXTS,
  DEFAULT_NOTIFICATION,
  KEY_CONTEXTS,
  KEY_MENU_ITEMS,
  KEY_NOTIFICATION,
  KEY_SAVE,
  NOTIFICATION_PERMISSION,
  debug,
  normalizeMenuItems,
  onError,
  storageArea,
} from './common.js'

const {
  i18n,
  permissions,
} = browser

function getMenuModeInputId (key, mode) {
  return KEY_MENU_ITEMS + '_' + key + '_' + mode
}

function setLabelText (id, key) {
  document.getElementById(id).textContent = ' ' + i18n.getMessage(key) + ' '
}

async function restore () {
  const data = await storageArea.get()
  debug('Loaded ' + JSON.stringify(data))

  const {
    [KEY_CONTEXTS]: contexts = DEFAULT_CONTEXTS,
    [KEY_NOTIFICATION]: notification = DEFAULT_NOTIFICATION,
  } = data
  const menuItems = normalizeMenuItems(data[KEY_MENU_ITEMS])
  const notificationAllowed = notification &&
    await permissions.contains(NOTIFICATION_PERMISSION)

  const contextSet = new Set(contexts)
  ALL_CONTEXTS.forEach((key) => {
    document.getElementById(key).checked = contextSet.has(key)
  })

  ALL_MENU_ITEMS.forEach((key) => {
    const modeSet = new Set(menuItems[key] || [])
    ALL_MENU_MODES.forEach((mode) => {
      document.getElementById(getMenuModeInputId(key, mode)).checked =
        modeSet.has(mode)
    })
  })

  document.getElementById(KEY_NOTIFICATION).checked = notificationAllowed
}

async function applyNotificationPermission (notification) {
  if (notification) {
    return await permissions.contains(NOTIFICATION_PERMISSION) ||
      await permissions.request(NOTIFICATION_PERMISSION)
  }
  if (await permissions.contains(NOTIFICATION_PERMISSION)) {
    await permissions.remove(NOTIFICATION_PERMISSION)
  }
  return false
}

async function save () {
  const contexts = []
  ALL_CONTEXTS.forEach((key) => {
    if (document.getElementById(key).checked) {
      contexts.push(key)
    }
  })

  const menuItems = {}
  ALL_MENU_ITEMS.forEach((key) => {
    const modes = []
    ALL_MENU_MODES.forEach((mode) => {
      if (document.getElementById(getMenuModeInputId(key, mode)).checked) {
        modes.push(mode)
      }
    })
    if (modes.length > 0) {
      menuItems[key] = modes
    }
  })

  let notification = document.getElementById(KEY_NOTIFICATION).checked
  notification = await applyNotificationPermission(notification)
  document.getElementById(KEY_NOTIFICATION).checked = notification

  const data = {
    [KEY_CONTEXTS]: contexts,
    [KEY_MENU_ITEMS]: menuItems,
    [KEY_NOTIFICATION]: notification,
  }
  await storageArea.clear()
  await storageArea.set(data)
  debug('Saved ' + JSON.stringify(data))
}

function addCheckboxEntry (key, ul, inputId = key) {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.id = inputId
  const span = document.createElement('span')
  span.textContent = ' ' + i18n.getMessage(key) + ' '
  const label = document.createElement('label')
  label.appendChild(input)
  label.appendChild(span)
  const li = document.createElement('li')
  li.appendChild(label)

  ul.appendChild(li)
}

function addMenuItemEntry (key, ul) {
  const span = document.createElement('span')
  span.textContent = i18n.getMessage(key)

  const modeUl = document.createElement('ul')
  modeUl.style.listStyleType = 'none'
  ALL_MENU_MODES.forEach((mode) => {
    addCheckboxEntry(mode, modeUl, getMenuModeInputId(key, mode))
  })

  const li = document.createElement('li')
  li.appendChild(span)
  li.appendChild(modeUl)
  ul.appendChild(li)
}

async function init () {
  const contextUl = document.getElementById(KEY_CONTEXTS)
  ALL_CONTEXTS.forEach((key) => addCheckboxEntry(key, contextUl))

  const itemUl = document.getElementById(KEY_MENU_ITEMS)
  ALL_MENU_ITEMS.forEach((key) => addMenuItemEntry(key, itemUl))

  setLabelText('label_' + KEY_CONTEXTS, KEY_CONTEXTS)
  setLabelText('label_' + KEY_MENU_ITEMS, KEY_MENU_ITEMS)
  setLabelText('label_' + KEY_NOTIFICATION, KEY_NOTIFICATION)
  setLabelText('label_' + KEY_SAVE, KEY_SAVE)

  document.getElementById(KEY_SAVE).
    addEventListener('click', () => save().catch(onError))

  await restore()
}

init().catch(onError)
