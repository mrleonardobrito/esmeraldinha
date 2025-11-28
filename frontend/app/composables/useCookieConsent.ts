import { useCookie } from '#imports'
import { computed } from 'vue'

export const useCookieConsent = () => {
  const cookie = useCookie<string | null>('cookie-consent', {
    default: () => null,
    maxAge: 60 * 60 * 24 * 365,
  })

  const acceptCookies = () => {
    cookie.value = 'accepted'
  }

  const rejectCookies = () => {
    cookie.value = 'rejected'
  }

  const resetConsent = () => {
    cookie.value = null
  }

  const hasConsent = computed(() => cookie.value === 'accepted')
  const hasRejected = computed(() => cookie.value === 'rejected')
  const needsConsent = computed(() => !cookie.value)

  return {
    acceptCookies,
    rejectCookies,
    resetConsent,
    hasConsent,
    hasRejected,
    needsConsent,
  }
}
