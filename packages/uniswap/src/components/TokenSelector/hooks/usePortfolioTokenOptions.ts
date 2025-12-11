import { GqlResult } from '@universe/api'
import { useMemo } from 'react'
import { OnchainItemListOptionType, TokenOption } from 'uniswap/src/components/lists/items/types'
import { filter } from 'uniswap/src/components/TokenSelector/filter'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useMoralisTokenList } from 'uniswap/src/features/portfolio/moralis/useMoralisTokenList'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { currencyId } from 'uniswap/src/utils/currencyId'

/**
 * 使用Moralis API获取"你的代币"列表（只包含有价格的代币）
 */
export function usePortfolioTokenOptions({
  evmAddress,
  svmAddress,
  chainFilter,
  searchFilter,
}: {
  evmAddress: Address | undefined
  svmAddress: Address | undefined
  chainFilter: UniverseChainId | null
  searchFilter?: string
}): GqlResult<TokenOption[] | undefined> {
  const { defaultChainId } = useEnabledChains()
  const targetChainId = chainFilter || defaultChainId

  // 使用Moralis API获取代币列表（只包含有价格的代币）
  const {
    data: moralisTokens,
    error,
    refetch,
    isLoading: loading,
  } = useMoralisTokenList(targetChainId || undefined)

  // 将Moralis代币转换为TokenOption格式
  const portfolioBalances: TokenOption[] | undefined = useMemo(() => {
    if (!moralisTokens || moralisTokens.length === 0) {
      return undefined
    }

    const tokenOptions = moralisTokens
      .map((tokenBalance) => {
        const id = currencyId(tokenBalance.token)
        if (!id) {
          return null
        }

        // 确保 balance 是有效的 CurrencyAmount
        if (!tokenBalance.balance || typeof tokenBalance.balance.toExact !== 'function') {
          console.warn('[usePortfolioTokenOptions] 无效的 balance:', tokenBalance)
          return null
        }
        
        // 直接创建CurrencyInfo对象
        const currencyInfo: CurrencyInfo = {
          currency: tokenBalance.token,
          currencyId: id,
          logoUrl: tokenBalance.logoURI || null,
          safetyInfo: undefined,
          spamCode: undefined,
        }

        return {
          type: OnchainItemListOptionType.Token,
          currencyInfo,
          quantity: parseFloat(tokenBalance.balance.toExact()),
          balanceUSD: tokenBalance.valueUSD,
        } as TokenOption
      })
      .filter((option): option is TokenOption => option !== null)

    // 排序：首行为原生代币，ERC20代币按价值（balanceUSD）降序排列
    return tokenOptions.sort((a, b) => {
      const aIsNative = a.currencyInfo.currency.isNative
      const bIsNative = b.currencyInfo.currency.isNative

      // 原生代币排在第一位
      if (aIsNative && !bIsNative) {
        return -1
      }
      if (!aIsNative && bIsNative) {
        return 1
      }

      // 如果都是原生代币或都不是原生代币，按价值降序排列
      const aValue = a.balanceUSD ?? 0
      const bValue = b.balanceUSD ?? 0
      return bValue - aValue
    })
  }, [moralisTokens])

  const filteredPortfolioBalances = useMemo(
    () => portfolioBalances && filter({ tokenOptions: portfolioBalances, chainFilter, searchFilter, hideWSOL: true }),
    [chainFilter, portfolioBalances, searchFilter],
  )

  // 即使有错误，如果数据为空，也不显示错误（可能只是没有代币，而不是真正的错误）
  // 只有在明确失败且没有任何数据时才显示错误
  // 确保在加载完成后再判断是否显示错误，避免闪烁
  const shouldShowError = !loading && !filteredPortfolioBalances && error

  return {
    data: filteredPortfolioBalances,
    // 只有在没有数据且明确失败时才显示错误
    error: shouldShowError ? error : undefined,
    refetch,
    loading,
  }
}
