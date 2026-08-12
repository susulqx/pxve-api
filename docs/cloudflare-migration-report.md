# pxve-api 迁移到 Cloudflare Workers/Pages 兼容性评估报告

> 评估对象：`pxve-api`（Deno 2.x + Hono 4 实现的 Pixiv 反代 API）
> 评估基准：Cloudflare Workers/Pages 运行时（workerd，V8 isolate），参考官方文档 limits / runtime-apis / nodejs 兼容说明
> 评估日期：2026-08-12

---

## 1. 项目架构总览

### 1.1 技术栈与运行环境

| 项目 | 内容 |
|---|---|
| 运行时 | **Deno 2.x**（Dockerfile 基于 `denoland/deno:2.6.5`） |
| Web 框架 | Hono 4（`npm:hono@^4.12.2`） |
| 启动方式 | `deno run --env --allow-all ./src/app.ts`（`--env` 自动加载 .env 文件） |
| 监听端口 | `PORT`（默认 3021），`Deno.serve({ hostname: '0.0.0.0', port }, ...)` |
| 语言 | TypeScript（strict），路径别名 `@lib/*`、`@services/*` |
| 部署形态 | Docker 容器（长驻进程） |

### 1.2 入口与启动链路（src/app.ts）

```
中间件: logger → cors → secureHeaders → blocker → etag(GET *) → prettyJSON
       → cache(可选, ENABLE_CACHE=1 时对所有 GET 生效)
路由:   app.route('/', routes)          ← src/routes/index.ts
文档:   /openapi.json /openapi-hibiapi.json /docs /docs/hibiapi /swagger /swagger/hibiapi
静态:   /robots.txt /favicon.ico        ← hono/deno 的 serveStatic 读 ./public/
兜底:   app.notFound(404) / app.onError(500)
监听:   RequestDeduper(按 URL 去重并发) → Deno.serve
```

关键点：`RequestDeduper`（`src/lib/request-deduper.ts`）用模块级 `Map` 对相同 URL 并发请求做 Promise 合并；`Deno.serve` 是所有请求的入口，`app.fetch(req, ...args)` 是纯标准 Request/Response 处理链——**这一层最贴近 Workers 的 fetch handler 模型**。

### 1.3 路由逻辑（src/routes/index.ts）

| 挂载路径 | 路由文件 | 功能 |
|---|---|---|
| `/api/ugoira/:id` | routes/ugoira | Ugoira 动图转换（**ffmpeg 子进程**） |
| `/api/sauce/` | routes/saucenao | 以图搜图（SauceNAO，fetch + FormData） |
| `/api/pixiv/:key` | routes/pixiv | HibiAPI 兼容 Pixiv App API（约 40 种 action，走 `PixivApi` 类） |
| `/api/pid-recover/:id` | routes/pixiv/pid-recover | Danbooru/Gelbooru/Yandere 镜像找回（最多 5 次串行 fetch） |
| `/api/pixiv-novel-translate/:id` | routes/pixiv/novel-translate | 小说翻译（微软/谷歌/有道/硅基 AI，**含 sleep(500) 分片**） |
| `/api/pixivision` | routes/pixivision | Pixivision 文章抓取（cheerio 解析 HTML） |
| `/api/pixiv-now/*` | routes/pixiv/pixiv-now | Pixiv Web API 代理 + 榜单 + 用户元数据 |
| `/api/pixiv-web-api/:func` | routes/pixiv/web-api | `@__dirname/pixiv-web-api` 包方法直调 |
| `/api/webp/*` | routes/webp | WebP 转换（**sharp 原生库，Worker 池**） |
| `/api/ai-image-detect` | routes/ai-image-detect | AI 图像检测（Illuminarty，fetch + FormData） |
| `/api/x/media` | routes/x-media | X(Twitter) 媒体抓取（**python + twikit 子进程**） |
| `/pximg/*`、`/pid/:path` | routes/pximg | pximg 图片代理、PID 直链 |
| `/pixiv-app-api/*`、`/pixiv-oauth/*` | routes/pixiv/app-api-proxy | Pixiv App API/OAuth 透传 |
| `/proxy/*` | routes/cors-proxy | 通用 CORS 代理（**手工 set Host 头**） |
| `/api/bilibili|netease|qrcode|tieba|wallpaper|bika/*` | routes/hibiapi-fallback | 转发到 `HIBIAPI_BASE` |

