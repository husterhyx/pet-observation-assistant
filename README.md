# 宠物观察小助手

单用户、纯本地的宠物档案与日常记录应用。Android 使用应用内 SQLite，电脑开发环境使用只监听本机的 Hono + SQLite 后端；不包含账号、远程同步或云端依赖。

## 本地运行

要求 Node.js 24。

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

打开 <http://127.0.0.1:3000/>。运行时不需要联网、账号、数据库服务或 API 密钥。

默认数据位置：

- SQLite：`data/pet-life.db`
- 图片：`data/uploads/`

`data/` 已被 Git 忽略。后端启动时会自动执行 `db/migrations/` 中尚未应用的迁移。

## 数据与备份

- “我的”页面提供“导出备份”和“导入备份”。
- 备份是一个 `pet-observation-backup-YYYYMMDD.json` 文件，包含档案、记录、每日照片、物品、主页卡片顺序以及全部图片数据。
- 导入前会校验文件格式并再次确认；确认后一次性替换当前业务数据。
- 图片压缩到最长边 2048px 后按 SHA-256 存储，SQLite 保存附件索引。
- Android 通过系统文件选择器保存和读取备份；网页开发模式通过浏览器下载和选择文件。

导入会覆盖当前数据，因此建议在导入前先导出一份现状备份。备份文件可能包含私人照片，请自行妥善保管。

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
- Gradle 缓存：`D:\Android\Build\pet-observation\gradle-cache`
- 纯英文构建目录：`D:\Android\Build\pet-observation`
- JDK：Microsoft OpenJDK 17

```powershell
npm run android:doctor
npm run android:init
npm run android:build:debug
npm run android:build:emulator
npm run android:build:release
```

真机调试包输出到 `dist/android/pet-observation-1.0.0-arm64-debug.apk`；模拟器包输出到 `dist/android/pet-observation-1.0.0-x86_64-debug.apk`；正式签名包输出到 `dist/android/pet-observation-1.0.0-arm64-release.apk`。构建脚本会先清理 Gradle 增量产物，并剥离交付 APK 内 Rust 动态库的调试符号；它只设置当前进程的 Android 和代理环境变量，不修改 Windows 系统配置，同时使用英文构建副本规避 NDK/Gradle 对中文路径及 Windows 符号链接的限制。

Android 正式包名为 `app.petobservation.local`。它与旧包名属于两个独立应用；从旧版本迁移时先导出 JSON 备份，再在新版本中导入。

首次正式构建会在当前 Windows 用户的 `.android` 目录生成本项目独立签名密钥和 DPAPI 加密的密码文件。两者都不会进入 Git；后续发布更新必须使用同一密钥。同机重建需保留两者；DPAPI 文件只能由当前 Windows 用户解密，跨设备灾备还需在当前账户可用时导出密码，并与 JKS 密钥分开保管。

Android 包内的数据读写使用 Tauri SQLite，网页开发环境使用 Hono/tRPC 和本机 SQLite。应用没有网络权限，所有记录和备份操作都在本机完成。
