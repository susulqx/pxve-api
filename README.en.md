# Pxve API

[![Deno](https://img.shields.io/badge/Deno-2-blue.svg)](https://deno.land/)
[![Hono](https://img.shields.io/badge/Hono-E36002.svg?style=flat\&logo=Hono\&logoColor=white)](https://hono.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

English | [中文](./README.md)

A program that implements an easy-to-use API for Pixiv-related sites, used by [Pixiv Viewer](https://github.com/asadahimeka/pixiv-viewer).

Demo: [api.pxve.cc](https://api.pxve.cc)

API Documentation: [api.pxve.cc/docs](https://api.pxve.cc/docs)

## ✨ Features

* 🎨 **Pixiv API** - Supports Pixiv App API and Web API
* 🔌 **HibiAPI Compatibility** - Pixiv endpoints are compatible with the [HibiAPI](https://github.com/mixmoe/HibiAPI) format
* 🎬 **Animated Image Processing** - Ugoira animation conversion
* 📚 **Novel Translation** - Pixiv novel translation support
* 🖼️ **Image Processing** - WebP conversion, image proxy
* 🔍 **Image Search** - Integrated SauceNAO API
* 🔐 **Security Protection** - Rate limiting, domain whitelist, UA blacklist
* 📖 **API Documentation** - Integrated Swagger UI and Scalar documentation
* 🐳 **Docker Support** - Docker deployment provided

## 🚀 Quick Start

### Requirements

Deno 2.x

### Installation & Running

1. **Clone the repository**

```bash
git clone https://github.com/asadahimeka/pxve-api.git
cd pxve-api
```

2. **Configure environment variables**

```bash
cp .env.example .env
# Edit the .env file and fill in the required configuration
```

3. **Run in development mode**

```bash
deno task dev
```

4. **Run in production mode**

```bash
deno task start
```

### Docker Deployment

```bash
# Build image
docker build -t pxve-api .

# Run container
docker run -d -p 3021:3021 --env-file .env pxve-api
```

## 📝 Configuration

### Basic Configuration

| Environment Variable | Description                    | Default |
| -------------------- | ------------------------------ | ------- |
| `PORT`               | Service listening port         | `3021`  |
| `ENABLE_CACHE`       | Enable GET request cache (1/0) | `0`     |

### Security Configuration

| Environment Variable | Description                                       |
| -------------------- | ------------------------------------------------- |
| `ACCEPT_DOMAINS`     | Request origin domain whitelist (comma-separated) |
| `UA_BLACKLIST`       | User-Agent blacklist (comma-separated)            |

### Pixiv Configuration

| Environment Variable       | Description                             | Required    |
| -------------------------- | --------------------------------------- | ----------- |
| `PIXIV_COOKIE`             | Pixiv Web API Cookie                    | Recommended |
| `PIXIV_ACCOUNT_TOKEN`      | Pixiv App API Refresh Token             | Recommended |
| `PIXIV_ACCOUNT_TOKEN_ALTS` | Backup Refresh Tokens (comma-separated) | Optional    |

### Third-party Service Configuration

| Environment Variable   | Description                   | Usage             |
| ---------------------- | ----------------------------- | ----------------- |
| `HIBIAPI_BASE`         | Backup HibiAPI service domain | API forwarding    |
| `SAUCENAO_API_KEY`     | SauceNAO API Key              | Image search      |
| `SILICONClOUD_APT_KEY` | SiliconFlow API Key           | Novel translation |

## 📚 API Documentation

After starting the service, the API documentation can be accessed at:

* **Scalar Docs (Recommended)**: [http://localhost:3021/docs](http://localhost:3021/docs)
* **Swagger UI**: [http://localhost:3021/swagger](http://localhost:3021/swagger)
* **HibiAPI Compatible Docs**: [http://localhost:3021/docs/hibiapi](http://localhost:3021/docs/hibiapi)

## 🔗 API Endpoints

### Pixiv Related

* `GET /api/pixiv/*` - Pixiv App API
* `GET /api/pixivision` - Pixivision API
* `GET /api/pixiv-now/http` - Pixiv Web API
* `GET /api/pixiv-novel-translate` - Novel translation
* `GET /pid` - Find Pixiv images by PID
* `GET /api/pid-recover` - Find Pixiv image mirrors by PID

### Media Processing

* `GET /api/ugoira` - Ugoira animation processing
* `GET /api/webp` - WebP conversion
* `GET /pximg` - pximg image proxy

### Third-party Integrations

* `GET /api/sauce/` - Image search
* `GET /api/ai-image-detect` - AI image detection
* `GET /api/x/media` - Fetch X user media tweets, see [reference documentation](./src/services/x-media/README.md)

### Other Endpoints

* `GET /proxy/*` - CORS proxy
* HibiAPI compatible endpoints

## 🛠️ Development Commands

```bash
# Development mode (hot reload)
deno task dev

# Production mode
deno task start

# Type checking
deno task type-check

# Code formatting
deno task fmt

# Linting
deno task lint

# Cache management
deno task manage-cache
```

## 📁 Project Structure

```
pxve-api/
├── src/
│   ├── app.ts             # Application entry
│   ├── middlewares/       # Middlewares
│   ├── routes/            # Route definitions
│   ├── services/          # Business logic
│   └── lib/               # Utility libraries
├── scripts/               # Script tools
├── public/                # Static assets
├── .env.example           # Environment variable template
├── deno.json              # Deno configuration
├── Dockerfile             # Docker configuration
└── README.md              # Project documentation
```

## 🔧 Tech Stack

* **Runtime**: Deno
* **Framework**: Hono
* **API Documentation**: Swagger UI + Scalar
* **Image Processing**: Sharp
* **HTML Parsing**: Cheerio
* **Data Validation**: Zod
* **Type Safety**: TypeScript

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 🔗 Related Projects

* [Pixiv Viewer](https://github.com/asadahimeka/pixiv-viewer) - Frontend application
* [HibiAPI](https://github.com/mixmoe/HibiAPI) - Reference API implementation

## ⚠️ Notes

1. Please comply with Pixiv's terms of service and relevant laws and regulations
2. Use the API responsibly and avoid excessive requests
3. Some features require corresponding API Keys or Tokens
4. It is recommended to enable caching in production environments to improve performance

## 📄 License

MIT License

![pxve-api](https://count.nanoka.top/@pxveapighen)