### 1.4 主要依赖清单（deno.json imports）

| 依赖 | 用途 | Workers 兼容性 |
|---|---|---|
| hono / hono-zod-openapi / @hono/swagger-ui / @scalar/hono-api-reference | Web 框架、OpenAPI、文档页 | ✅ 原生支持（hono 官方适配 CF Workers） |
| @__dirname/pixiv-web-api | Pixiv Web API 封装 | ✅ **零依赖、纯 fetch**，README 明确支持 "serverless 环境" |
| cheerio | HTML 解析（pixivision） | ✅ 纯 JS（parse5） |
| sharp | WebP 转换 | ❌ **原生 libvips 绑定，Workers 无法加载原生模块** |
| google-translate-api-x / microsoft-translate-api | 翻译 | ✅ 均为 fetch 实现（ms 版零运行时依赖） |
| crypto-js | MD5/AES（Pixiv 签名、有道解密） | ✅ 纯 JS（可用 Web Crypto 替代以减小体积） |
| qs / dayjs / cookie / isbot / await-lock / zod | 工具 | ✅ 纯 JS |
| @std/fs、@std/path（jsr） | 文件系统/路径 | ❌ 依赖 Deno API，仅 ugoira-worker 使用（随改造移除） |
| node:timers（setImmediate） | operation-registry | ✅ 需开启 `nodejs_compat` 兼容标志 |

### 1.5 状态与存储使用

- `src/lib/db-memory.ts`：模块级 `Map` 内存缓存（token 缓存等），进程内有效。
- `src/middlewares/cache.ts`：标准 **Cache API**（`caches.open(cacheName)` + `:metadata` 命名缓存），带 LRU 容量控制与 `setInterval` 后台清理。
- `src/lib/request-deduper.ts`：模块级 Map 做同 URL 并发合并。
- `src/services/pixiv/api.ts`：`PixivApi` 单例 + `memdb` 缓存 access_token（`PXV_CLIENT_AUTH_*`），AwaitLock 防并发刷新。
- `src/services/worker/*`：**Deno Web Worker 池**（`new Worker` + `import.meta.resolve`），webp 跑 sharp、ugoira 跑 ffmpeg/unzip。

---

## 2. Cloudflare Workers/Pages 逐项兼容性评估

### 2.1 运行时模型差异（根本性）

| 维度 | 现状（Deno 容器） | Workers/Pages（workerd） |
|---|---|---|
| 进程模型 | 长驻进程，监听端口 | 无端口、无进程；事件驱动 fetch handler，**每请求一个 isolate**（可复用） |
| 子进程 | `Deno.Command` 可执行 ffmpeg/python/unzip | ❌ **禁止** |
| 文件系统 | 可写临时目录、读任意路径 | ❌ 无真实文件系统（仅内存态 node:fs 虚拟层） |
| 全局状态 | 进程生命周期内模块级 Map 稳定 | ⚠️ isolate 内短暂存在，跨请求**不保证**、跨数据中心**不共享** |
| 定时器 | `setInterval` 后台常驻 | ⚠️ 响应返回后即被冻结，后台任务需 `ctx.waitUntil()` |

### 2.2 内置 API / 模块逐项对照

