import { Token } from '@uniswap/sdk-core'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

/**
 * 自定义代币信息接口
 * 
 * 使用示例：
 * ```typescript
 * const customToken: CustomToken = {
 *   chainId: 56, // BNB Chain
 *   address: '0xbfb4681A90F1584f0DB8688553C8f882C4484444',
 *   symbol: 'TOKEN',
 *   name: 'Token Name',
 *   decimals: 18,
 *   logoURI: 'https://example.com/logo.png', // 可选
 *   priceUSD: 1.5, // 可选：自定义价格（优先使用）
 *   priceTokenAddress: '0x...', // 可选：映射的代币地址，使用该代币的价格（通过 Moralis API 获取）
 * }
 * ```
 * 
 * 价格获取优先级：
 * 1. priceUSD（如果提供，直接使用）
 * 2. priceTokenAddress（如果提供，通过 Moralis API 获取映射代币的价格）
 */
export interface CustomToken {
  /** 链ID，例如：1 = Ethereum, 56 = BNB Chain, 137 = Polygon */
  chainId: UniverseChainId
  /** 代币合约地址（0x开头的十六进制地址） */
  address: string
  /** 代币符号（显示在UI中，例如：ETH, USDC） */
  symbol: string
  /** 代币全名 */
  name: string
  /** 小数位数（通常是18，例如：USDC是6，大多数ERC20是18） */
  decimals: number
  /** 可选：代币图标URL */
  logoURI?: string | null
  /** 可选：代币价格（USD），优先级最高，如果提供且 > 0 则直接使用 */
  priceUSD?: number | null
  /** 可选：映射的代币地址，使用该代币的价格（通过 Moralis API 获取），作为备用方案；当 priceUSD 未提供或 <= 0 时使用 */
  priceTokenAddress?: string | null
}

/**
 * 自定义代币存储键
 */
const CUSTOM_TOKENS_STORAGE_KEY = 'uniswap-custom-tokens'

/**
 * 从localStorage获取所有自定义代币
 */
export function getCustomTokens(): CustomToken[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const stored = localStorage.getItem(CUSTOM_TOKENS_STORAGE_KEY)
    if (!stored) {
      return []
    }
    return JSON.parse(stored) as CustomToken[]
  } catch (error) {
    console.error('[getCustomTokens] Failed to parse custom tokens:', error)
    return []
  }
}

/**
 * 保存自定义代币到localStorage
 */
export function saveCustomTokens(tokens: CustomToken[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.setItem(CUSTOM_TOKENS_STORAGE_KEY, JSON.stringify(tokens))
  } catch (error) {
    console.error('[saveCustomTokens] Failed to save custom tokens:', error)
  }
}

/**
 * 添加自定义代币
 * 
 * 使用示例：
 * ```typescript
 * import { addCustomToken } from 'uniswap/src/features/tokens/customTokens'
 * 
 * const success = addCustomToken({
 *   chainId: 56, // BNB Chain
 *   address: '0xbfb4681A90F1584f0DB8688553C8f882C4484444',
 *   symbol: 'TOKEN',
 *   name: 'Token Name',
 *   decimals: 18,
 *   logoURI: 'https://example.com/logo.png', // 可选
 *   priceUSD: 1.5, // 可选
 * })
 * 
 * if (success) {
 *   console.log('代币添加成功')
 * } else {
 *   console.log('代币已存在')
 * }
 * ```
 * 
 * @param token - 自定义代币信息
 * @returns 如果添加成功返回 true，如果代币已存在返回 false
 */
export function addCustomToken(token: CustomToken): boolean {
  const tokens = getCustomTokens()
  
  // 检查是否已存在（相同链ID和地址，地址不区分大小写）
  const exists = tokens.some(
    (t) => t.chainId === token.chainId && t.address.toLowerCase() === token.address.toLowerCase()
  )
  
  if (exists) {
    return false // 代币已存在，不重复添加
  }

  // 添加新代币到列表
  tokens.push(token)
  // 保存到localStorage
  saveCustomTokens(tokens)
  return true // 添加成功
}

/**
 * 删除自定义代币
 * 
 * 使用示例：
 * ```typescript
 * import { removeCustomToken } from 'uniswap/src/features/tokens/customTokens'
 * 
 * const success = removeCustomToken(56, '0xbfb4681A90F1584f0DB8688553C8f882C4484444')
 * if (success) {
 *   console.log('代币删除成功')
 * } else {
 *   console.log('代币不存在')
 * }
 * ```
 * 
 * @param chainId - 链ID
 * @param address - 代币合约地址
 * @returns 如果删除成功返回 true，如果代币不存在返回 false
 */
export function removeCustomToken(chainId: UniverseChainId, address: string): boolean {
  const tokens = getCustomTokens()
  // 过滤掉要删除的代币（地址不区分大小写）
  const filtered = tokens.filter(
    (t) => !(t.chainId === chainId && t.address.toLowerCase() === address.toLowerCase())
  )
  
  // 如果过滤后的长度没有变化，说明代币不存在
  if (filtered.length === tokens.length) {
    return false // 代币不存在
  }

  // 保存更新后的列表
  saveCustomTokens(filtered)
  return true // 删除成功
}

/**
 * 获取指定链的自定义代币
 * 
 * 使用示例：
 * ```typescript
 * import { getCustomTokensByChain } from 'uniswap/src/features/tokens/customTokens'
 * import { UniverseChainId } from 'uniswap/src/features/chains/types'
 * 
 * // 获取BNB Chain上的所有自定义代币
 * const bnbTokens = getCustomTokensByChain(UniverseChainId.Bnb)
 * console.log(`BNB Chain上有 ${bnbTokens.length} 个自定义代币`)
 * 
 * // 获取Ethereum主网上的所有自定义代币
 * const ethTokens = getCustomTokensByChain(UniverseChainId.Mainnet)
 * ```
 * 
 * @param chainId - 链ID
 * @returns 该链上的所有自定义代币数组
 */
export function getCustomTokensByChain(chainId: UniverseChainId): CustomToken[] {
  return getCustomTokens().filter((t) => t.chainId === chainId)
}

/**
 * 将自定义代币转换为Uniswap Token
 */
export function customTokenToUniswapToken(customToken: CustomToken): Token {
  return new Token(
    customToken.chainId,
    customToken.address,
    customToken.decimals,
    customToken.symbol,
    customToken.name
  )
}

/**
 * 获取自定义代币的映射代币地址（用于价格查询）
 * @param chainId 链ID
 * @param address 代币地址
 * @returns 映射的代币地址，如果不存在则返回 undefined
 */
export function getCustomTokenPriceTokenAddress(
  chainId: UniverseChainId,
  address: string
): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    const customTokens = getCustomTokens()
    const matchedToken = customTokens.find(
      (token) =>
        token.chainId === chainId &&
        token.address.toLowerCase() === address.toLowerCase() &&
        token.priceTokenAddress !== undefined &&
        token.priceTokenAddress !== null &&
        token.priceTokenAddress.trim() !== ''
    )

    return matchedToken?.priceTokenAddress?.trim() || undefined
  } catch (error) {
    console.debug('[getCustomTokenPriceTokenAddress] 获取映射代币地址失败:', error)
    return undefined
  }
}

