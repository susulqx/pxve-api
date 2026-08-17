# Pxve API

[![Hono](https://img.shields.io/badge/Hono-E36002.svg?style=flat&logo=Hono&logoColor=white)](https://hono.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

中文 | [English](./README.en.md)

一个实现了 Pixiv 相关站点的易用化 API 的程序，供 [Pixiv Viewer](https://github.com/asadahimeka/pixiv-viewer) 使用。

> **精简说明**：本仓库为官方 [pxve-api](https://github.com/asadahimeka/pxve-api) 的 **Vercel 精简版**（Node.js + Hono），仅保留 `/pixiv-app-api/*`、`/pixiv-oauth/*` 透传 + `/` 首页 + `/docs` 文档；完整功能（ugoira 动图、webp 转换、小说翻译、以图搜图等）见上游仓库。

Demo: [api.pxve.cc](https://api.pxve.cc)

API 文档：[api.pxve.cc/docs](https://api.pxve.cc/docs)

## ✨ 特性

- 🎨 **Pixiv App API 透传** - `/pixiv-app-api/*`、`/pixiv-oauth/*` 直接透传至 Pixiv 官方接口（host 重写 + 头转发 + 流式 body）
- 🔐 **安全防护** - 请求来源域名白名单、UA 黑名单、UA 机器人检测
- 📖 **API 文档** - 集成 Swagger UI 和 Scalar 文档（自动从已注册路由生成）
- ☁️ **Vercel 部署** - 零配置 Hono 检测，Node.js 运行时

## 🚀 快速开始

### 环境要求

Node.js ≥ 20.11（建议 22.x）

### 安装运行

1. **克隆项目**
```bash
git clone https://github.com/asadahimeka/pxve-api.git
cd pxve-api
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**（可选）
```bash
cp .env.example .env
# 编辑 .env 文件，按需配置
```

4. **开发模式运行**
```bash
npm run dev
```

5. **生产模式运行**
```bash
npm run start
```

## 📝 配置说明

### 基础配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `PORT` | 服务监听端口（仅本地使用，Vercel 忽略） | `3021` |
| `ENABLE_CACHE` | 是否启用 GET 请求缓存 (1/0)；Vercel 无 Cache API 自动降级 | `0` |

### 安全配置

| 环境变量 | 说明 |
|---------|------|
| `ACCEPT_DOMAINS` | 请求来源域名白名单（逗号分隔），留空=不限制 |
| `UA_BLACKLIST` | User-Agent 黑名单（逗号分隔），留空=不限制 |
| `USER_AGENT_DETECTOR` | User-Agent 机器人检测方案：`aua`（默认，@arraypress/user-agent）/ `isbot`（isbot）/ `no`（关闭）。非法值自动告警并降级为 `aua`；`no` 时仅保留上方 `UA_BLACKLIST`/`ACCEPT_DOMAINS` 防护 |

> 精简版为纯透传链路，无需配置 Pixiv Cookie / Refresh Token（客户端自带 `Authorization` 头）。

## 📚 API 文档

启动服务后，可以通过以下地址访问 API 文档：

- **Scalar 文档（推荐）**: http://localhost:3021/docs
- **Swagger UI**: http://localhost:3021/swagger
- **OpenAPI JSON**: http://localhost:3021/openapi.json

## 🔗 API 端点

- `GET /` - 首页
- `GET /pixiv-app-api/*` - Pixiv App API 透传（推荐、排行、搜索、插画、小说、用户、书签、关注、评论等）
- `POST /pixiv-oauth/auth/token` - Pixiv OAuth 透传
- `GET /openapi.json`、`/docs`、`/swagger` - API 文档
- `GET /robots.txt`、`/favicon.ico` - 静态资源

## 🛠️ 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run start

# 类型检查
npm run type-check

# 构建（esbuild bundle → dist/app.mjs）
npm run build
```

## 📁 项目结构

```
pxve-api/
├── src/
│   ├── app.ts             # 应用入口（Vercel 零配置识别 export default）
│   ├── local-server.ts    # 本地开发服务器
│   ├── middlewares/       # 中间件（logger/blocker/cache）
│   ├── routes/            # 路由定义（/ 首页 + pixiv 透传）
│   ├── services/          # 业务逻辑（pixiv 透传核心）
│   └── lib/               # 工具库
├── public/                # 静态资源
├── docs/                  # 部署/验证/回滚文档
├── .env.example           # 环境变量模板
└── vercel.json            # Vercel 函数配置
```

## 🔧 技术栈

- **运行时**: Node.js
- **框架**: Hono
- **API 文档**: Swagger UI + Scalar + hono-zod-openapi
- **数据验证**: Zod
- **构建**: esbuild
- **类型安全**: TypeScript

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 🔗 相关项目

- [Pixiv Viewer](https://github.com/asadahimeka/pixiv-viewer) - 前端应用
- [pxve-api 上游仓库](https://github.com/asadahimeka/pxve-api) - 完整功能版

## ⚠️ 注意事项

1. 请遵守 Pixiv 的使用条款和相关法律法规
2. 合理使用 API，避免过于频繁的请求
3. 透传请求的 `Authorization` 等凭据由客户端自行携带，服务端不保存任何 Pixiv 凭据

## 📄 许可证

MIT License

![pxve-api](https://count.nanoka.top/@pxveapigh)
