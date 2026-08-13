import type { MiddlewareHandler } from 'hono'
import { isBot } from '../lib/ua-detector.js'
import { ACCEPT_DOMAINS, UA_BLACKLIST } from '../lib/const.js'

/**
 * 请求准入判定（blocker 核心逻辑）。
 *
 * 判定顺序：
 *   1. 静态路径（favicon/robots）直接放行
 *   2. 无 UA → 拒绝
 *   3. Uptime 监控 UA → 放行
 *   4. UA 机器人检测（isbot / aua，见 ua-detector.ts）→ 拒绝
 *   5. UA_BLACKLIST 关键词 → 拒绝
 *   6. Origin / Referer 域名白名单（ACCEPT_DOMAINS）→ 拒绝
 */
const isAccepted = (
  path: string,
  ua?: string,
  origin?: string,
  referer?: string
): boolean => {
  if (path === '/favicon.ico' || path === '/robots.txt') return true

  if (!ua) return false
  if (ua.includes('Uptime')) return true

  if (isBot(ua)) return false

  const uaLower = ua.toLowerCase()
  if (UA_BLACKLIST.some(keyword => uaLower.includes(keyword.toLowerCase()))) {
    return false
  }

  const originOk = !origin || !ACCEPT_DOMAINS.length || ACCEPT_DOMAINS.some(domain => origin.includes(domain))
  const refererOk = !referer || !ACCEPT_DOMAINS.length || ACCEPT_DOMAINS.some(domain => referer.includes(domain))

  return originOk && refererOk
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
