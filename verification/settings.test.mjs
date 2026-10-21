import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

let plugin
vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(module) { plugin = module.factory(() => ({})) } } },
  AbortController, console,
})

function fixture(responses) {
  let revision = 1
  const calls = [], views = []
  let loads = 0
  const mirror = {
    async load() { loads++; revision++ },
    acceptView(view) { views.push(view) },
  }
  const services = {
    configForms: { describe: () => mirror },
    remote: { settings: { async mutate(...args) { calls.push(args); return responses.shift() } } },
  }
  const ctx = new Proxy(services, { get(target, key) {
    assert.ok(plugin.inject.includes(key), `missing inject: ${key}`)
    return target[key]
  } })
  return {
    write: plugin.createFontWriter(ctx, { getSnapshot: () => ({ revision }) }),
    calls, views, loads: () => loads,
  }
}

test('Japanese font terminal selection persists one field with a revision fence', async () => {
  const f = fixture([{ ok: true, value: { revision: 2 } }])
  await f.write('terminalFontFamily', '"テスト書体 Regular"')
  assert.equal(f.calls.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])), ['ui-theme', [{
    op: 'set', path: ['terminalFontFamily'], value: '"テスト書体 Regular"',
  }], 1])
  assert.equal(f.views.length, 1)
})

test('only a stale revision gets one retry after refreshing the shared mirror', async () => {
  const f = fixture([
    { ok: false, error: { code: 'settings/conflict', message: 'stale revision' } },
    { ok: true, value: { revision: 3 } },
  ])
  await f.write('terminalFontFamily', '"テスト書体 Regular"')
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[1][2], 2)
  assert.equal(f.loads(), 1)
})

test('a real refusal remains visible without retry or a false success', async () => {
  const f = fixture([{ ok: false, error: { code: 'settings/rejected', message: 'write refused' } }])
  await assert.rejects(f.write('terminalFontFamily', '"テスト書体 Regular"'), /write refused/)
  assert.equal(f.calls.length, 1)
  assert.equal(f.views.length, 0)
})

test('Japanese display names retain their English family alias in preview and saved CSS', () => {
  const family = 'テスト書体 Regular'
  assert.equal(plugin.familyCss(family, [{ family, aliases: [family, 'Test Sans Regular'] }]),
    '"テスト書体 Regular", "Test Sans Regular"')
  assert.equal(plugin.familyCss('', []), '')
})

test('UI and conversation inherit the chosen family at both scopes; default and disposal restore previous styles', () => {
  function element() {
    const values = new Map()
    return { style: {
      getPropertyValue: key => values.get(key)?.[0] || '',
      getPropertyPriority: key => values.get(key)?.[1] || '',
      setProperty: (key, value, priority) => values.set(key, [value, priority]),
      removeProperty: key => values.delete(key),
    } }
  }
  const root = element(), body = element()
  root.style.setProperty('--dsw-font-family', 'old-root', '')
  body.style.setProperty('--ds-font-family-code', 'Consolas', '')
  let changed, unsubscribed = false
  let snapshot = { status: 'ready', value: { textFontFamily: '"テスト書体 Heavy"' } }
  const dispose = plugin.bindTextFont({ getSnapshot: () => snapshot, subscribe(fn) {
    changed = fn; return () => { unsubscribed = true }
  } }, root, body)
  for (const node of [root, body]) {
    assert.match(node.style.getPropertyValue('--dsw-font-family'), /テスト書体 Heavy/)
    assert.equal(node.style.getPropertyPriority('--dsw-font-family'), 'important')
  }
  assert.match(body.style.getPropertyValue('font-family'), /テスト書体 Heavy/)
  assert.equal(body.style.getPropertyValue('--ds-font-family-code'), 'Consolas')
  snapshot = { status: 'ready', value: { textFontFamily: '' } }
  changed()
  assert.equal(root.style.getPropertyValue('--dsw-font-family'), 'old-root')
  assert.equal(body.style.getPropertyValue('font-family'), '')
  dispose()
  assert.equal(unsubscribed, true)
})

test('A heavy-only family uses its exact local face for normal text, shares loads, and releases the face on disposal', async () => {
  const faces = new Set()
  const requests = []
  const created = []
  class Face {
    constructor(family, source, descriptors) { created.push({ family, source, descriptors }) }
    async load() { return this }
  }
  const loader = plugin.createFaceLoader(faces, Face, async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => ({ localNames: ['TestSans-Heavy', 'Test Sans Heavy'] }) }
  })
  const [one, two] = await Promise.all([loader.resolve('テスト書体 Heavy'), loader.resolve('テスト書体 Heavy')])
  assert.equal(one, two)
  assert.equal(requests.length, 1)
  assert.match(created[0].source, /local\("TestSans-Heavy"\)/)
  assert.equal(created[0].descriptors.weight, '400')
  assert.equal(faces.size, 1)
  loader.dispose()
  assert.equal(faces.size, 0)
  assert.equal(requests[0].options.signal.aborted, true)
})
