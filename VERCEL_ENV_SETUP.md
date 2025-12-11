# Vercel 环境变量配置指南

## 问题描述

部署到 Vercel 后，代币选择器可能显示 "Couldn't load tokens" 错误。这通常是因为 Moralis API 密钥未正确配置。

## 解决方案

### 1. 改进的错误处理

代码已经改进，现在会：
- 在 API 密钥缺失或请求失败时返回空数组，而不是抛出错误
- 即使 ERC20 代币获取失败，仍然显示原生代币和自定义代币
- 只有在所有数据源都失败且没有任何数据时才显示错误

### 2. 配置 Vercel 环境变量

在 Vercel 控制台中配置以下环境变量：

#### 必需的环境变量

**重要**：本项目使用 Vite 构建，在 Vercel 部署时，**必须使用 `VITE_` 前缀**的环境变量。

1. **`VITE_MORALIS_PRIMARY_API_KEY`**（推荐，用于 Vercel 部署）
   - 描述：Moralis 主 API 密钥
   - 获取方式：访问 [Moralis Dashboard](https://admin.moralis.io/) 获取 API 密钥
   - 配置位置：Vercel 项目设置 → Environment Variables
   - **注意**：这是 Vite 项目的标准格式，在构建时会被正确注入

2. **`NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY`**（备选，也支持）
   - 描述：Moralis 主 API 密钥（Next.js 格式）
   - 说明：代码也支持此格式，但建议使用 `VITE_` 前缀
   - 配置位置：Vercel 项目设置 → Environment Variables

3. **`VITE_MORALIS_FALLBACK_API_KEY`**（可选但推荐）
   - 描述：Moralis 备用 API 密钥
   - 用途：当主 API 密钥失败时自动切换到备用密钥
   - 配置位置：Vercel 项目设置 → Environment Variables

4. **`NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY`**（备选，也支持）
   - 描述：Moralis 备用 API 密钥（Next.js 格式）
   - 说明：代码也支持此格式，但建议使用 `VITE_` 前缀

#### 可选的环境变量

3. **`NEXT_PUBLIC_MORALIS_BASE_URL`**（可选）
   - 描述：Moralis API 基础 URL
   - 默认值：`https://deep-index.moralis.io/api/v2.2`
   - 通常不需要修改

### 3. 配置步骤

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择你的项目
3. 进入 **Settings** → **Environment Variables**
4. 添加以下变量（**推荐使用 VITE_ 前缀**）：
   - Key: `VITE_MORALIS_PRIMARY_API_KEY`（推荐）
   - Value: 你的 Moralis API 密钥
   - Environment: 选择 `Production`、`Preview` 和 `Development`（根据需要）
5. 点击 **Save**
6. 重复步骤 4-5 添加 `VITE_MORALIS_FALLBACK_API_KEY`（如果使用）
7. **重要**：修改环境变量后，需要重新部署才能生效

**备选方案**（如果必须使用 NEXT_PUBLIC_ 前缀）：
- 也可以配置 `NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY`，代码会尝试读取
- 但为了确保兼容性，建议同时配置 `VITE_MORALIS_PRIMARY_API_KEY`

### 4. 环境变量格式说明

**重要**：本项目使用 **Vite** 构建，不是 Next.js。

项目支持两种环境变量格式（代码会自动检测并使用可用的格式）：

- **Vite 格式（推荐）**：`VITE_MORALIS_PRIMARY_API_KEY`
  - 这是 Vite 项目的标准格式
  - **在 Vercel 部署时，强烈建议使用此格式**
  - 在构建时会被正确注入到 `import.meta.env` 和 `process.env` 中

- **Next.js 格式（备选）**：`NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY`
  - 代码也支持此格式（为了兼容性）
  - 但 Vite 可能不会自动处理此格式，除非在 `vite.config.mts` 中配置了 `envPrefix: []`
  - 项目已配置 `envPrefix: []`，所以此格式也能工作，但建议使用 `VITE_` 前缀

**为什么本地开发正常，但部署后不行？**

可能的原因：
1. 本地开发时使用了 `.env` 文件，其中配置了 `VITE_MORALIS_PRIMARY_API_KEY`
2. 但在 Vercel 中只配置了 `NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY`
3. 虽然代码支持 `NEXT_PUBLIC_` 前缀，但在某些情况下可能无法正确读取

**解决方案**：
- 在 Vercel 中配置 `VITE_MORALIS_PRIMARY_API_KEY`（而不是 `NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY`）
- 或者同时配置两种格式，确保兼容性

### 5. 验证配置

部署后，检查以下内容：

1. **浏览器控制台**：打开浏览器开发者工具（F12），查看 Console 标签
   - 应该能看到 `[moralisApi] 环境变量读取状态` 的调试信息
   - 检查 `hasPrimaryVite` 或 `hasPrimaryNext` 是否为 `true`
   - 如果 `hasApiKey` 为 `false`，说明环境变量未正确配置
   
2. **代币选择器**：应该能够正常加载代币列表
   - 如果显示 "Couldn't load tokens"，检查控制台的错误信息

3. **网络请求**：在浏览器开发者工具的 Network 标签中
   - 检查 Moralis API 请求是否成功（状态码应为 200）
   - 如果请求失败，查看错误响应内容

#### 调试信息说明

代码会在浏览器控制台输出详细的调试信息，包括：

```javascript
[moralisApi] 环境变量读取状态: {
  hasPrimaryVite: true,      // 是否读取到 VITE_MORALIS_PRIMARY_API_KEY
  hasPrimaryNext: false,     // 是否读取到 NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY
  hasFallbackVite: false,    // 是否读取到 VITE_MORALIS_FALLBACK_API_KEY
  hasFallbackNext: false,    // 是否读取到 NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY
  hasApiKey: true,           // 是否有任何 API 密钥（应该为 true）
  hasImportMeta: true,        // import.meta 是否可用
  hasProcessEnv: true,       // process.env 是否可用
  hasNextData: false,        // window.__NEXT_DATA__ 是否可用
  nextDataKeys: [],          // window.__NEXT_DATA__.env 中的键列表
  allEnvKeys: [...]          // process.env 中所有包含 MORALIS 的键
}
```

**重要**：如果 `hasApiKey` 为 `false`，说明环境变量未正确配置或未正确读取。

### 6. 故障排除

#### 问题：仍然显示 "Couldn't load tokens"

**可能原因**：
- 环境变量未正确配置
- 环境变量未应用到正确的环境（Production/Preview/Development）
- 需要重新部署

**解决方法**：
1. 确认环境变量已正确添加到 Vercel
2. 确认环境变量已应用到正确的环境
3. 触发新的部署（在 Vercel 控制台点击 "Redeploy"）
4. 检查浏览器控制台的错误信息

#### 问题：代币列表为空，但没有错误

**可能原因**：
- API 密钥无效或已过期
- API 请求被限制
- 钱包地址没有代币余额

**解决方法**：
1. 验证 API 密钥是否有效
2. 检查 Moralis Dashboard 中的 API 使用情况
3. 确认钱包地址有代币余额

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

### 9. 改进说明

最新的代码改进包括：

1. **统一的环境变量读取**：
   - 所有文件现在使用统一的 `getEnvVar` 函数
   - 支持 `VITE_`、`NEXT_PUBLIC_` 和 `REACT_APP_` 前缀
   - 按顺序尝试：`import.meta.env` → `process.env` → `window.__NEXT_DATA__.env`

2. **优雅降级**：API 密钥缺失或请求失败时，返回空数组而不是抛出错误

3. **部分数据支持**：即使 ERC20 代币获取失败，仍然显示原生代币和自定义代币

4. **智能错误显示**：只有在所有数据源都失败且没有任何数据时才显示错误

5. **详细的调试信息**：
   - 在模块加载时记录环境变量读取状态
   - 在浏览器控制台输出详细的调试信息
   - 帮助快速诊断环境变量配置问题

6. **运行时环境变量检查**：
   - 自动检测所有可能的环境变量来源
   - 在控制台显示可用的环境变量键
   - 帮助识别配置问题

这些改进确保了应用在 API 配置不完整时仍能正常工作，只是可能无法显示某些代币。同时，详细的调试信息帮助快速定位和解决配置问题。

