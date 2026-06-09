import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import process from 'node:process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Builder, By, until } from 'selenium-webdriver'
import firefox from 'selenium-webdriver/firefox.js'
import { download } from 'geckodriver'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EXTENSION_DIR = resolve(ROOT_DIR, 'extension')
const WAIT_MS = 15_000

let driver
let extensionBaseUrl

async function createDriver () {
  const geckoDriverPath = process.env.GECKODRIVER_PATH || await download()
  const options = new firefox.Options()
  options.addArguments('-remote-allow-system-access')
  if (process.env.E2E_HEADLESS !== '0') {
    options.addArguments('-headless')
  }
  if (process.env.FIREFOX_BINARY) {
    options.setBinary(process.env.FIREFOX_BINARY)
  }

  return new Builder().
    forBrowser('firefox').
    setFirefoxOptions(options).
    setFirefoxService(new firefox.ServiceBuilder(geckoDriverPath)).
    build()
}

async function getExtensionBaseUrl (addonId) {
  await driver.setContext(firefox.Context.CHROME)
  try {
    return await driver.executeScript(`
      const policy = WebExtensionPolicy.getByID(arguments[0])
      return policy?.getURL('') || null
    `, addonId)
  } finally {
    await driver.setContext(firefox.Context.CONTENT)
  }
}

async function openExtensionPage (path) {
  await driver.get(extensionBaseUrl + path)
}

async function openFreshOptionsPage () {
  await openExtensionPage('options.html')
  await waitForOptionsPage()
  await runExtensionScript('await browser.storage.sync.clear()')
  await driver.navigate().refresh()
  await waitForOptionsPage()
}

async function waitForOptionsPage () {
  await driver.wait(until.elementLocated(By.id('tab')), WAIT_MS)
  await driver.wait(async () => {
    return await driver.executeScript(`
      return document.getElementById('label_name')?.textContent === 'ClickTabUniq' &&
        Boolean(document.getElementById('menuItems_url_eachHierarchy')) &&
        Boolean(document.getElementById('notification'))
    `)
  }, WAIT_MS)
}

