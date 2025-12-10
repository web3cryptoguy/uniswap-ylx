# Vercel 环境变量配置指南

## 问题描述

在生产环境中，如果 Moralis API 密钥未配置，token 选择器会显示错误："Couldn't load tokens"。

## 解决方案

### 1. 在 Vercel 中配置环境变量

登录 Vercel 控制台，进入项目设置，在 "Environment Variables" 部分添加以下环境变量：

#### 必需的环境变量

```
NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY=your_primary_api_key_here
NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY=your_fallback_api_key_here
```

#### 可选的环境变量

```
NEXT_PUBLIC_MORALIS_BASE_URL=https://deep-index.moralis.io/api/v2.2
```

### 2. 环境变量格式说明

代码同时支持以下两种格式的环境变量（按优先级）：

1. **Vite 格式**（开发环境）：
   - `VITE_MORALIS_PRIMARY_API_KEY`
   - `VITE_MORALIS_FALLBACK_API_KEY`
   - `VITE_MORALIS_BASE_URL`

2. **Next.js 格式**（生产环境，推荐）：
   - `NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY`
   - `NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY`
   - `NEXT_PUBLIC_MORALIS_BASE_URL`

### 3. 配置步骤

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择你的项目
3. 进入 **Settings** → **Environment Variables**
4. 添加上述环境变量
5. 选择应用环境（Production、Preview、Development）
6. 点击 **Save**
7. 重新部署项目

### 4. 验证配置

部署后，检查浏览器控制台：
- 如果看到警告 `[fetchWalletERC20Tokens] Moralis API 密钥未配置`，说明环境变量未正确配置
- 如果没有警告且 token 列表正常加载，说明配置成功

### 5. 错误处理改进

代码已更新，当 API 密钥缺失时：
- **之前**：抛出错误，导致整个 token 选择器无法使用
- **现在**：返回空列表，显示友好的错误提示，允许用户重试

### 6. 获取 Moralis API Key

1. 访问 [Moralis Dashboard](https://admin.moralis.io/)
2. 注册/登录账户
3. 创建新项目或选择现有项目
4. 在项目设置中找到 **API Keys**
5. 复制 **Primary API Key** 和 **Fallback API Key**（如果有）

### 7. Node.js 版本配置

项目已配置 Node.js 版本为 `22.13.1`，通过以下方式指定：

1. **`.nvmrc` 文件**：项目根目录已包含 `.nvmrc` 文件，Vercel 会自动识别并使用指定的 Node.js 版本
2. **`package.json`**：`engines.node` 字段指定了 `=22.13.1`

如果 Vercel 控制台显示 Node.js 版本警告（⚠️ 22.x 24.x），可以：

- **方法 1（推荐）**：提交 `.nvmrc` 文件后，Vercel 会在下次部署时自动使用正确的版本
- **方法 2**：在 Vercel 控制台的 **Settings** → **Runtime Settings** → **Node.js Version** 中手动选择 `22.x`

### 8. 注意事项

- 环境变量区分大小写
- 确保在正确的环境（Production/Preview/Development）中配置
- 修改环境变量后需要重新部署才能生效
- API Key 应该保密，不要提交到代码仓库
- Node.js 版本应与 `package.json` 中的 `engines.node` 保持一致

