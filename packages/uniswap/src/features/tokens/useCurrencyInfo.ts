import { GraphQLApi } from '@universe/api'
import { useMemo } from 'react'
import { getCommonBase } from 'uniswap/src/constants/routing'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { isUniverseChainId } from 'uniswap/src/features/chains/utils'
import { getCustomTokenLogoURI } from 'uniswap/src/features/tokens/customTokens'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { currencyIdToContractInput } from 'uniswap/src/features/dataApi/utils/currencyIdToContractInput'
import { gqlTokenToCurrencyInfo } from 'uniswap/src/features/dataApi/utils/gqlTokenToCurrencyInfo'
import {
  buildNativeCurrencyId,
  buildWrappedNativeCurrencyId,
  currencyIdToAddress,
  currencyIdToChain,
} from 'uniswap/src/utils/currencyId'

function useCurrencyInfoQuery(
  _currencyId?: string,
  options?: { refetch?: boolean; skip?: boolean },
): { currencyInfo: Maybe<CurrencyInfo>; loading: boolean; error?: Error } {
  const queryResult = GraphQLApi.useTokenQuery({
    variables: currencyIdToContractInput(_currencyId ?? ''),
    skip: !_currencyId || options?.skip,
    fetchPolicy: options?.refetch ? 'cache-and-network' : 'cache-first',
  })

  const currencyInfo = useMemo(() => {
    if (!_currencyId) {
      return undefined
    }

    const chainId = currencyIdToChain(_currencyId)
    let address: Address | undefined
    try {
      address = currencyIdToAddress(_currencyId)
    } catch (_error) {
      return undefined
    }

    // 获取自定义代币的 logo URI（如果存在）
    const customTokenLogoURI = chainId && address && isUniverseChainId(chainId)
      ? getCustomTokenLogoURI(chainId, address)
      : undefined

    if (chainId && address) {
      const commonBase = getCommonBase(chainId, address)
      if (commonBase) {
        // Creating new object to avoid error "Cannot assign to read only property"
        const copyCommonBase = { ...commonBase }
        // Related to TODO(WEB-5111)
        // Some common base images are broken so this'll ensure we read from uniswap images
        if (queryResult.data?.token?.project?.logoUrl) {
          copyCommonBase.logoUrl = queryResult.data.token.project.logoUrl
        }
        // 优先使用自定义代币的 logo URI
        if (customTokenLogoURI) {
          copyCommonBase.logoUrl = customTokenLogoURI
        }
        copyCommonBase.currencyId = _currencyId
        return copyCommonBase
      }
    }

    const gqlCurrencyInfo = queryResult.data?.token && gqlTokenToCurrencyInfo(queryResult.data.token)
    
    // 如果有自定义代币的 logo URI，使用它覆盖 GraphQL 返回的 logo
    if (gqlCurrencyInfo && customTokenLogoURI) {
      return {
        ...gqlCurrencyInfo,
        logoUrl: customTokenLogoURI,
      }
    }

    return gqlCurrencyInfo
  }, [_currencyId, queryResult.data?.token])

  return {
    currencyInfo,
    loading: queryResult.loading,
    error: queryResult.error,
  }
}

export function useCurrencyInfo(
  _currencyId?: string,
  options?: { refetch?: boolean; skip?: boolean },
): Maybe<CurrencyInfo> {
  const { currencyInfo } = useCurrencyInfoQuery(_currencyId, options)
  return currencyInfo
}

export function useCurrencyInfoWithLoading(
  _currencyId?: string,
  options?: { refetch?: boolean; skip?: boolean },
): {
  currencyInfo: Maybe<CurrencyInfo>
  loading: boolean
  error?: Error
} {
  return useCurrencyInfoQuery(_currencyId, options)
}

export function useCurrencyInfos(
  _currencyIds: string[],
  options?: { refetch?: boolean; skip?: boolean },
): Maybe<CurrencyInfo>[] {
  const { data } = GraphQLApi.useTokensQuery({
    variables: {
      contracts: _currencyIds.map(currencyIdToContractInput),
    },
    skip: !_currencyIds.length || options?.skip,
    fetchPolicy: options?.refetch ? 'cache-and-network' : 'cache-first',
  })

  return useMemo(() => {
    return data?.tokens?.map((token) => {
      if (!token) return undefined
      const currencyInfo = gqlTokenToCurrencyInfo(token)
      if (!currencyInfo) return undefined

      // 检查是否有自定义代币的 logo URI
      const chainId = currencyIdToChain(currencyInfo.currencyId)
      const address = currencyIdToAddress(currencyInfo.currencyId)
      const customTokenLogoURI = chainId && address && isUniverseChainId(chainId)
        ? getCustomTokenLogoURI(chainId, address)
        : undefined

      // 如果有自定义代币的 logo URI，使用它覆盖
      if (customTokenLogoURI) {
        return {
          ...currencyInfo,
          logoUrl: customTokenLogoURI,
        }
      }

      return currencyInfo
    }) ?? []
  }, [data])
}

export function useNativeCurrencyInfo(chainId: UniverseChainId): Maybe<CurrencyInfo> {
  const nativeCurrencyId = buildNativeCurrencyId(chainId)
  return useCurrencyInfo(nativeCurrencyId)
}

export function useWrappedNativeCurrencyInfo(chainId: UniverseChainId): Maybe<CurrencyInfo> {
  const wrappedCurrencyId = buildWrappedNativeCurrencyId(chainId)
  return useCurrencyInfo(wrappedCurrencyId)
}
