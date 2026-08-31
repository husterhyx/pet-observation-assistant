# 宠物生活记录

单用户、离线优先的宠物档案与日常记录应用。电脑开发环境使用 Hono + SQLite 本地后端；远程服务器使用同一套数据模型，并通过固定设备密钥提供同步接口。

## 本地运行

要求 Node.js 24。

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

打开 <http://127.0.0.1:3000/>。本地模式不需要账号、数据库服务或 API 密钥。

默认数据位置：

- SQLite：`data/pet-life.db`
- 图片：`data/uploads/`

`data/` 已被 Git 和 Docker 忽略。后端启动时会自动执行 `db/migrations/` 中尚未应用的迁移。

## 服务器模式

服务器模式必须通过 HTTPS 反向代理，并设置至少 32 个随机字节的设备密钥：

```dotenv
APP_MODE=server
DATA_DIR=/var/lib/pet-life
DEVICE_API_KEY=replace-with-a-random-secret
PUBLIC_BASE_URL=https://pet.example.com
PORT=3000
```

服务器模式下所有 `/api/*` 数据、同步和附件请求都需要：

```http
Authorization: Bearer <device-key>
```

健康检查为 `/api/health` 和 `/api/ready`。同步使用 `POST /api/sync`；附件通过 `/api/attachments/:sha256` 检查、上传和下载。

## 数据与同步

- 业务数据使用 UUID、`updatedAt`、设备 ID 和删除墓碑。
- 本地写入先进入 SQLite 和 outbox，不依赖网络。
- 冲突采用最后修改覆盖；时间相同则按设备 ID 稳定决胜。
- 图片压缩到最长边 2048px 后按 SHA-256 存储，SQLite 只保存附件索引。
- “我的”页面可填写远程 HTTPS 地址和固定设备密钥，并查看待同步数量与最近同步结果。

## 验证

```powershell
npm run check
npm test
npm run lint
npm run build
npm start
```
