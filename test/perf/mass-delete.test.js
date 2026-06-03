import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import process from 'node:process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Builder } from 'selenium-webdriver'
import firefox from 'selenium-webdriver/firefox.js'
import { download } from 'geckodriver'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EXTENSION_DIR = resolve(ROOT_DIR, 'extension')
const DEFAULT_TAB_COUNT = 500
const DEFAULT_MAX_MS = 30_000
const PERF_TIMEOUT_MS = 300_000

let driver
let extensionBaseUrl

function readMinInteger (name, defaultValue, min) {
  const value = process.env[name]
  if (value === undefined || value === '') {
    return defaultValue
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${name} must be an integer greater than or equal to ${min}`)
  }
  return parsed
}

function readPositiveNumber (name, defaultValue) {
  const value = process.env[name]
  if (value === undefined || value === '') {
    return defaultValue
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return parsed
}

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

async function runExtensionScript (script, ...args) {
  const result = await driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1]
    const args = Array.from(arguments).slice(0, -1)

    async function run () {
      const wait = msec => new Promise(resolve => setTimeout(resolve, msec))
      async function waitUntil (predicate, timeout = 30000) {
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

describe('Firefox real tab deletion performance', () => {
  before(async () => {
    driver = await createDriver()
    await driver.manage().setTimeouts({
      script: PERF_TIMEOUT_MS,
    })
    const addonId = await driver.installAddon(EXTENSION_DIR, true)
    extensionBaseUrl = await getExtensionBaseUrl(addonId)
    assert.ok(extensionBaseUrl, '拡張機能の moz-extension URL を取得できません')
    await openExtensionPage('options.html')
  })

  after(async () => {
    if (driver) {
      await driver.quit()
    }
  })

  test('大量の実タブをパフォーマンス予算内に削除する', {
    timeout: PERF_TIMEOUT_MS,
  }, async (t) => {
    const tabCount = readMinInteger('PERF_TAB_COUNT', DEFAULT_TAB_COUNT, 2)
    const maxMs = readPositiveNumber('PERF_MAX_MS', DEFAULT_MAX_MS)

    const result = await runExtensionScript(`
      const { run } = await import(browser.runtime.getURL('uniq.js'))
      const tabCount = args[0]
      const token = 'click-tab-uniq-perf-' + Date.now() + '-' + Math.random()
      const duplicateUrl = browser.runtime.getURL(
        '_locales/en/messages.json',
      ) + '?perf=' + token
      const createdTabs = []

      try {
        for (let i = 0; i < tabCount; i += 1) {
          createdTabs.push(await browser.tabs.create({
            active: false,
            url: duplicateUrl,
          }))
        }

        const sourceWindowId = createdTabs[0].windowId
        const ready = await waitUntil(async () => {
          const tabs = []
          for (const tab of createdTabs) {
            tabs.push(await browser.tabs.get(tab.id).catch(() => null))
          }
          return tabs.every(tab => tab?.url === duplicateUrl)
        }, 120000)
        if (!ready) {
          throw new Error('created tab URLs did not settle')
        }

        const startedAt = performance.now()
        await run(sourceWindowId, 'url', false)
        const durationMs = performance.now() - startedAt

        const remaining = await waitUntil(async () => {
          const tabs = await browser.tabs.query({
            windowId: sourceWindowId,
          })
          const createdIds = new Set(createdTabs.map(tab => tab.id))
          const remainingCreatedTabs = tabs.filter(tab => createdIds.has(tab.id))
          if (remainingCreatedTabs.length === 1 &&
              remainingCreatedTabs[0].url === duplicateUrl) {
            return remainingCreatedTabs
          }
          return false
        }, 120000)
        if (!remaining) {
          throw new Error('duplicate tabs were not closed')
        }

        return {
          tabCount,
          closedCount: tabCount - remaining.length,
          durationMs,
          remainingIds: remaining.map(tab => tab.id),
        }
      } finally {
        for (const tab of createdTabs) {
          await browser.tabs.remove(tab.id).catch(() => {})
        }
      }
    `, tabCount)

    t.diagnostic([
      `tabs=${result.tabCount}`,
      `closed=${result.closedCount}`,
      `remaining=${result.remainingIds.length}`,
      `durationMs=${result.durationMs.toFixed(2)}`,
      `maxMs=${maxMs}`,
    ].join(' '))

    assert.equal(result.closedCount, tabCount - 1)
    assert.equal(result.remainingIds.length, 1)
    assert.ok(
      result.durationMs <= maxMs,
      `expected ${tabCount} real tabs to be deleted within ${maxMs}ms, ` +
        `but took ${result.durationMs.toFixed(2)}ms`,
    )
  })
})
