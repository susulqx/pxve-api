import { Hono } from 'hono'
import { pixivApiProxyRoute } from './pixiv/app-api-proxy.js'

export const routes = new Hono()
  .get('/', c => c.html('<h2>Ciallo～(∠・ω< )⌒☆</h2><a href="/docs">API Document</a>'))
  .route('/', pixivApiProxyRoute)
