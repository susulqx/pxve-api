# pxve-api → Vercel 迁移执行计划清单

> 目标：将 pxve-api（Deno 2 + Hono 4）无痛迁移至 **Vercel Node.js 运行时（Fluid Compute）**，全程可回滚、分步验证。
> 依据：《docs/vercel-migration-report.md》评估结论（sharp 可保留、ffmpeg 用 ffmpeg-static、仅需 Node 化改造）。
> 版本基线：`asadahimeka/pxve-api` 当前 main 分支（2026-08-12）。
> 预计总工时：**10～14 小时**（单人，含观察期外的时间）。

**状态图例**：`[ ]` 待办　`[~]` 进行中　`[x]` 已完成

**全局安全策略（所有步骤的回滚基石）**
1. 新建分支 `feat/vercel-migration`，`main` 分支冻结并打 tag `v1.0-deno`（Docker 版本基线，随时可恢复）。
2. 迁移期间**原有部署（Docker 或当前 CF 上的服务）保持运行**，自有域名解析不提前切换（切换动作集中在 5.3，且 5.3 前用 `*.vercel.app` preview 域名验收）。
3. 唯一对外变更点是第 5.3 步的 DNS 切换——其回滚预案是"切回原 CNAME"，其余步骤全部在 Git 层面可逆。
4. 无持久化数据迁移（token 缓存可重建，可选 KV 属增强项，不阻塞上线）。

---

## 一、迁移前准备（前置检查项）

### 1.1 环境变量清单核对
| # | 检查项 | 现状（.env.example） | Vercel 配置方式 | 状态 |
|---|---|---|---|---|
| 1 | 收集全部环境变量 | PORT、ENABLE_CACHE、ACCEPT_DOMAINS、UA_BLACKLIST、PIXIV_COOKIE、PIXIV_ACCOUNT_TOKEN、PIXIV_ACCOUNT_TOKEN_ALTS、HIBIAPI_BASE、SAUCENAO_API_KEY、SILICONClOUD_APT_KEY | 逐项核对代码引用（src/lib/const.ts 为唯一入口） | [ ] |
| 2 | 非敏感变量 | PORT（删除，Vercel 无端口概念）、ENABLE_CACHE、ACCEPT_DOMAINS、UA_BLACKLIST、HIBIAPI_BASE | Dashboard → Settings → Environment Variables → **Variables** | [ ] |
| 3 | 敏感变量 | PIXIV_COOKIE、PIXIV_ACCOUNT_TOKEN、PIXIV_ACCOUNT_TOKEN_ALTS、SAUCENAO_API_KEY、SILICONClOUD_APT_KEY | 同上 → **Secrets**（写入后不可读回） | [ ] |
| 4 | 确认各变量当前真实取值可用（token 未过期） | 本地 `deno run --env src/app.ts` 起服务后调用 `/api/pixiv/illust?id=xxx` 验证 | — | [ ] |
| 5 | `.env.example` 增加 Vercel 专属说明（ENABLE_CACHE 建议 `0`，依赖 CDN 缓存） | — | — | [ ] |

### 1.2 域名与 DNS 配置（自有域名，DNS 托管在 Cloudflare）
> ⚠️ 注意：`api.pxve.cc` 是上游作者的 demo 域名（README 中 Demo 地址），**与本项目无关，无需也不可接管**。迁移使用你自己的域名（如 `pa.supy.cc` / `pa.supy.cc.cd`，两个域名写法请确认后填入下文）。

| # | 检查项 | 说明 | 状态 |
|---|---|---|---|
| 1 | 确认自有域名清单（主域 + 备用域） | Vercel 支持一个项目绑定多个域名（可设主域 + 重定向）；**先确认两个域名写法是否正确**（你提供的两处相同） | [ ] |
| 2 | 确认域名当前"绑定到 CF"的具体形态 | ① DNS 托管在 Cloudflare（NS 指向 CF）；② CF 上有 Worker/Pages 路由接管该域名。**若存在 Worker 路由，它会拦截流量，切 Vercel 时必须先移除/停用该路由** | [ ] |
| 3 | 在 Vercel 添加域名 | Dashboard → Project → Settings → Domains → Add Domain，按指引拿到验证记录 | [ ] |
| 4 | 在 **Cloudflare DNS** 添加 Vercel 指向 | 添加 CNAME：`pa.…` → `cname.vercel-dns.com`（以及 Vercel 要求的验证记录 `_vercel.…` TXT/CNAME） | [ ] |
| 5 | CF 代理模式（橙云）决策 | 推荐：**灰云（DNS only）** 直连 Vercel，避免 CF 缓存/改写干扰；若需橙云：SSL/TLS 模式设 **Full (strict)**，且为 `/api/*` 配置缓存绕过规则（防 API 数据被 CF 缓存） | [ ] |
| 6 | 切换前将原记录 TTL 临时降至 60s（便于快速回滚） | 关键步骤，否则 DNS 回滚有延迟 | [ ] |
| 7 | 备案/合规确认 | 中国大陆访问 Vercel 无 ICP 备案，需自行评估合规风险（`supy.cc.cd` 这类后缀在境内解析情况需实测） | [ ] |
| 8 | 备用验证域名（`pxve-api.vercel.app` 自动生成） | Preview 阶段用它验收，避免过早动线上 DNS | [ ] |

