import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const name = 'dsh-font-picker'
export const inject = ['webServer']

export function readFontFace(family, signal) {
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = fileURLToPath(new URL('./font-face.ps1', import.meta.url))
  return new Promise((resolve, reject) => {
    execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script, '-Family', family], {
      encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024, signal,
    }, (error, stdout) => {
      if (error) { reject(new Error('書体の識別名を取得できませんでした。', { cause: error })); return }
      try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, ''))) } catch (error) { reject(error) }
    })
  })
}

/** One bounded, hidden process per refresh; no watcher or resident font service. */
export function readInstalledFonts(signal) {
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('このフォント一覧はWindows版に対応しています。'))
  }
  const executable = join(process.env.SystemRoot || 'C:\\Windows',
    'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = fileURLToPath(new URL('./list-fonts.ps1', import.meta.url))
  return new Promise((resolve, reject) => {
    execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], {
      encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
      signal,
    }, (error, stdout) => {
      if (error) {
        reject(new Error('フォント一覧を取得できませんでした。「一覧を更新」で再試行してください。', { cause: error }))
        return
      }
      try {
        const records = JSON.parse(stdout.replace(/^\uFEFF/, ''))
        const unique = new Map()
        for (const record of Array.isArray(records) ? records : [records]) {
          if (typeof record?.family !== 'string' || !record.family.trim()) continue
          const family = record.family.trim()
          unique.set(family.toLocaleLowerCase(), {
            family,
            aliases: [...new Set([family, ...[record.aliases].flat()]
              .filter(value => typeof value === 'string'))],
          })
        }
        const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' })
        const fonts = [...unique.values()].sort((a, b) => collator.compare(a.family, b.family))
        if (!fonts.length) throw new Error('empty font collection')
        resolve(fonts)
      } catch {
        reject(new Error('フォント一覧を読み取れませんでした。「一覧を更新」で再試行してください。'))
      }
    })
  })
}

export function apply(ctx) {
  let cached
  let loadedAt = 0
  let pending
  const faces = new Map()
  let faceQueue = Promise.resolve()
  const lifetime = new AbortController()
  ctx.effect(() => () => lifetime.abort(), 'font-picker: terminate pending font enumeration')
  // register() returns a disposer; the server does not attach it to this plugin.
  // Without an effect, HMR leaves the old route using an aborted lifetime.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-font-picker/fonts',
    handler: async (request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8')
      response.setHeader('cache-control', 'no-store')
      if (request.method !== 'GET') {
        response.writeHead(405)
        response.end(JSON.stringify({ error: 'method not allowed' }))
        return
      }
      try {
        const refresh = new URL(request.url, 'http://localhost').searchParams.has('refresh')
        if (!cached || refresh || Date.now() - loadedAt > 300000) {
          pending ??= readInstalledFonts(lifetime.signal)
            .then(fonts => { cached = fonts; loadedAt = Date.now() })
            .finally(() => { pending = undefined })
          await pending
        }
        const family = new URL(request.url, 'http://localhost').searchParams.get('family')
        if (family !== null) {
          if (!cached.some(font => font.family === family || font.aliases.includes(family))) {
            response.writeHead(404)
            response.end(JSON.stringify({ error: 'インストールされたフォントが見つかりません。' }))
            return
          }
          if (!faces.has(family)) {
            const loading = faceQueue.then(() => readFontFace(family, lifetime.signal))
            faceQueue = loading.catch(() => {})
            faces.set(family, loading.catch(error => {
              faces.delete(family)
              throw error
            }))
          }
          response.end(JSON.stringify(await faces.get(family)))
        } else response.end(JSON.stringify({ fonts: cached, platform: 'win32' }))
      } catch (error) {
        response.writeHead(503)
        response.end(JSON.stringify({ error: error.message }))
      }
    },
  }), 'font-picker: unregister font route')
}
