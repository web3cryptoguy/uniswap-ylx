# Vercel 快速部署指南

## 🚀 5 分钟快速部署

### 步骤 1: 准备代码
```bash
# 确保代码已推送到 Git 仓库
git add .
git commit -m "准备部署到 Vercel"
git push
```

### 步骤 2: 在 Vercel 部署

#### 选项 A: 通过网页（推荐）

1. 访问 [vercel.com](https://vercel.com) 并登录
2. 点击 "Add New..." → "Project"
3. 选择您的 Git 仓库
4. 配置以下设置：
   - **Framework Preset**: `Other`
   - **Root Directory**: `./` (留空，使用根目录)
   - **Build Command**: `bun install && bun web build:production`
   - **Output Directory**: `apps/web/build`
   - **Install Command**: `bun install`
5. 添加环境变量（如果需要）：
   - `NODE_ENV=production`
   - `NEXT_PUBLIC_MORALIS_BASE_URL=...` (如果使用)
   - `NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY=...` (如果使用)
6. 点击 "Deploy"

#### 选项 B: 通过 CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 在项目根目录部署
cd /home/star/tools/🌐静态网页/uniswap
vercel

# 生产环境部署
vercel --prod
```

### 步骤 3: 等待部署完成

部署完成后，Vercel 会提供一个 URL，例如：
- `https://your-project.vercel.app`

## ⚙️ 关键配置

### 构建命令
```bash
bun install && bun web build:production
```

### 输出目录
```
apps/web/build
```

### 环境变量（可选）
```
NODE_ENV=production
VITE_SKIP_CSP=false
```

## ❓ 遇到问题？

### 问题 1: Bun 未安装
**解决方案**: 在 Vercel 设置中，将 Install Command 改为：
```bash
npm install -g bun && bun install
```

### 问题 2: 构建失败
**解决方案**: 
1. 检查构建日志
2. 确保所有依赖已安装
3. 尝试使用 npm 替代 bun

### 问题 3: 路由 404
**解决方案**: 确保 `vercel.json` 文件存在且配置正确（已包含在项目中）

## 📚 详细文档

查看 [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) 获取完整部署指南。

