import type { MiddlewareHandler } from 'hono'
import { isbot } from 'isbot'
import { ACCEPT_DOMAINS, UA_BLACKLIST } from '../lib/const.js'

function isAccepted(path: string, ua?: string, origin?: string, referer?: string): boolean {
  if (path === '/favicon.ico' || path === '/robots.txt') return true

  if (!ua) {
    console.log('[blocker] blocked=no-ua', JSON.stringify({ path }))
    return false
  }
  if (ua.includes('Uptime')) return true

  if (isbot(ua)) {
    console.log('[blocker] blocked=isbot', JSON.stringify({ path, ua }))
    return false
  }

  ua = ua.toLowerCase()
  const hit = UA_BLACKLIST.find(e => ua.includes(e.toLowerCase()))
  if (hit) {
    console.log(
      '[blocker] blocked=ua-blacklist',
      JSON.stringify({ path, hit, ua, UA_BLACKLIST, env: process.env.UA_BLACKLIST })
    )
    return false
  }

  let originOk = false
  if (!origin || !ACCEPT_DOMAINS.length || ACCEPT_DOMAINS.some(e => origin.includes(e))) {
    originOk = true
  }

  let refererOk = false
  if (!referer || !ACCEPT_DOMAINS.length || ACCEPT_DOMAINS.some(e => referer.includes(e))) {
    refererOk = true
  }

  if (!originOk || !refererOk) {
    console.log(
      '[blocker] blocked=domain',
      JSON.stringify({ path, origin, referer, originOk, refererOk, ACCEPT_DOMAINS, env: process.env.ACCEPT_DOMAINS })
    )
    return false
  }

  return true
}

export function blocker(): MiddlewareHandler {
  return async (ctx, next) => {
    const ua = ctx.req.header('User-Agent')
    const origin = ctx.req.header('Origin')
    const referer = ctx.req.header('Referer')

    if (isAccepted(ctx.req.path, ua, origin, referer)) {
      await next()
      return
    }

    return ctx.json({ error: 'Forbidden' }, 403)
  }
}
