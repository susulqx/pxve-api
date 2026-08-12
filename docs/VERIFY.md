# pxve-api Node.js 化迁移：验证方案（含实测结果）

> 验证目标：证明迁移后的 Node.js 版与原版 Deno 版行为等价（返回值、数据结构、错误码、响应格式一致）。
> 实测环境：Windows，Node v22.22.2，`feat/vercel-migration` @ f169375；本机无 Pixiv 凭据、无外网可达。
> 原版基准：`D:\Program Files\.su\pxve-api - 原`（源码级对照）。

---

## 1. 静态验证（无网络依赖）

### 1.1 类型检查
```bash
npm run type-check        # tsc --noEmit
```
✅ **实测通过（exit 0）**，原版在 Deno 下 `deno check` 等价。

### 1.2 模块加载与运行时自检
```bash
npm run self-check        # scripts/self-check.ts：40 个业务模块顶层加载 + crypto-js MD5 校验
```
✅ **实测通过**：全部 40 模块加载成功；crypto-js MD5 输出与标准值一致（Pixiv 签名/有道解密依赖）。

### 1.3 构建产物
```bash
npm run build             # esbuild bundle → dist/app.mjs
```
✅ **实测通过**：3.68MB，bundle 中无任何 `Deno.`/`new Worker` 代码引用。

### 1.4 源码残留检查
```bash
grep -rn "Deno\.\|jsr:\|@std/\|import.meta.resolve\|new Worker" src --include="*.ts"
```
✅ **实测通过**：无代码级残留（仅迁移说明注释）。

## 2. 动态验证（本地起服务）

### 2.1 启动
```bash
npm run start             # tsx src/local-server.ts → http://localhost:3021
```

### 2.2 端点冒烟矩阵（实测 2026-08-12）

| 端点 | 实测 HTTP | 实测响应特征 | 原版预期 | 结论 |
|---|---|---|---|---|
| `GET /` | 200 | Ciallo HTML | 同（固定字符串） | ✅ |
| `GET /docs` | 200 | Scalar HTML | 同 | ✅ |
| `GET /swagger` | 200 | Swagger UI HTML | 同 | ✅ |
| `GET /openapi.json` | 200 | 31KB OpenAPI JSON | 同 | ✅ |
| `GET /openapi-hibiapi.json` | 200 | 静态 JSON（serveStatic） | 同 | ✅ |
| `GET /robots.txt` | 200 | 静态文件 | 同 | ✅ |
| `GET /favicon.ico` | 200 | 静态文件 | 同 | ✅ |
| `GET /nope` | 404 | `{"error":"Not Found"}` | 同 | ✅ |
| `GET /api/pixiv/`（缺 type） | 400 | ZodError JSON | 同（hono-zod-openapi） | ✅ |
| `GET /api/pixiv/rank`（无 token） | 500 | `{"error":"…refresh_token required"}` | 同异常路径 | ✅ |
| `GET /api/x/media`（无参数） | 500 | `{"error":"…required."}` | 同 | ✅ |
| `GET /api/webp/http://x/a.txt` | 500 | `{"error":"Not supported"}` | 同 | ✅ |
| `GET /api/webp/<外网图>` | 500 | `{"error":"Response not ok."}`（外网不可达） | 同 | ✅ |
| `GET /api/ugoira/139993591.mp4` | 500 | 业务异常（getMetadata fetch 失败），**非** "Worker is not defined" | 同 | ✅ |
| CORS | — | `access-control-allow-origin: *` | 同（hono/cors 默认） | ✅ |
| sharp 转码链路 | — | 本地生成图 png→webp 成功（RIFF 魔数） | 同（sharp 同版本同参数） | ✅ |

### 2.3 需凭据/外网端点（本机无法端到端实测，部署后必须复测）

| 端点 | 复测命令（部署后） | 验收标准 |
|---|---|---|
| `/api/pixiv/{action}` | `curl https://<域名>/api/pixiv/illust?id=114514` | 返回标准 Pixiv illust JSON |
| `/api/pixiv-web-api/ranking` | `curl https://<域名>/api/pixiv-web-api/ranking` | 返回榜单数据 |
| `/api/pixiv-now/ranking` | `curl 'https://<域名>/api/pixiv-now/ranking?mode=daily'` | 返回 contents 数组 |
| `/api/pixivision` | `curl 'https://<域名>/api/pixivision?lang=zh'` | 返回 articles/rank |
| `/api/pixiv-novel-translate/…` | `curl 'https://<域名>/api/pixiv-novel-translate/27077032.html?srv=ms'` | 返回翻译 HTML |
| `/api/sauce/` | 上传图片 | SauceNAO 结果 JSON |
| `/api/pid-recover/…` | `curl https://<域名>/api/pid-recover/134903417` | 返回镜像数组 |
| `/pximg/...` | `curl -s -o /dev/null -w "%{http_code} %{size_download}" https://<域名>/pximg/c/...` | 200 + 完整大小（流式） |
| `/proxy/...` | `curl 'https://<域名>/proxy/https://yande.re/post.json?limit=1'` | 200 + JSON |
| `/api/ugoira/<id>.mp4` | 配置 token 后请求 | 返回可播放视频（流式） |

> 原版与迁移版使用**同一套业务代码**（routes/services 零改动），因此上表"需凭据端点"的行为由同一代码路径决定；复测的目的是确认**运行环境（Node/Vercel）**下无平台差异，而非业务差异。

## 3. 与原版差异的最终判定（详见 MIGRATION-COMPARE.md 第 4 节）

1. `--dev` 参数逻辑移除 —— 仅影响显式 --dev 启动场景，默认无差异。
2. `ENABLE_CACHE=1` 时缓存降级 —— 原代码自带 `globalThis.caches` 检测，Node 下自动透传；默认配置 `0` 无差异。
3. ugoira/webp 由 Web Worker 改请求内联 —— 结果一致，并发隔离由 serverless 实例承担。
4. x-media 依赖 python —— 与原版相同的环境依赖，Vercel 平台不可用（部署前移除/重写）。
5. Node 建议 20.11+（engines 已声明 ≥18.17，本地 22 验证通过）。

## 4. 交付物验证清单

- [x] `npm run type-check` 通过
- [x] `npm run self-check` 通过（40 模块 + crypto-js）
- [x] `npm run build` 通过（3.68MB，无 Deno 引用）
- [x] 无凭据端点冒烟矩阵全部符合原版预期
- [ ] 部署后按 2.3 复测全部凭据端点（需配置 PIXIV_* 等环境变量）
- [ ] 部署后验证 4.5MB 流式响应（pximg 大图下载完整性）
- [ ] 部署后验证 HTTPS/域名/缓存行为（见 DEPLOY-VERCEL.md）
