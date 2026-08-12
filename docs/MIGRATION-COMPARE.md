# pxve-api Node.js 化迁移：前后对比报告

> 迁移基准：`v1.0-deno-original`（Deno 2 + Hono 4 原版，对应 `D:\Program Files\.su\pxve-api - 原`）
> 迁移结果：`feat/vercel-migration` 分支（Node.js 运行时，Vercel 就绪）
> 迁移范围：**仅替换底层运行环境（Deno → Node.js），业务逻辑零改动**
> 日期：2026-08-12

---

## 1. 变更总览（git diff v1.0-deno-original..HEAD）

```
 15 files changed, 2784 insertions(+), 219 deletions(-)
```

| 类型 | 文件 | 改动语义 |
|---|---|---|
| 修改 | `src/app.ts` | 入口适配：`Deno.serve` → `export default app`（Vercel/Hono 零配置检测）；`hono/deno` serveStatic → `@hono/node-server/serve-static`；`Deno.env/Deno.args` → `process.env` |
| 修改 | `src/lib/const.ts` | 8 处 `Deno.env.get('X')` → `process.env.X`（读取时机同为模块加载期，语义一致） |
| 修改 | `src/lib/pixiv-api.ts` | await-lock CJS interop 兼容（`AwaitLock.default` → `(AwaitLock as any).default ?? AwaitLock`），运行效果与原版相同 |
| 修改 | `src/services/ugoira.ts` | 内联原 `ugoira-worker.ts` 逻辑；`Deno.Command`(unzip/ffmpeg) → `child_process.execFile`；`Deno.*fs` → `node:fs/promises`；**ffmpeg 参数表、unzip 命令、输出结构逐字保留** |
| 修改 | `src/services/webp.ts` | 内联原 `webp-worker.ts` 逻辑；sharp 选项（fit/withoutEnlargement/quality 80）逐字保留 |
| 修改 | `src/services/x-media/index.ts` | `Deno.Command('python')` → `child_process.execFile('python')`，同命令同错误消息；`@std/path` → `node:url` |
| 修改 | `tsconfig.json` | 补 ESM/Bundler 解析、`types:["node"]`、`allowImportingTsExtensions` |
| 删除 | `src/lib/worker-pool.ts` | Deno-only（`new Worker` + `import.meta.resolve`），Node 无此 API |
| 删除 | `src/services/worker/index.ts`、`webp-worker.ts`、`ugoira-worker.ts` | Deno Web Worker 池整体移除 |
| 新增 | `package.json` / `package-lock.json` | npm 依赖清单（等价 deno.json imports；新增 `@hono/node-server`、devDeps tsx/typescript/esbuild/@types） |
| 新增 | `src/local-server.ts` | 本地启动入口（等价原 `Deno.serve` 逻辑，保留 RequestDeduper） |
| 新增 | `scripts/self-check.ts` | 模块加载 + crypto-js 运行时自检脚本 |

**未改动**：全部业务路由（`src/routes/*`）、Pixiv 数据面（`src/services/pixiv/*`、pximg、pixivision、翻译、saucenao、illuminarty、proxy、youdao）、中间件（logger/blocker/cache/etag/cors）、`src/lib/db-memory.ts`、`request-deduper.ts`、`operation-registry.ts`、`public/*`、`scripts/cache-*.ts`、`README*`、`deno.json`（保留供历史参考）。

## 2. 运行时 API 替换对照表

| 原版（Deno） | 迁移后（Node.js） | 行为等价性 |
|---|---|---|
| `Deno.serve({hostname, port}, handler)` | `@hono/node-server` `serve()`（local-server.ts）+ `export default app` | ✅ 同一 Hono app、同一 RequestDeduper 包装 |
| `Deno.env.get('X')` | `process.env.X` | ✅ 同为模块加载期读取；未设置均为 undefined |
| `Deno.args.includes('--dev')` | 移除 | ⚠️ 见差异 #1 |
| `new Worker(url, {type:'module'})` + `import.meta.resolve` | 直接函数调用（内联） | ✅ 结果一致；并发隔离语义见差异 #3 |
| `Deno.Command('unzip'/'ffmpeg', {args})` | `child_process.execFile` | ✅ 相同命令与参数 |
| `Deno.makeTempDir/writeFile/readFile/remove` | `node:fs/promises` mkdtemp/writeFile/readFile/rm（/tmp） | ✅ 等价 |
| `Deno.build.os === 'windows'` | `process.platform === 'win32'` | ✅ 等价 |
| `import.meta.dirname` | `fileURLToPath(new URL(...))` | ✅ Node 18 兼容 |
| `@std/path` / `@std/fs`（jsr） | `node:path` / `node:fs` | ✅ |
| Cache API `globalThis.caches` | 不存在 | ⚠️ 见差异 #2 |
| fetch 手动设置 `Host` 头 | Node fetch 静默忽略 | ✅ 无差异：URL 已含目标 host，实际发送的 Host 与原版相同（原版也是设为 URL 的 host） |
| `node:timers` setImmediate | Node 原生支持 | ✅ |

## 3. 逐接口行为对比（本地实测）

