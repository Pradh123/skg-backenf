import assert from 'node:assert/strict'
import test from 'node:test'
import { PasswordReset } from '../src/models/PasswordReset.js'
import { createTestServer, TEST_ADMIN } from './helpers/testServer.js'
import { assertError, assertStatus } from './helpers/assertions.js'

test('authentication, sessions, password changes, and password resets', async t => {
  const api = await createTestServer({ passwordResetTtlMs: 60_000 })
  let adminToken
  let adminPassword = TEST_ADMIN.password

  try {
    await t.test('rejects missing, malformed, and incorrect login credentials', async () => {
      let response = await api.request('/api/v1/auth/login', { body: {} })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/auth/login', {
        body: { email: 'not-an-email', password: 'anything' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/auth/login', {
        body: { email: TEST_ADMIN.email, password: 'WrongPassword1!' },
      })
      assertError(response, 401, 'UNAUTHORIZED')
    })

    await t.test('logs in the seeded Super Admin and returns the current session', async () => {
      const response = await api.request('/api/v1/auth/login', {
        body: { email: TEST_ADMIN.email.toUpperCase(), password: adminPassword },
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.user.email, TEST_ADMIN.email)
      assert.equal(response.body.data.user.role, 'Super Admin')
      assert.equal(response.body.data.isImpersonating, false)
      assert.equal(typeof response.body.data.token, 'string')
      assert.ok(response.body.data.token.length >= 32)
      assert.equal(response.body.data.user.passwordHash, undefined)
      adminToken = response.body.data.token

      const me = await api.request('/api/v1/auth/me', { token: adminToken })
      assertStatus(me, 200)
      assert.equal(me.body.data.user.email, TEST_ADMIN.email)
      assert.equal(me.body.data.actor, null)

      const anonymous = await api.request('/api/v1/auth/me')
      assertError(anonymous, 401, 'UNAUTHORIZED')
    })

    await t.test('changes password, preserves the current session, and revokes other sessions', async () => {
      const secondSession = await api.login(TEST_ADMIN.email, adminPassword)

      let response = await api.request('/api/v1/auth/change-password', {
        token: adminToken,
        body: { currentPassword: 'WrongPassword1!', newPassword: 'ChangedAdmin123!' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/auth/change-password', {
        token: adminToken,
        body: { currentPassword: adminPassword, newPassword: 'weak' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/auth/change-password', {
        token: adminToken,
        body: { currentPassword: adminPassword, newPassword: 'ChangedAdmin123!' },
      })
      assertStatus(response, 200)
      adminPassword = 'ChangedAdmin123!'

      response = await api.request('/api/v1/auth/me', { token: adminToken })
      assertStatus(response, 200)

      response = await api.request('/api/v1/auth/me', { token: secondSession.token })
      assertError(response, 401, 'UNAUTHORIZED')

      response = await api.request('/api/v1/auth/login', {
        body: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
      })
      assertError(response, 401, 'UNAUTHORIZED')

      const relogin = await api.login(TEST_ADMIN.email, adminPassword)
      assert.equal(relogin.user.role, 'Super Admin')
    })

    await t.test('logs out and makes the bearer token unusable', async () => {
      const session = await api.login(TEST_ADMIN.email, adminPassword)
      let response = await api.request('/api/v1/auth/logout', {
        method: 'POST',
        token: session.token,
      })
      assertStatus(response, 200)

      response = await api.request('/api/v1/auth/me', { token: session.token })
      assertError(response, 401, 'UNAUTHORIZED')
    })

    await t.test('issues generic forgot-password responses without account enumeration', async () => {
      let response = await api.request('/api/v1/auth/forgot-password', {
        body: { email: 'invalid-email' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/auth/forgot-password', {
        body: { email: 'missing.user@skg.example' },
      })
      assertStatus(response, 202)
      assert.equal(response.body.data.resetToken, undefined)
      assert.match(response.body.data.message, /If an account exists/i)

      response = await api.request('/api/v1/auth/forgot-password', {
        body: { email: TEST_ADMIN.email },
      })
      assertStatus(response, 202)
      assert.match(response.body.data.message, /If an account exists/i)
      assert.equal(typeof response.body.data.resetToken, 'string')
      assert.ok(response.body.data.expiresAt)
    })

    await t.test('resets a password once and revokes all existing user sessions', async () => {
      const active = await api.login(TEST_ADMIN.email, adminPassword)
      const forgot = await api.request('/api/v1/auth/forgot-password', {
        body: { email: TEST_ADMIN.email },
      })
      assertStatus(forgot, 202)
      const resetToken = forgot.body.data.resetToken

      let response = await api.request('/api/v1/auth/reset-password', {
        body: { token: 'not-a-real-token', newPassword: 'ResetAdmin123!' },
      })
      assertError(response, 401, 'UNAUTHORIZED')

      response = await api.request('/api/v1/auth/reset-password', {
        body: { token: resetToken, newPassword: 'weak' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/auth/reset-password', {
        body: { token: resetToken, newPassword: 'ResetAdmin123!' },
      })
      assertStatus(response, 200)
      adminPassword = 'ResetAdmin123!'

      response = await api.request('/api/v1/auth/me', { token: active.token })
      assertError(response, 401, 'UNAUTHORIZED')
      response = await api.request('/api/v1/auth/me', { token: adminToken })
      assertError(response, 401, 'UNAUTHORIZED')

      response = await api.request('/api/v1/auth/reset-password', {
        body: { token: resetToken, newPassword: 'AnotherAdmin123!' },
      })
      assertError(response, 401, 'UNAUTHORIZED')

      response = await api.request('/api/v1/auth/login', {
        body: { email: TEST_ADMIN.email, password: 'ChangedAdmin123!' },
      })
      assertError(response, 401, 'UNAUTHORIZED')

      const relogin = await api.login(TEST_ADMIN.email, adminPassword)
      assert.equal(relogin.user.email, TEST_ADMIN.email)
    })

    await t.test('rejects missing and expired password-reset tokens', async () => {
      let response = await api.request('/api/v1/auth/reset-password', {
        body: { newPassword: 'AnotherAdmin123!' },
      })
      assertError(response, 401, 'UNAUTHORIZED')

      const forgot = await api.request('/api/v1/auth/forgot-password', {
        body: { email: TEST_ADMIN.email },
      })
      assertStatus(forgot, 202)
      await PasswordReset.updateMany({}, { $set: { expiresAt: new Date(0) } })

      response = await api.request('/api/v1/auth/reset-password', {
        body: { token: forgot.body.data.resetToken, newPassword: 'AnotherAdmin123!' },
      })
      assertError(response, 401, 'UNAUTHORIZED')

      const current = await api.login(TEST_ADMIN.email, adminPassword)
      assert.equal(current.user.email, TEST_ADMIN.email)
    })
  } finally {
    await api.close()
  }
})

test('production forgot-password responses never expose reset tokens', async () => {
  const api = await createTestServer({ nodeEnv: 'production' })
  try {
    const response = await api.request('/api/v1/auth/forgot-password', {
      body: { email: TEST_ADMIN.email },
    })
    assertStatus(response, 202)
    assert.equal(response.body.data.resetToken, undefined)
    assert.equal(response.body.data.expiresAt, undefined)
    assert.match(response.body.data.message, /If an account exists/i)
  } finally {
    await api.close()
  }
})

test('authentication endpoints rate limit repeated abusive requests', async t => {
  const api = await createTestServer({
    authRateLimitWindowMs: 60_000,
    loginRateLimitMax: 2,
    forgotPasswordRateLimitMax: 2,
    resetPasswordRateLimitMax: 2,
  })
  try {
    await t.test('limits repeated login failures', async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await api.request('/api/v1/auth/login', {
          body: { email: TEST_ADMIN.email, password: 'WrongPassword1!' },
        })
        assertError(response, 401, 'UNAUTHORIZED')
        assert.equal(response.headers.get('ratelimit-limit'), '2')
      }
      const response = await api.request('/api/v1/auth/login', {
        body: { email: TEST_ADMIN.email, password: 'WrongPassword1!' },
      })
      assertError(response, 429, 'AUTH_RATE_LIMITED')
      assert.equal(response.headers.get('ratelimit-remaining'), '0')
      assert.ok(Number(response.headers.get('retry-after')) >= 1)
    })

    await t.test('limits forgot-password requests independently', async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await api.request('/api/v1/auth/forgot-password', {
          body: { email: 'missing.user@skg.example' },
        })
        assertStatus(response, 202)
      }
      const response = await api.request('/api/v1/auth/forgot-password', {
        body: { email: 'missing.user@skg.example' },
      })
      assertError(response, 429, 'AUTH_RATE_LIMITED')
    })

    await t.test('limits invalid reset-token attempts independently', async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await api.request('/api/v1/auth/reset-password', {
          body: { token: 'invalid-reset-token', newPassword: 'ResetAdmin123!' },
        })
        assertError(response, 401, 'UNAUTHORIZED')
      }
      const response = await api.request('/api/v1/auth/reset-password', {
        body: { token: 'invalid-reset-token', newPassword: 'ResetAdmin123!' },
      })
      assertError(response, 429, 'AUTH_RATE_LIMITED')
    })
  } finally {
    await api.close()
  }
})
