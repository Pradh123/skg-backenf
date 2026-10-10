import { createRateLimiter } from './rateLimiter.js'

const defaultLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  code: 'RATE_LIMITED',
  message: 'Too many lead requests. Please try again later.',
})

export function publicLeadLimiter(options) {
  if (!options) return defaultLimiter
  return createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 20,
    code: 'RATE_LIMITED',
    message: 'Too many lead requests. Please try again later.',
    ...options,
  })
}

export function resetPublicLeadLimiter() {
  defaultLimiter.reset()
}
