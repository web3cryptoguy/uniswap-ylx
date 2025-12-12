import { Currency } from '@uniswap/sdk-core'
import { getCustomTokens } from 'uniswap/src/features/tokens/customTokens'
import { currencyId } from 'uniswap/src/utils/currencyId'

/**
 * 自定义代币信息配置
 */
export interface CustomTokenInfo {
  /** 代币价格（USD，每单位） */
  priceUSD?: number
  /** 代币 Logo URL */
  logoURI?: string
  /** 代币名称 */
  name?: string
  /** 代币符号 */
  symbol?: string
}

/**
 * 自定义代币配置映射
 * Key: currencyId (chainId:address)
 * Value: 自定义代币信息
 */
const customTokenConfigs: Map<string, CustomTokenInfo> = new Map()

/**
 * 设置自定义代币信息
 * @param currency 代币
 * @param info 自定义信息
 */
export function setCustomTokenInfo(currency: Currency, info: CustomTokenInfo): void {
  const id = currencyId(currency)
  if (!id) {
    console.warn('[setCustomTokenInfo] 无法生成 currencyId:', currency)
    return
  }
  customTokenConfigs.set(id.toLowerCase(), info)
  console.log('[setCustomTokenInfo] 设置自定义代币信息:', { currencyId: id, info })
}

/**
 * 获取自定义代币信息
 * @param currency 代币
 * @returns 自定义信息，如果不存在则返回 undefined
 */
export function getCustomTokenInfo(currency?: Currency): CustomTokenInfo | undefined {
  if (!currency) {
    return undefined
  }

  const id = currencyId(currency)
  if (!id) {
    return undefined
  }
  return customTokenConfigs.get(id.toLowerCase())
}

/**
 * 获取代币价格（优先使用内存配置，其次从 localStorage 读取自定义代币）
 * @param currency 代币
 * @returns 代币价格（USD），如果未设置自定义价格则返回 undefined
 */
export function getTokenPrice(currency?: Currency): number | undefined {
  if (!currency) {
    return undefined
  }

  // 1. 优先检查内存中的自定义配置
  const customInfo = getCustomTokenInfo(currency)
  if (customInfo?.priceUSD !== undefined && customInfo.priceUSD > 0) {
    console.log('[getTokenPrice] 使用内存中的自定义价格:', {
      symbol: currency.symbol,
      price: customInfo.priceUSD,
    })
    return customInfo.priceUSD
  }

  // 2. 如果内存中没有，尝试从 localStorage 读取自定义代币信息
  // 注意：自定义代币不包含原生代币（如 ETH、BNB），只匹配 ERC20 代币
  if (typeof window !== 'undefined' && !currency.isNative) {
    try {
      const customTokens = getCustomTokens()
      
      // 查找匹配的自定义代币（通过 chainId 和 address 匹配，地址不区分大小写）
      const matchedToken = customTokens.find(
        (token) =>
          token.chainId === currency.chainId &&
          token.address.toLowerCase() === currency.address.toLowerCase() &&
          token.priceUSD !== undefined &&
          token.priceUSD !== null &&
          token.priceUSD > 0
      )

      if (matchedToken?.priceUSD) {
        console.log('[getTokenPrice] 使用 localStorage 中的自定义代币价格:', {
          symbol: currency.symbol,
          chainId: currency.chainId,
          address: currency.address,
          price: matchedToken.priceUSD,
        })
        return matchedToken.priceUSD
      }
    } catch (error) {
      // 如果获取失败（例如在服务端渲染时），静默忽略
      console.debug('[getTokenPrice] 无法从 localStorage 读取自定义代币:', error)
    }
  }

  return undefined
}

/**
 * 清除所有自定义代币配置
 */
export function clearCustomTokenConfigs(): void {
  customTokenConfigs.clear()
  console.log('[clearCustomTokenConfigs] 已清除所有自定义代币配置')
}

/**
 * 批量设置自定义代币信息
 * @param configs 代币配置数组
 */
export function setCustomTokenConfigs(
  configs: Array<{ currency: Currency; info: CustomTokenInfo }>
): void {
  configs.forEach(({ currency, info }) => {
    setCustomTokenInfo(currency, info)
  })
}

