# pxve-api 迁移到 Vercel 兼容性评估报告

> 评估对象：`pxve-api`（Deno 2.x + Hono 4 实现的 Pixiv 反代 API）
> 评估基准：Vercel Functions（Node.js / Fluid Compute 运行时）与 Edge 运行时
> 评估日期：2026-08-12

---

## 0. 结论先行

**可以运行，且迁移成本显著低于 Cloudflare Workers。** 关键原因：Vercel 有完整的 **Node.js 运行时**（默认、Fluid Compute 架构），sharp 原生可用、ffmpeg 可通过 `ffmpeg-static` + `child_process` 运行、文件系统可用、环境变量就是 `process.env`。真正被卡住的只有三处：入口适配、Deno 专属 API 的机械替换、以及 **x-media 的 python 子进程**（Vercel 同样无法在 Node 函数里跑 python，与 CF 一样需要重写或移除）。

**前提：必须选 Node.js 运行时，不能选 Edge 运行时。** Vercel Edge（V8 isolate）与 Cloudflare Workers 限制相同：无 child_process、无原生模块、bundle 仅 1MB——sharp/ffmpeg 全部不可用。

---

## 1. 项目架构回顾（与 CF 报告相同）

- **入口**：`src/app.ts` — 中间件链 → 路由 → 文档 → `RequestDeduper` → `Deno.serve`（端口 3021）。
- **路由**：`src/routes/index.ts` 挂载 15 组（Pixiv App/Web API、pixivision、小说翻译、Ugoira、WebP、pximg、SauceNAO、AI 检测、X 媒体、CORS 代理、HibiAPI 兜底）。
- **依赖**：Hono 4、cheerio、sharp（原生）、crypto-js、google/microsoft 翻译库、`@__dirname/pixiv-web-api`（零依赖纯 fetch）。
- **状态**：模块级 Map（memdb/token 缓存/去重）+ Cache API + Deno Web Worker 池。

---

## 2. Vercel 运行时模型

| 维度 | Vercel Node（Fluid Compute，默认） | Vercel Edge |
|---|---|---|
| 底层 | AWS Lambda 容器（Node.js） | V8 isolate（类 CF Workers） |
| Node 内置模块 | ✅ 完整（fs/http/net/child_process…） | ❌ 仅少量 shim |
| 原生模块（sharp） | ✅ 支持 | ❌ |
| 子进程（ffmpeg/python） | ✅（bundle 内二进制） | ❌ |
| 环境变量 | `process.env` | 受限 |
| Bundle 上限 | 250MB（未压缩）；Large Functions 5GB | 1MB（Hobby 压缩） |
| 执行时长 | 300s（Hobby）/ 800s（Pro，beta 1800s） | 25s 内开始响应，可流式至 300s |
| 内存 | 默认 2GB / 1vCPU（最大 4GB/2vCPU） | 128MB |
| 请求/响应体 | **4.5MB**（流式响应除外） | 4.5MB |

本项目（sharp + ffmpeg + fs）**必须部署在 Node 运行时**。

---

## 3. 逐项兼容性评估

### 3.1 Deno 专属 API

| 项目中使用的 API | 位置 | Vercel Node | 处置 |
|---|---|---|---|
| `Deno.serve` | app.ts:89 | ❌ | 换 Hono Vercel 适配器（`export default app` / `handle(app)`） |
| `Deno.env.get` / `Deno.args` | const.ts、app.ts:26/88 | ❌ | 换 `process.env.X`；删除 PORT/--dev 逻辑 |
| `Deno.Command`（unzip/ffmpeg） | ugoira-worker.ts | ⚠️ | `child_process.execFile` + `ffmpeg-static`（可行，见 3.3） |
| `Deno.Command`（python） | x-media/index.ts | ❌ | 无法跑 python，JS 重写或移除（同 CF） |
| `Deno.writeFile/readFile/makeTempDir/remove/build.os` | ugoira-worker.ts | ⚠️ | 换 `node:fs`（/tmp 可写，Lambda 标准模式） |
| `new Worker` + `import.meta.resolve` | worker-pool.ts、worker/index.ts | ⚠️ | Node 无全局 `new Worker`（需 worker_threads）；**推荐直接删除池**，serverless 每请求天然隔离，内联调用即可 |
| `import.meta.dirname` | x-media/index.ts | ✅ | Node 18.19+ 支持；该文件随改造删除 |
| `@std/fs`/`@std/path` | ugoira-worker.ts | ❌ | 换 `node:fs` / `node:path` |
| `node:timers` setImmediate | operation-registry.ts | ✅ | Node 原生支持 |
| Cache API（`caches.open`） | middlewares/cache.ts | ❌ | Node 无 Cache API → 中间件 `if (!globalThis.caches)` **自动优雅降级**（不缓存）；建议换 `@vercel/kv` 或依赖 CDN Cache-Control |
| `serveStatic`（hono/deno） | app.ts:41/42/75 | ❌ | `hono/node-server` 的 serveStatic（读 fs）或交给 Vercel 静态托管 |
| WebSocket/长连接 | 无 | — | Vercel 函数不支持持久 WS；项目未使用，无影响 |