| 项目中使用的 API | 位置 | Workers 支持 | 结论/处置 |
|---|---|---|---|
| `Deno.serve` | app.ts:89 | ❌ | 改为 `export default { fetch(request, env, ctx) }` |
| `Deno.env.get` / `Deno.args` | const.ts、app.ts:26/88 | ❌ | 改为 env 绑定参数注入 |
| `Deno.Command` | ugoira-worker.ts、x-media/index.ts | ❌ | 无子进程，整块重写/外置 |
| `Deno.writeFile/readFile/makeTempDir/remove/build.os` | ugoira-worker.ts | ❌ | 随 ugoira 改造删除 |
| `new Worker` + `import.meta.resolve` | worker-pool.ts、services/worker/index.ts | ❌ | Workers 内不允许创建 Web Worker；sharp/ffmpeg 均不可用 |
| `import.meta.dirname` | x-media/index.ts:3 | ❌ | 用 `import.meta.url` 解析（且该文件随改造删除） |
| `@std/fs`/`@std/path` | ugoira-worker.ts | ❌ | 随改造删除（@std/path 纯 JS 理论上可打包，但无必要） |
| `node:timers` setImmediate | operation-registry.ts | ✅ | 需 `nodejs_compat`；注意该 class 未被引用，打包可被 tree-shake |
| `fetch`/`Request`/`Response`/`FormData`/`Blob` | 全站 | ✅ | 标准 Web API，原样可用 |
| `caches.open()` 命名缓存 | middlewares/cache.ts | ✅（有差异） | 支持命名缓存，但**仅本地数据中心生效**、计入子请求配额 |
| `setInterval` 后台清理 | middlewares/cache.ts | ⚠️ | 响应结束即冻结，需 `waitUntil` 包裹 |
| `serveStatic`（hono/deno） | app.ts:6/41/42/75 | ❌ | 换 `hono/cloudflare-workers` 的 serveStatic（ASSETS 绑定） |
| WebSocket / 长连接 | 无 | — | 本项目未使用 WS；Workers 服务端 WS 需 Durable Objects，无此需求 |
| `Host` 请求头设置 | services/proxy.ts:51 | ❌ | Workers fetch **禁止设置 Host 头**（安全限制），会抛错 |

### 2.3 关键不兼容点详析

**(1) 图片处理 sharp（webp-worker.ts）** —— 不可运行。sharp 依赖原生 libvips 二进制，V8 isolate 无法加载原生模块。Cloudflare 上替代路径：官方 Image Resizing（`fetch(url, { cf: { image: {...} } })`，按用量计费 $0.50/千次转换）、或 WASM 方案 `@cf-wasm/photon` / `@jsquash/*`（免费、能力有限）、或 sharp 0.33 的 WASM 实验构建（慢、单线程、128MB 内存下仅适合小图）。

**(2) Ugoira 动图转换（ugoira-worker.ts）** —— 完全不可行。需要：下载 zip → `unzip` 解压 → `ffmpeg` 按帧率编码 mp4/gif/webp/avif 等。Worker 无子进程、无文件系统；即便用 ffmpeg.wasm，免费版 10ms / 付费版 30s 的 CPU 限制也无法完成视频编码，128MB 内存也不够。**必须外置**（自建 ffmpeg 服务 / 云函数 / 第三方动图接口）。

**(3) X 媒体抓取（x-media/index.ts）** —— 不可运行。`Deno.Command('python', ...)` 调 `fetch_x_media.py`（twikit 库）。Workers 无 Python。需用 JS fetch 重写（需要 X 的 cookie/API 内部端点，凭据放 KV/secret），或移除该路由。

**(4) CORS 代理 Host 头（services/proxy.ts:51）** —— Workers 的 fetch 将 URL 的 hostname 作为目标 host，**禁止手动覆盖 Host 头**（安全机制），该行在 Workers 上会抛异常。修复简单：直接删除 host 设置（URL 本身已带目标 host），origin/referer 头可以正常设置。

**(5) 环境变量读取方式（src/lib/const.ts）** —— 全部在**模块加载期**调用 `Deno.env.get()`。Workers 的环境变量来自 fetch handler 的第二个参数 `env`（`wrangler secret put` / vars 绑定），**模块顶层拿不到**。需改为函数式/注入式读取。

**(6) 缓存与持久化（memdb + Cache API 中间件）** —— 三层问题：
- `memdb`（Map）与 `PixivApi` 单例的 token 缓存：isolate 内短暂有效，跨区域/冷启动会各自刷新 token，导致 Pixiv OAuth 刷新请求放大。建议改用 **KV**（`PXV_CLIENT_AUTH_*` 键）。
- Cache API 中间件本身可用（命名缓存受支持），但：① 缓存**仅存在于处理请求的数据中心**，不全局复制；② 每次缓存 miss 约 3~5 次 cache 调用，计入子请求配额（免费 50/请求），命中也有 2 次；③ 1GB 容量控制（maxSizeBytes）需遍历全部元数据，成本高；④ `setInterval` 清理在响应后不运行。建议简化：GET 响应直接依赖 Cache-Control + `fetch cacheTtl` / Cache API，清理逻辑改为惰性过期或去掉。
- 大对象（图片/视频）如需持久化，用 **R2**（10GB 免费、零出口费）替换"磁盘缓存"语义。

