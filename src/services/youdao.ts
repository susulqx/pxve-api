import { createHash, createDecipheriv } from 'node:crypto'
import { UA_HEADER } from '../lib/const.js'

const SECRET_KEY = 'SRz6r3IGA6lj9i5zW0OYqgVZOtLDQe3E'
const AES_KEY = 'ydsecret://query/key/B*RGygVywfNBwpmBaZg*WT7SIOUP2T0C9WHMZN39j^DAdaZhAnxvGcCY6VYFwnHl'
const AES_IV = 'ydsecret://query/iv/C@lZe2YzHtZ2CYgaXKSVfsb7Y4QWHjITPPZ0nQp87fBeJ!Iv6v^6fvi2WN@bYpJ4'

function decryptResult(result: string) {
  const key = createHash('md5').update(AES_KEY).digest()
  const iv = createHash('md5').update(AES_IV).digest()
  const cipher = Buffer.from(result.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('base64')

  const decipher = createDecipheriv('aes-128-cbc', key, iv)
  decipher.setAutoPadding(true)
  const decryptedText = Buffer.concat([decipher.update(cipher, 'base64'), decipher.final()]).toString('utf8')
  return JSON.parse(decryptedText.trim())
}

export async function translate(text: string, from = 'ja', to = 'zh-CHS') {
  const url = 'https://dict.youdao.com/webtranslate'

  const mysticTime = Date.now().toString()

  const sign = createHash('md5')
    .update(`client=fanyideskweb&mysticTime=${mysticTime}&product=webfanyi&key=${SECRET_KEY}`)
    .digest('hex')

  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'host': 'dict.youdao.com',
    'origin': 'https://fanyi.youdao.com',
    'Referer': 'https://fanyi.youdao.com/',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'cookie': `OUTFOX_SEARCH_USER_ID=${Math.floor(Math.random() * 100000000)}@${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}; OUTFOX_SEARCH_USER_ID_NCOO=${Math.floor(Math.random() * 100000000)}.${Math.floor(Math.random() * 100000000)}`,
    ...UA_HEADER,
  }

  const res = await fetch(url, {
    method: 'POST',
    body: `i=${encodeURIComponent(text)}&from=${from}&to=${to}&useTerm=false&domain=0&dictResult=true&keyid=webfanyi&sign=${sign}&client=fanyideskweb&product=webfanyi&appVersion=1.0.0&vendor=web&pointParam=client%2CmysticTime%2Cproduct&mysticTime=${mysticTime}&keyfrom=fanyi.web&mid=1&screen=1&model=1&network=wifi&abtest=0&yduuid=abcdefg`,
    headers: {
      ...headers,
      'content-type': 'application/x-www-form-urlencoded',
    },
  })

  if (res.ok) {
    const result = await res.text()
    const json = decryptResult(result)
    if (json.translateResult) {
      return json.translateResult.map((e: any[]) =>
        e.map((it: any) => ({
          res: it.tgt,
          resPron: it.tgtPronounce,
          src: it.src,
          srcPron: it.srcPronounce,
          srcRuby: it.jaTransPjm
            ?.map((p: any) =>
              p.pjm ? `<ruby>${p.word}<rp>(</rp><rt>${p.pjm}</rt><rp>)</rp></ruby>` : `<span>${p.word}</span>`
            )
            .join(''),
        }))
      ) as any[][]
    }
    throw new Error(JSON.stringify(json))
  } else {
    throw new Error(`Http Request Error: Status ${res.status} ${await res.text()}`)
  }
}
