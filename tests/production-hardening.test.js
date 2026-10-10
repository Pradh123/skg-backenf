import assert from 'node:assert/strict'
import test from 'node:test'
import { loadConfig, DEFAULT_ADMIN_PASSWORD } from '../src/config/env.js'
import { errorHandler } from '../src/middleware/errorHandler.js'
import { User } from '../src/models/User.js'
import { Session } from '../src/models/Session.js'
import { PasswordReset } from '../src/models/PasswordReset.js'
import { ensureSuperAdmin } from '../src/services/userService.js'
import { hashPassword, verifyPassword } from '../src/services/passwordService.js'
import { HttpError } from '../src/utils/errors.js'
import { createTestServer } from './helpers/testServer.js'

test('production configuration requires a strong non-default admin password', () => {
  for (const password of [
    DEFAULT_ADMIN_PASSWORD,
    'short!',
    'alllowercase1!',
    'ALLUPPERCASE1!',
    'NoNumberHere!',
    'NoSymbolHere1',
  ]) {
    assert.throws(
      () => loadConfig({ nodeEnv: 'production', adminPassword: password }),
      /ADMIN_PASSWORD/,
    )
  }

  const config = loadConfig({ nodeEnv: 'production', adminPassword: 'ProductionReady456$' })
  assert.equal(config.adminPassword, 'ProductionReady456$')

  assert.equal(loadConfig({ nodeEnv: 'production', adminPassword: 'Aa1!bbbb' }).adminPassword.length, 8)
  const maximumLength = `Aa1!${'b'.repeat(124)}`
  assert.equal(loadConfig({ nodeEnv: 'production', adminPassword: maximumLength }).adminPassword.length, 128)
  assert.throws(
    () => loadConfig({ nodeEnv: 'production', adminPassword: `${maximumLength}b` }),
    /ADMIN_PASSWORD/,
  )
})

test('unexpected server errors never expose their internal message', () => {
  let status
  let payload
  const originalConsoleError = console.error
  const response = {
    status(value) {
      status = value
      return this
    },
    json(value) {
      payload = value
      return this
    },
  }

  try {
    console.error = () => {}
    errorHandler(
      new Error('Mongo connection failed for mongodb://private-host/internal-db'),
      { requestId: 'hardening-test' },
      response,
    )
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(status, 500)
  assert.deepEqual(payload, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: 'hardening-test',
    },
  })

  try {
    console.error = () => {}
    errorHandler(
      new HttpError(503, 'DATABASE_UNAVAILABLE', 'private database topology', { host: 'private' }),
      { requestId: 'typed-hardening-test' },
      response,
    )
  } finally {
    console.error = originalConsoleError
  }
  assert.equal(status, 500)
  assert.deepEqual(payload, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: 'typed-hardening-test',
    },
  })
})

test('production startup rotates only the development default admin password', async () => {
  const api = await createTestServer()
  const productionPassword = 'ProductionReady456$'
  const customPassword = 'OwnerSelected789#'

  try {
    let admin = await User.findOne({ email: api.config.adminEmail }).select('+passwordHash')
    admin.passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD)
    await admin.save()
    const staleSession = await api.login(api.config.adminEmail, DEFAULT_ADMIN_PASSWORD)
    await Promise.all([
      Session.create({
        tokenHash: 'actor-session-created-before-production-rotation',
        user: admin._id,
        actorUser: admin._id,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      PasswordReset.create({
        tokenHash: 'reset-created-before-production-rotation',
        user: admin._id,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ])

    await ensureSuperAdmin({
      ...api.config,
      nodeEnv: 'production',
      adminPassword: productionPassword,
    })

    admin = await User.findOne({ email: api.config.adminEmail }).select('+passwordHash')
    assert.equal(await verifyPassword(DEFAULT_ADMIN_PASSWORD, admin.passwordHash), false)
    assert.equal(await verifyPassword(productionPassword, admin.passwordHash), true)
    assert.equal(await Session.countDocuments({
      $or: [{ user: admin._id }, { actorUser: admin._id }],
    }), 0)
    assert.equal(await PasswordReset.countDocuments({ user: admin._id }), 0)
    const staleResponse = await api.request('/api/v1/auth/me', { token: staleSession.token })
    assert.equal(staleResponse.status, 401)

    admin.passwordHash = await hashPassword(customPassword)
    await admin.save()
    await Session.create({
      tokenHash: 'custom-password-session-that-must-be-preserved',
      user: admin._id,
      expiresAt: new Date(Date.now() + 60_000),
    })
    await ensureSuperAdmin({
      ...api.config,
      nodeEnv: 'production',
      adminPassword: 'DifferentEnvironment123!',
    })

    admin = await User.findOne({ email: api.config.adminEmail }).select('+passwordHash')
    assert.equal(await verifyPassword(customPassword, admin.passwordHash), true)
    assert.equal(await verifyPassword('DifferentEnvironment123!', admin.passwordHash), false)
    assert.equal(await Session.countDocuments({ user: admin._id }), 1)
  } finally {
    await api.close()
  }
})
