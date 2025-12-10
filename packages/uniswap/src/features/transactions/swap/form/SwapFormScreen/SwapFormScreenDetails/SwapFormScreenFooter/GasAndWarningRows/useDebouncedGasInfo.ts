import { useMemo } from 'react'
import {
  useFormattedUniswapXGasFeeInfo,
  useGasFeeFormattedDisplayAmounts,
  useGasFeeHighRelativeToValue,
} from 'uniswap/src/features/gas/hooks'
import type { GasInfo } from 'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/types'
import { useSwapFormStoreDerivedSwapInfo } from 'uniswap/src/features/transactions/swap/stores/swapFormStore/useSwapFormStore'
import { useSwapTxStore } from 'uniswap/src/features/transactions/swap/stores/swapTxStore/useSwapTxStore'
import { isUniswapX } from 'uniswap/src/features/transactions/swap/utils/routing'
import { CurrencyField } from 'uniswap/src/types/currency'
import { usePrevious } from 'utilities/src/react/hooks'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { NumberType } from 'utilities/src/format/types'

// TODO: WALL-6293
export function useDebouncedGasInfo(): GasInfo {
  const { chainId, currencyAmountsUSDValue, trade, currencyAmounts, exactCurrencyField } =
    useSwapFormStoreDerivedSwapInfo((s) => ({
      chainId: s.chainId,
      currencyAmountsUSDValue: s.currencyAmountsUSDValue,
      trade: s.trade,
      currencyAmounts: s.currencyAmounts,
      exactCurrencyField: s.exactCurrencyField,
    }))
  const inputUSDValue = currencyAmountsUSDValue[CurrencyField.INPUT]
  const outputUSDValue = currencyAmountsUSDValue[CurrencyField.OUTPUT]

  const { gasFee, gasFeeBreakdown } = useSwapTxStore((s) => {
    if (isUniswapX(s)) {
      return {
        gasFee: s.gasFee,
        gasFeeBreakdown: s.gasFeeBreakdown,
      }
    }

    return {
      gasFee: s.gasFee,
      gasFeeBreakdown: undefined,
    }
  })

  const uniswapXGasFeeInfo = useFormattedUniswapXGasFeeInfo(gasFeeBreakdown, chainId)

  const { gasFeeFormatted, gasFeeUSD } = useGasFeeFormattedDisplayAmounts({
    gasFee,
    chainId,
    placeholder: undefined,
  })

  // 如果没有 gas 费用，提供一个基于链的默认 USD 估算值
  // 这些是基于典型 swap 交易的估算值（包括 approval 和 swap）
  const defaultGasFeeUSDByChain: Record<number, string> = {
    1: '1.20', // Ethereum Mainnet
    8453: '0.10', // Base
    10: '0.10', // Optimism
    42161: '0.10', // Arbitrum
    137: '0.10', // Polygon
    56: '0.120', // BSC
  }
  
  const { convertFiatAmountFormatted } = useLocalizationContext()
  
  // 估算 gas 费用（使用基于链的默认 USD 值）
  const estimatedGasFeeFormatted = useMemo(() => {
    if (gasFeeFormatted) {
      return undefined // 如果有实际的 gas 费用，不使用估算值
    }
    
    const defaultGasFeeUSD = defaultGasFeeUSDByChain[chainId]
    if (defaultGasFeeUSD) {
      return convertFiatAmountFormatted(defaultGasFeeUSD, NumberType.FiatGasPrice)
    }
    
    return undefined
  }, [gasFeeFormatted, chainId, convertFiatAmountFormatted])

  // 使用实际的 gas 费用或估算值
  const finalGasFeeFormatted = gasFeeFormatted ?? estimatedGasFeeFormatted
  const finalGasFeeUSD = gasFeeUSD ?? (estimatedGasFeeFormatted ? defaultGasFeeUSDByChain[chainId] : undefined)

  const isHighRelativeToValue = useGasFeeHighRelativeToValue(finalGasFeeUSD, outputUSDValue ?? inputUSDValue)

  const amountChanged = usePrevious(currencyAmounts[exactCurrencyField]) !== currencyAmounts[exactCurrencyField]
  
  // Trade 功能已移除，不再依赖 trade 状态
  const gasLoading = Boolean(gasFee.isLoading || (gasFee.value && !gasFeeUSD))

  // 仅基于金额变化和 gas 加载状态来判断是否加载中
  const isLoading = gasLoading || amountChanged

  return useMemo(
    () => ({
      gasFee,
      fiatPriceFormatted: finalGasFeeFormatted ?? undefined,
      isHighRelativeToValue,
      uniswapXGasFeeInfo,
      isLoading,
      chainId,
    }),
    [gasFee, finalGasFeeFormatted, isHighRelativeToValue, isLoading, uniswapXGasFeeInfo, chainId],
  )
}
