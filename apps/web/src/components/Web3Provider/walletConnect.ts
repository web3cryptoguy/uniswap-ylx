import { isWebAndroid, isWebIOS } from 'utilities/src/platform'
import { isDevEnv } from 'utilities/src/environment/env'
import { createConnector } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'

// Get WalletConnect Project ID from environment variables
// Support both REACT_APP_ and VITE_ prefixes for compatibility
function getWalletConnectProjectId(): string | undefined {
  // Try REACT_APP_ prefix first (legacy)
  if (process.env.REACT_APP_WALLET_CONNECT_PROJECT_ID) {
    return process.env.REACT_APP_WALLET_CONNECT_PROJECT_ID
  }
  
  // Try VITE_ prefix (Vite standard)
  // @ts-expect-error - import.meta.env is available in Vite runtime
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WALLET_CONNECT_PROJECT_ID) {
    // @ts-expect-error - import.meta.env is available in Vite runtime
    return import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID
  }
  
  // Try process.env with VITE_ prefix (fallback)
  if (process.env.VITE_WALLET_CONNECT_PROJECT_ID) {
    return process.env.VITE_WALLET_CONNECT_PROJECT_ID
  }
  
  // If not found, log warning but don't throw error
  // This allows the app to load, but WalletConnect features won't work
  if (typeof window !== 'undefined') {
    console.warn(
      '[walletConnect] REACT_APP_WALLET_CONNECT_PROJECT_ID or VITE_WALLET_CONNECT_PROJECT_ID is not defined. ' +
      'WalletConnect features will not be available. ' +
      'Please configure this environment variable in Vercel.'
    )
  }
  
  // Return undefined to clearly indicate missing configuration
  // The connector will fail gracefully if this is undefined
  return undefined
}

const WALLET_CONNECT_PROJECT_ID = getWalletConnectProjectId()

export function walletTypeToAmplitudeWalletType(connectionType?: string): string {
  switch (connectionType) {
    case 'injected': {
      return 'Browser Extension'
    }
    case 'walletConnect': {
      return 'Wallet Connect'
    }
    case 'coinbaseWallet': {
      return 'Coinbase Wallet'
    }
    case 'uniswapWalletConnect': {
      return 'Wallet Connect'
    }
    case 'embeddedUniswapWallet': {
      return 'Passkey'
    }
    default: {
      return connectionType ?? 'Network'
    }
  }
}

// Get metadata URL dynamically based on current domain
// This allows the app to work on any domain (e.g., www-uniswap.org)
const getMetadataUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  // Fallback for SSR (should not happen in this context)
  return 'https://app.uniswap.org'
}

export const WC_PARAMS = {
  projectId: WALLET_CONNECT_PROJECT_ID || '',
  metadata: {
    name: 'Uniswap',
    description: 'Uniswap Interface',
    url: getMetadataUrl(),
    icons: [`${getMetadataUrl()}/favicon.png`],
  },
  qrModalOptions: {
    themeVariables: {
      '--wcm-font-family': '"Inter custom", sans-serif',
      // Higher than tamagui's default modal z-index
      '--wcm-z-index': '100011',
    },
  },
}

export function uniswapWalletConnect() {
  return createConnector((config) => {
    const wc = walletConnect({
      ...WC_PARAMS,
      showQrModal: false,
    })(config)

    // Get current origin to support deployment on different domains (e.g., www-uniswap.org)
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://app.uniswap.org'

    config.emitter.on('message', ({ type, data }) => {
      if (type === 'display_uri') {
        // Emits custom wallet connect code, parseable by the Uniswap Wallet
        // Use current origin to support deployment on different domains
        const uniswapWalletUri = `${currentOrigin}/app/wc?uri=${data}`

        // Emits custom event to display the Uniswap Wallet URI
        window.dispatchEvent(new MessageEvent('display_uniswap_uri', { data: uniswapWalletUri }))

        // Opens deeplink to Uniswap Wallet if on mobile
        if (isWebIOS || isWebAndroid) {
          // Using window.location.href to open the deep link ensures smooth navigation and leverages OS handling for installed apps,
          // avoiding potential popup blockers or inconsistent behavior associated with window.open
          window.location.href = `uniswap://wc?uri=${encodeURIComponent(data as string)}`
        }
      }
    })
    
    return {
      ...wc,
      id: 'uniswapWalletConnect',
      type: 'uniswapWalletConnect',
      name: 'Uniswap Wallet',
      icon: `${currentOrigin}/favicon.png`,
    }
  })
}
