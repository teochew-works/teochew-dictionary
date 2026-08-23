import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { getStatus, saveRecording, type SaveRecordingBody } from './local-recordings-handlers.js'

/**
 * Dev-only backend for the Sounds tab's "record" control (issue #128,
 * `data/phonology/REVIEW.md` § 17): `GET /api/local-recordings` reports
 * which syllables already have a published clip or a staged proposal,
 * `POST /api/local-recordings` stages a newly-recorded one. Registered via
 * `configureServer`, which Vite only ever calls while running `vite dev` —
 * never during `vite build` — so this route (and everything it can do to
 * the filesystem) simply does not exist in the production bundle. See
 * web/vite.config.ts, which additionally only includes this plugin when
 * `command === 'serve'`, belt-and-suspenders on top of that.
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

export function localRecordingsPlugin(): Plugin {
  return {
    name: 'teochew-local-recordings',
    configureServer(server) {
      server.middlewares.use('/api/local-recordings', (req, res) => {
        if (req.method === 'GET') {
          sendJson(res, 200, getStatus())
          return
        }

        if (req.method === 'POST') {
          readJsonBody(req)
            .then((body) => {
              const result = saveRecording(body as SaveRecordingBody)
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