> 条件：Node 22.22.2，无 Pixiv 凭据、无外网可达（本机网络限制）。`原版行为` 依据 `pxve-api - 原` 源码逻辑判定。

| 接口 | HTTP | 迁移后响应（实测） | 原版预期 | 结论 |
|---|---|---|---|---|
| `GET /` | 200 | `<h2>Ciallo…` HTML | 同源码（固定字符串） | ✅ 一致 |
| `GET /docs` | 200 | Scalar HTML | 同（纯前端渲染） | ✅ 一致 |
| `GET /swagger` | 200 | Swagger UI HTML | 同 | ✅ 一致 |
| `GET /openapi.json` | 200 | 31KB OpenAPI JSON | 同（hono-zod-openapi 生成） | ✅ 一致 |
| `GET /openapi-hibiapi.json` | 200 | 静态文件（serveStatic） | 同 | ✅ 一致 |
| `GET /robots.txt` / `/favicon.ico` | 200 | 静态文件（serveStatic） | 同 | ✅ 一致 |
| `GET /nope`（未匹配） | 404 | `{"error":"Not Found"}` | 同 app.notFound | ✅ 一致 |
| `GET /api/pixiv/`（缺 type） | 400 | ZodError JSON（hono-zod-openapi 校验） | 同（同一校验逻辑） | ✅ 一致 |
| `GET /api/pixiv/rank`（无 token） | 500 | `{"error":"[pixivApi.refreshAccessToken] refresh_token required"}` | 同（同一异常路径） | ✅ 一致 |
| `GET /api/x/media`（无参数） | 500 | `{"error":"\`userName\` or \`userId\` is required."}` | 同（同一校验） | ✅ 一致 |
| `GET /api/webp/http://x/a.txt` | 500 | `{"error":"Not supported"}` | 同（同一校验） | ✅ 一致 |
| `GET /api/webp/<外网图>` | 500 | `{"error":"Response not ok."}`（源图 fetch 失败，外网不可达） | 同 | ✅ 一致（错误路径） |
| `GET /api/ugoira/<id>.mp4`（无凭据） | 500 | 业务异常（`fetch failed`，getMetadata 失败）——**非** "Worker is not defined" | 原版在 Deno 下同为 fetch 失败路径 | ✅ 一致 |
| `GET /api/pximg/...` / `/proxy/...` / pixivision / saucenao / translate | 需凭据/外网 | 无法端到端实测（本机网络限制） | — | ⚠️ 需配置凭据后按第 4 节清单复测 |
| CORS 预检/响应头 | — | `access-control-allow-origin: *`（hono/cors 默认） | 同 | ✅ 一致 |

**关键验证**：`npm run self-check` —— 40 个业务模块全部在 Node 下顶层加载成功 + crypto-js MD5 运行时校验通过（Pixiv 签名与有道解密所依赖）。

## 4. 与原版的已知差异（必须知悉）

| # | 差异 | 原因 | 影响 |
|---|---|---|---|
| 1 | `--dev` 启动参数逻辑移除 | Node 无 `Deno.args`；原逻辑为"dev 模式下禁用缓存" | 仅在显式 `--dev` 启动且 `ENABLE_CACHE=1` 时行为不同（本地开发默认无 --dev，无影响） |
| 2 | `ENABLE_CACHE=1` 时缓存不生效（自动透传） | Node 运行时无 `globalThis.caches`（Cache API），中间件已有 `if (!globalThis.caches)` 优雅降级 | 默认 `ENABLE_CACHE=0` 无影响；如需缓存改走 `@vercel/kv` 或 CDN 缓存 |
| 3 | ugoira/webp 转换由"独立 Web Worker"改为"请求内联执行" | Node 无 Web Worker 全局 API；Vercel serverless 每请求独立隔离，等价于 worker 隔离 | 输出结果一致；并发时 CPU 占用在请求实例内（Vercel 按实例隔离） |
| 4 | `/api/x/media` 在无 python/twikit 环境下失败 | 与原版相同依赖（python + twikit）；Vercel 部署时不可用（见部署文档） | 行为一致，仅部署平台限制 |
| 5 | `engines.node` 声明为 `>=18.17`，实测建议 **Node 20.11+**（本地用 22 验证） | sharp/ffmpeg 生态以 Node 20/22 为基准 | 推荐 Node 20+ 运行 |

**结论：迁移仅替换底层运行环境为 Node.js；未发生任何业务逻辑、数据结构、字段命名、错误码、响应格式的改动。** 上述差异全部源于平台能力差异（Cache API 缺失、Worker API 缺失），且在原版设计上已有降级路径。

## 5. 可追溯性

- 基线 tag：`v1.0-deno-original`（main 分支，未动）
- 阶段提交（每阶段独立分支）：
  - `feat/vercel/phase1-node-ify` → `a0b9378`（Node 化：依赖/入口/环境变量）
  - `feat/vercel/phase2-worker-adapt` → `5aee6a6`（Worker 池移除 + sharp/ffmpeg 内联）
  - `feat/vercel/phase3-platform-fixes` → `da11409` / `f169375`（平台收口 + Node 18 兼容修复）
- 汇总分支：`feat/vercel-migration`（HEAD = f169375）
- 每阶段 merge commit 均可单独 revert（见 ROLLBACK.md）
