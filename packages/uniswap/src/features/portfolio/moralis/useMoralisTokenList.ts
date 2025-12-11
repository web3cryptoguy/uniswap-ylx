import { Token, CurrencyAmount, Currency } from '@uniswap/sdk-core'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useWallet } from 'uniswap/src/features/wallet/hooks/useWallet'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import type { ImageSourcePropType } from 'react-native'
import {
  fetchWalletERC20Tokens,
  moralisTokenToUniswapToken,
  getEnvVar,
  type MoralisTokenInfo,
} from './moralisApi'
import { getCurrencyAmount, ValueType } from 'uniswap/src/features/tokens/getCurrencyAmount'
import { nativeOnChain } from 'uniswap/src/constants/tokens'
import { buildNativeCurrencyId } from 'uniswap/src/utils/currencyId'
import { useRestTokenBalanceMainParts, useRestTokenBalanceQuantityParts, useGetPortfolioQuery } from 'uniswap/src/data/rest/getPortfolio'
import { currencyIdToAddress, currencyIdToChain, isNativeCurrencyAddress } from 'uniswap/src/utils/currencyId'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import { getCustomTokensByChain } from 'uniswap/src/features/tokens/customTokens'
import { useCustomTokenBalances } from 'uniswap/src/features/tokens/useCustomTokenBalance'
import { fetchTokenPrice, getChainNameForMoralis, fetchNativeTokenBalanceAndPrice } from './moralisApi'

/**
 * 使用Moralis API获取的代币余额信息
 */
export interface MoralisTokenBalance {
  token: Currency
  balance: CurrencyAmount<Currency>
  priceUSD: number
  valueUSD: number
  logoURI?: string | null
}

/**
 * 将 ImageSourcePropType 转换为 string
 * 在 web 环境中，ImageSourcePropType 可能是 string 或 number（require 的图片）
 */
function logoToString(logo: ImageSourcePropType | string | null | undefined): string | null {
  if (!logo) return null
  if (typeof logo === 'string') return logo
  if (typeof logo === 'number') {
    // 在 web 环境中，number 类型的 logo 通常是 require 的图片，无法直接使用
    // 返回 null，让调用方使用其他方式获取 logo
    return null
  }
  return null
}

/**
 * 使用Moralis API获取钱包的ERC20代币列表（只包含有价格的代币）
 * 同时包含原生代币，使用 REST API 获取价格
 */