### 1.3 依赖与构建脚本校验
| # | 检查项 | 说明 | 状态 |
|---|---|---|---|
| 1 | 本机 Node ≥ 18.17（建议 20/22 LTS） | `node -v` 确认；ffmpeg-static 与 sharp 均要求 Node 18+ | [ ] |
| 2 | Vercel CLI 安装并登录 | `npm i -g vercel && vercel login` | [ ] |
| 3 | npm registry 可达（本项目此前用 Deno 缓存，Node 侧首次拉全量依赖） | `npm ping` / 试装 sharp 确认预编译二进制可下载 | [ ] |
| 4 | 确认 npm 包 `@__dirname/pixiv-web-api@0.1.4` 可从官方源安装 | 该包名特殊（@__dirname 命名空间），提前 `npm view` 验证 | [ ] |
| 5 | tsconfig 路径别名（`@lib/*`、`@services/*`）在 Node/ESM 下解析方案定稿 | 见步骤 1.2：优先保留 tsconfig `paths`（esbuild 0.21+ 支持），失败则全量改相对导入 | [ ] |
| 6 | deno.json 中 `jsr:@std/fs`、`jsr:@std/path` 替换来源确认 | 仅 ugoira-worker 使用 → 随 2.3 一并移除，无需保留 | [ ] |
| 7 | 构建/开发脚本映射定稿 | deno task dev/start/type-check → npm scripts（见 1.6） | [ ] |

### 1.4 框架版本兼容性确认
| # | 检查项 | 说明 | 状态 |
|---|---|---|---|
| 1 | Hono 4.x 在 Node 运行时的入口形态确认 | Vercel 零配置检测：`src/app.ts` 需 `export default app`；或显式 `handle(app)`（@hono/node-server/vercel） | [ ] |
| 2 | `hono-zod-openapi`、`@hono/swagger-ui`、`@scalar/hono-api-reference` 无 Node 专属依赖 | 均为纯 JS 输出，已评估兼容 | [ ] |
| 3 | sharp@0.34.5 在 Node 20/22 下的预编译二进制匹配 | `npm i sharp` 后 `node -e "require('sharp')"` 冒烟 | [ ] |
| 4 | ffmpeg-static 包选择与平台确认 | 服务器为 linux-x64（Vercel 运行环境），安装后确认二进制存在且可执行 | [ ] |
| 5 | `export { app }`（现有）与 `export default app`（新增）兼容性 | 平台要求 default export；保留命名导出不影响 | [ ] |

### 1.5 工具链与仓库准备
| # | 检查项 | 说明 | 状态 |
|---|---|---|---|
| 1 | `git checkout -b feat/vercel-migration` | 全部分支隔离 | [ ] |
| 2 | `git tag v1.0-deno`（main 上打标） | 基线锚点 | [ ] |
| 3 | 原 Docker 部署确认在运行且健康（`docker ps` / curl 探活） | 回滚兜底 | [ ] |
| 4 | `.gitignore` 增加 `node_modules/`、`.vercel/`、`dist/` | 防误提交 | [ ] |

---

## 二、最优迁移顺序（总览）

> 顺序原则：**先 Node 化（本地可跑）→ 再平台化（Vercel 可跑）→ 后功能替换（重活）→ 最后对外切换**。每阶段结束都有本地或 Preview 验证门，失败即停、就地回滚。

