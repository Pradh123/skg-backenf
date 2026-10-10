import { Router } from 'express'
import { createAuthController } from '../controllers/authController.js'
import { authenticate } from '../middleware/authenticate.js'
import { requireSuperAdmin } from '../middleware/authorize.js'
import { createRateLimiter } from '../middleware/rateLimiter.js'

export function createAuthRoutes(config) {
  const router = Router()
  const controller = createAuthController(config)
  const limiterOptions = { windowMs: config.authRateLimitWindowMs }
  const loginLimiter = createRateLimiter({
    ...limiterOptions,
    max: config.loginRateLimitMax,
    code: 'AUTH_RATE_LIMITED',
    message: 'Too many sign-in attempts. Please try again later.',
  })
  const forgotPasswordLimiter = createRateLimiter({
    ...limiterOptions,
    max: config.forgotPasswordRateLimitMax,
    code: 'AUTH_RATE_LIMITED',
    message: 'Too many password reset requests. Please try again later.',
  })
  const resetPasswordLimiter = createRateLimiter({
    ...limiterOptions,
    max: config.resetPasswordRateLimitMax,
    code: 'AUTH_RATE_LIMITED',
    message: 'Too many password reset attempts. Please try again later.',
  })

  router.post('/login', loginLimiter, controller.login)
  router.post('/forgot-password', forgotPasswordLimiter, controller.forgotPassword)
  router.post('/reset-password', resetPasswordLimiter, controller.resetPassword)
  router.get('/me', authenticate, controller.me)
  router.post('/logout', authenticate, controller.logout)
  router.post('/change-password', authenticate, controller.changePassword)
  router.post('/impersonate/:userId', authenticate, requireSuperAdmin, controller.impersonate)
  router.post('/stop-impersonating', authenticate, controller.stopImpersonation)
  router.post('/stop-impersonation', authenticate, controller.stopImpersonation)

  return router
}
