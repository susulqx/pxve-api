# pxve-api 部署步骤（Vercel，Node.js 运行时）

> 前置：本仓库为官方 pxve-api 的**精简版**（LEAN 迁移，基线 `lean-baseline-6085363`），仅保留 `/pixiv-app-api/*`、`/pixiv-oauth/*` 透传 + `/` 首页 + `/docs` 文档；完整功能见上游仓库。
> 平台注意：必须使用 **Node.js 运行时**（默认/Fluid），不要选 Edge 运行时（Edge 无 child_process/fs/原生模块）。

---

## 1. 前置条件

- [ ] Vercel 账号（Hobby 免费 / Pro $20 起；**Hobby 仅限非商业用途**）
- [ ] `vercel` CLI：`npm i -g vercel && vercel login`
- [ ] Node ≥ 20.11（本机验证用 22.22.2）
- [ ] 自有域名（当前 DNS 托管在 Cloudflare，如 `pa.supy.cc.cd`，两个域名写法请先确认）

## 2. 部署方式（推荐：零配置 Hono 检测）

项目已满足 Hono 在 Vercel 的零配置要求：`src/app.ts` 含 `export default app`，Vercel 自动识别为 Hono 应用并在 **Node.js 运行时**部署。

### 2.1 创建 `vercel.json`（项目根目录）

```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "src/app.ts": { "maxDuration": 300 }
  }
}
```

> - ⚠️ `functions.runtime` 只接受运行时包标识（如 `@vercel/node@3.x`），**不要写 `nodejs20.x`**（会报 "Function Runtimes must have a valid version"）；`nodeVersion` 也不是 vercel.json 的字段（会报 "should NOT have additional property"）。
> - **Node 版本在 Dashboard → Project → Settings → General → Node.js Version 里选择（建议 20.x 或 22.x）**，不写在配置文件中。
> - `maxDuration`：Hobby 上限 300s；透传链路为流式 fetch，通常远低于上限。

### 2.2 环境变量（Dashboard → Settings → Environment Variables）

| 变量 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `ACCEPT_DOMAINS` | 变量 | 可选 | 请求来源白名单（逗号分隔），留空=不限制 |
| `UA_BLACKLIST` | 变量 | 可选 | UA 黑名单（逗号分隔），留空=不限制 |
| `USER_AGENT_DETECTOR` | 变量 | 可选 | UA 机器人检测方案：`aua`（默认）/ `isbot` / `no` |
| `ENABLE_CACHE` | 变量 | 建议 `0` | Node 无 Cache API，`1` 时中间件自动降级不缓存 |

> 精简版为纯透传链路，不读取 `PIXIV_COOKIE` / `PIXIV_ACCOUNT_TOKEN` 等服务端凭据（客户端自带 `Authorization`），无需配置。

### 2.3 部署命令

```bash
cd "D:/Program Files/.su/pxve-api-vercel"
npm ci                                     # 安装锁定依赖
vercel deploy --prod                       # 生产部署
vercel logs                                # 查看运行时日志
```

> 也可在 Vercel Dashboard 连接 Git 仓库自动部署（建议 PR 预览：preview 环境单独配置 Secret）。

## 3. 域名与 DNS（Cloudflare 托管场景）

1. Vercel → Project → Settings → Domains → Add 添加自有域名，取得验证记录。
2. **Cloudflare DNS 控制台**添加：
   - CNAME：`pa.…` → `cname.vercel-dns.com`
   - 验证记录：按 Vercel 提示（`_vercel.…` TXT/CNAME）
   - 原记录 TTL 先降为 60s（便于回滚）
3. CF 代理模式（橙云）决策：
   - 推荐 **灰云（DNS only）** 直连 Vercel；
   - 若需橙云：SSL/TLS 模式设为 **Full (strict)**，并为 `/api/*` 配缓存绕过规则（防止 API 数据被 CF 缓存陈旧）。
4. 若 CF 上存在接管该域名的 Worker/Pages 路由（旧部署），**先停用**，否则流量到不了 Vercel。
5. Vercel 自动签发 HTTPS 证书（Let's Encrypt，DNS 验证）。

## 4. 部署后验证

```bash
curl -s https://<你的域名>/                          # Ciallo 首页
curl -s https://<你的域名>/openapi.json | head -c 100   # 应仅含 /pixiv-app-api/* 与 /pixiv-oauth/*
curl -s -o /dev/null -w "%{http_code}\n" https://<你的域名>/docs
curl -s -o /dev/null -w "%{http_code}\n" https://<你的域名>/swagger
curl -s -o /dev/null -w "%{http_code}\n" https://<你的域名>/robots.txt
curl -s -o /dev/null -w "%{http_code}\n" https://<你的域名>/favicon.ico
curl -s https://<你的域名>/pixiv-app-api/v1/illust/recommended   # 带 Authorization 时返回 Pixiv 数据
curl -s -o /dev/null -w "%{http_code}\n" https://<你的域名>/nope   # 404
```

完整清单见 `docs/VERIFY.md`。

## 5. 平台已知限制（部署前必读）

| 限制 | 数值 | 对本项目影响 |
|---|---|---|
| 请求/响应体 | 4.5MB（流式响应除外） | 透传链路为流式 fetch 转发，大响应不受此限制 |
| 最大时长 | 300s（Hobby）/ 800s（Pro） | 透传请求远低于上限，`maxDuration=300` 已足够 |
| bundle 大小 | 250MB 未压缩 | 精简后 bundle 显著小于原 3.68MB |
| 商用条款 | Hobby 非商业 | 面向公众服务建议 Pro |

> 原版依赖 python 子进程 / ffmpeg / sharp 的功能（`/api/x/media`、`/api/ugoira`、`/api/webp` 等）已在精简版中移除，无平台兼容问题。

## 6. 回滚

- 函数回滚：Dashboard → Deployments → 上一版本 → Redeploy（或 `vercel rollback`）。
- DNS 回滚：CF 控制台改回原记录（TTL 60s）。
- 代码回滚：`git checkout lean-baseline-6085363 -- .` 可整体恢复精简前版本（完整说明见 `docs/ROLLBACK.md`）。
