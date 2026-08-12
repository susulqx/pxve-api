import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const fetch_x_media_py = fileURLToPath(new URL('./fetch_x_media.py', import.meta.url))
export async function runFetchXMediaCmd(userName?: string, userId?: string, nextCursor?: string) {
  if (!userName && !userId) {
    throw new Error('`userName` or `userId` is required.')
  }
  if (userId && !/^\d+$/.test(userId)) {
    throw new Error('`userId` should be numeric.')
  }

  const args = [
    userName && ['--user', userName],
    userId && ['--userid', userId],
    nextCursor && ['--cursor', nextCursor],
  ]
    .flat()
    .filter(Boolean) as string[]

  // Node.js port of the original Deno.Command('python', ...) invocation.
  // Same command, same arguments, same error message on failure.
  try {
    const { stdout, stderr } = await execFileAsync('python', [fetch_x_media_py, ...args])
    if (stderr) {
      console.error('Run fetch_x_media cmd stderr:', stderr)
    }
    return JSON.parse(stdout)
  } catch (error) {
    console.error('Run fetch_x_media cmd failed:', error)
    throw new Error('Run fetch_x_media cmd failed')
  }
}
