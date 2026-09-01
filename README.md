# Portune

Portune 是一个美股持仓 Web 工具，支持：

- 录入美股代号和数量
- 使用 `localStorage` 缓存持仓输入
- 前端切换 `FMP`、`Twelve Data`、`Yahoo` 数据源，默认 `Yahoo`
- 为需要的 provider 配置 API key，并支持本地缓存
- 通过所选金融接口计算每个股票的持仓占比
- 计算组合总仓位的 beta
- 一键复制 `代号, 持仓占比`
- 使用 `better-auth` + Google 登录，并通过邮箱白名单控制访问

## Tech Stack

- Frontend: React 19 + Vite + TypeScript
- Backend: Hono + TypeScript
- Runtime: Node.js / Vercel Functions
- Market Data: `FMP`, `Twelve Data`, `Yahoo Finance`

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

开发模式会同时启动：

- 前端: `http://localhost:5173`
- 后端 API: `http://localhost:3001`

如果需要测试 Google 登录，请在 Google Cloud Console 注册回调地址：

- `http://localhost:5173/api/auth/callback/google`

## Usage

1. 打开 `http://localhost:5173`
2. 点击“使用 Google 登录”
3. 使用白名单里的 Google 账号完成授权
4. 登录成功后录入股票 `symbol` 和 `quantity`
5. 选择 `Yahoo`、`FMP` 或 `Twelve Data`
6. 点击分析，查看持仓占比和组合 beta
7. 需要导出时点击复制按钮，复制内容为 `代号, 持仓占比`

## Why Google Login Needs Setup

这不是产品额外加的“手动步骤”，而是自托管 OAuth 的基本要求：

- Google 必须预先知道允许回调的域名和路径
- 服务端必须持有 `client id`、`client secret` 和签名密钥
- 当前项目还额外启用了邮箱白名单，所以需要配置 `AUTH_ALLOWED_EMAILS`

很多成熟网站看起来像“点一下就能登录”，是因为这些配置已经在它们的生产环境里提前做好了；当前仓库作为你自己部署的应用，需要你自己持有并配置这些 OAuth 参数。

## Local Production Build

```bash
npm run build
npm start
```

`npm start` 会启动 Node 服务，并托管 `dist/` 下的前端静态资源。

## Environment Variables

```bash
FMP_API_KEY=
TWELVE_DATA_API_KEY=
BETTER_AUTH_URL=
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_ALLOWED_EMAILS=
GITHUB_DATA_REPO=
GITHUB_DATA_TOKEN=
GITHUB_DATA_BRANCH=
```

- `FMP_API_KEY`: FMP 服务端共享 key
- `TWELVE_DATA_API_KEY`: Twelve Data 服务端共享 key
- `BETTER_AUTH_URL`: Better Auth 对外回调地址。生产环境建议显式填写正式域名；本地开发可省略，系统会从当前请求推导
- `BETTER_AUTH_SECRET`: Better Auth 签名密钥，至少 32 字节
- `GOOGLE_CLIENT_ID`: Google OAuth Web 应用 client id
- `GOOGLE_CLIENT_SECRET`: Google OAuth Web 应用 client secret
- `AUTH_ALLOWED_EMAILS`: 逗号分隔的白名单邮箱列表。所有环境必填；只有这些账号可以使用服务端共享 API key
- `GITHUB_DATA_REPO`: 私有数据仓，格式 `owner/name`（如 `zhmushan/portune-data`）。存放 `ledger.csv` 等财务数据，**不可放在本公开仓**
- `GITHUB_DATA_TOKEN`: 对上述数据仓有读写权限的 token。建议用 fine-grained PAT 且只授权该单仓
- `GITHUB_DATA_BRANCH`: 数据仓分支，默认 `main`

## Google OAuth Setup

本地现在已经不再要求手工填写 `BETTER_AUTH_URL`；但白名单在所有环境都强制启用，所以本地调试也必须配置 `AUTH_ALLOWED_EMAILS`。

如果你点击“使用 Google 登录”后看到 `Error 400: redirect_uri_mismatch`，这不是项目代码 bug，而是 Google Cloud Console 还没有放行当前回调地址。

本地开发至少需要注册：

- `http://localhost:5173/api/auth/callback/google`

生产环境需要额外注册：

- `https://<your-domain>/api/auth/callback/google`

Google 之所以要求这一步，是为了防止你的 OAuth client 被任意站点盗用。很多现成网站之所以看起来“点一下就能登录”，是因为它们已经提前把正式域名和回调地址配置好了。

## Vercel Deployment

项目已经按单个 Vercel 项目部署准备完成：

- 前端使用 Vite 静态构建输出到 `dist/`
- `/api/*` 由 `api/[...route].ts` 承接并转发给 Hono
- `vercel.json` 已固定 `framework`, `buildCommand`, `outputDirectory`

部署步骤：

1. 在 Vercel 导入当前仓库。
2. 设置 Production 环境变量：
   - `FMP_API_KEY`
   - `TWELVE_DATA_API_KEY`
   - `BETTER_AUTH_URL`
   - `BETTER_AUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `AUTH_ALLOWED_EMAILS`
3. 在 Google Cloud Console 注册生产回调地址：
   - `https://<your-domain>/api/auth/callback/google`
4. 触发部署。

建议：

- Preview 环境不要配置共享 provider key。
- 认证联调优先使用 localhost 或生产域名，避免为 Preview 域名单独维护 Google 回调。

## Provider Config

- 默认 provider 是 `Yahoo`
- `FMP` 支持从前端输入 API key，或使用后端环境变量 `FMP_API_KEY`
- `Twelve Data` 支持从前端输入 API key，或使用后端环境变量 `TWELVE_DATA_API_KEY`
- `Yahoo` 无需 API key，但更容易遇到上游限流

## API

### `GET /api/session`

返回当前应用可用的登录状态。这里会在 Better Auth session 之外额外校验邮箱白名单。

### `GET /api/auth/session`

`/api/session` 的调试别名，返回同样的应用级登录状态，便于沿用常见的 auth 调试路径。

### `POST /api/auth/sign-in/social`

由 `better-auth` 处理 Google 登录发起。前端当前只使用 `provider = google`。

### `GET /api/auth/callback/google`

由 `better-auth` 处理 Google OAuth 回调并建立 session cookie。

### `POST /api/auth/sign-out`

由 `better-auth` 清除当前 session cookie。

### `POST /api/portfolio/analyze`

需要先登录。请求体：

```json
{
  "provider": "fmp",
  "providerConfig": {
    "apiKey": "YOUR_API_KEY"
  },
  "positions": [
    { "symbol": "AAPL", "quantity": 10 },
    { "symbol": "MSFT", "quantity": 5 }
  ]
}
```

返回体会包含：

- `positions`: 每只股票的价格、市值、beta、持仓占比
- `portfolioBeta`: 组合 beta
- `provider` / `providerLabel`: 本次分析使用的数据源
- `warnings`: beta 缺失或币种不一致等提示
- `errors`: 无效 symbol 或无价格股票的错误信息
