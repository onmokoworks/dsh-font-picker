import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

test('reload removes the old route, cancels its enumeration, and serves a fresh list', { skip: process.platform !== 'win32' }, async () => {
  const routes = new Map()
  function install() {
    const disposers = []
    apply({
      effect(setup) { disposers.push(setup()) },
      webServer: {
        register(route) {
          assert.equal(routes.has(route.path), false, 'reload must not leave a duplicate route')
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    })
    return () => disposers.reverse().forEach(dispose => dispose())
  }
  async function read(url = '/dsh-font-picker/fonts') {
    let status = 200, body
    await routes.get('/dsh-font-picker/fonts').handler({ method: 'GET', url }, {
      setHeader() {}, writeHead(value) { status = value }, end(value) { body = JSON.parse(value) },
    })
    return { status, body }
  }
  const disposeOld = install()
  const inFlight = read()
  disposeOld()
  assert.equal(routes.size, 0)
  const cancelled = await inFlight
  assert.equal(cancelled.status, 503)
  const disposeNew = install()
  try {
    const fresh = await read()
    assert.equal(fresh.status, 200)
    assert.ok(fresh.body.fonts.length > 0)
    const cached = await read()
    assert.deepEqual(cached.body.fonts, fresh.body.fonts)
    const missing = await read('/dsh-font-picker/fonts?family=not-an-installed-font')
    assert.equal(missing.status, 404)
  } finally { disposeNew() }
  assert.equal(routes.size, 0)
})
