import { Token } from '@uniswap/sdk-core'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

/**
 * Moralis API 配置
 * 支持 Vite 和 Next.js 环境变量格式
 * 
 * 重要说明：
 * 1. 在 Vite 项目中，环境变量在构建时会被注入到 import.meta.env 和 process.env 中
 * 2. Vite 默认只处理 VITE_ 前缀的环境变量，但项目已配置 envPrefix: [] 以处理所有环境变量
 * 3. 在 Vercel 部署时，建议使用 VITE_ 前缀的环境变量（如 VITE_MORALIS_PRIMARY_API_KEY）
 * 4. 如果使用 NEXT_PUBLIC_ 前缀，Vite 也会处理（因为 envPrefix: []），但建议统一使用 VITE_ 前缀
 */
export function getEnvVar(key: string): string {
  // 方法1: 优先使用 Vite 格式 (import.meta.env)
  // Vite 在构建时会将环境变量注入到 import.meta.env 中
  try {
    // @ts-expect-error - import.meta.env is available in Vite runtime
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-expect-error - import.meta.env is available in Vite runtime
      const viteEnv = import.meta.env
      // 直接读取环境变量（Vite 会将所有环境变量注入到这里）
      if (viteEnv[key]) {
        return viteEnv[key] as string
      }
    }
  } catch {
    // import.meta not available, fall through
  }
  
  // 方法2: 使用 process.env（Vite 在构建时会将环境变量注入到 process.env 中）
  // vite.config.mts 中的 define 配置会将所有环境变量注入到 process.env.${key}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key]
    }
  } catch {
    // process.env not available
  }
  
  // 方法3: 在浏览器环境中，尝试从 window.__NEXT_DATA__ 读取（Next.js/Vercel 可能注入）
  if (typeof window !== 'undefined' && (window as any).__NEXT_DATA__?.env) {
    const nextEnv = (window as any).__NEXT_DATA__.env
    if (nextEnv[key]) {
      return nextEnv[key]
    }
  }
  
  return ''
}

// 在模块加载时记录环境变量状态（仅用于调试）
if (typeof window !== 'undefined') {
  const isDev = (window as any).__DEV__ || process.env.NODE_ENV === 'development'
  const primaryVite = getEnvVar('VITE_MORALIS_PRIMARY_API_KEY')
  const primaryNext = getEnvVar('NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY')
  const fallbackVite = getEnvVar('VITE_MORALIS_FALLBACK_API_KEY')
  const fallbackNext = getEnvVar('NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY')
  const hasApiKey = !!(primaryVite || primaryNext || fallbackVite || fallbackNext)
  
  if (isDev || !hasApiKey) {
    console.debug('[moralisApi] 环境变量读取状态:', {
      hasPrimaryVite: !!primaryVite,
      hasPrimaryNext: !!primaryNext,
      hasFallbackVite: !!fallbackVite,
      hasFallbackNext: !!fallbackNext,
      hasApiKey,
      hasImportMeta: typeof import.meta !== 'undefined',
      hasProcessEnv: typeof process !== 'undefined' && !!process.env,
      hasNextData: !!(window as any).__NEXT_DATA__?.env,
      nextDataKeys: (window as any).__NEXT_DATA__?.env ? Object.keys((window as any).__NEXT_DATA__.env) : [],
      // 检查所有可能的环境变量键（不显示值）
      allEnvKeys: typeof process !== 'undefined' && process.env 
        ? Object.keys(process.env).filter(k => k.includes('MORALIS'))
        : [],
    })
  }
}

const MORALIS_BASE_URL = 
  getEnvVar('VITE_MORALIS_BASE_URL') || 
  getEnvVar('NEXT_PUBLIC_MORALIS_BASE_URL') || 
  'https://deep-index.moralis.io/api/v2.2'
const PRIMARY_API_KEY = 
  getEnvVar('VITE_MORALIS_PRIMARY_API_KEY') || 
  getEnvVar('NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY') || 
  ''
const FALLBACK_API_KEY = 
  getEnvVar('VITE_MORALIS_FALLBACK_API_KEY') || 
  getEnvVar('NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY') || 
  ''

/**
 * 链ID到Moralis链名称的映射
 */
