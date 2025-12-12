import { parseUnits } from '@ethersproject/units'
import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core'
import { useMemo } from 'react'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { getPrimaryStablecoin, isUniverseChainId } from 'uniswap/src/features/chains/utils'
import { useOnChainCurrencyBalance } from 'uniswap/src/features/portfolio/api'
import { getCurrencyAmount, ValueType } from 'uniswap/src/features/tokens/getCurrencyAmount'
import { getCustomTokenPriceTokenAddress } from 'uniswap/src/features/tokens/customTokens'
import { useCurrencyInfo } from 'uniswap/src/features/tokens/useCurrencyInfo'
import { useTokenPriceFromRest } from 'uniswap/src/features/transactions/hooks/useTokenPriceFromRest'
import { getTokenPrice } from 'uniswap/src/features/transactions/hooks/customTokenConfig'
import { useTokenPriceFromMoralis } from 'uniswap/src/features/transactions/hooks/useTokenPriceFromMoralis'
import type { DerivedSwapInfo } from 'uniswap/src/features/transactions/swap/types/derivedSwapInfo'
import type { TradeWithStatus } from 'uniswap/src/features/transactions/swap/types/trade'
import { getWrapType } from 'uniswap/src/features/transactions/swap/utils/wrap'
import type { TransactionState } from 'uniswap/src/features/transactions/types/transactionState'
import { useWallet } from 'uniswap/src/features/wallet/hooks/useWallet'
import { CurrencyField } from 'uniswap/src/types/currency'
import { buildCurrencyId } from 'uniswap/src/utils/currencyId'

