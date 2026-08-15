import { PIXIV_API_HEADERS } from '../../lib/const.js'

export async function pixivApiProxy(reqUrl: string, req: Request) {
  const url = new URL(reqUrl)
  url.protocol = 'https:'
  url.port = ''
  if (url.pathname.startsWith('/pixiv-app-api/')) {
    url.host = 'app-api.pixiv.net'
    url.pathname = url.pathname.replace('/pixiv-app-api', '')
  } else if (url.pathname.startsWith('/pixiv-oauth/')) {
    url.host = 'oauth.secure.pixiv.net'
    url.pathname = url.pathname.replace('/pixiv-oauth', '')
  } else {
    throw new Error('Not found')
  }

  const headers: Record<string, string> = { ...PIXIV_API_HEADERS }
  const headerKeys = ['Authorization', 'Content-Type', 'X-Client-Time', 'X-Client-Hash']
  headerKeys.forEach(key => {
    const val = req.headers.get(key)
    if (val) headers[key] = val
  })

  const resp = await fetch(url.href, {
    method: req.method,
    body: req.body,
    headers,
    // 转发流式 body（POST 如发评论）时，Node/Deno fetch 要求显式声明 duplex
    // 否则报 "RequestInit: duplex option is required when sending a body."
    duplex: 'half',
    // RequestInit 类型未包含 duplex（运行时必需），用断言绕过类型限制
  } as RequestInit)

  return resp
}
