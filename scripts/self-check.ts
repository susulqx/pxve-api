/**
 * Node.js 迁移自检脚本（交付物：验证方案的一部分）
 *
 * 验证内容：
 * 1. 全部业务模块可在 Node.js 下顶层加载（无 Deno 依赖、无顶层副作用异常）
 * 2. node:crypto MD5 等运行时调用可用
 *
 * 用法：npm run self-check
 */
const modules = [
  '../src/lib/const.ts',
  '../src/lib/db-memory.ts',
  '../src/lib/pixiv-api.ts',
  '../src/lib/request-deduper.ts',
  '../src/lib/operation-registry.ts',
  '../src/middlewares/logger.ts',
  '../src/middlewares/blocker.ts',
  '../src/middlewares/cache.ts',
  '../src/routes/index.ts',
  '../src/routes/pixiv/index.ts',
  '../src/routes/pixiv/app-api-proxy.ts',
  '../src/routes/pixiv/pixiv-now.ts',
  '../src/routes/pixiv/web-api.ts',
  '../src/routes/pixiv/pid-recover.ts',
  '../src/routes/pixiv/novel-translate.ts',
  '../src/routes/pixivision/index.ts',
  '../src/routes/ugoira/index.ts',
  '../src/routes/webp/index.ts',
  '../src/routes/pximg/index.ts',
  '../src/routes/saucenao/index.ts',
  '../src/routes/ai-image-detect/index.ts',
  '../src/routes/x-media/index.ts',
  '../src/routes/cors-proxy/index.ts',
  '../src/routes/hibiapi-fallback/index.ts',
  '../src/services/proxy.ts',
  '../src/services/pximg.ts',
  '../src/services/webp.ts',
  '../src/services/ugoira.ts',
  '../src/services/pixivision.ts',
  '../src/services/saucenao.ts',
  '../src/services/illuminarty.ts',
  '../src/services/youdao.ts',
  '../src/services/x-media/index.ts',
  '../src/services/pixiv/action.ts',
  '../src/services/pixiv/api-proxy.ts',
  '../src/services/pixiv/pid-recover.ts',
  '../src/services/pixiv/pixiv-now.ts',
  '../src/services/pixiv/translate.ts',
  '../src/services/pixiv/web-api.ts',
  '../src/app.ts',
]

let fail = 0
for (const m of modules) {
  try {
    await import(m)
    console.log('OK  ', m)
  } catch (e) {
    fail++
    console.log('FAIL', m, '->', (e as Error).message)
  }
}

// node:crypto 运行时冒烟（Pixiv 签名 / 有道解密依赖；原 crypto-js 已替换）
try {
  const { createHash } = await import('node:crypto')
  const md5 = createHash('md5').update('test').digest('hex')
  if (md5 !== '098f6bcd4621d373cade4e832627b4f6') throw new Error('md5 mismatch')
  console.log('OK   node:crypto MD5 runtime check')
} catch (e) {
  fail++
  console.log('FAIL node:crypto MD5 runtime check ->', (e as Error).message)
}

console.log(fail === 0 ? '\n✅ 全部模块加载与运行时自检通过' : `\n❌ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
