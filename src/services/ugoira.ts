import { join } from 'node:path'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { UA_HEADER } from '@lib/const.ts'
import { pixivWebApi } from './pixiv/web-api.ts'

const execFileAsync = promisify(execFile)

export type UgoiraConvertExt = 'mp4' | 'gif' | 'apng' | 'webp' | 'webm' | 'avif'

const ugoiraMimeTypes: Record<UgoiraConvertExt, string> = {
  mp4: 'video/mp4',
  gif: 'image/gif',
  apng: 'image/apng',
  webp: 'image/webp',
  webm: 'video/webm',
  avif: 'image/avif',
}

export const ugoiraExts = Object.keys(ugoiraMimeTypes)
export const ugoiraExtRegex = new RegExp(`^\\d+\\.(${Object.keys(ugoiraMimeTypes).join('|')})$`)

/**
 * Node.js port of the original Deno Web Worker logic (src/services/worker/ugoira-worker.ts).
 * Business logic is unchanged: same metadata fetch, same unzip command, same ffmpeg args,
 * same output format. Only the runtime APIs were replaced:
 *   self.onmessage wrapper      -> direct async function call (returns same {status,data|error} shape)
 *   Deno.makeTempDir/writeFile  -> fs/promises mkdtemp/writeFile (/tmp)
 *   Deno.Command(unzip/ffmpeg)  -> child_process.execFile (system binaries, same as original)
 *   Deno.readFile/remove        -> fs/promises readFile/rm
 */
async function getMetadata(id: number) {
  const data = await pixivWebApi.illustUgoiraMeta(id)
  const { frames = [], originalSrc = '' } = data as { frames: any[]; originalSrc: string }

  const totalMs = frames.reduce((acc, cur) => {
    acc += Number(cur.delay)
    return acc
  }, 0)
  const rate = (frames.length / totalMs) * 1000

  return { zip: originalSrc, rate }
}

async function downloadAndUnzip(zipUrl: string, outputDir: string) {
  const response = await fetch(zipUrl, {
    headers: {
      Referer: 'https://www.pixiv.net/',
      ...UA_HEADER,
    },
  })
  const zipData = new Uint8Array(await response.arrayBuffer())

  await mkdir(outputDir, { recursive: true })
  const zipPath = join(outputDir, 'ugoira.zip')
  await writeFile(zipPath, zipData)

  let cmd = 'unzip'
  let args = ['-o', zipPath, '-d', outputDir]
  if (process.platform === 'win32') {
    cmd = 'PowerShell'
    args = ['Expand-Archive', '-Path', `"${zipPath}"`, '-DestinationPath', `"${outputDir}"`, '-Force']
  }
  console.log(cmd, args.join(' '))
  try {
    await execFileAsync(cmd, args)
  } catch (error: any) {
    const decoder = new TextDecoder()
    console.error('unzip failed:', error?.stderr ? decoder.decode(error.stderr) : error)
    throw new Error('unzip failed')
  }
}

async function convertImages(imagesDir: string, outputFilePath: string, rate: string, ext: UgoiraConvertExt = 'avif') {
  const argsMap = {
    avif: `-y -r ${rate} -i ${imagesDir}/%06d.jpg -c:v libsvtav1 -pix_fmt yuv420p -crf 30 -b:v 0`
      .split(/\s+/)
      .concat([outputFilePath]),
    mp4: `-y -r ${rate} -i ${imagesDir}/%06d.jpg -c:v libx264 -pix_fmt yuv420p -vf pad=ceil(iw/2)*2:ceil(ih/2)*2`
      .split(/\s+/)
      .concat([outputFilePath]),
    gif: `-y -r ${rate} -i ${imagesDir}/%06d.jpg -filter_complex [0:v]scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=single[p];[b][p]paletteuse=dither=none`
      .split(/\s+/)
      .concat([outputFilePath]),
    apng: `-y -r ${rate} -i ${imagesDir}/%06d.jpg -c:v apng -plays 0 -vsync 0`.split(/\s+/).concat([outputFilePath]),
    webp: `-y -r ${rate} -i ${imagesDir}/%06d.jpg -vf scale=600:-1:force_original_aspect_ratio=decrease,fps=${rate} -loop 0 -compression_level 6 -quality 80 -preset picture`
      .split(/\s+/)
      .concat([outputFilePath]),
    webm: `-y -r ${rate} -i ${imagesDir}/%06d.jpg -c:v libvpx-vp9 -crf 28 -b:v 0 -pix_fmt yuv420p -vsync 0`
      .split(/\s+/)
      .concat([outputFilePath]),
  }
  const args = argsMap[ext]
  if (!args) throw new Error('Invalid extension')

  console.log('ffmpeg', args.join(' '))
  try {
    await execFileAsync('ffmpeg', args)
  } catch (error: any) {
    const decoder = new TextDecoder()
    console.error('FFmpeg failed:', error?.stderr ? decoder.decode(error.stderr) : error)
    throw new Error('FFmpeg conversion failed')
  }
}

async function downloadAndConvert(zipUrl: string, rate: string, id: string, ext: UgoiraConvertExt = 'avif') {
  const tempDir = await mkdtemp(join(tmpdir(), 'pxve-ugoira-'))
  const imagesDir = join(tempDir, `images_${id}`)
  const outputFilePath = join(tempDir, `${id}.${ext}`)

  try {
    await downloadAndUnzip(zipUrl, imagesDir)
    await convertImages(imagesDir, outputFilePath, rate, ext)
    const data = await readFile(outputFilePath)
    return data
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

/**
 * Direct-call replacement of the original worker message handler.
 * Returns the same payload shape the worker posted back:
 *   { status: 'success', data } | { status: 'error', error }
 */
export async function convertUgoiraWorker(
  data: any
): Promise<{ status: 'success'; data: Uint8Array<ArrayBuffer> } | { status: 'error'; error: string }> {
  let { zip, rate, id, ext = 'avif' } = data
  try {
    if (!rate) rate = 16
    if (!zip) {
      ;({ zip, rate } = await getMetadata(Number(id)))
    }
    const buf = await downloadAndConvert(zip, rate, id, ext)
    const out = new Uint8Array(buf.length)
    out.set(buf)
    return { status: 'success', data: out }
  } catch (error: any) {
    return { status: 'error', error: error.message }
  }
}

export async function convertUgoira(ugoiraId: string, zip?: string, rate?: string) {
  if (!ugoiraExtRegex.test(ugoiraId)) throw new Error('Invalid ugoira extension')
  const [id, ext] = ugoiraId.split('.') as [string, UgoiraConvertExt]

  const result = await convertUgoiraWorker({ id, zip, rate, ext })
  if (result.status !== 'success') {
    throw new Error(result.error)
  }

  const headers: Record<string, string> = {}
  headers['Content-Type'] = ugoiraMimeTypes[ext]
  headers['Content-Disposition'] = `inline; filename=${id}.${ext}`
  headers['Cache-Control'] = 'public, max-age=31536000, s-maxage=31536000'

  return {
    data: result.data,
    headers,
  }
}
