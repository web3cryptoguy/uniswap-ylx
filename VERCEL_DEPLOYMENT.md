# Vercel 部署指南

本指南将帮助您将 Uniswap 项目部署到 Vercel。

## 📋 前置要求

1. **Vercel 账户**：如果没有，请访问 [vercel.com](https://vercel.com) 注册
2. **GitHub/GitLab/Bitbucket 账户**：用于连接代码仓库
3. **Node.js 22.13.1**：Vercel 会自动使用项目配置的 Node 版本

## 🚀 部署步骤

### 方法一：通过 Vercel Dashboard（推荐）

1. **登录 Vercel**
   - 访问 [vercel.com](https://vercel.com)
   - 使用 GitHub/GitLab/Bitbucket 账户登录

2. **导入项目**
   - 点击 "Add New..." → "Project"
   - 选择您的代码仓库（如果未连接，先连接仓库）
   - 选择 `uniswap` 仓库

3. **配置项目设置**
   - **Framework Preset**: 选择 "Vite" 或 "Other"
   - **Root Directory**: 留空（使用项目根目录）
   - **Build Command**: `bun install && bun web build:production`
   - **Output Directory**: `apps/web/build`
   - **Install Command**: `bun install`

4. **环境变量配置**
   在 Vercel Dashboard 中添加以下环境变量（根据您的需求）：
   
   ```bash
   # 必需的环境变量
   NODE_ENV=production
   
   # Moralis API（如果使用）
   NEXT_PUBLIC_MORALIS_BASE_URL=https://deep-index.moralis.io/api/v2.2
   NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY=your_moralis_api_key
   
   # Trading API（如果使用）
   REACT_APP_TRADING_API_URL_OVERRIDE=your_trading_api_url
   
   # 其他配置
   VITE_SKIP_CSP=false
   VITE_DISABLE_SOURCEMAP=false
   ```

5. **部署**
   - 点击 "Deploy" 按钮
   - 等待构建完成

### 方法二：通过 Vercel CLI

1. **安装 Vercel CLI**
   ```bash
   npm i -g vercel
   # 或
   bun add -g vercel
   ```

2. **登录 Vercel**
   ```bash
   vercel login
   ```

3. **在项目根目录部署**
   ```bash
   cd /home/star/tools/🌐静态网页/uniswap
   vercel
   ```

4. **按照提示操作**
   - 选择项目范围
   - 确认项目设置
   - 等待部署完成

5. **生产环境部署**
   ```bash
   vercel --prod
   ```

## ⚙️ 项目配置

### vercel.json 配置

项目已包含 `vercel.json` 配置文件，包含以下设置：

- **路由重写**：所有路由重定向到 `/`（支持 SPA 路由）
- **缓存策略**：
  - `index.html`: 不缓存，实时更新
  - `assets/*`: 长期缓存（1年）
  - `fonts/*`: 长期缓存（1年）
  - `favicon.ico`: 长期缓存（1年）

### 构建配置

项目使用以下构建配置：

- **构建工具**: Vite
- **输出目录**: `apps/web/build`
- **Node 版本**: 22.13.1
- **包管理器**: Bun (>=1.3.1)

## 🔧 环境变量

### 必需的环境变量

在 Vercel Dashboard → Project Settings → Environment Variables 中添加：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NODE_ENV` | 环境类型 | `production` |
| `NEXT_PUBLIC_MORALIS_BASE_URL` | Moralis API 基础 URL | `https://deep-index.moralis.io/api/v2.2` |
| `NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY` | Moralis API 密钥 | `your_api_key` |

### 可选的环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `VITE_SKIP_CSP` | 跳过 CSP 配置 | `false` |
| `VITE_DISABLE_SOURCEMAP` | 禁用 Source Map | `false` |
| `REACT_APP_TRADING_API_URL_OVERRIDE` | Trading API URL 覆盖 | - |
| `ENABLE_REACT_COMPILER` | 启用 React Compiler | `false` |

## 📝 自定义构建命令

如果默认构建命令不工作，可以在 Vercel Dashboard 中自定义：

### 构建命令
```bash
bun install && bun web build:production
```

### 输出目录
```
apps/web/build
```

### 安装命令
```bash
bun install
```

## 🐛 常见问题

### 1. 构建失败：找不到 bun

**解决方案**：
- 在 Vercel Dashboard → Project Settings → General → Build & Development Settings
- 将 "Install Command" 设置为：`npm install -g bun && bun install`

或者使用 npm 作为替代：
- 将 "Install Command" 设置为：`npm install`
- 将 "Build Command" 设置为：`npm install && npm run web build:production`

### 2. 构建失败：内存不足

**解决方案**：
- 在 `package.json` 中，构建命令已包含 `NODE_OPTIONS=--max_old_space_size=8192`
- 如果仍然失败，可以在 Vercel Dashboard 中设置环境变量：
  ```
  NODE_OPTIONS=--max_old_space_size=8192
  ```

### 3. 路由 404 错误

**解决方案**：
- 确保 `vercel.json` 中的 `rewrites` 配置正确
- 所有路由应该重定向到 `/index.html`

### 4. CSP 错误

**解决方案**：
- 检查 `apps/web/public/csp.json` 配置
- 确保所有需要的域名都在 `connectSrc` 中
- 如果不需要 CSP，设置 `VITE_SKIP_CSP=true`

### 5. 环境变量未生效

**解决方案**：
- 确保环境变量名称以 `NEXT_PUBLIC_` 或 `VITE_` 开头（Vite 项目）
- 重新部署项目以应用新的环境变量

## 🔄 持续部署

### 自动部署

Vercel 会自动：
- 监听 Git 推送
- 在每次 push 到主分支时自动部署
- 为每个 Pull Request 创建预览部署

### 手动触发部署

1. 在 Vercel Dashboard 中
2. 进入项目 → "Deployments"
3. 点击 "Redeploy"

## 📊 监控和日志

### 查看构建日志

1. 在 Vercel Dashboard 中
2. 进入项目 → "Deployments"
3. 点击某个部署 → 查看 "Build Logs"

### 查看运行时日志

1. 在 Vercel Dashboard 中
2. 进入项目 → "Functions" 或 "Logs"
3. 查看实时日志

## 🎯 优化建议

1. **启用 Vercel Analytics**
   - 在项目设置中启用 Analytics
   - 监控性能和用户行为

2. **配置自定义域名**
   - 在项目设置 → Domains 中添加自定义域名
   - 配置 DNS 记录

3. **启用 Edge Functions**（如果需要）
   - 使用 Vercel Edge Functions 优化 API 响应

4. **优化构建时间**
   - 使用 Vercel 的构建缓存
   - 考虑使用 Turborepo（如果项目支持）

## 📚 相关资源

- [Vercel 文档](https://vercel.com/docs)
- [Vite 部署指南](https://vitejs.dev/guide/static-deploy.html)
- [Bun 文档](https://bun.sh/docs)

## ✅ 部署检查清单

- [ ] 代码已推送到 Git 仓库
- [ ] Vercel 账户已创建并登录
- [ ] 项目已导入到 Vercel
- [ ] 构建命令已配置
- [ ] 环境变量已设置
- [ ] 构建成功完成
- [ ] 网站可以正常访问
- [ ] 路由正常工作
- [ ] API 调用正常（如果使用）

---

**需要帮助？** 查看 [Vercel 支持](https://vercel.com/support) 或项目文档。

