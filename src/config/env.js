const DEFAULT_ADMIN_EMAIL = 'skgtravels9@gmail.com'
const DEFAULT_ADMIN_PASSWORD = 'ChangeMe123!'

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

function origins(value) {
  const fallback = [
    'https://cms-of-skg.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]
  if (!value) return fallback
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function isStrongPassword(value) {
  return typeof value === 'string'
    && value.length >= 8
    && value.length <= 128
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value)
}

export function loadConfig(overrides = {}) {
  const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: positiveInteger(process.env.PORT, 4000, 'PORT'),
    mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skg_admin',
    corsOrigins: origins(process.env.CORS_ORIGINS),
    adminEmail: (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase(),
    adminPassword: process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
    sessionTtlMs: positiveInteger(process.env.SESSION_TTL_MS, 8 * 60 * 60 * 1000, 'SESSION_TTL_MS'),
    passwordResetTtlMs: positiveInteger(process.env.PASSWORD_RESET_TTL_MS, 30 * 60 * 1000, 'PASSWORD_RESET_TTL_MS'),
    authRateLimitWindowMs: positiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 'AUTH_RATE_LIMIT_WINDOW_MS'),
    loginRateLimitMax: positiveInteger(process.env.LOGIN_RATE_LIMIT_MAX, 20, 'LOGIN_RATE_LIMIT_MAX'),
    forgotPasswordRateLimitMax: positiveInteger(process.env.FORGOT_PASSWORD_RATE_LIMIT_MAX, 10, 'FORGOT_PASSWORD_RATE_LIMIT_MAX'),
    resetPasswordRateLimitMax: positiveInteger(process.env.RESET_PASSWORD_RATE_LIMIT_MAX, 30, 'RESET_PASSWORD_RATE_LIMIT_MAX'),
    jsonLimit: process.env.JSON_LIMIT || '14mb',
    trustProxy: process.env.TRUST_PROXY === 'true',
    ...overrides,
  }

  if (config.nodeEnv === 'production' && !isStrongPassword(config.adminPassword)) {
    throw new Error('ADMIN_PASSWORD must be 8-128 characters and include uppercase, lowercase, number, and symbol in production')
  }
  if (config.nodeEnv === 'production' && config.adminPassword === DEFAULT_ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD must be changed from the development default in production')
  }
  return config
}

export { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD }
