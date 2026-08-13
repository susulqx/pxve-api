import { Hono } from 'hono'
import { ugoiraRoute } from './ugoira/index.js'
import { aiImageDetectRoute } from './ai-image-detect/index.js'
import { pixivApiRoute } from './pixiv/index.js'
import { pixivApiProxyRoute } from './pixiv/app-api-proxy.js'
import { hibiapiFallbackRoute } from './hibiapi-fallback/index.js'
import { saucenaoRoute } from './saucenao/index.js'
import { pixivTranslateNovelRoute } from './pixiv/novel-translate.js'
import { pidRecoverRoute } from './pixiv/pid-recover.js'
import { pixivWebApiRoute } from './pixiv/web-api.js'
import { pixivNowRoute } from './pixiv/pixiv-now.js'
import { pixivisionRoute } from './pixivision/index.js'
import { pximgRoute } from './pximg/index.js'
import { webpConvertRoute } from './webp/index.js'
import { xMediaRoute } from './x-media/index.js'
import { proxyRoute } from './cors-proxy/index.js'

export const routes = new Hono()
  .get('/', c => c.html('<h2>Ciallo～(∠・ω< )⌒☆</h2><a href="/docs">API Document</a>'))
  .route('/api', ugoiraRoute)
  .route('/api', saucenaoRoute)
  .route('/api', pixivApiRoute)
  .route('/api', pidRecoverRoute)
  .route('/api', pixivTranslateNovelRoute)
  .route('/api', pixivisionRoute)
  .route('/api', pixivNowRoute)
  .route('/api', pixivWebApiRoute)
  .route('/api', webpConvertRoute)
  .route('/api', aiImageDetectRoute)
  .route('/api', xMediaRoute)
  .route('/', pximgRoute)
  .route('/', pixivApiProxyRoute)
  .route('/', hibiapiFallbackRoute)
  .route('/', proxyRoute)