async function runExtensionScript (script, ...args) {
  const result = await driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1]
    const args = Array.from(arguments).slice(0, -1)

    async function run () {
      const wait = msec => new Promise(resolve => setTimeout(resolve, msec))
      async function waitUntil (predicate, timeout = 5000) {
        const startedAt = Date.now()
        while (Date.now() - startedAt < timeout) {
          const value = await predicate()
          if (value) {
            return value
          }
          await wait(100)
        }
        return await predicate()
      }

      ${script}
    }

    run().then(
      value => done({ ok: true, value }),
      error => done({
        ok: false,
        message: error?.message || String(error),
        stack: error?.stack || '',
      }),
    )
  `, ...args)

  if (!result.ok) {
    throw new Error(result.stack || result.message)
  }
  return result.value
}

async function getStorageData () {
  return await runExtensionScript('return await browser.storage.sync.get()')
}

async function waitForStorageData (predicate, description) {
  let latest
  await driver.wait(async () => {
    latest = await getStorageData()
    return predicate(latest)
  }, WAIT_MS, description)
  return latest
}

async function setCheckboxValue (id, checked) {
  const input = await driver.findElement(By.id(id))
  await driver.executeScript(`
    if (arguments[0].checked === arguments[1]) {
      return
    }
    arguments[0].checked = arguments[1]
    arguments[0].dispatchEvent(new Event('change', { bubbles: true }))
  `, input, checked)
}

async function isChecked (id) {
  return await (await driver.findElement(By.id(id))).isSelected()
}

describe('Firefox extension E2E', () => {
  before(async () => {
    driver = await createDriver()
    const addonId = await driver.installAddon(EXTENSION_DIR, true)
    extensionBaseUrl = await getExtensionBaseUrl(addonId)
    assert.ok(extensionBaseUrl, '拡張機能の moz-extension URL を取得できません')
  })

  after(async () => {
    if (driver) {
      await driver.quit()
    }
  })

  test('options page saves settings and restores them after reload', async () => {
    await openFreshOptionsPage()

    assert.equal(await isChecked('tab'), true)
    assert.equal(await isChecked('all'), false)
    assert.equal(await isChecked('menuItems_url_currentHierarchy'), false)
    assert.equal(await isChecked('menuItems_url_eachHierarchy'), true)
    assert.equal(await isChecked('menuItems_url_allTabs'), false)
    assert.equal(await isChecked('menuItems_urlWithoutHash_currentHierarchy'),
      false)
    assert.equal(await isChecked('menuItems_title_eachHierarchy'), true)
    assert.equal(await isChecked('notification'), false)

    await setCheckboxValue('all', true)
    await setCheckboxValue('menuItems_url_allTabs', true)
    await setCheckboxValue('menuItems_urlWithoutHash_currentHierarchy', true)
    await setCheckboxValue('menuItems_title_eachHierarchy', false)

    await waitForStorageData((data) => {
      return data.contexts?.includes('tab') &&
        data.contexts?.includes('all') &&
        data.menuItems?.url?.includes('eachHierarchy') &&
        data.menuItems?.url?.includes('allTabs') &&
        data.menuItems?.urlWithoutHash?.includes('currentHierarchy') &&
        !data.menuItems?.title?.includes('eachHierarchy') &&
        data.notification === false
    }, 'options page settings were not saved')

    await driver.navigate().refresh()
    await waitForOptionsPage()

    assert.equal(await isChecked('tab'), true)
    assert.equal(await isChecked('all'), true)
    assert.equal(await isChecked('menuItems_url_eachHierarchy'), true)
    assert.equal(await isChecked('menuItems_url_allTabs'), true)
    assert.equal(await isChecked('menuItems_urlWithoutHash_currentHierarchy'),
      true)
    assert.equal(await isChecked('menuItems_title_eachHierarchy'), false)
    assert.equal(await isChecked('notification'), false)
  })

  test('run closes duplicate tabs by URL in Firefox', async () => {
    await openFreshOptionsPage()

    const result = await runExtensionScript(`
      const { run } = await import(browser.runtime.getURL('uniq.js'))
      const token = 'click-tab-uniq-e2e-' + Date.now() + '-' + Math.random()
      const duplicateUrl = 'https://example.com/?' + token
      const uniqueUrl = 'https://example.org/?' + token
      const createdTabs = []

      try {
        createdTabs.push(await browser.tabs.create({
          active: false,
          url: duplicateUrl,
        }))
        createdTabs.push(await browser.tabs.create({
          active: false,
          url: duplicateUrl,
        }))
        createdTabs.push(await browser.tabs.create({
          active: false,
          url: uniqueUrl,
        }))

        const sourceWindowId = createdTabs[0].windowId
        const ready = await waitUntil(async () => {
          const tabs = []
          for (const tab of createdTabs) {
            tabs.push(await browser.tabs.get(tab.id).catch(() => null))
          }
          return tabs.every(tab =>
            tab?.url === duplicateUrl || tab?.url === uniqueUrl)
        })
        if (!ready) {
          throw new Error('created tab URLs did not settle')
        }

        await run(sourceWindowId, 'url', false)

        const remaining = await waitUntil(async () => {
          const tabs = await browser.tabs.query({
            windowId: sourceWindowId,
          })
          const tabIds = new Set(tabs.map(tab => tab.id))
          if (tabIds.has(createdTabs[0].id) &&
              !tabIds.has(createdTabs[1].id) &&
              tabIds.has(createdTabs[2].id)) {
            return tabs.filter(tab =>
              createdTabs.some(created => created.id === tab.id))
          }
        })
        if (!remaining) {
          throw new Error('duplicate tab was not closed')
        }

        return {
          closedTabId: createdTabs[1].id,
          remainingTabIds: remaining.map(tab => tab.id),
          survivorTabId: createdTabs[0].id,
          uniqueTabId: createdTabs[2].id,
        }
      } finally {
        for (const tab of createdTabs) {
          await browser.tabs.remove(tab.id).catch(() => {})
        }
      }
    `)

    assert.equal(result.remainingTabIds.includes(result.survivorTabId), true)
    assert.equal(result.remainingTabIds.includes(result.uniqueTabId), true)
    assert.equal(result.remainingTabIds.includes(result.closedTabId), false)
  })

  test('run closes duplicate tabs by URL without hash in Firefox', async () => {
    await openFreshOptionsPage()

    const result = await runExtensionScript(`
      const { run } = await import(browser.runtime.getURL('uniq.js'))
      const token = 'click-tab-uniq-e2e-' + Date.now() + '-' + Math.random()
      const duplicateBaseUrl = 'https://example.com/?' + token
      const uniqueUrl = 'https://example.org/?' + token + '#first'
      const createdTabs = []

      try {
        createdTabs.push(await browser.tabs.create({
          active: false,
          url: duplicateBaseUrl + '#first',
        }))
        createdTabs.push(await browser.tabs.create({
          active: false,
          url: duplicateBaseUrl + '#second',
        }))
        createdTabs.push(await browser.tabs.create({
          active: false,
          url: uniqueUrl,
        }))

        const sourceWindowId = createdTabs[0].windowId
        const ready = await waitUntil(async () => {
          const tabs = []
          for (const tab of createdTabs) {
            tabs.push(await browser.tabs.get(tab.id).catch(() => null))
          }
          return tabs.every(tab =>
            tab?.url === duplicateBaseUrl + '#first' ||
            tab?.url === duplicateBaseUrl + '#second' ||
            tab?.url === uniqueUrl)
        })
        if (!ready) {
          throw new Error('created tab URLs did not settle')
        }

        await run(sourceWindowId, 'urlWithoutHash', false)

        const remaining = await waitUntil(async () => {
          const tabs = await browser.tabs.query({
            windowId: sourceWindowId,
          })
          const tabIds = new Set(tabs.map(tab => tab.id))
          if (tabIds.has(createdTabs[0].id) &&
              !tabIds.has(createdTabs[1].id) &&
              tabIds.has(createdTabs[2].id)) {
            return tabs.filter(tab =>
              createdTabs.some(created => created.id === tab.id))
          }
        })
        if (!remaining) {
          throw new Error('hash-only duplicate tab was not closed')
        }

        return {
          closedTabId: createdTabs[1].id,
          remainingTabIds: remaining.map(tab => tab.id),
          survivorTabId: createdTabs[0].id,
          uniqueTabId: createdTabs[2].id,
        }
      } finally {
        for (const tab of createdTabs) {
          await browser.tabs.remove(tab.id).catch(() => {})
        }
      }
    `)

    assert.equal(result.remainingTabIds.includes(result.survivorTabId), true)
    assert.equal(result.remainingTabIds.includes(result.uniqueTabId), true)
    assert.equal(result.remainingTabIds.includes(result.closedTabId), false)
  })

  test('run closes duplicate tabs across tab groups with allTabs scope in Firefox',
    async (t) => {
      await openFreshOptionsPage()

      const canGroupTabs = await runExtensionScript(`
        return typeof browser.tabs.group === 'function'
      `)
      if (!canGroupTabs) {
        t.skip('browser.tabs.group is unavailable in this Firefox build')
        return
      }

      const result = await runExtensionScript(`
        const { countDuplicateTabs, run } =
          await import(browser.runtime.getURL('uniq.js'))
        const token = 'click-tab-uniq-e2e-' + Date.now() + '-' + Math.random()
        const duplicateUrl = 'https://example.com/?' + token
        const uniqueUrl = 'https://example.org/?' + token
        const createdTabs = []

        try {
          createdTabs.push(await browser.tabs.create({
            active: false,
            url: duplicateUrl,
          }))
          createdTabs.push(await browser.tabs.create({
            active: false,
            url: duplicateUrl,
          }))
          createdTabs.push(await browser.tabs.create({
            active: false,
            url: uniqueUrl,
          }))

          const sourceWindowId = createdTabs[0].windowId
          const ready = await waitUntil(async () => {
            const tabs = []
            for (const tab of createdTabs) {
              tabs.push(await browser.tabs.get(tab.id).catch(() => null))
            }
            return tabs.every(tab =>
              tab?.url === duplicateUrl || tab?.url === uniqueUrl)
          })
          if (!ready) {
            throw new Error('created tab URLs did not settle')
          }

          await browser.tabs.group({ tabIds: [createdTabs[1].id] })

          const noGroupId =
            browser.tabGroups?.TAB_GROUP_ID_NONE ??
            browser.tabs.TAB_GROUP_ID_NONE ??
            -1
          const sourceTab = await browser.tabs.get(createdTabs[0].id)
          const groupedTab = await browser.tabs.get(createdTabs[1].id)
          const uniqueTab = await browser.tabs.get(createdTabs[2].id)
          if (groupedTab.groupId === undefined ||
              groupedTab.groupId === noGroupId) {
            return { skipped: 'tab group could not be created' }
          }

          const eachHierarchyCount = countDuplicateTabs(
            [sourceTab, groupedTab, uniqueTab],
            'url',
            'eachHierarchy',
            sourceTab,
          )
          if (eachHierarchyCount !== 0) {
            throw new Error('test setup did not create separate hierarchies')
          }

          await run(sourceWindowId, 'url', false, 'allTabs', sourceTab)

          const remaining = await waitUntil(async () => {
            const tabs = await browser.tabs.query({
              windowId: sourceWindowId,
            })
            const tabIds = new Set(tabs.map(tab => tab.id))
            if (tabIds.has(createdTabs[0].id) &&
                !tabIds.has(createdTabs[1].id) &&
                tabIds.has(createdTabs[2].id)) {
              return tabs.filter(tab =>
                createdTabs.some(created => created.id === tab.id))
            }
          })
          if (!remaining) {
            throw new Error('cross-group duplicate tab was not closed')
          }

          return {
            closedTabId: createdTabs[1].id,
            remainingTabIds: remaining.map(tab => tab.id),
            survivorTabId: createdTabs[0].id,
            uniqueTabId: createdTabs[2].id,
          }
        } finally {
          for (const tab of createdTabs) {
            await browser.tabs.remove(tab.id).catch(() => {})
          }
        }
      `)

      if (result.skipped) {
        t.skip(result.skipped)
        return
      }

      assert.equal(result.remainingTabIds.includes(result.survivorTabId), true)
      assert.equal(result.remainingTabIds.includes(result.uniqueTabId), true)
      assert.equal(result.remainingTabIds.includes(result.closedTabId), false)
    })
})