### 3.2 关键能力：sharp / ffmpeg / 文件系统（与 CF 的本质区别）

| 能力 | Cloudflare Workers | **Vercel Node 运行时** |
|---|---|---|
| sharp（WebP 转换） | ❌ 必须换 Image Resizing/WASM | ✅ **原生可用**，`webp-worker.ts` 内联调用即可，逻辑几乎原样保留 |
| ffmpeg（Ugoira 转换） | ❌ 必须外置服务 | ✅ **可行**：`ffmpeg-static`（~76MB 二进制，250MB bundle 内放得下）+ `child_process.spawn` + `/tmp` 读写。⚠️ 注意：转换期间函数保持占用，需 `maxDuration` 调大；输出必须**流式**返回（见 4/5） |
| 文件系统 | ❌ 无 | ✅ `/tmp` 可写（Lambda 语义，实例级临时） |
| 并发子请求上限 | 50/请求（免费） | ✅ **无限制**（pid-recover 的 5 次串行抓取、缓存逻辑均无忧） |
| CPU 时间 | 10ms（免费）硬限制 | ✅ 无硬限制，仅活跃 CPU 计费（cheerio 整页解析毫无压力） |

### 3.3 依赖兼容性

| 依赖 | Vercel Node | 说明 |
|---|---|---|
| hono / hono-zod-openapi / @hono/swagger-ui / @scalar/hono-api-reference | ✅ | Hono 官方支持 Vercel（Node 运行时自动识别 `export default app`，或 `handle(app)` 适配器） |
| @__dirname/pixiv-web-api | ✅ | 零依赖纯 fetch |
| cheerio / zod / qs / dayjs / cookie / isbot / await-lock / crypto-js | ✅ | 纯 JS |
| google-translate-api-x / microsoft-translate-api | ✅ | fetch 实现 |
| **sharp** | ✅ | Node 原生模块，Vercel 对 sharp 有专门优化 |
| **ffmpeg-static**（新增） | ✅ | ~76MB，需显式加入依赖并配置 exec 权限 |

---

## 4. Vercel 限制核对（改造后是否满足）

| 限制项 | 数值 | 本项目影响 |
|---|---|---|
| 请求体大小 | **4.5MB**（413: FUNCTION_PAYLOAD_TOO_LARGE） | ✅ 入站基本为小型 JSON/查询；SauceNAO/Illuminarty 上传图片 < 4.5MB。若未来支持大文件上传需走 Vercel Blob 直传 |
| 响应体大小 | **4.5MB**（**流式响应除外**） | ⚠️ **重点**：pximg 大图、ugoira 视频、WebP 大图可能超 4.5MB。当前 proxy/pximg 已用 `new Response(resp.body)` 流式透传（✅ 天然豁免）；**ugoira 改造时必须用 `fs.createReadStream`/ReadableStream 流式返回，不能整块读入再 `c.json`** |
| 最大时长 | 300s（Hobby）/ 800s（Pro） | ⚠️ 小说翻译分片（每片 sleep(500)）+ ugoira 转码可能逼近上限；长篇小说或长动图建议 Pro。Vercel 需在 `vercel.json`/函数配置里显式设 `maxDuration` |
| 内存 | 2GB（默认，可调至 4GB） | ✅ 远超 CF 的 128MB，sharp 处理大图无压力 |
| Bundle 大小 | 250MB 未压缩（Large Functions 5GB） | ⚠️ sharp（~30MB）+ ffmpeg-static（~76MB）合计约 110MB，**在限内**；但建议 ugoira 与主服务分离或按需加载 |
| 调用量 | Hobby 100 万次/月；活跃 CPU 4 CPU-小时 | ✅ Pixiv viewer 场景通常足够；注意 Hobby **仅限非商业用途**（见坑 8） |
| 数据流量 | Hobby 100GB/月 | ⚠️ 图片代理流量大，pximg 是流量大户，需留意 |
| 并发 | 无子请求限制 | ✅ |
| 环境变量 | `process.env`（Dashboard/CLI 配置） | ✅ 机械替换 |
| WebSocket | 函数不支持持久连接 | 未使用，无影响 |

