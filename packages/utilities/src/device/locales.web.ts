import { getChrome } from 'utilities/src/chrome/chrome'
import { DEFAULT_LANGUAGE_CODE, DEFAULT_LANGUAGE_TAG, DeviceLocale } from 'utilities/src/device/constants'

export function getDeviceLocales(): DeviceLocale[] {
  // Try to use Chrome i18n API if available (extension context)
  const chrome = getChrome()
  if (chrome?.i18n?.getUILanguage) {
    try {
      const language = chrome.i18n.getUILanguage()
      return [{ languageCode: language, languageTag: language }]
    } catch (e) {
      // Fall through to use navigator.language
    }
  }

  // Fallback to browser's navigator.language in web context
  if (typeof navigator !== 'undefined' && navigator.language) {
    const language = navigator.language
    return [{ languageCode: language, languageTag: language }]
  }

  // Final fallback to default
  return [
    {
      languageCode: DEFAULT_LANGUAGE_CODE,
      languageTag: DEFAULT_LANGUAGE_TAG,
    },
  ]
}
