# Pxve API

[![Hono](https://img.shields.io/badge/Hono-E36002.svg?style=flat\&logo=Hono\&logoColor=white)](https://hono.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

English | [中文](./README.md)

A program that implements an easy-to-use API for Pixiv-related sites, used by [Pixiv Viewer](https://github.com/asadahimeka/pixiv-viewer).

> **Slim note**: This repository is a **Vercel-slimmed** version of the official [pxve-api](https://github.com/asadahimeka/pxve-api) (Node.js + Hono), retaining only `/pixiv-app-api/*` and `/pixiv-oauth/*` passthrough plus the `/` homepage and `/docs` documentation. The full feature set (ugoira, webp conversion, novel translation, image search, etc.) lives in the upstream repository.

Demo: [api.pxve.cc](https://api.pxve.cc)

API Documentation: [api.pxve.cc/docs](https://api.pxve.cc/docs)

## ✨ Features

* 🎨 **Pixiv App API Passthrough** - `/pixiv-app-api/*` and `/pixiv-oauth/*` forward directly to Pixiv official endpoints (host rewrite + header forwarding + streaming body)
* 🔐 **Security Protection** - Origin domain whitelist, UA blacklist, UA bot detection
* 📖 **API Documentation** - Integrated Swagger UI and Scalar docs (auto-generated from registered routes)
* ☁️ **Vercel Deployment** - Zero-config Hono detection, Node.js runtime

## 🚀 Quick Start

### Requirements

Node.js ≥ 20.11 (22.x recommended)

### Installation & Running

1. **Clone the repository**

```bash
git clone https://github.com/asadahimeka/pxve-api.git
cd pxve-api
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables** (optional)

```bash
cp .env.example .env
# Edit the .env file as needed
```

4. **Run in development mode**

```bash
npm run dev
```

5. **Run in production mode**

```bash
npm run start
```

## 📝 Configuration

### Basic Configuration

| Environment Variable | Description                    | Default |
| -------------------- | ------------------------------ | ------- |
| `PORT`               | Service listening port (local only; ignored on Vercel) | `3021`  |
| `ENABLE_CACHE`       | Enable GET request cache (1/0); degrades gracefully on Vercel (no Cache API) | `0`     |

### Security Configuration

| Environment Variable | Description                                       |
| -------------------- | ------------------------------------------------- |
| `ACCEPT_DOMAINS`     | Request origin domain whitelist (comma-separated), empty = unrestricted |
| `UA_BLACKLIST`       | User-Agent blacklist (comma-separated), empty = unrestricted |
| `USER_AGENT_DETECTOR`| UA bot detection: `aua` (default) / `isbot` / `no` |

> The slim build is a pure passthrough; no Pixiv Cookie / Refresh Token configuration is required (clients send their own `Authorization` header).

## 📚 API Documentation

After starting the service, the API documentation can be accessed at:

* **Scalar Docs (Recommended)**: [http://localhost:3021/docs](http://localhost:3021/docs)
* **Swagger UI**: [http://localhost:3021/swagger](http://localhost:3021/swagger)
* **OpenAPI JSON**: [http://localhost:3021/openapi.json](http://localhost:3021/openapi.json)

## 🔗 API Endpoints

* `GET /` - Homepage
* `GET /pixiv-app-api/*` - Pixiv App API passthrough (recommended, ranking, search, illust, novel, user, bookmark, follow, comment, etc.)
* `POST /pixiv-oauth/auth/token` - Pixiv OAuth passthrough
* `GET /openapi.json`, `/docs`, `/swagger` - API documentation
* `GET /robots.txt`, `/favicon.ico` - Static assets

## 🛠️ Development Commands

```bash
# Development mode (hot reload)
npm run dev

# Production mode
npm run start

# Type checking
npm run type-check

# Build (esbuild bundle → dist/app.mjs)
npm run build
```

## 📁 Project Structure

```
pxve-api/
├── src/
│   ├── app.ts             # Application entry (Vercel zero-config via export default)
│   ├── local-server.ts    # Local dev server
│   ├── middlewares/       # Middlewares (logger/blocker/cache)
│   ├── routes/            # Route definitions (/ homepage + pixiv passthrough)
│   ├── services/          # Business logic (pixiv passthrough core)
│   └── lib/               # Utility libraries
├── public/                # Static assets
├── docs/                  # Deploy/verify/rollback docs
├── .env.example           # Environment variable template
└── vercel.json            # Vercel function config
```

## 🔧 Tech Stack

* **Runtime**: Node.js
* **Framework**: Hono
* **API Documentation**: Swagger UI + Scalar + hono-zod-openapi
* **Data Validation**: Zod
* **Build**: esbuild
* **Type Safety**: TypeScript

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 🔗 Related Projects

* [Pixiv Viewer](https://github.com/asadahimeka/pixiv-viewer) - Frontend application
* [pxve-api upstream](https://github.com/asadahimeka/pxve-api) - Full-featured version

## ⚠️ Notes

1. Please comply with Pixiv's terms of service and relevant laws and regulations
2. Use the API responsibly and avoid excessive requests
3. Credentials such as `Authorization` are supplied by the client; the server does not store any Pixiv credentials

## 📄 License

MIT License

![pxve-api](https://count.nanoka.top/@pxveapighen)
