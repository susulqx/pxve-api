# pxve-api Node.js 化迁移：回滚操作说明

> 目标：任何阶段出现问题时，可在**分钟级**恢复到上一稳定状态或原始 Deno 版本。
> 前提：迁移全程在独立分支完成，`main` 分支从未改动；原版目录 `D:\Program Files\.su\pxve-api - 原` 为最终兜底。
> **回滚全程无数据丢失风险**：本项目无持久化业务数据（token 缓存可自动重建）。

---

## 1. 快速回滚（推荐路径）

### 1.1 回滚整个迁移（恢复 Deno 原版基线）

```bash
cd "D:/Program Files/.su/pxve-api"
git checkout main          # 回到 Deno 原版基线（从未被修改）
git checkout v1.0-deno-original -- .   # 如 main 有意外变动，强制还原基线文件
git status                # 确认工作区干净
```

恢复后运行方式（与原版一致）：
```bash
# 方式 A：Docker（推荐）
docker build -t pxve-api .
docker run -d -p 3021:3021 --env-file .env pxve-api

# 方式 B：Deno 直接运行（需安装 Deno 2.x）
deno task start
```

### 1.2 只回滚某个迁移阶段

```bash
git checkout feat/vercel-migration
git revert -m 1 <merge-commit>   # 撤销对应阶段的 merge（见下表）
```

| 阶段 | merge commit | 撤销后恢复内容 |
|---|---|---|
| 阶段 1 Node 化 | `948c438` | 恢复 Deno.serve/Deno.env 入口（回到纯 Deno 版） |
| 阶段 2 Worker 适配 | `791f1c7` | 恢复 worker-pool 与 webp/ugoira worker 文件 |
| 阶段 3 平台收口 | `dcdc73d` | 移除 self-check 等平台修复 |

> revert 后如需继续迁移，在 `feat/vercel-migration` 上重建对应阶段即可（阶段提交均为独立 commit，可 `git cherry-pick`）。

## 2. 分支与提交地图

```
main  (ac390fb, tag v1.0-deno-original)  ← 未动，随时可切回
└── feat/vercel-migration (f169375)      ← 迁移汇总分支
    ├── merge 948c438 (phase1)  ← a0b9378 feat/vercel/phase1-node-ify
    ├── merge 791f1c7 (phase2)  ← 5aee6a6 feat/vercel/phase2-worker-adapt
    └── merge dcdc73d (phase3)  ← da11409 + f169375 feat/vercel/phase3-platform-fixes
```

每阶段独立分支名：`feat/vercel/phase1-node-ify`、`feat/vercel/phase2-worker-adapt`、`feat/vercel/phase3-platform-fixes`。分支保留不删，可直接切换查看各阶段状态。

## 3. 本地运行回滚

| 场景 | 操作 |
|---|---|
| Node 版启动失败 | ① `netstat -ano \| grep :3021` 找到 PID → `taskkill //F //PID <pid>`；② 检查 `npm run type-check` / `npm run self-check`；③ 若为代码问题，按 1.1 回滚 |
| 依赖损坏 | 删除 `node_modules/` 与 `package-lock.json`，重新 `npm install`（不触碰 src） |
| 端口冲突 | 确认旧服务已停（多实例并存时会 EADDRINUSE） |

## 4. 线上部署回滚（Vercel 部署后适用）

| 场景 | 操作 |
|---|---|
| 新版本函数异常 | Vercel Dashboard → Deployments → 上一版本 → **Redeploy / Rollback**（秒级回退，对外无感知） |
| DNS 切换后异常 | Cloudflare DNS 控制台：把记录改回原目标（TTL 已预设 60s，约 5 分钟生效） |
| 环境变量配错 | Dashboard → Settings → Environment Variables 修正后重新部署（**不改代码**） |

## 5. 回滚自检清单

- [ ] `git status` 干净（无未提交改动）
- [ ] `git branch --show-current` = main（或目标恢复分支）
- [ ] Docker 镜像/deno 运行后：`curl http://localhost:3021/` 返回 Ciallo 首页
- [ ] 原版目录 `D:\Program Files\.su\pxve-api - 原` 完整未被触碰（最终兜底）

---

*回滚操作不涉及任何数据删除/覆盖；所有迁移改动均可通过 git 追溯还原。*
