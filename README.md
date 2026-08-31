# 宠物观察小助手

单用户、离线优先的宠物档案与日常记录应用。电脑开发环境使用 Hono + SQLite 本地后端；远程服务器使用同一套数据模型，并通过固定设备密钥提供同步接口。

## 本地运行

要求 Node.js 24。

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

打开 <http://127.0.0.1:3000/>。本地模式不需要账号、数据库服务或 API 密钥。

如果当前网络需要本地代理才能访问远程同步服务器，只为当前终端设置代理即可；`npm run dev` 和 `npm start` 会让 Node.js 读取这些变量，不会修改 Windows 系统代理：

```powershell
$env:HTTP_PROXY='http://127.0.0.1:10809'
$env:HTTPS_PROXY='http://127.0.0.1:10809'
$env:NO_PROXY='localhost,127.0.0.1,::1'
npm run dev
```

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
HOST=127.0.0.1
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
- 日常开发连接 `https://yuxiang66.top/pet-dev`；正式使用连接 `https://yuxiang66.top/pet`。两套地址使用不同设备密钥和独立数据库，不要交叉填写。

## 验证

```powershell
npm run check
npm test
npm run lint
npm run build
npm start
```

## Android 开发构建

Android 工具链固定使用 D 盘现有环境：

- SDK：`D:\Android\Sdk`
- NDK：`D:\Android\Sdk\ndk\29.0.13846066`
- AVD：`D:\Android\Avd`
- Gradle 缓存：`D:\Android\GradleCache`
- 纯英文构建目录：`D:\Android\Build\pet-observation`
- JDK：Microsoft OpenJDK 17

```powershell
npm run android:doctor
npm run android:init
npm run android:build:debug
npm run android:build:emulator
```

真机使用的 ARM64 Debug APK 输出到 `dist/android/pet-observation-0.1.0-arm64-debug.apk`；模拟器使用的 x86_64 Debug APK 输出到 `dist/android/pet-observation-0.1.0-x86_64-debug.apk`。构建脚本只设置当前进程的 Android 和代理环境变量，不修改 Windows 系统配置；同时使用英文构建副本规避 NDK/Gradle 对中文路径及 Windows 符号链接的限制。

Android 包内的数据读写已经切换到 Tauri SQLite，本地业务写入与同步 outbox 在同一事务中提交；网页开发环境仍使用 Hono/tRPC。Android 端远程同步使用 Tauri 原生 HTTPS，不依赖 WebView 跨域能力。首次安装后可完全离线记录，之后在“我的”页面配置开发或正式服务器地址和对应密钥。
