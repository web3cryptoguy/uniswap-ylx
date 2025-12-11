import { Currency } from '@uniswap/sdk-core'
import { useQuery } from '@tanstack/react-query'
import { fetchTokenPrice, getChainNameForMoralis, getEnvVar } from 'uniswap/src/features/portfolio/moralis/moralisApi'
import { isNativeCurrencyAddress } from 'uniswap/src/utils/currencyId'

const PRIMARY_API_KEY = 
  getEnvVar('VITE_MORALIS_PRIMARY_API_KEY') || 
  getEnvVar('NEXT_PUBLIC_MORALIS_PRIMARY_API_KEY') || 
  ''
const FALLBACK_API_KEY = 
  getEnvVar('VITE_MORALIS_FALLBACK_API_KEY') || 
  getEnvVar('NEXT_PUBLIC_MORALIS_FALLBACK_API_KEY') || 
  ''

/**
 * 从 Moralis API 获取代币价格
 * @param currency 要获取价格的代币
 * @returns 代币的 USD 价格（每单位），如果无法获取则返回 undefined
 */
export function useTokenPriceFromMoralis(currency?: Currency): number | undefined {
  const tokenAddress = currency?.isNative ? undefined : currency?.address
  const chainId = currency?.chainId

  const { data: price } = useQuery({
    queryKey: ['moralisTokenPrice', chainId, tokenAddress],
    queryFn: async (): Promise<number | null> => {
      if (!currency || !chainId || !tokenAddress) {
        return null
      }

      // 跳过原生代币（ETH等），Moralis API 不支持原生代币价格查询
      if (currency.isNative || isNativeCurrencyAddress(chainId, tokenAddress)) {
        return null
      }

      const chainName = getChainNameForMoralis(chainId)
      if (!chainName) {
        // 调试日志：仅在需要时启用
        // console.debug('[useTokenPriceFromMoralis] 不支持的链:', chainId)
        return null
      }

      // 尝试使用主API密钥
      if (PRIMARY_API_KEY) {
        try {
          const price = await fetchTokenPrice(tokenAddress, chainName, PRIMARY_API_KEY)
          if (price !== null && price > 0) {
            // 调试日志：仅在需要时启用
            // console.debug('[useTokenPriceFromMoralis] 使用主API密钥获取价格成功:', {
            //   symbol: currency.symbol,
            //   chainId,
            //   price,
            // })
            return price
          }
        } catch (error) {
          // 仅在调试模式下记录警告，避免日志噪音
          // console.debug('[useTokenPriceFromMoralis] 主API密钥失败:', error)
        }
      }

      // 如果主API密钥失败，尝试备用密钥
      if (FALLBACK_API_KEY) {
        try {
          const price = await fetchTokenPrice(tokenAddress, chainName, FALLBACK_API_KEY)
          if (price !== null && price > 0) {
            // 调试日志：仅在需要时启用
            // console.debug('[useTokenPriceFromMoralis] 使用备用API密钥获取价格成功:', {
            //   symbol: currency.symbol,
            //   chainId,
            //   price,
            // })
            return price
          }
        } catch (error) {
          // 仅在调试模式下记录警告，避免日志噪音
          // console.debug('[useTokenPriceFromMoralis] 备用API密钥失败:', error)
        }
      }

      return null
    },
    enabled: !!currency && !!chainId && !!tokenAddress && !currency.isNative,
    staleTime: 5 * 60 * 1000, // 5分钟缓存
    gcTime: 10 * 60 * 1000, // 10分钟垃圾回收时间
    retry: 1, // 只重试一次
  })

  return price !== null && price !== undefined && price > 0 ? price : undefined
}

