export const ACCEPT_DOMAINS = process.env.ACCEPT_DOMAINS?.split(',') || []
export const UA_BLACKLIST = process.env.UA_BLACKLIST?.split(',') || []

export const PIXIV_API_HEADERS = {
  'App-OS': 'Android',
  'App-OS-Version': 'Android 15.0',
  'App-Version': '6.168.0',
  'Accept-Language': 'zh-CN',
  'User-Agent': 'PixivAndroidApp/6.168.0 (Android 15.0; Pixel 9)',
}
