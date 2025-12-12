import type { CustomToken } from './customTokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

/**
 * 预设的自定义代币列表
 * 
 * 这些代币会在应用初始化时自动添加到localStorage中。
 * 如果代币已存在（通过链ID和地址判断），则不会重复添加。
 * 
 * 如何添加新代币：
 * 
 * 1. 在下面的数组中添加新的代币对象
 * 2. 确保提供所有必需字段：chainId, address, symbol, name, decimals
 * 3. 可选字段：
 *    - logoURI（代币图标URL）
 *    - priceUSD（自定义代币价格，优先级最高）
 *    - priceTokenAddress（映射代币地址，使用该代币的价格，通过 Moralis API 获取）
 * 
 * 价格获取优先级：
 * 1. priceUSD（如果提供，直接使用自定义价格）
 * 2. priceTokenAddress（如果提供，通过 Moralis API 获取映射代币的价格）
 * 
 * 示例：
 * 
 * ```typescript
 * // 示例1：使用自定义价格
 * {
 *   chainId: UniverseChainId.Bnb,  // 链ID：1 = Ethereum, 56 = BNB Chain, 137 = Polygon 等
 *   address: '0x...',               // 代币合约地址（必须是小写或混合大小写）
 *   symbol: 'TOKEN',                // 代币符号（显示在UI中）
 *   name: 'Token Name',             // 代币全名
 *   decimals: 18,                   // 小数位数（通常是18）
 *   logoURI: 'https://...',         // 可选：代币图标URL
 *   priceUSD: 1.5,                  // 可选：自定义价格（USD），优先级最高
 * }
 * 
 * // 示例2：使用映射代币价格（例如：新代币映射到 USDT 的价格）
 * {
 *   chainId: UniverseChainId.Bnb,
 *   address: '0x...',
 *   symbol: 'NEWTOKEN',
 *   name: 'New Token',
 *   decimals: 18,
 *   priceTokenAddress: '0x55d398326f99059fF775485246999027B3197955', // USDT 地址（BNB Chain）
 *   // 系统会通过 Moralis API 获取 USDT 的价格，并使用它作为 NEWTOKEN 的价格
 * }
 * 
 * ```
 * 
 * 支持的链ID（UniverseChainId）：
 * - UniverseChainId.Mainnet (1) - Ethereum主网
 * - UniverseChainId.Bnb (56) - BNB Chain
 * - UniverseChainId.Polygon (137) - Polygon
 * - UniverseChainId.ArbitrumOne (42161) - Arbitrum
 * - UniverseChainId.Base (8453) - Base
 * - UniverseChainId.Optimism (10) - Optimism
 * - UniverseChainId.Avalanche (43114) - Avalanche
 * - 等等...（查看 UniverseChainId 枚举获取完整列表）
 * 
 * 注意事项：
 * - 地址会自动转换为小写进行比较，但建议使用正确的大小写格式
 * - logoURI 可以是任何可访问的图片URL（建议使用 PNG 或 SVG）
 * - priceUSD 优先级最高，如果提供了 priceUSD，会忽略 priceTokenAddress
 * - priceTokenAddress 必须是同一链上的代币地址，系统会通过 Moralis API 获取该代币的价格
 * - 如果 priceUSD 和 priceTokenAddress 都未提供，价格将无法显示（除非在"你的代币"列表中有价格）
 * - 代币添加后，如果钱包中有余额，会自动显示在"你的代币"列表中
 */
export const PRESET_CUSTOM_TOKENS: CustomToken[] = [
  // 示例1：BNB Chain上的代币
  {
    chainId: UniverseChainId.Bnb, // 56 - BNB Chain
    address: '0x5bee1b15970790cb8d044ce05be5851481584444',
    symbol: '金蟾蟾',
    name: '金蟾蟾',
    decimals: 18,
    logoURI: 'https://four.meme/_next/image?url=https%3A%2F%2Fstatic.four.meme%2Fmarket%2F4e57f536-2ec7-41a5-9a39-f3158f9edd896534373108249292059.jpeg&w=64&q=75',
    priceUSD: 0.000000041, // 可选：自定义价格
  },

  // 示例2：BNB Chain上的代币
   {
     chainId: UniverseChainId.Bnb, // 56 - BNB Chain
     address: '0xbfb4681A90F1584f0DB8688553C8f882C4484444',
     symbol: '马到成功',
     name: '马到成功',
     decimals: 18,
     logoURI: '/mdcg.png', // 可选
     priceUSD: 0.0000031, // 可选
   },

  // 示例3：Polygon上的代币（注释掉的示例）
  // {
  //   chainId: UniverseChainId.Polygon, // 137 - Polygon
  //   address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  //   symbol: 'POLY',
  //   name: 'Polygon Token',
  //   decimals: 18,
  //   // logoURI 和 priceUSD 都是可选的
  // },
]

/**
 * 初始化预设代币
 * 
 * 在应用启动时自动调用，将 PRESET_CUSTOM_TOKENS 数组中的代币添加到 localStorage。
 * 
 * 工作流程：
 * 1. 检查 localStorage 中是否已存在该代币（通过链ID和地址判断，不区分大小写）
 * 2. 如果不存在，则添加该代币
 * 3. 如果已存在，则跳过（不会重复添加或覆盖）
 * 
 * 调用时机：
 * - 在 apps/web/src/index.tsx 中应用启动时自动调用
 * - 也可以手动调用：import { initializePresetCustomTokens } from 'uniswap/src/features/tokens/presetCustomTokens'
 *                    initializePresetCustomTokens()
 * 
 * 注意事项：
 * - 只在浏览器环境中执行（服务端渲染时跳过）
 * - 使用动态导入避免循环依赖
 * - 如果添加失败，会在控制台输出错误信息，但不会中断应用启动
 */
export function initializePresetCustomTokens(): void {
  if (typeof window === 'undefined') {
    return
  }

  // 使用动态导入避免循环依赖
  import('./customTokens').then(({ getCustomTokens, addCustomToken }) => {
    PRESET_CUSTOM_TOKENS.forEach((token) => {
      try {
        // 获取已存在的自定义代币列表
        const existingTokens = getCustomTokens()
        
        // 检查代币是否已存在（通过链ID和地址判断，地址不区分大小写）
        const exists = existingTokens.some(
          (t) => t.chainId === token.chainId && t.address.toLowerCase() === token.address.toLowerCase()
        )

        if (!exists) {
          // 代币不存在，添加到localStorage
          addCustomToken(token)
          console.log(`[initializePresetCustomTokens] Added preset token: ${token.symbol} (${token.address})`)
        } else {
          // 代币已存在，跳过
          console.log(`[initializePresetCustomTokens] Token already exists: ${token.symbol} (${token.address})`)
        }
      } catch (error) {
        // 添加失败时记录错误，但不中断应用启动
        console.error(`[initializePresetCustomTokens] Failed to add preset token ${token.symbol}:`, error)
      }
    })
  })
}

