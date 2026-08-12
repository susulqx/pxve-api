export const ACCEPT_DOMAINS = process.env.ACCEPT_DOMAINS?.split(',') || []
export const UA_BLACKLIST = process.env.UA_BLACKLIST?.split(',') || []

export const PIXIV_COOKIE = process.env.PIXIV_COOKIE
export const PIXIV_ACCOUNT_TOKEN = process.env.PIXIV_ACCOUNT_TOKEN
export const PIXIV_ACCOUNT_TOKEN_ALTS =
  process.env
    .PIXIV_ACCOUNT_TOKEN_ALTS
    ?.split(',')
    .filter(e => e && e != PIXIV_ACCOUNT_TOKEN) || []

export const PIXIV_API_HEADERS = {
  'App-OS': 'Android',
  'App-OS-Version': 'Android 15.0',
  'App-Version': '6.168.0',
  'Accept-Language': 'zh-CN',
  'User-Agent': 'PixivAndroidApp/6.168.0 (Android 15.0; Pixel 9)',
}

export const UA_HEADER = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
}

export const HIBIAPI_BASE = process.env.HIBIAPI_BASE
export const SAUCENAO_API_KEY = process.env.SAUCENAO_API_KEY
export const SILICONClOUD_APT_KEY = process.env.SILICONClOUD_APT_KEY