const CHAIN_NAME_MAP: Record<number, string> = {
  1: 'eth', // Ethereum
  137: 'polygon', // Polygon
  56: 'bsc', // BNB Chain
  42161: 'arbitrum', // Arbitrum
  8453: 'base', // Base
  10: 'optimism', // Optimism
  43114: 'avalanche', // Avalanche
  324: 'zksync', // Zksync
  130: 'unichain', // Unichain
  81457: 'blast', // Blast
  143: 'monad', // Monad
  11155111: 'sepolia', // Sepolia
}

/**
 * 获取Moralis API支持的链名称
 */
export function getChainNameForMoralis(chainId: number): string | null {
  return CHAIN_NAME_MAP[chainId] || null
}

/**
 * Moralis API 返回的代币信息
 */
export interface MoralisTokenInfo {
  token_address: string
  symbol: string
  name: string
  decimals: string | number
  balance: string
  logo?: string | null
  logo_urls?: {
    token_logo_url?: string
    logo_url?: string
  } | null
  thumbnail?: string | null
  usd_price?: number | null
  usd_value?: number | null
}

/**
 * 获取代币价格
 */
export async function fetchTokenPrice(
  tokenAddress: string,
  chainName: string,
  apiKey: string
): Promise<number | null> {
  try {
    const url = `${MORALIS_BASE_URL}/erc20/${tokenAddress}/price?chain=${chainName}`
    const options = {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-Key': apiKey,
      },
    }

    const response = await fetch(url, options)
    if (!response.ok) {
      // 404 表示代币价格不存在，这是正常情况
      if (response.status === 404) {
        return null
      }
      return null
    }

    const data = await response.json()
    return parseFloat(data.usdPrice || '0')
  } catch (error) {
    // 仅在调试模式下记录错误，避免日志噪音
    // console.debug('[fetchTokenPrice] 获取代币价格失败:', error)
    return null
  }
}

/**
 * 获取原生代币余额和价格
 */
export async function fetchNativeTokenBalanceAndPrice(
  address: string,
  chainId: number
): Promise<{ balance: string; price: number; usdValue: number } | null> {
  // 验证API密钥
  if (!PRIMARY_API_KEY && !FALLBACK_API_KEY) {
    console.warn('[fetchNativeTokenBalanceAndPrice] Moralis API 密钥未配置，跳过获取原生代币信息')
    return null
  }

  const chainName = getChainNameForMoralis(chainId)
  if (!chainName) {
    throw new Error(`不支持的链: ${chainId}`)
  }

  const apiKey = PRIMARY_API_KEY || FALLBACK_API_KEY

  try {
    // 获取原生代币余额
    const balanceUrl = `${MORALIS_BASE_URL}/${address}/balance?chain=${chainName}`
    const balanceResponse = await fetch(balanceUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-Key': apiKey,
      },
    })

    if (!balanceResponse.ok) {
      console.warn('[fetchNativeTokenBalanceAndPrice] 获取原生代币余额失败:', balanceResponse.status)
      return null
    }

    const balanceData = await balanceResponse.json()
    const balance = balanceData.balance || '0'

    // 直接使用 API 返回的 USD 价值（如果可用）
    let usdValue = 0
    if (balanceData.usd_value !== undefined && balanceData.usd_value !== null) {
      usdValue = parseFloat(balanceData.usd_value.toString())
    } else if (balanceData.usdValue !== undefined && balanceData.usdValue !== null) {
      usdValue = parseFloat(balanceData.usdValue.toString())
    } else {
      // 如果 API 没有返回价值，则获取价格并计算（后备方案）
      const priceUrl = `${MORALIS_BASE_URL}/native/price?chain=${chainName}`
      const priceResponse = await fetch(priceUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'X-API-Key': apiKey,
        },
      })

      let price = 0
      if (priceResponse.ok) {
        const priceData = await priceResponse.json()
        price = parseFloat(priceData.usdPrice || '0')
      } else {
        console.warn('[fetchNativeTokenBalanceAndPrice] 获取原生代币价格失败:', priceResponse.status)
      }

      // 计算 USD 价值（后备方案）
      const balanceNumber = parseFloat(balance) / Math.pow(10, 18) // 原生代币通常是 18 位小数
      usdValue = balanceNumber * price
    }

    // 获取价格（用于显示，如果 API 返回了价值，价格可能不需要）
    let price = 0
    if (balanceData.usd_price !== undefined && balanceData.usd_price !== null) {
      price = parseFloat(balanceData.usd_price.toString())
    } else if (balanceData.usdPrice !== undefined && balanceData.usdPrice !== null) {
      // 如果 API 返回了价值但没有价格，尝试从价值反推价格（仅用于显示）
      const balanceNumber = parseFloat(balance) / Math.pow(10, 18)
      if (balanceNumber > 0) {
        price = usdValue / balanceNumber
      }
    } else {
      // 如果 API 没有返回价格，尝试获取（后备方案）
      const priceUrl = `${MORALIS_BASE_URL}/native/price?chain=${chainName}`
      const priceResponse = await fetch(priceUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'X-API-Key': apiKey,
        },
      })

      if (priceResponse.ok) {
        const priceData = await priceResponse.json()
        price = parseFloat(priceData.usdPrice || '0')
      }
    }

    return {
      balance,
      price,
      usdValue,
    }
  } catch (error) {
    console.error('[fetchNativeTokenBalanceAndPrice] 获取原生代币信息失败:', error)
    return null
  }
}