**(7) 静态资源（public/）** —— `serveStatic({ path: './public/...' })` 走文件系统。Workers 静态资产需 `assets` 目录绑定（wrangler `assets` 配置，自动映射 ASSETS 绑定）或放 R2；Pages 则直接放 `public/` 目录即可。

**(8) 环境与 bundle** —— `nodejs_compat` 标志启用后 `node:timers` 等可用；`hono-zod-openapi` 的 OpenAPI 文档生成、Scalar/Swagger 均为纯 JS 输出，兼容。sharp 移除后 bundle 应能压进 3MB（免费版 Worker 大小限制）。

---

## 3. 不兼容项替换方案（文件级清单）

| # | 模块/API | 替换方案 | 涉及文件 | 改动范围 |
|---|---|---|---|---|
| 1 | `Deno.serve` / 入口 | 新增 `src/worker.ts`：`export default { async fetch(request, env, ctx) { ... return app.fetch(request, env) } }`，保留 Hono 中间件链 | 新建 worker.ts；app.ts:87-91 移除 Deno.serve/RequestDeduper 接入 | 小（入口壳） |
| 2 | `Deno.env` / `Deno.args` | `const.ts` 改为 `loadConfig(env)` 或可变单例 `setEnv(env)`，fetch handler 入口调用一次；`PORT`/`ENABLE_CACHE`/`--dev` 逻辑删除（Workers 无端口、无 dev 参数） | src/lib/const.ts、app.ts:26/88、及所有 import const 的文件（blocker、pixiv-api、proxy、pximg、web-api、pixiv-now、translate、saucenao、pixivision、pid-recover、hibiapi-fallback、youdao、illuminarty 等） | 中（全局配置层重构，涉及面广但机械） |
| 3 | sharp（WebP） | 优先 **Cloudflare Image Resizing**（`fetch(url, { cf: { image: { format: 'webp', width, height, fit: 'inside' } } })`，付费 $0.5/千次）；或 WASM `@cf-wasm/photon`（免费）；删除 worker 池 | src/services/webp.ts、webp-worker.ts、worker/index.ts、lib/worker-pool.ts、routes/webp | 大（删两个 worker + 池，重写服务层） |
| 4 | ffmpeg（Ugoira） | **外置转换服务**（自建 ffmpeg API / 云函数 / 对接现有动图接口）；Worker 内只做「请求→外呼→流式回传」；删除 unzip/ffmpeg/临时目录逻辑 | src/services/ugoira.ts、ugoira-worker.ts、worker/index.ts、lib/worker-pool.ts、routes/ugoira | 大（整模块重构，功能可暂时禁用） |
| 5 | python（x-media） | JS fetch 重写（X 内部 API + cookies 存 KV/secret），或移除该路由 | src/services/x-media/*、routes/x-media | 大 |
| 6 | `Host` 头 | 删除 `reqHeaders.set('host', ...)`（URL 已含目标 host），保留 origin/referer/cookie 逻辑 | src/services/proxy.ts:50-54 | 极小 |
| 7 | 内存缓存/token | 单例内存缓存改为 **KV**（bindings 注入）；`PixivApi` token 缓存键写 KV | src/lib/db-memory.ts、lib/pixiv-api.ts、app.ts | 中 |
| 8 | Cache 中间件 | 保留 Cache API 但：去掉 `setInterval` 清理（或 `ctx.waitUntil` 包裹）、去掉 1GB LRU 遍历、注意配额；或改用 Cache-Control + fetch 缓存 | src/middlewares/cache.ts | 中 |
| 9 | serveStatic / public | Workers：wrangler `assets` 目录 → `hono/cloudflare-workers` serveStatic；Pages：public/ 直挂 | app.ts:6/41/42/75、wrangler.jsonc | 小 |
| 10 | `node:timers` | 开启 `nodejs_compat` 标志；operation-registry.ts 未被引用可保留（会被 tree-shake）或直接删除 | wrangler.jsonc；lib/operation-registry.ts | 极小 |
| 11 | crypto-js | 可保留（纯 JS）；体积敏感时可换 `crypto.subtle` | lib/pixiv-api.ts、services/youdao.ts | 可选 |

### 改造后入口形态示意（src/worker.ts）

```ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
// ... 其余中间件与原 app.ts 相同
import { setEnv } from './lib/const.ts'
import { routes } from './routes/index.ts'

const app = new Hono()
app.use(logger())
app.use(cors())
// ... 路由挂载、notFound/onError 同原 app.ts

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    setEnv(env)                       // ① 注入环境变量
    if (env.ENABLE_CACHE === '1') {
      // ② 可选：缓存中间件按需装配（注意 waitUntil）
    }
    return app.fetch(request, env, ctx)
  },
}
```

配套 `wrangler.jsonc` 示意：

```jsonc
{
  "name": "pxve-api",
  "main": "src/worker.ts",
  "compatibility_date": "2026-07-23",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./public", "binding": "ASSETS" },
  "vars": { "ACCEPT_DOMAINS": "", "UA_BLACKLIST": "", "ENABLE_CACHE": "0" },
  "kv_namespaces": [{ "binding": "KV", "id": "<namespace-id>" }],
  "r2_buckets": [{ "binding": "R2", "bucket_name": "pxve-media" }]
}
// 敏感项用 `wrangler secret put PIXIV_COOKIE` / PIXIV_ACCOUNT_TOKEN / SAUCENAO_API_KEY / SILICONClOUD_APT_KEY
```

若走 **Pages**：将全部路由收敛进 `functions/[[path]].ts` 的单一 catch-all（Hono app），public/ 作为 Pages 静态资源目录，KV/R2 以 Pages 绑定配置。

---

## 4. 结论：可保留 vs 必须改造

### ✅ 可以原样保留（改造工作量小）

- **整个 Hono 路由/中间件框架层**：cors、etag、secureHeaders、prettyJSON、logger、blocker（UA/域名白名单）、notFound/onError —— 全是标准 Web API 纯 JS。
- **Pixiv 数据面全部逻辑**：`PixivApi` 类（fetch + crypto-js + qs）、pixiv-now 代理、pixiv-web-api 直调、pixivision 抓取（cheerio）、小说翻译（三个 fetch 翻译源 + 硅基 AI）、saucenao、illuminarty、pid-recover（串行 fetch）、pximg 代理、app-api 透传、hibiapi fallback —— fetch 系代码可直接跑。
- **依赖**：hono 全家桶、cheerio、zod、qs、dayjs、cookie、isbot、await-lock、crypto-js、google/microsoft 翻译库、@__dirname/pixiv-web-api。
- **请求去重**（RequestDeduper）：逻辑保留，仅改为在 handler 内实例化（模块级也可，效果为 best-effort）。

### ❌ 必须改造（按优先级）

| 优先级 | 模块 | 原因 |
|---|---|---|
| P0 | 入口 + 配置读取（app.ts、const.ts） | 无 Deno.serve/Deno.env 无法启动 |
| P0 | WebP（sharp） | 原生模块不可运行 |
| P0 | Ugoira（ffmpeg） | 子进程 + 文件系统 + CPU 全部不可行 |
| P0 | x-media（python） | 子进程不可行 |
| P1 | CORS 代理 Host 头 | Workers 禁止设置，直接抛错 |
| P1 | 缓存中间件后台清理 | setInterval 语义失效 |
| P2 | 内存 token 缓存 → KV | 跨 isolate/区域失效导致 OAuth 刷新放大 |
| P2 | 静态资源 serveStatic | 适配 ASSETS 绑定 |

---

## 5. 部署限制核对（改造后是否满足）

| 限制项 | Workers Free | Workers Paid | 本项目影响 |
|---|---|---|---|
| 请求体大小 | 100 MB（账户套餐级） | 100~200 MB | ✅ 本项目入站多为小 JSON/查询；以图搜图、webp 源图远小于 100MB |
| CPU 时间/请求 | **10 ms** | 30 s | ⚠️ **免费版是最大风险**：cheerio 解析 pixivision 整页、小说翻译的文本处理、OpenAPI 生成均可能超 10ms CPU（超限有柔性余量但高频触发会被掐）。**建议至少 Paid 或对解析类路由降级** |
| 子请求/请求 | 50 | 1000 | ✅ 单请求最多约 5~6 次 fetch（pid-recover 5 次 + 兜底）；Cache API 调用同样计入，需注意缓存中间件每请求 3~5 次 |
| 请求时长（wall-clock） | 客户端保持连接即可，无硬上限 | 同左 | ⚠️ 小说翻译分片 `sleep(500)` 会拉长请求；客户端中断即取消。`waitUntil` 仅 30s |
| Worker 内存 | 128 MB | 128 MB | ⚠️ 原图解码/大文件缓存注意；图片处理建议入口限流（如 >16MB 拒绝） |
| Worker 体积 | 3 MB（压缩） | 10 MB | ⚠️ 移除 sharp 后预计 2~3MB，需 `--minify`；超限用 Paid |
| 每日请求 | 100,000/天（免费） | 按量计费（$5 含 1000 万/月） | ✅ 视使用量选择 |
| Cache API | 对象 ≤512MB、50 次调用/请求 | ≤512MB、1000 次/请求 | ⚠️ 原代码 maxSizeBytes 1GB 是总量目标（单对象上限 512MB 不受影响），但清理逻辑不适用 |
| KV（免费） | 10 万读/天、1 千写/天、1GB | 1000 万读、100 万写/月 | ✅ token 缓存写入极少，足够 |
| R2（免费） | 10GB 存储、100 万 A 类/1000 万 B 类操作/月 | 同左 | ✅ 如做图片持久化 |

**总体判断**：改造后架构**满足** Workers/Pages 部署限制，但**免费版 CPU 10ms 对解析/翻译类路由偏紧**，建议：关键解析路由做性能优化（如 pixivision 用更轻解析）、图片处理走 Image Resizing（计费但便宜）、Ugoira 外置。生产建议直接使用 Workers Paid（$5/月起）或 Pages（免费额度相同限制）。

---

## 6. 坑与注意事项

1. **Host 头禁令**：`/proxy/*` 在 Workers 上会因 set Host 抛错，务必删除（proxy.ts:51）。origin/referer/cookie 可正常设置。
2. **Cache API 仅本地数据中心**：同 URL 在不同地区可能各自缓存，命中率低于预期；`cache.put` 对带 `Vary: *`、206、非 GET 会抛错；`Set-Cookie` 响应永不缓存（中间件已有规避）。
3. **定时器陷阱**：Workers 的 setTimeout/setInterval 在响应结束后不执行（除非 `waitUntil`），且实际延迟被限制为"最后一次 I/O 之后"，不能作为精确延时。小说翻译的 `sleep(500)` 属于响应内等待，可用但会让请求变长。
4. **isolate 全局状态不可靠**：memdb、RequestDeduper、PixivApi 单例在冷启动/多区域下各自独立——token 刷新会重复打 Pixiv OAuth，建议 KV 化；并发去重退化为 best-effort。
5. **`nodejs_compat` 必须开启**（compatibility_flags），否则 `node:timers` 等导入失败；`compatibility_date` 建议 2024-09-23 之后以获得 v2 特性。
6. **免费版 CPU 超限**：cheerio 整页解析（pixivision）、OpenAPI 文档生成、小说 HTML 拼装是 CPU 大户；如用免费版，建议 `wrangler dev` 本地压测观察 `CPU Time Exceeded`。
7. **子请求配额**：缓存中间件一次 miss 最多 3~5 次 Cache API 调用（match+metadata+put×2+keys），与 fetch 共享 50/1000 配额；pid-recover 的 5 次串行抓取注意与缓存叠加。
8. **静态资源与路由冲突**：assets 目录绑定后，`/robots.txt`、`/favicon.ico` 可直接由静态资产提供，无需 serveStatic 中间件（避免双份逻辑）。
9. **Pages 注意**：Pages Functions 与 Workers 共享运行时与大部分绑定（KV/R2/D1/DO 支持），但命名 Cache API 与部分 Workers 特性存在差异，部署到 Pages 前先验证缓存行为。
10. **安全合规**：PIXIV_COOKIE / token 等必须以 `wrangler secret` 存放（不要进 vars/仓库）；.env.example 中的键名（含拼写 `SILICONClOUD_APT_KEY`）保持不变以免改代码。

---

*报告完。如需按本报告实施迁移（新建 worker.ts、改造 const.ts、替换图片处理等），可继续下一步。*
