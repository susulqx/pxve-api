/**
 * Local development / self-hosting entry for pxve-api (Node.js runtime).
 *
 * Replaces the original Deno.serve entry in src/app.ts:
 *   Deno.serve({ hostname: '0.0.0.0', port }, (req, ...args) =>
 *     deduper.run(req.url, async () => await app.fetch(req, ...args))
 *   )
 *
 * Usage:
 *   npm run dev    (tsx watch, hot reload)
 *   npm run start  (tsx, plain run)
 */
import { serve } from '@hono/node-server'
import { app } from './app.ts'
import { RequestDeduper } from '@lib/request-deduper.ts'

const port = Number(process.env.PORT ?? 3021)
const deduper = new RequestDeduper()

serve(
  {
    fetch: (req, ...args) => deduper.run(req.url, async () => await app.fetch(req, ...args)),
    port,
  },
  info => {
    console.log(`pxve-api (Node) listening on http://localhost:${info.port}`)
  }
)