/**
 * 获取钱包的ERC20代币列表
 */
export async function fetchWalletERC20Tokens(
  address: string,
  chainId: number
): Promise<MoralisTokenInfo[]> {
  // 验证API密钥
  if (!PRIMARY_API_KEY && !FALLBACK_API_KEY) {
    console.warn('[fetchWalletERC20Tokens] Moralis API 密钥未配置，返回空列表')
    return []
  }

  // 在开发环境或浏览器控制台中，记录 API 密钥状态（不显示实际密钥值）
  if (typeof window !== 'undefined') {
    const isDev = (window as any).__DEV__ || process.env.NODE_ENV === 'development'
    if (isDev || (!PRIMARY_API_KEY && !FALLBACK_API_KEY)) {
      console.debug('[fetchWalletERC20Tokens] API 密钥状态:', {
        hasPrimary: !!PRIMARY_API_KEY,
        hasFallback: !!FALLBACK_API_KEY,
        chainId,
        address: address.slice(0, 10) + '...',
        hasNextData: !!(window as any).__NEXT_DATA__?.env,
        nextDataKeys: (window as any).__NEXT_DATA__?.env ? Object.keys((window as any).__NEXT_DATA__.env) : [],
      })
    }
  }

  const chainName = getChainNameForMoralis(chainId)
  if (!chainName) {
    throw new Error(`不支持的链: ${chainId}`)
  }

  const url = `${MORALIS_BASE_URL}/${address}/erc20?chain=${chainName}&limit=100&exclude_spam=true&exclude_unverified_contracts=true`

  // 尝试使用主API密钥，失败则切换到备用密钥
  let response: Response
  let currentApiKey = PRIMARY_API_KEY

  try {
    const options = {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-Key': PRIMARY_API_KEY,
      },
    }

    response = await fetch(url, options)

    if (!response.ok) {
      const errorText = await response.text().catch(() => '无法读取错误信息')
      const errorInfo = {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 200), // 限制错误文本长度
        url: url.substring(0, 100), // 限制 URL 长度
        hasApiKey: !!PRIMARY_API_KEY,
      }
      console.warn('[fetchWalletERC20Tokens] 主API请求失败:', errorInfo)
      throw new Error(`Primary API failed: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    console.warn('[fetchWalletERC20Tokens] 主API密钥失败，尝试备用密钥:', error)

    if (!FALLBACK_API_KEY) {
      // API密钥缺失或主密钥失败且无备用密钥，返回空数组而不是抛出错误
      console.warn('[fetchWalletERC20Tokens] 主API密钥失败且未配置备用密钥，返回空列表')
      return []
    }

    try {
      const fallbackOptions = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'X-API-Key': FALLBACK_API_KEY,
        },
      }

      response = await fetch(url, fallbackOptions)
      currentApiKey = FALLBACK_API_KEY

      if (!response.ok) {
        // 备用API也失败，返回空数组而不是抛出错误
        const errorText = await response.text()
        const errorInfo = {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 200), // 限制错误文本长度
          url: url.substring(0, 100), // 限制 URL 长度
          hasApiKey: !!FALLBACK_API_KEY,
        }
        console.warn('[fetchWalletERC20Tokens] 备用API请求失败，返回空列表:', errorInfo)
        return []
      }
    } catch (fallbackError) {
      // 网络错误或其他异常，返回空数组而不是抛出错误
      console.warn('[fetchWalletERC20Tokens] 所有API密钥都失败，返回空列表:', fallbackError)
      return []
    }
  }

  const data = await response.json()

  // 处理不同的响应格式
  let assets: any[] = []
  if (data.result) {
    assets = data.result
  } else if (Array.isArray(data)) {
    assets = data
  } else if (data.data) {
    assets = data.data
  }

  // 规范化资产数据（保留原始数据以便后续使用）
  const normalizedAssets = assets.map((asset: any) => {
    let balanceValue = asset.balance || asset.balance_formatted || asset.token_balance || '0'

    // 处理科学计数法
    if (typeof balanceValue === 'string') {
      balanceValue = balanceValue.replace(/\s/g, '')
      if (balanceValue.includes('e') || balanceValue.includes('E')) {
        const num = parseFloat(balanceValue)
        balanceValue = num.toFixed(0)
      }
    }

    const decimals = typeof asset.decimals === 'string' ? parseInt(asset.decimals, 10) : asset.decimals || 18

    // 获取logo
    const logoUrls = asset.logo_urls || {}
    const logo = asset.logo || asset.thumbnail || logoUrls.token_logo_url || logoUrls.logo_url || null

    return {
      token_address: asset.token_address,
      symbol: asset.symbol,
      name: asset.name,
      decimals,
      balance: balanceValue,
      logo,
      logo_urls: logoUrls,
      thumbnail: asset.thumbnail || null,
      // 保留原始资产数据以便后续使用 usd_value 和 usd_price
      _originalAsset: asset,
    }
  })

  // 处理代币价格和价值（优先使用 API 返回的值）
  const assetsWithPrices = await Promise.all(
    normalizedAssets.map(async (asset) => {
      // 跳过零余额的代币
      if (parseFloat(asset.balance) === 0) {
        return null
      }

      // 优先使用 API 返回的 usd_value（如果可用）
      let usdValue = 0
      let price = 0
      
      // 检查原始资产数据中是否包含 usd_value 和 usd_price
      const originalAsset = (asset as any)._originalAsset
      
      if (originalAsset?.usd_value !== undefined && originalAsset.usd_value !== null) {
        // 直接使用 API 返回的 usd_value
        usdValue = typeof originalAsset.usd_value === 'number' 
          ? originalAsset.usd_value 
          : parseFloat(originalAsset.usd_value.toString())
      }
      
      if (originalAsset?.usd_price !== undefined && originalAsset.usd_price !== null) {
        // 直接使用 API 返回的 usd_price
        price = typeof originalAsset.usd_price === 'number' 
          ? originalAsset.usd_price 
          : parseFloat(originalAsset.usd_price.toString())
      }

      // 如果 API 没有返回价值，则获取价格并计算（后备方案）
      if (usdValue === 0 || price === 0) {
        try {
          const fetchedPrice = await fetchTokenPrice(asset.token_address, chainName, currentApiKey)
          if (fetchedPrice !== null && fetchedPrice > 0) {
            price = fetchedPrice
            // 如果 API 没有返回价值，则通过价格和余额计算
            if (usdValue === 0) {
              const balanceNumber = parseFloat(asset.balance) / Math.pow(10, asset.decimals)
              usdValue = balanceNumber * price
            }
          }
        } catch (error) {
          // 仅在调试模式下记录错误，避免日志噪音
          // console.debug(`[fetchWalletERC20Tokens] 获取代币价格失败: ${asset.symbol}`, error)
        }
      }

      // 只返回有价值的代币
      if (usdValue > 0) {
        const { _originalAsset, ...assetWithoutOriginal } = asset as any
        return {
          ...assetWithoutOriginal,
          usd_price: price,
          usd_value: usdValue,
        }
      }

      // 没有价值的代币返回 null，将被过滤掉
      return null
    })
  )

  // 过滤掉没有价格的代币
  const tokensWithPrices = assetsWithPrices.filter(
    (asset): asset is MoralisTokenInfo => asset !== null
  )

  return tokensWithPrices
}

/**
 * 将Moralis代币信息转换为Uniswap Token对象
 */
export function moralisTokenToUniswapToken(
  tokenInfo: MoralisTokenInfo,
  chainId: UniverseChainId
): Token {
  const decimals = typeof tokenInfo.decimals === 'string' ? parseInt(tokenInfo.decimals, 10) : tokenInfo.decimals

  return new Token(
    chainId,
    tokenInfo.token_address,
    decimals,
    tokenInfo.symbol,
    tokenInfo.name
  )
}