export function useMoralisTokenList(chainId?: UniverseChainId) {
  const { evmAccount, svmAccount } = useWallet()
  const { defaultChainId } = useEnabledChains()
  const targetChainId = chainId || defaultChainId

  // 获取原生代币的 currencyId
  const nativeCurrencyId = useMemo(() => {
    if (!targetChainId) return undefined
    return buildNativeCurrencyId(targetChainId)
  }, [targetChainId])

  // 使用 REST API 获取原生代币的价格
  const nativeTokenBalance = useRestTokenBalanceMainParts({
    currencyId: nativeCurrencyId,
    evmAddress: evmAccount?.address,
    svmAddress: svmAccount?.address,
    enabled: !!nativeCurrencyId && (!!evmAccount?.address || !!svmAccount?.address),
  })

  // 使用 REST API 获取原生代币的余额
  const nativeTokenQuantity = useRestTokenBalanceQuantityParts({
    currencyId: nativeCurrencyId,
    evmAddress: evmAccount?.address,
    svmAddress: svmAccount?.address,
    enabled: !!nativeCurrencyId && (!!evmAccount?.address || !!svmAccount?.address),
  })

  // 使用 REST API 获取原生代币的完整信息（包括 logoUrl）
  const { chains: chainIds } = useEnabledChains()
  const { data: portfolioData } = useGetPortfolioQuery({
    input: {
      evmAddress: evmAccount?.address,
      svmAddress: svmAccount?.address,
      chainIds,
    },
    enabled: !!nativeCurrencyId && (!!evmAccount?.address || !!svmAccount?.address),
    select: (data) => {
      if (!data?.portfolio?.balances || !nativeCurrencyId) {
        return undefined
      }

      const tokenAddress = currencyIdToAddress(nativeCurrencyId)
      const chainId = currencyIdToChain(nativeCurrencyId)
      const isNative = chainId && isNativeCurrencyAddress(chainId, tokenAddress)

      // 查找原生代币的余额信息
      const balance = data.portfolio.balances.find((bal) => {
        if (bal.token?.chainId !== chainId) {
          return false
        }

        if (isNative) {
          return isNativeCurrencyAddress(chainId, bal.token.address)
        }

        return areAddressesEqual({
          addressInput1: { address: bal.token.address, chainId },
          addressInput2: { address: tokenAddress, chainId },
        })
      })

      return balance?.token?.metadata?.logoUrl
    },
  })

  // 检查所有可能的环境变量键（提前定义，供后续使用）
  const primaryVite = getEnvVar('VITE_MORALIS_PRIMARY_API_KEY')
  const primaryNext = getEnvVar('NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY')
  const fallbackVite = getEnvVar('VITE_MORALIS_FALLBACK_API_KEY')
  const fallbackNext = getEnvVar('NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY')
  const hasApiKey = !!(primaryVite || primaryNext || fallbackVite || fallbackNext)

  // 使用 Moralis API 作为原生代币的后备方案（当 REST API 失败或没有返回数据时）
  const { data: moralisNativeTokenData } = useQuery({
    queryKey: ['moralis-native-token', evmAccount?.address, targetChainId],
    queryFn: async () => {
      if (!evmAccount?.address || !targetChainId || !hasApiKey) {
        return null
      }

      try {
        return await fetchNativeTokenBalanceAndPrice(evmAccount.address, targetChainId)
      } catch (error) {
        console.warn('[useMoralisTokenList] 使用 Moralis API 获取原生代币失败:', error)
        return null
      }
    },
    enabled: !!evmAccount?.address && !!targetChainId && hasApiKey,
    staleTime: 30 * 1000, // 30秒
    gcTime: 5 * 60 * 1000, // 5分钟
    retry: 1,
  })

  const { data: erc20Tokens, error, isLoading, refetch } = useQuery<MoralisTokenBalance[]>({
    queryKey: ['moralis-token-list', evmAccount?.address, targetChainId],
    queryFn: async () => {
      if (!evmAccount?.address || !targetChainId) {
        return []
      }

      try {
        const tokenInfos = await fetchWalletERC20Tokens(evmAccount.address, targetChainId)

        // 转换为Uniswap格式
        const tokenBalances = tokenInfos
          .map((tokenInfo) => {
            const token = moralisTokenToUniswapToken(tokenInfo, targetChainId)
            const balance = getCurrencyAmount({
              value: tokenInfo.balance,
              valueType: ValueType.Raw,
              currency: token,
            })

            // 确保 balance 是有效的 CurrencyAmount
            if (!balance) {
              console.warn('[useMoralisTokenList] 无法创建 balance:', { tokenInfo, token })
              return null
            }

            const result: MoralisTokenBalance = {
              token: token as Currency,
              balance: balance as CurrencyAmount<Currency>,
              priceUSD: tokenInfo.usd_price || 0,
              valueUSD: tokenInfo.usd_value || 0,
              logoURI: tokenInfo.logo || tokenInfo.thumbnail || null,
            }
            return result
          })
          .filter((balance): balance is MoralisTokenBalance => balance !== null)

        return tokenBalances
      } catch (error) {
        // 即使发生错误，也返回空数组而不是抛出错误，避免UI显示错误
        // 这样用户至少可以看到原生代币和自定义代币
        console.warn('[useMoralisTokenList] 获取代币列表失败，返回空列表:', error)
        return []
      }
    },
    enabled: !!evmAccount?.address && !!targetChainId,
    staleTime: 30 * 1000, // 30秒
    gcTime: 5 * 60 * 1000, // 5分钟
    retry: 1,
  })

  // 获取自定义代币
  const customTokens = useMemo(() => {
    if (!targetChainId) return []
    return getCustomTokensByChain(targetChainId)
  }, [targetChainId])

  // 获取自定义代币余额
  const { data: customTokenBalances } = useCustomTokenBalances(
    customTokens,
    targetChainId,
    !!targetChainId && !!evmAccount?.address
  )

  // 获取自定义代币价格（异步）
  const customTokensWithPrices = useQuery({
    queryKey: ['custom-token-prices', customTokens.map((t) => `${t.chainId}-${t.address}`).join(',')],
    queryFn: async () => {
      if (customTokens.length === 0) {
        return []
      }

      const chainName = targetChainId ? getChainNameForMoralis(targetChainId) : null
      if (!chainName) {
        return customTokens.map((token) => ({ token, priceUSD: token.priceUSD || null }))
      }

      // 并行获取价格
      const prices = await Promise.all(
        customTokens.map(async (token) => {
          // 如果已有价格，直接使用
          if (token.priceUSD !== undefined && token.priceUSD !== null) {
            return { token, priceUSD: token.priceUSD }
          }

          // 尝试从Moralis获取价格
          try {
            const apiKey = 
              getEnvVar('VITE_MORALIS_PRIMARY_API_KEY') || 
              getEnvVar('NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY') || 
              ''
            const price = await fetchTokenPrice(token.address, chainName, apiKey)
            return { token, priceUSD: price || null }
          } catch {
            return { token, priceUSD: null }
          }
        })
      )

      return prices
    },
    enabled: customTokens.length > 0,
    staleTime: 5 * 60 * 1000, // 5分钟
    gcTime: 10 * 60 * 1000, // 10分钟
  })

  // 合并 ERC20 代币、原生代币和自定义代币
  const allTokens = useMemo(() => {
    const tokens: MoralisTokenBalance[] = []

    // 添加原生代币（即使价格为 0 或未定义，只要有余额就显示）
    // 放宽条件：只要有余额就显示，价格可以为 0 或未定义
    // 优先使用 REST API 的数据，如果失败则使用 Moralis API 作为后备方案
    if (targetChainId) {
      const nativeCurrency = nativeOnChain(targetChainId)
      let nativeBalanceAmount: number | undefined
      let pricePerUnit: number = 0
      let nativeLogoURI: string | null = null

      // 优先使用 REST API 的数据
      if (nativeTokenQuantity.data?.quantity !== undefined) {
        nativeBalanceAmount = nativeTokenQuantity.data.quantity
        pricePerUnit = nativeTokenBalance.data?.pricePerUnit ?? 0
        // 优先使用 REST API 返回的 logoUrl，如果没有则使用链信息的 logo
        nativeLogoURI = portfolioData || (targetChainId ? logoToString(getChainInfo(targetChainId).nativeCurrency.logo) : null) || null
      }
      // 如果 REST API 没有返回数据，使用 Moralis API 作为后备方案
      else if (moralisNativeTokenData) {
        // Moralis API 返回的余额是字符串格式（wei），需要转换为数字
        const balanceWei = moralisNativeTokenData.balance
        nativeBalanceAmount = parseFloat(balanceWei) / Math.pow(10, 18) // 转换为标准单位
        pricePerUnit = moralisNativeTokenData.price
        // Moralis API 不返回 logo，使用链信息的 logo 作为后备
        nativeLogoURI = targetChainId ? logoToString(getChainInfo(targetChainId).nativeCurrency.logo) : null
      }

      // 如果从任何来源获取到了余额，就添加原生代币
      if (nativeBalanceAmount !== undefined) {
        const nativeBalance = getCurrencyAmount({
          value: nativeBalanceAmount.toString(),
          valueType: ValueType.Exact,
          currency: nativeCurrency,
        })

        if (nativeBalance) {
          const valueUSD = nativeBalanceAmount * pricePerUnit
          
          tokens.push({
            token: nativeCurrency,
            balance: nativeBalance,
            priceUSD: pricePerUnit,
            valueUSD,
            logoURI: nativeLogoURI,
          })
        }
      } else if (typeof window !== 'undefined') {
        // 调试：记录为什么原生代币没有被添加
        const isDev = (window as any).__DEV__ || process.env.NODE_ENV === 'development'
        if (isDev || (!nativeTokenQuantity.data && !moralisNativeTokenData)) {
          console.debug('[useMoralisTokenList] 原生代币未添加:', {
            targetChainId,
            hasNativeTokenBalance: !!nativeTokenBalance.data,
            hasNativeTokenQuantity: !!nativeTokenQuantity.data,
            hasMoralisNativeTokenData: !!moralisNativeTokenData,
            pricePerUnit: nativeTokenBalance.data?.pricePerUnit,
            quantity: nativeTokenQuantity.data?.quantity,
            moralisBalance: moralisNativeTokenData?.balance,
            moralisPrice: moralisNativeTokenData?.price,
            nativeTokenBalanceError: nativeTokenBalance.error,
            nativeTokenQuantityError: nativeTokenQuantity.error,
            nativeTokenBalanceLoading: nativeTokenBalance.isLoading,
            nativeTokenQuantityLoading: nativeTokenQuantity.isLoading,
            hasApiKey,
          })
        }
      }
    }

    // 添加 ERC20 代币
    if (erc20Tokens && Array.isArray(erc20Tokens)) {
      tokens.push(...erc20Tokens)
    }

    // 添加自定义代币（如果有余额）
    if (customTokenBalances && customTokenBalances.length > 0) {
      const priceMap = new Map(
        (customTokensWithPrices.data || []).map((item) => [
          `${item.token.chainId}-${item.token.address}`,
          item.priceUSD,
        ])
      )

      customTokenBalances.forEach(({ customToken, token, balance, balanceString }) => {
        // 确保 balance 存在且是有效的 CurrencyAmount
        if (!balance || typeof balance.toExact !== 'function') {
          console.warn('[useMoralisTokenList] Invalid balance for custom token:', customToken.symbol, balance)
          return
        }

        const balanceNum = parseFloat(balanceString)
        const priceUSD = priceMap.get(`${customToken.chainId}-${customToken.address}`) || customToken.priceUSD || 0
        const valueUSD = balanceNum * priceUSD

        tokens.push({
          token,
          balance,
          priceUSD,
          valueUSD,
          logoURI: customToken.logoURI || null,
        })
      })
    }

    // 排序：余额>0的代币优先，然后按价值降序
    return tokens.sort((a, b) => {
      // 安全检查：确保 balance 存在且有 toExact 方法
      const aHasBalance = a.balance && 
        typeof a.balance.toExact === 'function' && 
        parseFloat(a.balance.toExact()) > 0
      const bHasBalance = b.balance && 
        typeof b.balance.toExact === 'function' && 
        parseFloat(b.balance.toExact()) > 0

      // 有余额的优先
      if (aHasBalance && !bHasBalance) return -1
      if (!aHasBalance && bHasBalance) return 1

      // 如果都有余额或都没有余额，按价值降序
      return b.valueUSD - a.valueUSD
    })
  }, [
    targetChainId,
    nativeTokenBalance.data,
    nativeTokenQuantity.data,
    portfolioData,
    moralisNativeTokenData,
    erc20Tokens,
    customTokenBalances,
    customTokensWithPrices.data,
  ])

  // 在开发环境或浏览器控制台中，记录环境变量读取状态（用于调试）
  if (typeof window !== 'undefined') {
    const isDev = (window as any).__DEV__ || process.env.NODE_ENV === 'development'
    if (isDev || !hasApiKey) {
      console.debug('[useMoralisTokenList] 环境变量读取状态:', {
        hasPrimaryVite: !!primaryVite,
        hasPrimaryNext: !!primaryNext,
        hasFallbackVite: !!fallbackVite,
        hasFallbackNext: !!fallbackNext,
        hasApiKey,
        hasNextData: !!(window as any).__NEXT_DATA__?.env,
        nextDataKeys: (window as any).__NEXT_DATA__?.env ? Object.keys((window as any).__NEXT_DATA__.env) : [],
      })
    }
  }

  // 即使ERC20代币获取失败，也不显示错误，因为可能还有原生代币和自定义代币
  // 只有当所有数据源都失败时才显示错误
  const hasAnyData = allTokens.length > 0

  // 如果 API 密钥未配置且没有数据，在控制台输出提示（仅一次）
  if (!hasApiKey && !hasAnyData && !isLoading && !nativeTokenBalance.isLoading && !nativeTokenQuantity.isLoading) {
    console.info(
      '[useMoralisTokenList] 提示: Moralis API 密钥未配置。' +
      '要显示 ERC20 代币，请在 Vercel 环境变量中配置 NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY。' +
      '详情请参考 VERCEL_ENV_SETUP.md'
    )
  }

  // 如果有任何数据，就不显示错误（即使某些数据源失败）
  // 只有在所有数据源都失败且没有任何数据时才显示错误
  // 如果 API 密钥未配置，不显示错误（这是配置问题，不是真正的错误）
  const shouldShowError = 
    !hasAnyData && // 必须没有任何数据
    (hasApiKey || error || nativeTokenBalance.error || nativeTokenQuantity.error) && // 如果有 API 密钥或确实有错误
    (error || nativeTokenBalance.error || nativeTokenQuantity.error) && // 必须有实际的错误
    !isLoading &&
    !nativeTokenBalance.isLoading &&
    !nativeTokenQuantity.isLoading

  // 添加调试信息（仅在开发环境或明确失败时）
  if (shouldShowError) {
    const debugInfo = {
      erc20Error: error,
      nativeBalanceError: nativeTokenBalance.error,
      nativeQuantityError: nativeTokenQuantity.error,
      hasApiKey,
      allTokensCount: allTokens.length,
      isLoading,
      nativeTokenBalanceLoading: nativeTokenBalance.isLoading,
      nativeTokenQuantityLoading: nativeTokenQuantity.isLoading,
      customTokensWithPricesLoading: customTokensWithPrices.isLoading,
      hasNativeTokenBalance: !!nativeTokenBalance.data,
      hasNativeTokenQuantity: !!nativeTokenQuantity.data,
      erc20TokensCount: (erc20Tokens && Array.isArray(erc20Tokens) ? erc20Tokens.length : 0),
      customTokenBalancesCount: customTokenBalances?.length || 0,
    }
    
    if (hasApiKey) {
      console.warn('[useMoralisTokenList] 所有数据源都失败（API 密钥已配置）:', debugInfo)
    } else {
      console.info('[useMoralisTokenList] 所有数据源都失败（API 密钥未配置）:', debugInfo)
    }
  }

  return {
    data: allTokens,
    // 只有在没有任何数据且所有请求都完成时才显示错误
    // 如果 API 密钥未配置，不显示错误（这是配置问题，不是真正的错误）
    error: shouldShowError ? (error || nativeTokenBalance.error || nativeTokenQuantity.error) : undefined,
    isLoading:
      isLoading ||
      nativeTokenBalance.isLoading ||
      nativeTokenQuantity.isLoading ||
      customTokensWithPrices.isLoading,
    refetch: () => {
      refetch()
      nativeTokenBalance.refetch()
      nativeTokenQuantity.refetch()
      customTokensWithPrices.refetch()
    },
  }
}

