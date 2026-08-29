# Agent Mocker 桌面版

把整个 Agent Mocker（Fastify 服务端 + React 工作台）打包成 Windows / macOS / Linux 桌面应用。
用户不需要装 Node、不需要开终端，双击就能用；Mock API 依然监听本机端口，Agent 把
`base_url` 指过去即可。

## 它是怎么跑起来的

```
Electron 主进程
├── 启动内嵌的 Fastify（dist/server/index.cjs）    监听 127.0.0.1:3000
└── BrowserWindow 加载 http://127.0.0.1:3000/      即 apps/web 的构建产物
```

服务端**直接跑在主进程里**，不额外 fork 子进程：少一层进程管理，模块加载路径也
交给 Electron 自己解析。Web UI 通过 HTTP 访问服务端和 `pnpm start` 时的行为完全一致
（`apps/web/src/api/client.ts` 里 `baseURL` 就是相对路径 `/api`）。

构建产物：

| 路径 | 内容 |
| --- | --- |
| `dist/main/index.cjs` | Electron 主进程 |
| `dist/preload/index.cjs` | 预加载脚本（只暴露一个只读标记） |
| `dist/server/index.cjs` | 整个服务端，fastify / drizzle / zod 等都已 bundle |
| `dist/web/` | `apps/web` 的构建产物，由 Fastify 静态托管 |
| `dist/renderer/` | 启动中 / 启动失败的提示页 |

SQLite 使用 Node 24 内置的 `node:sqlite`（自定义 Drizzle 驱动见
`apps/server/src/db/node-sqlite.ts`），整个产物是纯 JS，没有任何原生模块；构建时也不
需要现场编译，所以一台 runner 可以同时产出 x64 和 arm64 的安装包。`dist/web/` 仍走
`asarUnpack`：`@fastify/static` 会对静态根目录做 `realpath` 校验。

## 数据存在哪

| 平台 | 目录 |
| --- | --- |
| Windows | `%APPDATA%\Agent Mocker\` |
| macOS | `~/Library/Application Support/Agent Mocker/` |
| Linux | `~/.config/Agent Mocker/` |

- `data/mock.db` —— SQLite 数据库，升级应用不会丢。
- `settings.json` —— 端口、监听地址等，见下。
- 启动日志在系统日志目录（菜单「文件 → 打开启动日志」可直达）。

菜单里的「文件 → 打开数据目录」会直接打开上面这个目录。

### settings.json

首次退出应用时自动写出，改完重启生效：

```jsonc
{
  "port": 3000,          // 首选端口，被占用会自动顺延
  "host": "127.0.0.1",   // 改成 0.0.0.0 可让局域网 / 容器里的 Agent 连进来
  "strictApiKey": true,  // false 时未匹配 API Key 的 /v1 请求落到唯一项目上
  "logLevel": "info",
  "window": { "width": 1440, "height": 900 }
}
```

端口被占用时应用会自动往后找空闲端口，并弹窗告知实际地址；窗口标题栏也始终显示当前
`base_url`，菜单「文件 → 复制 Mock API 地址」可以直接复制 `http://127.0.0.1:<port>/v1`。

## 本地开发

`desktop/` 刻意**没有**加进根 `pnpm-workspace.yaml`：Electron 加 electron-builder 有几百 MB
的下载量，不该拖慢只做 server / web 的同学的 `pnpm install`。这里通过一个内容为空的
`desktop/pnpm-workspace.yaml` 把本目录变成独立的 pnpm 根，所以要装两次依赖：

```bash
# 1. 仓库根目录：服务端和 web 的依赖
pnpm install

# 2. 本目录：Electron 工具链
cd desktop
pnpm install

# 3. 生成应用图标（从 docs/image/logo.png 裁出机器人图形）
pnpm icon

# 4. 构建并启动
pnpm build
pnpm exec electron .
```

`pnpm build` 会先跑 `pnpm --filter @agent-mock/web build`，再用 esbuild 打三份 bundle。
只改了主进程代码、不想重新构建 web 时，可以跳过这一步：

```bash
node scripts/build.mjs --skip-web
```

改完 `apps/server` 或 `apps/web` 的源码后需要重新 `pnpm build` —— 桌面版加载的是构建产物，
不是源码。

`pnpm smoke` 会在 Electron 的运行时里真正拉起一次服务端，检查 node:sqlite 能否使用、SQLite
能否写入、Mock API 和 Web UI 有没有正常响应。CI 在打包前会先跑它。

> 注意：桌面版要求本机 Node ≥ 24（`node:sqlite` 的要求）；Electron 内嵌自己的 Node
> 运行时，应用运行不依赖系统 Node。

## 本地打包

```bash
pnpm dist:linux    # AppImage
pnpm dist:win      # NSIS 安装包 + zip
pnpm dist:mac      # dmg + zip
pnpm pack          # 只解包成目录，用来快速验证打包结果
```

产物在 `desktop/release/`。产物是纯 JS（没有原生模块），在一台机器上交叉打出另一个
架构的包是可行的；但 `.dmg` 的制作和 macOS 签名仍然需要 macOS，正式产物请走下面的 CI。

## 发布（GitHub Actions）

`.github/workflows/desktop-release.yml`，**手动触发**：

Actions → *Build and release desktop app* → *Run workflow*，可填：

| 输入 | 说明 |
| --- | --- |
| `version` | 版本号如 `0.2.0`，留空则用 `desktop/package.json` 里的值 |
| `draft` | 默认开。先出草稿 Release，确认产物没问题再手动发布 |
| `prerelease` | 标记为预发布 |

三个 runner 并行构建，每个各出 x64 和 arm64 两种架构：

| Runner | 产物 |
| --- | --- |
| `ubuntu-22.04` | AppImage |
| `windows-latest` | NSIS 安装包 / zip |
| `macos-latest` | dmg / zip |

每个平台在打包前会先跑 `pnpm smoke`，确认服务端在 Electron 里能真正起来。之后所有安装包
汇总成一个 tag 为 `desktop-v<version>` 的 Release。`fail-fast` 关着，一个平台失败不影响其它
平台，可以在一次运行里看全所有报错；但 Release 任务要求所有平台都成功，避免发出残缺的版本。

### 关于签名

产物没有做代码签名和公证，属于「能用但系统会拦一下」：

- macOS：首次打开右键选「打开」；`identity: null` 保证 ad-hoc 签名，应用本身可以运行。
- Windows：SmartScreen 提示时选「更多信息 → 仍要运行」。

要正式签名的话，在 `electron-builder.yml` 里配置证书，并把证书通过 secrets 注入 CI
（macOS 用 `CSC_LINK` / `CSC_KEY_PASSWORD` + `APPLE_ID` 等公证变量，Windows 用
`WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`）。