---

## 5. 改造清单（文件级）

| # | 模块 | Vercel 方案 | 涉及文件 | 改动范围 |
|---|---|---|---|---|
| 1 | 入口 | `export default app`（Vercel 自动识别 Hono，Node 运行时）；或 `import { handle } from '@hono/node-server/vercel'; export default handle(app)` | src/app.ts（删除 Deno.serve/RequestDeduper 接入；app.ts 末尾已有 `export { app }`，补 `export default app`） | 小 |
| 2 | 配置读取 | `Deno.env.get` → `process.env`；const.ts 顶部改为 `process.env.X` 读取（模块加载期即可，无需注入式——比 CF 简单） | src/lib/const.ts、app.ts:26/88 | 小 |
| 3 | sharp（WebP） | **保留 sharp**，删除 Web Worker 池，`webp-worker.ts` 的转换逻辑改为普通函数直接 `await` 调用 | src/services/webp.ts、worker/webp-worker.ts、worker/index.ts、lib/worker-pool.ts、routes/webp | 中（删池 + 内联化） |
| 4 | ffmpeg（Ugoira） | 保留思路：`ffmpeg-static` 定位二进制 + `child_process.spawn` + `/tmp` 解压/编码 + **流式回传**；删除 Deno.Command/Deno fs | src/services/ugoira.ts、worker/ugoira-worker.ts、worker/index.ts、lib/worker-pool.ts、routes/ugoira | 大（重写 worker 内实现，但功能可保住） |
| 5 | python（x-media） | ❌ 无解：JS fetch 重写（X 内部 API + cookies 存 env/KV）或移除路由 | src/services/x-media/*、routes/x-media | 大（同 CF） |
| 6 | 缓存 | Cache API 不存在 → 中间件自动降级；如需缓存换 `@vercel/kv`（Upstash Redis）存 token/响应，或依赖 CDN Cache-Control | src/middlewares/cache.ts、lib/db-memory.ts | 中 |
| 7 | `Host` 头 | Node 18+ 全局 fetch（undici）对 forbidden header 同样受限；**删除 `reqHeaders.set('host', ...)` 行**（URL 自带 host），保留 origin/referer/cookie | src/services/proxy.ts:50-54 | 极小 |
| 8 | 静态资源 | public/ 由 Vercel 静态托管（自动）；app.ts 的 serveStatic 路由删除或改 `hono/node-server` serveStatic | app.ts:41/42/75、public/ | 小 |
| 9 | 内存 token 缓存 | 实例内 Map 有效（Fluid 单实例内并发共享）；跨实例刷新放大 → 可选 `@vercel/kv` | src/lib/pixiv-api.ts | 可选 |

### 部署配置示意

**方式 A（推荐，零构建配置）**：Vercel CLI 或 Git 连接，Hono app 放 `src/app.ts`（默认导出），`vercel.json`：

```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "src/app.ts": { "runtime": "nodejs20.x", "maxDuration": 300, "memory": 2048 }
  },
  "headers": [
    { "source": "/(.*)", "headers": [{ "key": "Access-Control-Allow-Origin", "value": "*" }] }
  ]
}
// 敏感配置（PIXIV_COOKIE / PIXIV_ACCOUNT_TOKEN / SAUCENAO_API_KEY / SILICONClOUD_APT_KEY）
// 在 Vercel Dashboard → Settings → Environment Variables 配置，代码里 process.env 读取
```

**方式 B（Build Output API）**：用 `@hono/vite-build` 的 Vercel adapter 产出 `.vercel/output/`（static/ 放 public、functions/__hono.func 跑 Node），`vercel deploy --prebuilt`。适合需要自定义函数配置（流式、region）的场景。

---

## 6. 结论：可保留 vs 必须改造

### ✅ 可原样保留
- **全部 Pixiv 数据面**（PixivApi 类、pixiv-now、pixiv-web-api、pixivision、翻译、saucenao、illuminarty、pid-recover、pximg、app-api 透传、hibiapi fallback）——纯 fetch。
- **Hono 中间件层**（cors、etag、secureHeaders、prettyJSON、logger、blocker、notFound/onError）。
- **sharp 转换逻辑本身**（仅去掉 Worker 池包装）。
- 全部 npm 依赖（除新增 ffmpeg-static 外无需更换任何库）。

### ❌ 必须改造
| 优先级 | 模块 | 原因 |
|---|---|---|
| P0 | 入口 + env（app.ts、const.ts） | Deno.serve/Deno.env 不存在 |
| P0 | Ugoira（ffmpeg） | Deno.Command/Deno fs → child_process + node:fs + 流式返回 |
| P0 | x-media（python） | 无法运行 python，重写或移除 |
| P1 | Worker 池（webp/ugoira） | Node 无全局 Worker，直接内联化 |
| P1 | proxy.ts Host 头 | fetch 规范禁止 |
| P2 | 缓存中间件 | 自动降级；可选 @vercel/kv |

> 相比 Cloudflare Workers，**不需要动**：WebP 图片处理（sharp 原样）、ugoira 的主流程（仅换进程/文件 API）、cheerio 解析的 CPU 顾虑（无 10ms 限制）、子请求配额。

---

## 7. 坑与注意事项

1. **4.5MB 响应体是最大坑**：所有大体积响应（pximg 原图、ugoira 产物、WebP）必须走**流式**。现有 proxy/pximg 已是流式透传 ✅；ugoira 改造务必 `fs.createReadStream` → `ReadableStream`，避免整块 Buffer 返回触发 413。
2. **maxDuration 必须显式配置**：Vercel 默认时长可能较短，ugoira 转码、超长小说翻译需在 `vercel.json` 的 `functions` 里设置（Hobby 上限 300s，Pro 800s）。
3. **ffmpeg-static 的代价**：~76MB 二进制进入 bundle（250MB 限内，但增大部署体）；需确认二进制可执行权限；长视频转码期间函数被占用，并发高时成本上升——流量大建议外置转码服务。
4. **Hobby 计划的商用条款**：Vercel Hobby 明确**仅限非商业用途**（接广告、捐赠按钮、付费服务均算商业）。公共 Pixiv Viewer API 若面向公众服务，建议 Pro（$20/月）。
5. **默认区域 iad1（美东）**：中国大陆访问延迟较高；Pro 可配多区域/近源区域。pximg 图片代理经美国区域中转，体验需实测。
6. **Cache API 静默降级**：中间件检测到无 `globalThis.caches` 会直接不缓存——不要依赖 X-Cache 头行为；建议改用 CDN 层 Cache-Control + Vercel Edge Network 缓存。
7. **冷启动**：Lambda 冷启动明显高于 CF Edge（Fluid Compute 已缓解）；`--dev` 参数逻辑、`PORT` 概念删除。
8. **Bun 运行时**（可选）：Vercel 支持 `bunVersion` 让 Hono 跑在 Bun 上（API 兼容 Node），可作为替代，但需验证 sharp 原生模块在 Bun 上的表现。
9. **x-media 若坚持要**：无 python 环境，只能 JS 重写（X 内部 API + cookies），且 X 风控严格，建议降级为"移除或外置"。
10. **与 CF 对比小结**：Vercel 胜在 **sharp/ffmpeg 可保留、无 CPU/子请求限制、内存 2GB**；CF 胜在**边缘冷启动更快、Cache API 可用、免费版额度（10 万/天 vs 100 万/月 但 CF 免费层无商用条款问题）**。若目标是"尽量少改代码"，**Vercel Node 运行时是更优选择**；若目标是"全球边缘低延迟 + 免费不限商用"，选 CF（但需外置图片/视频处理）。

---

*报告完。如需按本报告实施 Vercel 迁移（入口改造、worker 池内联化、ugoira 换 ffmpeg-static 等），可继续下一步。*