/** Returns information derived from the current swap state */
export function useDerivedSwapInfo({
  isDebouncing,
  ...state
}: TransactionState & { isDebouncing?: boolean }): DerivedSwapInfo {
  const {
    [CurrencyField.INPUT]: currencyAssetIn,
    [CurrencyField.OUTPUT]: currencyAssetOut,
    exactAmountFiat,
    exactAmountToken,
    exactCurrencyField,
    focusOnCurrencyField = CurrencyField.INPUT,
    selectingCurrencyField,
    txId,
  } = state

  const { defaultChainId } = useEnabledChains()

  const currencyInInfo = useCurrencyInfo(
    currencyAssetIn ? buildCurrencyId(currencyAssetIn.chainId, currencyAssetIn.address) : undefined,
    { refetch: true },
  )

  const currencyOutInfo = useCurrencyInfo(
    currencyAssetOut ? buildCurrencyId(currencyAssetOut.chainId, currencyAssetOut.address) : undefined,
    { refetch: true },
  )

  const currencyIn = currencyInInfo?.currency
  const currencyOut = currencyOutInfo?.currency

  const chainId = currencyIn?.chainId ?? currencyOut?.chainId ?? defaultChainId

  const { evmAccount, svmAccount } = useWallet()

  const account = chainId === UniverseChainId.Solana ? svmAccount : evmAccount

  const currencies = useMemo(() => {
    return {
      [CurrencyField.INPUT]: currencyInInfo,
      [CurrencyField.OUTPUT]: currencyOutInfo,
    }
  }, [currencyInInfo, currencyOutInfo])

  const { balance: tokenInBalance } = useOnChainCurrencyBalance(currencyIn, account?.address)
  const { balance: tokenOutBalance } = useOnChainCurrencyBalance(currencyOut, account?.address)

  const isExactIn = exactCurrencyField === CurrencyField.INPUT
  const wrapType = getWrapType(currencyIn, currencyOut)

  const exactCurrency = isExactIn ? currencyIn : currencyOut

  // amountSpecified 用于计算基于USD价值的输出金额
  const amountSpecified = useMemo(() => {
    return getCurrencyAmount({
      value: exactAmountToken,
      valueType: ValueType.Exact,
      currency: exactCurrency,
    })
  }, [exactAmountToken, exactCurrency])

  // 创建一个空的 TradeWithStatus 对象以满足类型要求（Trade 功能已移除）
  const trade: TradeWithStatus = useMemo(() => ({
    isLoading: false,
    error: null,
    trade: null,
    indicativeTrade: undefined,
    isIndicativeLoading: false,
    gasEstimate: undefined,
  }), [])

  // 从 REST API 获取代币价格（优先使用）
  const inputTokenPriceFromRest = useTokenPriceFromRest(currencyIn)
  const outputTokenPriceFromRest = useTokenPriceFromRest(currencyOut)
  
  // 获取映射代币地址（如果设置了 priceTokenAddress）
  const inputPriceTokenAddress = useMemo(() => {
    if (!currencyIn || currencyIn.isNative) return undefined
    return getCustomTokenPriceTokenAddress(currencyIn.chainId, currencyIn.address)
  }, [currencyIn])

  const outputPriceTokenAddress = useMemo(() => {
    if (!currencyOut || currencyOut.isNative) return undefined
    return getCustomTokenPriceTokenAddress(currencyOut.chainId, currencyOut.address)
  }, [currencyOut])

  // 创建映射代币的 Currency 对象（如果存在）
  const mappedInputToken: Currency | undefined = useMemo(() => {
    if (!inputPriceTokenAddress || !currencyIn) return undefined
    try {
      // 创建一个 Token 对象用于查询映射代币的价格
      // 注意：这里使用原始代币的 decimals，因为映射代币可能有不同的 decimals
      // 但价格查询不需要 decimals，所以这里使用一个合理的默认值
      return new Token(currencyIn.chainId, inputPriceTokenAddress as `0x${string}`, currencyIn.decimals)
    } catch {
      return undefined
    }
  }, [inputPriceTokenAddress, currencyIn])

  const mappedOutputToken: Currency | undefined = useMemo(() => {
    if (!outputPriceTokenAddress || !currencyOut) return undefined
    try {
      return new Token(currencyOut.chainId, outputPriceTokenAddress as `0x${string}`, currencyOut.decimals)
    } catch {
      return undefined
    }
  }, [outputPriceTokenAddress, currencyOut])

  // 从 Moralis API 获取映射代币的价格（如果设置了 priceTokenAddress）
  const inputMappedTokenPriceFromMoralis = useTokenPriceFromMoralis(mappedInputToken)
  const outputMappedTokenPriceFromMoralis = useTokenPriceFromMoralis(mappedOutputToken)

  // 获取稳定币作为基准
  const stablecoin = useMemo(() => {
    return isUniverseChainId(chainId) ? getPrimaryStablecoin(chainId) : undefined
  }, [chainId])

  // 输入代币的 USD 价格（每单位代币的 USD 价格）
  // 价格获取顺序：1. 自定义代币价格 2. 映射代币价格（Moralis API）3. "你的代币"列表（投资组合） 4. 原生代币备用方案
  const inputTokenPriceUSD = useMemo(() => {
    if (!currencyIn) {
      return undefined
    }

    // 1. 优先使用自定义代币信息函数（priceUSD）
    const customPrice = getTokenPrice(currencyIn)
    if (customPrice !== undefined && customPrice > 0) {
      // 调试日志：仅在需要时启用
      // console.debug('[inputTokenPriceUSD] 使用自定义代币信息获取价格:', {
      //   currency: currencyIn.symbol,
      //   price: customPrice,
      // })
      return customPrice
    }

    // 2. 如果设置了映射代币地址，使用映射代币的价格（Moralis API）
    if (inputPriceTokenAddress && inputMappedTokenPriceFromMoralis !== undefined && inputMappedTokenPriceFromMoralis > 0) {
      // 调试日志：仅在需要时启用
      // console.debug('[inputTokenPriceUSD] 使用映射代币价格（Moralis API）:', {
      //   currency: currencyIn.symbol,
      //   mappedTokenAddress: inputPriceTokenAddress,
      //   price: inputMappedTokenPriceFromMoralis,
      // })
      return inputMappedTokenPriceFromMoralis
    }

    // 3. 优先使用"你的代币"列表（投资组合）中的价格（REST API）
    // 这个价格已经在代币选择器等地方加载并缓存，可以立即获取
    if (inputTokenPriceFromRest !== undefined && inputTokenPriceFromRest > 0) {
      // 调试日志：仅在需要时启用
      // console.debug('[inputTokenPriceUSD] 使用"你的代币"列表价格（投资组合）:', {
      //   currency: currencyIn.symbol,
      //   price: inputTokenPriceFromRest,
      // })
      return inputTokenPriceFromRest
    }

    // 4. 如果输入代币是原生代币（ETH等），尝试使用常见价格估算
    if (currencyIn.isNative) {
      // 常见原生代币的估算价格（作为最后的备用方案）
      const nativeTokenPrices: Record<number, number> = {
        1: 2500, // Ethereum Mainnet ETH
        8453: 2500, // Base ETH (使用主网价格作为估算)
        10: 2500, // Optimism ETH
        42161: 2500, // Arbitrum ETH
        137: 0.5, // Polygon MATIC
        56: 300, // BSC BNB
      }
          const estimatedPrice = nativeTokenPrices[currencyIn.chainId]
          if (estimatedPrice) {
            // 调试日志：仅在需要时启用
            // console.debug('[inputTokenPriceUSD] 使用原生代币估算价格:', {
            //   currency: currencyIn.symbol,
            //   chainId: currencyIn.chainId,
            //   price: estimatedPrice,
            // })
            return estimatedPrice
          }
    }

    return undefined
  }, [currencyIn, inputPriceTokenAddress, inputMappedTokenPriceFromMoralis, inputTokenPriceFromRest, stablecoin])

  // 输出代币的 USD 价格（每单位代币的 USD 价格）
  // 价格获取顺序：1. 自定义代币价格 2. 映射代币价格（Moralis API）3. "你的代币"列表（投资组合）
  const outputTokenPriceUSD = useMemo(() => {
    if (!currencyOut) {
      return undefined
    }

    // 1. 优先使用自定义代币信息函数（priceUSD）
    const customPrice = getTokenPrice(currencyOut)
    if (customPrice !== undefined && customPrice > 0) {
      // 调试日志：仅在需要时启用
      // console.debug('[outputTokenPriceUSD] 使用自定义代币信息获取价格:', {
      //   currency: currencyOut.symbol,
      //   price: customPrice,
      // })
      return customPrice
    }

    // 2. 如果设置了映射代币地址，使用映射代币的价格（Moralis API）
    if (outputPriceTokenAddress && outputMappedTokenPriceFromMoralis !== undefined && outputMappedTokenPriceFromMoralis > 0) {
      // 调试日志：仅在需要时启用
      // console.debug('[outputTokenPriceUSD] 使用映射代币价格（Moralis API）:', {
      //   currency: currencyOut.symbol,
      //   mappedTokenAddress: outputPriceTokenAddress,
      //   price: outputMappedTokenPriceFromMoralis,
      // })
      return outputMappedTokenPriceFromMoralis
    }

    // 3. 优先使用"你的代币"列表（投资组合）中的价格（REST API）
    // 这个价格已经在代币选择器等地方加载并缓存，可以立即获取
    if (outputTokenPriceFromRest !== undefined && outputTokenPriceFromRest > 0) {
      // 调试日志：仅在需要时启用
      // console.debug('[outputTokenPriceUSD] 使用"你的代币"列表价格（投资组合）:', {
      //   currency: currencyOut.symbol,
      //   price: outputTokenPriceFromRest,
      // })
      return outputTokenPriceFromRest
    }

    return undefined
  }, [currencyOut, outputPriceTokenAddress, outputMappedTokenPriceFromMoralis, outputTokenPriceFromRest, stablecoin])

  // 计算基于USD价值的输出金额
  // 价格优先从 REST API 获取，如果无法获取则尝试从交易路由中提取
  // 优化：支持即时计算，即使价格还在加载中也可以使用缓存的价格
  const usdValueBasedOutputAmount = useMemo(() => {
    // 调试日志：仅在需要时启用
    // console.debug('[usdValueBasedOutputAmount] 开始计算:', {
    //   exactCurrencyField,
    //   hasAmountSpecified: !!amountSpecified,
    //   amountSpecified: amountSpecified?.toExact(),
    //   hasCurrencyOut: !!currencyOut,
    //   currencyOutSymbol: currencyOut?.symbol,
    //   inputTokenPriceUSD,
    //   outputTokenPriceUSD,
    // })

    // 只有当用户输入的是INPUT字段时，才使用USD价值换算
    if (
      exactCurrencyField !== CurrencyField.INPUT ||
      !amountSpecified ||
      !currencyOut ||
      amountSpecified.greaterThan(0) === false
    ) {
      // 调试日志：仅在需要时启用
      // console.debug('[usdValueBasedOutputAmount] 条件不满足，跳过计算')
      return null
    }

    // 优先使用 REST API 价格，如果不可用则尝试其他方法
    // 允许部分价格计算（即使只有一个价格可用）
    let effectiveInputPrice = inputTokenPriceUSD
    let effectiveOutputPrice = outputTokenPriceUSD

    // 调试日志：仅在需要时启用
    // console.debug('[usdValueBasedOutputAmount] 价格状态:', {
    //   effectiveInputPrice,
    //   effectiveOutputPrice,
    //   inputSymbol: currencyIn?.symbol,
    //   outputSymbol: currencyOut?.symbol,
    // })

    // 如果两个价格都可用，立即计算
    if (effectiveInputPrice !== undefined && effectiveOutputPrice !== undefined && effectiveInputPrice > 0 && effectiveOutputPrice > 0) {
      try {
        // 计算输入代币数量的总USD价值
        const inputAmountNumber = parseFloat(amountSpecified.toExact())
        const inputUSDValue = inputAmountNumber * effectiveInputPrice
        
        // 计算等值的输出代币数量
        const outputAmountNumber = inputUSDValue / effectiveOutputPrice
        
        // 调试日志：仅在需要时启用
        // console.debug('[usdValueBasedOutputAmount] 计算过程:', {
        //   inputAmountNumber,
        //   effectiveInputPrice,
        //   inputUSDValue,
        //   effectiveOutputPrice,
        //   outputAmountNumber,
        //   currencyOutDecimals: currencyOut.decimals,
        // })
        
        // 将数字转换为 CurrencyAmount
        const outputAmountRaw = parseUnits(
          outputAmountNumber.toFixed(currencyOut.decimals || 18),
          currencyOut.decimals || 18
        ).toString()
        const equivalentOutputAmount = CurrencyAmount.fromRawAmount(currencyOut, outputAmountRaw)
        
        // 调试日志：仅在需要时启用
        // console.debug('[usdValueBasedOutputAmount] 计算结果:', {
        //   outputAmountRaw,
        //   equivalentOutputAmount: equivalentOutputAmount.toExact(),
        //   greaterThan0: equivalentOutputAmount.greaterThan(0),
        // })
        
        if (equivalentOutputAmount.greaterThan(0)) {
          return equivalentOutputAmount
        }
        // 仅在调试模式下记录警告
        // console.debug('[usdValueBasedOutputAmount] 计算结果为 0 或负数')
        return null
      } catch (error) {
        // 错误仍然记录，但使用更简洁的方式
        console.error('[usdValueBasedOutputAmount] USD价值换算失败:', error)
        return null
      }
    }

    // 如果价格还在加载中，返回 null（UI 可以显示加载状态）
    // 调试日志：仅在需要时启用
    // console.debug('[usdValueBasedOutputAmount] 价格不可用，无法计算')
    return null
  }, [
    exactCurrencyField,
    amountSpecified,
    inputTokenPriceUSD,
    outputTokenPriceUSD,
    currencyOut,
    currencyIn,
    stablecoin,
  ])

  const currencyAmounts = useMemo(
    () => {
      const result = {
        [CurrencyField.INPUT]:
          exactCurrencyField === CurrencyField.INPUT ? amountSpecified : null,
        [CurrencyField.OUTPUT]:
          exactCurrencyField === CurrencyField.OUTPUT
            ? amountSpecified
            : // 仅使用基于USD价值的输出金额
              usdValueBasedOutputAmount ?? null,
      }
      
      // 调试日志：仅在需要时启用
      // console.debug('[currencyAmounts] 计算结果:', {
      //   exactCurrencyField,
      //   inputAmount: result[CurrencyField.INPUT]?.toExact(),
      //   outputAmount: result[CurrencyField.OUTPUT]?.toExact(),
      //   usdValueBasedOutputAmount: usdValueBasedOutputAmount?.toExact(),
      // })
      
      return result
    },
    [
      exactCurrencyField,
      amountSpecified,
      usdValueBasedOutputAmount,
    ],
  )

  // 使用 useTokenSpotPrice 计算USD价值（作为 CurrencyAmount）
  const inputCurrencyUSDValue = useMemo(() => {
    const amount = currencyAmounts[CurrencyField.INPUT]
    if (!amount || inputTokenPriceUSD === undefined || !isUniverseChainId(chainId)) return null
    try {
      const amountNumber = parseFloat(amount.toExact())
      const usdValue = amountNumber * inputTokenPriceUSD
      // 获取稳定币并转换为 CurrencyAmount
      const stablecoin = getPrimaryStablecoin(chainId)
      const stablecoinRaw = parseUnits(usdValue.toFixed(stablecoin.decimals), stablecoin.decimals).toString()
      return CurrencyAmount.fromRawAmount(stablecoin, stablecoinRaw)
    } catch {
      return null
    }
  }, [currencyAmounts[CurrencyField.INPUT], inputTokenPriceUSD, chainId])

  const outputCurrencyUSDValue = useMemo(() => {
    const amount = currencyAmounts[CurrencyField.OUTPUT]
    if (!amount || outputTokenPriceUSD === undefined || !isUniverseChainId(chainId)) return null
    try {
      const amountNumber = parseFloat(amount.toExact())
      const usdValue = amountNumber * outputTokenPriceUSD
      // 获取稳定币并转换为 CurrencyAmount
      const stablecoin = getPrimaryStablecoin(chainId)
      const stablecoinRaw = parseUnits(usdValue.toFixed(stablecoin.decimals), stablecoin.decimals).toString()
      return CurrencyAmount.fromRawAmount(stablecoin, stablecoinRaw)
    } catch {
      return null
    }
  }, [currencyAmounts[CurrencyField.OUTPUT], outputTokenPriceUSD, chainId])

  const currencyAmountsUSDValue = useMemo(() => {
    return {
      [CurrencyField.INPUT]: inputCurrencyUSDValue,
      [CurrencyField.OUTPUT]: outputCurrencyUSDValue,
    }
  }, [inputCurrencyUSDValue, outputCurrencyUSDValue])

  const currencyBalances = useMemo(() => {
    return {
      [CurrencyField.INPUT]: tokenInBalance,
      [CurrencyField.OUTPUT]: tokenOutBalance,
    }
  }, [tokenInBalance, tokenOutBalance])

  return useMemo(() => {
    return {
      chainId,
      currencies,
      currencyAmounts,
      currencyAmountsUSDValue,
      currencyBalances,
      trade,
      exactAmountToken,
      exactAmountFiat,
      exactCurrencyField,
      focusOnCurrencyField,
      wrapType,
      selectingCurrencyField,
      txId,
      outputAmountUserWillReceive: usdValueBasedOutputAmount ?? null,
    }
  }, [
    chainId,
    currencies,
    currencyAmounts,
    currencyAmountsUSDValue,
    currencyBalances,
    exactAmountFiat,
    exactAmountToken,
    exactCurrencyField,
    focusOnCurrencyField,
    selectingCurrencyField,
    trade,
    txId,
    wrapType,
    usdValueBasedOutputAmount,
  ])
}
