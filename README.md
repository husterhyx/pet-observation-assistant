# 宠物观察小助手

单用户、离线优先的宠物档案与日常记录应用。桌面开发环境使用 Hono + SQLite 本地后端；服务器使用相同的数据模型，并通过每个环境独立的设备密钥提供 HTTPS 同步接口。

## 本地运行

要求 Node.js 24。

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

打开 <http://127.0.0.1:3000/>。本地模式不需要账号、数据库服务或 API 密钥。`server` 分支默认数据位于 `server-data/`，与 `main` 分支的 `data/` 是两个独立目录；两者都不会进入 Git 或 Docker 构建上下文。

如果下载依赖或连接自己的服务器需要代理，只在当前终端设置 `HTTP_PROXY`、`HTTPS_PROXY` 和 `NO_PROXY`；项目不会修改操作系统代理。

## 一键部署服务器

部署脚本支持 Debian、Ubuntu、Fedora 和 RHEL 系发行版，适用于已将域名 DNS 指向服务器的全新主机。它会交互收集配置并自动完成：

- 安装 Git、Node.js、Nginx、Certbot 和原生模块编译依赖；
- 从公开仓库浅层、部分拉取服务端所需源码并创建专用低权限 Linux 账户；
- 部署正式环境，以及可选的独立开发环境；
- 为每个环境生成不同的 32 字节随机设备密钥；
- 配置 systemd、Nginx 路径反代、Let's Encrypt HTTPS 和证书续期；
- 可选配置第二个域名和自定义 HTTPS 端口的直连入口；
- 完成回环地址和 HTTPS 就绪检查。

服务器上不需要预先下载仓库。发布 `server` 分支后，只需运行下面这一行，随后按提示输入域名等配置：

```bash
curl -fsSL https://raw.githubusercontent.com/husterhyx/pet-observation-assistant/server/deploy/server/install.sh -o /tmp/pet-observation-install.sh && sudo bash /tmp/pet-observation-install.sh
```

安装器使用 Git 的浅克隆、部分克隆和 sparse checkout，只获取 `api/`、`contracts/`、`db/`、`src/` 及根目录构建配置；不会下载提交历史、`src-tauri/`、Android 生成工程、图标或 APK 构建脚本。部署 fork 时可在交互界面填写其他公开 HTTPS 仓库地址和分支。

默认会创建以下两个互不共享数据和密钥的入口，域名、路径及内部端口都可以在安装时修改：

```text
https://pet.example.com/pet
https://pet.example.com/pet-dev
```

脚本可重复执行。再次运行会获取所选分支的最新版本，同时保留数据库、附件和已有设备密钥。安装参数保存在仅 root 可读的 `/etc/pet-observation-installer.conf`；密钥位于 `/etc/<service-name>/*.env`；业务数据位于 `/var/lib/<service-name>/`。脚本不会在终端打印密钥。

自动化部署时，可以用同名环境变量代替交互输入：

```bash
curl -fsSL https://raw.githubusercontent.com/husterhyx/pet-observation-assistant/server/deploy/server/install.sh | sudo env NON_INTERACTIVE=1 DOMAIN=pet.example.com CERTBOT_EMAIL=admin@example.com DEPLOY_DEV=1 PROD_PATH=pet PROD_PORT=3100 DEV_PATH=pet-dev DEV_PORT=3101 ENABLE_DIRECT=0 bash
```

仓库默认为 `https://github.com/husterhyx/pet-observation-assistant.git` 的 `server` 分支；fork 或镜像可通过 `REPOSITORY_URL`、`REPOSITORY_REF` 覆盖。高级场景也可设置 `SOURCE_DIR` 使用服务器上的现有最小源码目录，但正常一键部署不需要它。

无交互模式不会猜测真实域名；务必替换示例值。若启用直连入口，还要设置 `ENABLE_DIRECT=1`、`DIRECT_DOMAIN` 和 `DIRECT_HTTPS_PORT`，并在云防火墙中放行所选端口。首次签发证书前，所有填写的域名都必须已经解析到该服务器。

可先加入 `VALIDATE_ONLY=1` 检查全部输入和项目结构；该模式不要求 root，也不会安装软件或写入系统目录。

服务器模式下所有 `/api/*` 数据、同步和附件请求都需要：

```http
Authorization: Bearer <device-key>
```

健康检查为 `/api/health` 和 `/api/ready`；同步使用 `POST /api/sync`；附件通过 `/api/attachments/:sha256` 检查、上传和下载。客户端在“我的”页面填写自己的 HTTPS 入口和对应设备密钥。

## 手动服务器配置

不使用安装脚本时，可从 `.env.example` 创建环境文件。服务器模式必须位于 HTTPS 反向代理之后，并使用至少 32 个随机字节的密钥：

```dotenv
APP_MODE=server
DATA_DIR=/var/lib/pet-observation
DEVICE_API_KEY=replace-with-a-random-secret
PUBLIC_BASE_URL=https://pet.example.com
HOST=127.0.0.1
PORT=3000
```

## 数据与同步

- 业务数据使用 UUID、`updatedAt`、设备 ID 和删除墓碑。
- 本地写入先进入 SQLite 和 outbox，不依赖网络。
- 冲突采用最后修改覆盖；时间相同则按设备 ID 稳定决胜。
- 图片压缩到最长边 2048px 后按 SHA-256 存储，SQLite 只保存附件索引。
- 开发与正式服务器应使用不同设备密钥和独立数据库，不要交叉填写。

## 验证

```powershell
npm run check
npm test
npm run lint
npm run build
npm start
```

## Android 构建

Android 构建脚本从环境变量读取本机工具链，不包含开发者个人目录。至少设置 `JAVA_HOME` 以及 `ANDROID_HOME`（或 `ANDROID_SDK_ROOT`）；还可按需设置：

- `PET_ANDROID_NDK_VERSION`：NDK 版本，默认 `29.0.13846066`；
- `PET_ANDROID_BUILD_TOOLS_VERSION`：Build Tools 版本，默认 `36.0.0`；
- `PET_ANDROID_BUILD_ROOT`：英文路径的临时构建目录；
- `GRADLE_USER_HOME`、`ANDROID_AVD_HOME`：自定义缓存与模拟器位置；
- `PET_BUILD_PROXY`：仅当前构建进程使用的代理，例如 `http://127.0.0.1:8080`。

```powershell
npm run android:doctor
npm run android:init
npm run android:build:debug
npm run android:build:emulator
npm run android:build:release
```

首次正式构建会在当前 Windows 用户的 `.android` 目录生成项目独立签名密钥和 DPAPI 加密的密码文件。两者都不会进入 Git；后续发布更新必须安全保留同一份签名材料。
