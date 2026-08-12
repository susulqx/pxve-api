# pxve-api 部署步骤（Vercel，Node.js 运行时）

> 前置：本仓库已完成 Node.js 化（`feat/vercel-migration`，HEAD=f169375）。本文件只描述"部署"，不涉及代码改造。
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
    "src/app.ts": { "runtime": "nodejs20.x", "maxDuration": 300, "memory": 2048 }
  }
}
```

> - `maxDuration`：Hobby 上限 300s（ugoira 转码/长文翻译预留）；Pro 可 800s。
> - 若本机 ffmpeg 未装导致 ugoira 失败：部署前安装 `ffmpeg-static` 并把 `src/services/ugoira.ts` 的 `execFile('ffmpeg', …)` 改为 `execFile(ffmpegPath, …)`（ffmpeg-static 导出二进制路径），bundle 会增大约 76MB（Vercel 250MB 限内）。

### 2.2 环境变量（Dashboard → Settings → Environment Variables）

| 变量 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `PIXIV_ACCOUNT_TOKEN` | **Secret** | 推荐 | Pixiv App API Refresh Token |
| `PIXIV_COOKIE` | **Secret** | 推荐 | Pixiv Web API Cookie |
| `PIXIV_ACCOUNT_TOKEN_ALTS` | Secret | 可选 | 备用 tokens（逗号分隔） |
| `SAUCENAO_API_KEY` | Secret | 可选 | 以图搜图 |
| `SILICONClOUD_APT_KEY` | Secret | 可选 | 小说 AI 翻译 |
| `ACCEPT_DOMAINS` | 变量 | 可选 | 请求来源白名单（逗号分隔） |
| `UA_BLACKLIST` | 变量 | 可选 | UA 黑名单（逗号分隔） |
| `HIBIAPI_BASE` | 变量 | 可选 | 非 Pixiv 部分兜底服务 |
| `ENABLE_CACHE` | 变量 | 建议 `0` | Node 无 Cache API，`1` 时中间件自动降级不缓存 |

### 2.3 部署命令

```bash
cd "D:/Program Files/.su/pxve-api"
git checkout feat/vercel-migration        # 确保在迁移分支
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
curl -s https://<你的域名>/openapi.json | head -c 100
curl -s -o /dev/null -w "%{http_code}\n" https://<你的域名>/docs
curl -s https://<你的域名>/api/pixiv/rank            # 有 token 时返回数据
curl -s -I https://<你的域名>/pximg/...              # 图片流式透传
```

完整清单见 `docs/vercel-migration-plan.md` 第四节 + `docs/VERIFY.md`。

## 5. 平台已知限制（部署前必读）

| 限制 | 数值 | 对本项目影响 |
|---|---|---|
| 请求/响应体 | 4.5MB（流式响应除外） | pximg 大图、ugoira 产物必须**流式返回**（现有代理已流式透传；ugoira 改造时用 `fs.createReadStream`） |
| 最大时长 | 300s（Hobby）/ 800s（Pro） | ugoira 转码、超长小说翻译注意 `maxDuration` 配置 |
| bundle 大小 | 250MB 未压缩 | 当前 3.68MB（含 ffmpeg-static 后约 80MB，仍充足） |
| `/api/x/media` | 不可用 | 依赖 python+twikit 子进程，Vercel Node 函数无 python。**默认移除或 JS 重写**，否则该路由 500 |
| 商用条款 | Hobby 非商业 | 面向公众服务建议 Pro |

## 6. 回滚

- 函数回滚：Dashboard → Deployments → 上一版本 → Redeploy（或 `vercel rollback`）。
- DNS 回滚：CF 控制台改回原记录（TTL 60s）。
- 完整说明见 `docs/ROLLBACK.md`。
