import sharp from 'sharp'
import { UA_HEADER } from '../lib/const.js'

/**
 * Node.js port of the original Deno Web Worker logic (src/services/worker/webp-worker.ts).
 * Business logic unchanged: same sharp options (fit:'inside', withoutEnlargement, quality 80).
 * The worker-pool indirection was removed; conversion now runs inline in the request.
 */
async function convertWebpBuffer(
  inputBuffer: ArrayBuffer,
  options: Record<string, any>
): Promise<{ status: 'success'; data: Uint8Array<ArrayBuffer> } | { status: 'error'; error: string }> {
  try {
    const webpOpts = { quality: options.quality || 80 }
    let compressedImage
    if (options.width && options.height) {
      const width = Number(options.width)
      const height = Number(options.height)
      if (!width || !height) {
        throw new Error('Invalid width or height')
      }
      compressedImage = await sharp(new Uint8Array(inputBuffer))
        .resize({
          width,
          height,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp(webpOpts)
        .toBuffer()
    } else {
      compressedImage = await sharp(new Uint8Array(inputBuffer)).webp(webpOpts).toBuffer()
    }
    const out = new Uint8Array(compressedImage.length)
    out.set(compressedImage)
    return { status: 'success', data: out }
  } catch (error: any) {
    return { status: 'error', error: error.message }
  }
}

export async function convertWebP(url: string) {
  const reqUrl = new URL(url)
  const imgUrl = new URL(reqUrl.pathname.replace('/api/webp/', '') + reqUrl.search)

  if (!/\.(jpg|jpeg|png|webp)$/i.test(imgUrl.pathname)) throw new Error('Not supported')

  const width = imgUrl.searchParams.get('w')
  if (width) imgUrl.searchParams.delete('w')
  const height = imgUrl.searchParams.get('h')
  if (height) imgUrl.searchParams.delete('h')

  const imgResp = await fetch(imgUrl, { headers: UA_HEADER })
  if (!imgResp.ok) throw new Error('Response not ok.')

  const inputBuffer = await imgResp.arrayBuffer()
  const options = width && height ? { width, height } : {}

  const result = await convertWebpBuffer(inputBuffer, options)
  if (result.status !== 'success') {
    throw new Error(result.error)
  }

  const headers: Record<string, string> = {}
  headers['Content-Type'] = 'image/webp'
  headers['Cache-Control'] = 'max-age=31536000'

  return {
    data: result.data,
    headers,
  }
}
