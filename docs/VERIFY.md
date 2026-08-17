# pxve-api 精简版：验证方案（含实测结果）

> 验证目标：证明精简后的 Vercel 部署可构建、可本地运行，保留端点行为正确。
> 实测环境：Windows，Node v22.22.2，LEAN 迁移基线 `lean-baseline-6085363` + LEAN-00..05。

---

## 1. 静态验证（无网络依赖）

### 1.1 类型检查
```bash
npm run type-check        # tsc --noEmit
```
✅ **实测通过（exit 0）**

### 1.2 构建产物
```bash
npm run build             # esbuild bundle → dist/app.mjs
```
✅ **实测通过**：产物明显小于精简前 3.68MB。

### 1.3 源码零残留检查
```bash
grep -rn "pixiv-api\|operation-registry\|db-memory\|/api/pixiv\|/pximg\|/api/ugoira\|/api/webp\|x-media\|/proxy\|saucenao\|pixivision" src --include="*.ts"
```
✅ **实测通过**：零命中。

## 2. 动态验证（本地起服务）

### 2.1 启动
```bash
npm run start             # tsx src/local-server.ts → http://localhost:3021
```

### 2.2 端点冒烟矩阵（精简后保留端点）

| 端点 | 预期 | 实测 |
|---|---|---|
| `GET /` | 200，Ciallo HTML 首页 | ✅ |
| `GET /docs` | 200，Scalar HTML | ✅ |
| `GET /swagger` | 200，Swagger UI HTML | ✅ |
| `GET /openapi.json` | 200，OpenAPI JSON（仅含 `/pixiv-app-api/*` 与 `/pixiv-oauth/*`） | ✅ |
| `GET /robots.txt` | 200，静态文件 | ✅ |
| `GET /favicon.ico` | 200，静态文件 | ✅ |
| `GET /nope` | 404，`{"error":"Not Found"}` | ✅ |
| `GET /pixiv-app-api/v1/illust/recommended` | 带 `Authorization` 时返回 Pixiv JSON（透传） | 需真机凭据 |

### 2.3 需凭据/外网端点（部署后必须复测）

| 端点 | 复测命令（部署后） | 验收标准 |
|---|---|---|
| `/pixiv-app-api/*` | `curl -H "Authorization: Bearer <token>" https://<域名>/pixiv-app-api/v1/illust/recommended` | 返回标准 Pixiv JSON 或上游错误码 |
| `/pixiv-oauth/*` | `curl -X POST https://<域名>/pixiv-oauth/auth/token ...` | 透传至 oauth.secure.pixiv.net |

> 透传链路为纯 fetch 转发（host 重写 + 头转发 + 流式 body，POST 流式 `duplex:'half'`），行为与上游一致；复测目的为确认运行环境（Node/Vercel）无平台差异。

## 3. 交付物验证清单

- [x] `npm run type-check` 通过
- [x] `npm run build` 通过（dist/app.mjs 生成）
- [x] 保留端点冒烟矩阵全部符合预期
- [ ] 部署后复测 `/pixiv-app-api/*`、`/pixiv-oauth/*`（需客户端凭据）
- [ ] 部署后验证 HTTPS/域名/缓存行为（见 DEPLOY-VERCEL.md）
