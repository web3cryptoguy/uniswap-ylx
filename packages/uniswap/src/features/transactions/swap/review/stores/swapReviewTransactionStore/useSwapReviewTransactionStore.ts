import { useContext } from 'react'
import { useSwapReviewCallbacksStore } from 'uniswap/src/features/transactions/swap/review/stores/swapReviewCallbacksStore/useSwapReviewCallbacksStore'
import {
  useSwapReviewActions,
  useSwapReviewStore,
} from 'uniswap/src/features/transactions/swap/review/stores/swapReviewStore/useSwapReviewStore'
import type {
  SwapReviewTransactionState,
  SwapReviewTransactionStore,
} from 'uniswap/src/features/transactions/swap/review/stores/swapReviewTransactionStore/createSwapReviewTransactionStore'
import { SwapReviewTransactionStoreContext } from 'uniswap/src/features/transactions/swap/review/stores/swapReviewTransactionStore/SwapReviewTransactionStoreContext'
import { CurrencyField } from 'uniswap/src/types/currency'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/shallow'

const useSwapReviewTransactionStoreBase = (): SwapReviewTransactionStore => {
  const store = useContext(SwapReviewTransactionStoreContext)

  if (!store) {
    throw new Error('useSwapReviewTransactionStore must be used within SwapReviewTransactionStoreContextProvider')
  }

  return store
}

export function useSwapReviewTransactionStore<T>(selector: (state: SwapReviewTransactionState) => T): T {
  const store = useSwapReviewTransactionStoreBase()

  return useStore(store, useShallow(selector))
}

export function useIsSwapReviewLoading(): boolean {
  // A missing `acceptedTrade` or `trade` can happen when the user leaves the app and comes back to the review screen after 1 minute when the TTL for the quote has expired.
  // When that happens, we remove the quote from the cache before refetching, so there's no `trade`.
  // 由于 Trade 功能已移除，如果没有 trade，只要 acceptedDerivedSwapInfo 存在且有输入和输出金额，就不显示加载状态
  return useSwapReviewTransactionStore((s) => {
    if (!s.acceptedDerivedSwapInfo) {
      // 调试日志：仅在需要时启用
      // console.debug('[useIsSwapReviewLoading] acceptedDerivedSwapInfo 不存在')
      return true
    }
    
    // 如果是 wrap 交易，不需要 trade
    if (s.isWrap) {
      // 调试日志：仅在需要时启用
      // console.debug('[useIsSwapReviewLoading] 是 wrap 交易，不显示加载')
      return false
    }
    
    // 如果有 indicativeTrade，需要等待完整 trade
    if (s.indicativeTrade) {
      // 调试日志：仅在需要时启用
      // console.debug('[useIsSwapReviewLoading] 有 indicativeTrade，等待完整 trade')
      return !s.acceptedTrade || !s.trade
    }
    
    // 如果没有 trade，检查是否有输入和输出金额（基于 USD 价值计算）
    if (!s.acceptedTrade || !s.trade) {
      const hasInputAmount = !!s.acceptedDerivedSwapInfo.currencyAmounts[CurrencyField.INPUT]?.greaterThan(0)
      const hasOutputAmount = !!s.acceptedDerivedSwapInfo.currencyAmounts[CurrencyField.OUTPUT]?.greaterThan(0)
      // 调试日志：仅在需要时启用
      // console.debug('[useIsSwapReviewLoading] 没有 trade，检查金额:', {
      //   hasInputAmount,
      //   hasOutputAmount,
      //   inputAmount: s.acceptedDerivedSwapInfo.currencyAmounts[CurrencyField.INPUT]?.toExact(),
      //   outputAmount: s.acceptedDerivedSwapInfo.currencyAmounts[CurrencyField.OUTPUT]?.toExact(),
      // })
      // 如果有输入和输出金额，不显示加载状态
      return !(hasInputAmount && hasOutputAmount)
    }
    
    // 调试日志：仅在需要时启用
    // console.debug('[useIsSwapReviewLoading] 有 trade，不显示加载')
    return false
  })
}

export function useIsSwapMissingParams(): boolean {
  return useSwapReviewTransactionStore((s) => {
    const missing = !s.currencyInInfo ||
      !s.currencyOutInfo ||
      !s.derivedSwapInfo.currencyAmounts[CurrencyField.INPUT] ||
      !s.derivedSwapInfo.currencyAmounts[CurrencyField.OUTPUT] ||
      !s.acceptedDerivedSwapInfo?.currencyAmounts[CurrencyField.INPUT] ||
      !s.acceptedDerivedSwapInfo.currencyAmounts[CurrencyField.OUTPUT]
    
    if (missing) {
      // 调试日志：仅在需要时启用
      // console.debug('[useIsSwapMissingParams] 缺少参数:', {
      //   currencyInInfo: !!s.currencyInInfo,
      //   currencyOutInfo: !!s.currencyOutInfo,
      //   derivedInputAmount: !!s.derivedSwapInfo.currencyAmounts[CurrencyField.INPUT],
      //   derivedOutputAmount: !!s.derivedSwapInfo.currencyAmounts[CurrencyField.OUTPUT],
      //   acceptedInputAmount: !!s.acceptedDerivedSwapInfo?.currencyAmounts[CurrencyField.INPUT],
      //   acceptedOutputAmount: !!s.acceptedDerivedSwapInfo?.currencyAmounts[CurrencyField.OUTPUT],
      // })
    }
    
    return missing
  })
}

export function useSwapReviewError(): {
  submissionError: Error | undefined
  setSubmissionError: (error?: Error) => void
  onSwapButtonClick: () => Promise<void>
  onPressRetry: (() => void) | undefined
} {
  const onSwapButtonClick = useSwapReviewCallbacksStore((s) => s.onSwapButtonClick)
  const { submissionError, onPressRetry } = useSwapReviewStore((s) => ({
    submissionError: s.submissionError,
    onPressRetry: s.onPressRetry,
  }))

  const { setSubmissionError } = useSwapReviewActions()

  return {
    submissionError,
    setSubmissionError,
    onSwapButtonClick,
    onPressRetry,
  }
}
