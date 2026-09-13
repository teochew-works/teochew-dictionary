import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { listItems, listSets, resolveAudio, saveVerdict, summarise, toCanonicalWav, type SaveVerdictBody } from './tts-review-handlers.js'

/**
 * Dev-only backend for the blind A/B listening test (issue #260):
 *
 *   GET  /api/tts-review                      the generated sets available
 *   GET  /api/tts-review/set/<setId>          its syllables, blinded, with any verdict
 *   GET  /api/tts-review/audio/<setId>/<key>/<a|b>   the WAV for one side
 *   POST /api/tts-review                      record a verdict, reveal the sides
 *
 * Registered through `configureServer`, which Vite calls only under
 * `vite dev` — never `vite build` — and additionally only wired up when
 * `command === 'serve'` in vite.config.ts. The route, the generated audio it
 * serves and everything it writes therefore do not exist in a production
 * build, which is the point: ADR-0027 permits publishing synthesis only as a
 * tier derived from a named recording, and none of this output qualifies.
 * See `tts-review-handlers.ts` for the pairing and blinding rules.
 */

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch (e) {
        reject(e as Error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

/** `/set/<setId>` and `/audio/<setId>/<key>/<side>`, with setId's own slash intact. */
function parsePath(url: string): { kind: 'root' } | { kind: 'set'; setId: string } | { kind: 'audio'; setId: string; key: string; side: 'a' | 'b' } | null {
  const path = decodeURI(url.split('?')[0] ?? '')
  if (path === '' || path === '/') return { kind: 'root' }
  const set = /^\/set\/(.+)$/u.exec(path)
  if (set) return { kind: 'set', setId: decodeURIComponent(set[1]!) }
  const audio = /^\/audio\/(.+)\/([^/]+)\/(a|b)$/u.exec(path)
  if (audio) {
    return { kind: 'audio', setId: decodeURIComponent(audio[1]!), key: decodeURIComponent(audio[2]!), side: audio[3] as 'a' | 'b' }
  }
  return null
}

export function ttsReviewPlugin(): Plugin {
  return {
    name: 'teochew-tts-review',
    configureServer(server) {
      server.middlewares.use('/api/tts-review', (req, res) => {
        const route = parsePath(req.url ?? '/')
        if (route === null) {
          res.statusCode = 404
          res.end()
          return
        }

        if (req.method === 'GET' && route.kind === 'root') {
          const sets = listSets()
          sendJson(res, 200, { sets: sets.map((s) => ({ ...s, summary: summarise(s.id) })) })
          return
        }

        if (req.method === 'GET' && route.kind === 'set') {
          const result = listItems(route.setId)
          sendJson(res, result.ok ? 200 : 404, result.ok ? { items: result.items, summary: summarise(route.setId) } : result)
          return
        }

        if (req.method === 'GET' && route.kind === 'audio') {
          const path = resolveAudio(route.setId, route.key, route.side)
          if (path === null) {
            res.statusCode = 404
            res.end()
            return
          }
          let wav: Buffer
          try {
            // Re-encoded rather than streamed so the two sides are byte-for-byte
            // comparable in size — see `toCanonicalWav`.
            wav = toCanonicalWav(readFileSync(path))
          } catch (e) {
            sendJson(res, 500, { ok: false, error: `${path}: ${e instanceof Error ? e.message : String(e)}` })
            return
          }
          res.statusCode = 200
          res.setHeader('content-type', 'audio/wav')
          res.setHeader('content-length', wav.length)
          // Never cached: a re-render writes the same path, and a stale clip
          // would silently be the thing under test.
          res.setHeader('cache-control', 'no-store')
          res.end(wav)
          return
        }

        if (req.method === 'POST' && route.kind === 'root') {
          readJsonBody(req)
            .then((body) => {
              const result = saveVerdict(body as SaveVerdictBody)
              sendJson(res, result.ok ? 200 : 400, result)
            })
            .catch(() => sendJson(res, 400, { ok: false, error: 'invalid JSON body' }))
          return
        }

        res.statusCode = 405
        res.end()
      })
    },
  }
}