| 阶段 | 内容 | 优先级 | 预计耗时 | 涉及模块 | 前置条件 | 验证门 |
|---|---|---|---|---|---|---|
| 0 | 迁移前准备（第一节全部） | 高 | 0.5～1h | 全项目/平台账号 | 无 | 1.5 全部 [x] |
| 1 | **项目 Node 化**：package.json、路径别名、Deno API → Node、本地可跑 | 高 | 3～4h | 根目录、src/lib/const.ts、src/app.ts、scripts | 阶段 0 | 本地全路由冒烟 |
| 2 | **Worker 池移除 + 图片处理内联**：sharp 内联、ugoira 重写（ffmpeg-static） | 高 | 2～3h | src/lib/worker-pool.ts、src/services/worker/*、src/services/webp.ts、src/services/ugoira.ts | 阶段 1 | 本地 /api/webp、/api/ugoira 验证 |
| 3 | **平台细节修复**：Host 头、缓存中间件、静态资源、x-media 决策 | 中 | 1～1.5h | src/services/proxy.ts、src/middlewares/cache.ts、src/app.ts、src/services/x-media/* | 阶段 1 | 本地回归 + 决策确认 |
| 4 | **Vercel 部署配置**：vercel.json、环境变量录入、vercel dev 联调 | 高 | 0.5～1h | 根目录、Dashboard | 阶段 2、3 | `vercel dev` 本地模拟通过 |
| 5 | **部署与验证**：preview → 全路由验收 → 生产域名切换 | 高 | 1～2h（+24h 观察窗） | 平台/域名 | 阶段 4 | Preview 验收全绿 |
| 6 | **收尾**：监控、配额、文档、旧服务下线决策 | 低 | 0.5h | README、Dashboard | 阶段 5 观察窗通过 | 5.3 稳定运行 24h |

---

## 三、步骤详情与回滚方案

### 阶段 1：项目 Node 化（高风险，最先做）

#### 1.1 建立 package.json（npm 依赖）
- [ ] **操作**：按 deno.json `imports` 生成 package.json，`dependencies` 含：`hono@^4.12.2`、`hono-zod-openapi@^1.0.1`、`@hono/swagger-ui@^0.5.3`、`@scalar/hono-api-reference@^0.9.34`、`cheerio@^1.1.2`、`cookie@^1.1.1`、`crypto-js@^4.2.0`、`dayjs@^1.11.19`、`google-translate-api-x@^10.7.2`、`isbot@^5.1.32`、`microsoft-translate-api@^1.1.0`、`qs@^6.14.2`、`sharp@^0.34.5`、`zod@^4.3.5`、`await-lock@^2.2.2`、`@__dirname/pixiv-web-api@^0.1.4`、**新增 `ffmpeg-static`（1.2.x 最新）**；`devDependencies`：`typescript`、`tsx`、`@types/node`。删除 `@std/fs`、`@std/path`（jsr 依赖，不使用）。
- [ ] **操作**：`npm install` 成功、`npm audit` 无阻断级漏洞。
- **验收标准**：`node -e "require('sharp'); console.log('sharp ok')"` 与 `node -e "console.log(require('ffmpeg-static'))"` 均输出路径；`npm ls` 无缺失依赖。
- **回滚**：删除 package.json/package-lock.json/node_modules，`git checkout main -- .` 恢复 deno 基线（未触碰 src，纯新增文件，无风险）。

#### 1.2 路径别名方案验证（验证门）
- [ ] **操作**：保留 tsconfig.json 现有 `paths`（`@lib/*`、`@services/*`）；用 `npx esbuild src/app.ts --bundle --platform=node --outfile=/tmp/x.mjs` 试打包，观察别名是否被解析（esbuild ≥0.21 支持 tsconfig paths）。
- [ ] **若失败（备选）**：全量替换 `@lib/` → `../lib/`、`@services/` → `../services/`（相对路径按文件层级换算），并删除 tsconfig paths。
- **验收标准**：esbuild 打包成功且产物可被 Node 直接 `import` 执行（`node /tmp/x.mjs` 无 "Cannot find module '@lib/...'" 报错）。
- **回滚**：若改动了 import 语句，用 `git checkout -- src` 还原（该步骤在提交前完成验证）。

#### 1.3 配置读取 Node 化（src/lib/const.ts）
- [ ] **操作**：`Deno.env.get('X')` → `process.env.X`（8 处）；`Deno.args`/`--dev` 相关逻辑删除（app.ts:26）。
- [ ] **操作**：`PORT` 读取删除（app.ts:88，Vercel 无端口）；若本地开发需要，改由 1.6 的 local-server 入口读取。
- **验收标准**：`grep -rn "Deno\." src/` 在阶段 1 结束后仅剩 ugoira/x-media 待处理项（阶段 2/3 清零）。
- **回滚**：`git checkout -- src/lib/const.ts src/app.ts`。

#### 1.4 入口适配（src/app.ts）
- [ ] **操作**：删除 `Deno.serve` + `RequestDeduper` 接入（app.ts:87-91）；新增 `export default app`（保留 `export { app }`）。
- [ ] **操作**：`serveStatic`（hono/deno）替换——`/robots.txt`、`/favicon.ico`、`/openapi-hibiapi.json` 三条改为依赖 Vercel 静态托管（public/ 目录自动映射），移除中间件调用；`/docs`、`/swagger` 动态路由保留。
- [ ] **操作**：新增 `src/local-server.ts`（本地开发/自测用）：`import { serve } from '@hono/node-server'; import { app } from './app.ts'; serve({ fetch: app.fetch, port: 3021 })`。
- **验收标准**：`npx tsx src/local-server.ts` 启动后 `curl localhost:3021/`、`/docs`、`/openapi.json` 正常返回；`robots.txt` 由静态目录逻辑另行验证（见 3.3）。
- **回滚**：`git checkout -- src/app.ts`（新增 local-server.ts 可保留）。

#### 1.5 脚本替换（deno task → npm scripts）
- [ ] **操作**：package.json `scripts`：`dev` → `tsx watch src/local-server.ts`；`start` → `tsx src/local-server.ts`；`type-check` → `tsc --noEmit`；`manage-cache` 临时禁用（脚本依赖 Cache API，Vercel 无，见 3.2）；删除 deno.json（或保留但注明"仅历史参考"）。
- **验收标准**：`npm run type-check` 通过（若 1.3/1.4 有类型报错在此暴露）；`npm run dev` 热更正常。
- **回滚**：还原 package.json scripts（git checkout）。

#### 1.6 阶段验证门：本地全路由冒烟
- [ ] **操作**：本地起服务，逐项 curl：`/`、`/docs`、`/swagger`、`/openapi.json`、`/api/pixiv/rank`、`/api/pixiv/illust?id=…`、`/api/pixiv-web-api/ranking`、`/api/pixivision?lang=zh`、`/api/pixiv-novel-translate/27077032.html?srv=ms`、`/api/pid-recover/134903417`、`/api/sauce/`（如配置 key）、`/proxy/https://yande.re/post.json?limit=1`、`/pximg/…`。
- **验收标准**：≥95% 端点返回预期结果；失败项记录并进入阶段 2/3 修复队列。
- **回滚**：此阶段结束打 commit `feat: node-ify pxve-api`；后续任何问题 `git revert` 该 commit。

### 阶段 2：Worker 池移除 + 图片处理内联化（高风险重活）

#### 2.1 删除 Worker 池
- [ ] **操作**：删除 `src/lib/worker-pool.ts`、`src/services/worker/index.ts`、`src/services/worker/webp-worker.ts`、`src/services/worker/ugoira-worker.ts`；删除 `services/worker/` 目录。
- **回滚**：`git checkout -- src/`（提交前验证）。

#### 2.2 WebP 内联化（sharp 直接调用）
- [ ] **操作**：`src/services/webp.ts` 中删除 `webpWorkerPool.addTask(...)`，改为在服务函数内直接 `await sharp(inputBuffer).resize({...}).webp({quality:80}).toBuffer()`（逻辑从原 webp-worker.ts 搬入，保持行为一致：w/h 校验、`fit:'inside'`、`withoutEnlargement`）。
- [ ] **操作**：响应改为流式更稳妥（可选优化）：`new Response(ReadableStream, headers)` 或维持 Buffer 返回（webp 图通常 <4.5MB，Buffer 即可；大图建议流式）。
- **验收标准**：`curl '/api/webp/https://…/xxx.jpg?w=100&h=100' -o out.webp` 输出有效 webp（`file out.webp` 识别正确）。
- **回滚**：git revert 该 commit。

#### 2.3 Ugoira 重写（ffmpeg-static + child_process，最大改造点）
- [ ] **操作**：重写 `src/services/ugoira.ts`：
  - 获取元数据逻辑保留（pixivWebApi.illustUgoiraMeta → zip/rate）。
  - 下载 zip：fetch → arrayBuffer（原逻辑）。
  - 解压：`node:fs` 写 `/tmp/pxve-<id>/ugoira.zip`，用 `ffmpeg-static` 的 ffmpeg 二进制以 `-y -i zipPath -r <rate> out.ext` 直接转码（**ffmpeg 支持直接读 zip 输入**，避免调用 unzip 子进程；若个别格式不支持，再退回 `child_process.execFile('unzip')`）。
  - 输出：`fs.createReadStream(outPath)` 包装为 `ReadableStream` **流式返回**（规避 4.5MB 响应体限制）。
  - 清理：`finally` 中 `fs.rm(tmpDir, {recursive:true, force:true})`。
- [ ] **操作**：`ffmpeg-static` 路径解析 + 失败时抛可读错误；`rate`/`ext` 参数校验保持原样（mp4/gif/apng/webp/webm/avif）。
- [ ] **操作**：路由 `routes/ugoira/index.ts` 的 `c.body(data, 200, headers)` 改为返回流式 Response（headers 中 Content-Type/Content-Disposition/Cache-Control 不变）。
- **验收标准**：`curl -I '/api/ugoira/139993591.mp4?zip=…&rate=16'` 返回 200 + 正确 Content-Type；`curl` 完整下载小样图产物可播放（用短 ugoira 样例验证，如 1～2 秒动画）。
- **回滚**：git revert；本地 Docker 服务继续承担 ugoira（若 5.x 阶段 ugoira 异常，可临时把该路由用 HIBIAPI_BASE 兜底）。

#### 2.4 阶段验证门
- [ ] **操作**：本地回归阶段 1 全部端点 + `/api/webp`、`/api/ugoira`。
- **验收标准**：全绿；打 commit `feat: inline image processing (sharp/ffmpeg)`。

### 阶段 3：平台细节修复（低-中风险）

#### 3.1 CORS 代理 Host 头
- [ ] **操作**：`src/services/proxy.ts:50-54` 删除 `reqHeaders.set('host', …)`（及同段 origin/referer 保留）；确认 fetch 目标 URL 已含目标 host。
- **验收标准**：`curl '/proxy/https://yande.re/post.json?limit=1'` 正常返回；无 "Cannot set forbidden header" 报错。
- **回滚**：git revert。

#### 3.2 缓存中间件适配
- [ ] **操作（决策点 A）**：默认方案——保持中间件代码不变（`if (!globalThis.caches)` 自动降级为透传），将 `ENABLE_CACHE` 置 0；依赖 Vercel CDN 的 Cache-Control 头做响应缓存（项目各路由已带 Cache-Control）。
- [ ] **操作（可选增强）**：若需跨实例共享 token 缓存，安装 `@vercel/kv`（Upstash），将 `src/lib/db-memory.ts` 的 token 缓存键（`PXV_CLIENT_AUTH_*`）改为 KV get/set（过期时间用 TTL），业务缓存不动。
- **验收标准**：默认方案下各接口响应正常且带 Cache-Control；可选方案下 `/api/pixiv/illust` 重复请求无 OAuth 刷新放大（观察 Vercel 日志）。
- **回滚**：回退 KV 改动即可（默认方案无代码风险）。

#### 3.3 静态资源
- [ ] **操作**：确认 Vercel "Other" 预设下 public/ 被自动托管（`vercel dev` 时验证 `/robots.txt`、`/favicon.ico`、`/openapi-hibiapi.json` 可访问）；若未托管，改为 `vercel.json` 显式 `"cleanUrls"`/路由或 `hono/node-server` 的 serveStatic（读 fs，文件随函数打包）。
- **验收标准**：三个静态路径在 `vercel dev` 下均 200。
- **回滚**：还原 app.ts/vercel.json。

#### 3.4 x-media 决策（决策点 B）
- [ ] **选项 B1（推荐，0.5h）**：移除 `routes/x-media` 与 `src/services/x-media/*`（python 子进程在 Vercel 不可行），路由返回 501 或在 README 标注不可用。
- [ ] **选项 B2（2h+，不推荐首版）**：用 JS + fetch 重写（需 X 内部 API 端点与 cookies，存 Secret），功能与上游行为无法完全对齐，风险高。
- **验收标准**：B1——`/api/x/media` 返回明确错误且不影响其他路由；B2——冒烟通过（低优先级）。
- **回滚**：B1 删除文件可由 git 还原；B2 失败则回退到 B1。

#### 3.5 清理与收口
- [ ] **操作**：删除/保留 `operation-registry.ts`（node:timers 在 Node 可用，未被引用，建议删除减包）；确认 `grep -rn "Deno\.\|jsr:\|import.meta.resolve\|@std/" src/` 结果为 0。
- **验收标准**：全仓无 Deno 专属引用；`npm run type-check` 通过。
- **回滚**：git revert；打 commit `feat: platform fixes for Vercel`。

### 阶段 4：Vercel 部署配置

#### 4.1 vercel.json
- [ ] **操作**：创建 `vercel.json`：
```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "src/app.ts": { "runtime": "nodejs20.x", "maxDuration": 300, "memory": 2048 }
  }
}
```
（Hobby 上限 300s；Pro 可 800s；若 ugoira 转码需更长，配合 2.3 的流式方案观察实际耗时再调。）
- **验收标准**：`vercel dev` 本地模拟无报错；`vercel build` 成功产出。

#### 4.2 环境变量录入 Vercel
- [ ] **操作**：按 1.1 表把 Variables/Secrets 录入（Production + Preview 环境）；确认 `PIXIV_COOKIE` 等格式正确（无多余引号/换行）。
- **验收标准**：Dashboard 环境变量页与 1.1 清单逐项一致。

#### 4.3 本地联调
- [ ] **操作**：`vercel dev` 启动，用 Vercel 模拟环境再跑一遍 1.6 冒烟清单（重点：env 注入、静态资源、流式响应）。
- **验收标准**：全绿；打 commit `feat: vercel config`。

### 阶段 5：部署与验证

#### 5.1 Preview 部署
- [ ] **操作**：`vercel deploy`（非 --prod）获得 preview URL；`vercel logs <url>` 观察日志无异常。
- [ ] **操作**：在 preview URL 上执行完整验证清单（第四节全部）。
- **验收标准**：第四节清单全部 [x]。
- **回滚**：Preview 失败仅重部署，不影响生产。

#### 5.2 生产部署（旧服务并行）
- [ ] **操作**：确认 5.1 通过后 `vercel deploy --prod`；**此阶段自有域名仍解析到旧部署（Docker 或当前 CF 服务）**，双环境并行观察 30 分钟（对比 preview 域名与自有域名响应）。
- **验收标准**：生产函数日志无 5xx 增长；调用 `/api/pixiv/rank` 等抽样正常。
- **回滚**：`vercel rollback`（Dashboard/CLI）回退上一版本即可，对外无感知。

#### 5.3 DNS 切换（唯一对外变更点，在 Cloudflare DNS 操作）
- [ ] **操作**：确认 5.2 稳定后，在 **Cloudflare DNS 控制台**将自有域名记录的 CNAME 目标切到 Vercel（`cname.vercel-dns.com`）；如之前是橙云，切换后按 1.2 的决策调整代理模式/SSL 模式。TTL 已在 1.2 调低。
- [ ] **操作**：若 CF 上存在拦截该域名的 Worker/Pages 路由（旧部署），确认已停用或改走 Vercel 前先放行。
- [ ] **操作**：切换后观察窗 24h：监控 5xx/延迟/配额；前端 pixiv-viewer 用新 API 域名实测。
- **验收标准**：24h 内无异常（5xx < 0.5%、p95 延迟可接受、无 429 配额告警）。
- **回滚（最重要）**：任一项异常 → 立即在 CF DNS 把记录改回原目标（TTL 60s，5 分钟内恢复），Vercel 侧 `vercel rollback` 亦可；确认恢复后复盘。

### 阶段 6：收尾

- [ ] **操作**：更新 README（部署章节改为 Vercel 方式 + `npm run dev`；标注 x-media 不可用、ENABLE_CACHE 语义）。
- [ ] **操作**：Dashboard 设置监控告警（错误率、时长、用量）；确认 Hobby/Pro 商用条款与配额（1M 调用/月、100GB 流量、4 CPU-h）。
- [ ] **操作**：稳定运行 ≥1 周后，决策旧 Docker 服务下线（保留 Dockerfile 与部署文档备查，或降级为备份）。
- **验收标准**：README 与代码一致；告警就位；下线决策记录在案。

---

## 四、迁移后验证清单

### 4.1 部署成功确认
- [ ] `vercel ls` / Dashboard 显示最新 Production 部署 Success
- [ ] 部署产物大小符合预期（sharp+ffmpeg-static 约 110MB，< 250MB 上限）
- [ ] `vercel inspect --latest` 的配置（nodejs20.x、maxDuration、memory）正确

### 4.2 路由与重定向
- [ ] `GET /` → 200 HTML（Ciallo 页面）
- [ ] `GET /docs`、`/swagger`、`/openapi.json`、`/openapi-hibiapi.json` → 200 且渲染正常
- [ ] `/api/pixiv/`（HibiAPI 兼容）301 重定向到 `/api/pixiv/{type}` 正常
- [ ] `/pximg/...` 流式透传：`curl -s -o /dev/null -w "%{http_code} %{size_download}"` 大图完整下载
- [ ] `/proxy/...` 无 Host 头报错；`/pid-recover/...` 串行回源正常
- [ ] 404 兜底返回 `{"error":"Not Found"}`；未知异常 500 JSON 正常

### 4.3 Serverless 函数运行
- [ ] `vercel logs` 无未捕获异常、无 "Cannot find module" / 语法错误
- [ ] `Deno` 相关报错为零（grep 日志关键词 "Deno is not defined" 等）
- [ ] 冷启动请求成功（首请求 < 若干秒可接受，Fluid 预热后明显改善）
- [ ] 并发请求（如 20 并发打 `/api/pixiv/rank`）无 5xx 雪崩

### 4.4 环境变量生效
- [ ] 未配置 token 时 `/api/pixiv/illust` 返回明确错误（而非 500 崩溃）
- [ ] 配置后 `/api/pixiv/illust?id=...` 返回真实数据（验证 PIXIV_ACCOUNT_TOKEN 生效）
- [ ] `/api/pixiv-web-api/ranking` 返回数据（PIXIV_COOKIE 生效）
- [ ] `ACCEPT_DOMAINS`/`UA_BLACKLIST` 生效：伪造 Origin/UA 请求被 403
- [ ] `SAUCENAO_API_KEY`、`SILICONClOUD_APT_KEY` 对应路由行为正确（如有 key）

### 4.5 性能与时长
- [ ] 常规 JSON 接口 p95 延迟可接受（对比旧服务，列出实测值：____ ms）
- [ ] `/api/webp` 转换耗时在预期内（sharp 内联后实测：____ ms）
- [ ] `/api/ugoira` 转码未触发 maxDuration 截断（日志无 "Task timed out"；若触发→调 maxDuration 或外置）
- [ ] 小说翻译长文（>1000 字）未超时

### 4.6 域名与 HTTPS
- [ ] 自有域名（如 `pa.supy.cc` / `pa.supy.cc.cd`）解析到 Vercel 且证书自动签发（HTTPS 绿锁）
- [ ] 强制 HTTPS 生效（HTTP 请求 301 → HTTPS）
- [ ] `curl https://<自有域名>/docs` 与 preview URL 行为一致

### 4.7 前端联动与配额
- [ ] pixiv-viewer 配置新 API 域名后：列表、详情、动图（ugoira）、翻译页均可用（**注意前端默认指向 `api.pxve.cc`，需改为你的域名**）
- [ ] 若 CF 上原部署已下线，确认无 Worker 路由继续拦截新域名流量
- [ ] Dashboard Usage 观察 24h：调用量、CPU 时长、流量未超配额
- [ ] Hobby 商用条款确认（若面向公众服务，评估是否升 Pro）

### 4.8 可回滚性最终确认
- [ ] 记录原 DNS 记录与旧部署的恢复操作卡（CNAME 值、Docker 启动命令）
- [ ] `feat/vercel-migration` 分支已 merge/标记；main 分支 tag `v1.0-deno` 保留

---

## 附录：关键决策点汇总

| 决策点 | 默认选择 | 触发变更条件 |
|---|---|---|
| A：缓存方案 | 中间件自动降级 + CDN Cache-Control | 出现 token 频繁刷新 → 启用 @vercel/kv |
| B：x-media | 移除（B1） | 有明确业务诉求再投入 JS 重写（B2） |
| C：ugoira 流式 vs 外置 | ffmpeg-static 本地转码 + 流式返回 | 转码经常超 maxDuration/占用过高 → 外置转码服务 |
| D：计划选择 | Hobby（免费） | 商用场景或流量超限 → Pro |
| E：路径别名 | 保留 tsconfig paths | esbuild 解析失败 → 全量改相对导入 |
