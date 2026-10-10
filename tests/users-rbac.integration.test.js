import assert from 'node:assert/strict'
import test from 'node:test'
import { createTestServer } from './helpers/testServer.js'
import { assertError, assertStatus } from './helpers/assertions.js'

test('users, RBAC, profile access, blocking, and impersonation', async t => {
  const api = await createTestServer()
  const adminSession = await api.login()
  const adminToken = adminSession.token
  const adminUser = adminSession.user
  const userPassword = 'LimitedUser123!'
  const userBody = {
    firstName: 'Limited',
    lastName: 'Operator',
    name: 'Limited Operator',
    email: 'limited.operator@skg.example',
    password: userPassword,
    role: 'Admin',
    branch: 'Mumbai',
    photo: 'data:image/png;base64,AA==',
    permissions: {
      '/': ['view'],
      '/vehicles': ['view'],
      '/leads': ['view', 'edit', 'delete'],
      '/masters/invoice-settings': ['view'],
    },
  }
  let managedUser
  let userToken

  try {
    await t.test('protects user management and validates account creation', async () => {
      let response = await api.request('/api/v1/users')
      assertError(response, 401, 'UNAUTHORIZED')

      response = await api.request('/api/v1/users', {
        token: adminToken,
        body: { ...userBody, email: 'bad', password: 'weak', role: 'Unknown' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/users', {
        token: adminToken,
        body: { ...userBody, email: 'another.super@skg.example', role: 'Super Admin' },
      })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request('/api/v1/users', {
        token: adminToken,
        body: {
          ...userBody,
          email: 'invalid.photo@skg.example',
          photo: 'data:text/plain;base64,AA==',
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/users', { token: adminToken, body: userBody })
      assertStatus(response, 201)
      managedUser = response.body.data
      assert.equal(managedUser.email, userBody.email)
      assert.equal(managedUser.passwordHash, undefined)
      assert.deepEqual(managedUser.permissions['/vehicles'], ['view'])
      assert.deepEqual(managedUser.permissions['/leads'], ['view', 'edit'])
      assert.deepEqual(managedUser.permissions['/drivers'], [])

      response = await api.request('/api/v1/users', { token: adminToken, body: userBody })
      assertError(response, 409, 'CONFLICT')

      response = await api.request('/api/v1/users?search=LIMITED&limit=1', { token: adminToken })
      assertStatus(response, 200)
      assert.equal(response.body.data.length, 1)
      assert.equal(response.body.data[0].id, managedUser.id)
      assert.equal(response.body.meta.limit, 1)
    })

    await t.test('enforces per-operation permissions on every request', async () => {
      const session = await api.login(userBody.email, userPassword)
      userToken = session.token

      let response = await api.request('/api/v1/vehicles', { token: userToken })
      assertStatus(response, 200)

      response = await api.request('/api/v1/vehicles', {
        token: userToken,
        body: {
          registrationNumber: 'RBAC-CAR-1',
          vehicleMake: 'Toyota',
          vehicleModel: 'Innova',
          vehicleType: 'SUV',
        },
      })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request('/api/v1/drivers', { token: userToken })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request('/api/v1/users', { token: userToken })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request('/api/v1/drivers', {
        token: adminToken,
        body: {
          employeeNumber: 'HIDDEN-DASH-EMP',
          joiningDate: '2026-10-05',
          firstName: 'Hidden',
          lastName: 'Driver',
          mobileNumber: '9876543219',
          location: 'Mumbai',
        },
      })
      assertStatus(response, 201)

      response = await api.request('/api/v1/dashboard', { token: userToken })
      assertStatus(response, 200)
      assert.ok(Array.isArray(response.body.data.stats))
      assert.equal(response.body.data.counts.drivers, undefined)
      assert.equal(response.body.data.counts.users, undefined)
      assert.equal(
        response.body.data.stats.some(item => item.label === 'Total Drivers'),
        false
      )
      assert.equal(
        response.body.data.quickStats.some(item => item.label === 'Users'),
        false
      )

      response = await api.request('/api/v1/public/leads', {
        body: { name: 'RBAC Lead', phone: '9876543218' },
      })
      assertStatus(response, 201)
      const leadId = response.body.data.id

      response = await api.request(`/api/v1/leads/${leadId}/status`, {
        method: 'PATCH', token: userToken, body: { status: 'Contacted' },
      })
      assertStatus(response, 200)
      response = await api.request(`/api/v1/leads/${leadId}`, {
        method: 'DELETE', token: userToken,
      })
      assertError(response, 403, 'FORBIDDEN')
    })

    await t.test('lets a signed-in user read and edit only safe profile fields', async () => {
      let response = await api.request('/api/v1/profile', { token: userToken })
      assertStatus(response, 200)
      assert.equal(response.body.data.id, managedUser.id)

      response = await api.request('/api/v1/profile', {
        method: 'PATCH',
        token: userToken,
        body: {
          name: 'Updated Limited Operator',
          email: 'updated.operator@skg.example',
          phone: '9876543210',
          photo: 'https://cdn.example.com/operators/limited.png',
        },
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.name, 'Updated Limited Operator')
      assert.equal(response.body.data.email, 'updated.operator@skg.example')
      assert.equal(response.body.data.photo, 'https://cdn.example.com/operators/limited.png')

      response = await api.request('/api/v1/profile', {
        method: 'PATCH',
        token: userToken,
        body: { photo: 'ftp://example.com/not-allowed.png' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/profile', {
        method: 'PATCH',
        token: userToken,
        body: { role: 'Super Admin', blocked: false },
      })
      const error = assertError(response, 422, 'VALIDATION_ERROR')
      assert.deepEqual(error.details.map(item => item.field).sort(), ['blocked', 'role'])

      response = await api.request('/api/v1/auth/login', {
        body: { email: userBody.email, password: userPassword },
      })
      assertError(response, 401, 'UNAUTHORIZED')
      const relogin = await api.login('updated.operator@skg.example', userPassword)
      assert.equal(relogin.user.name, 'Updated Limited Operator')
    })

    await t.test('applies permission changes to already active sessions', async () => {
      const permissions = {
        '/': ['view'],
        '/vehicles': ['view', 'create', 'edit', 'delete'],
        '/leads': ['view', 'edit', 'delete'],
      }
      let response = await api.request(`/api/v1/users/${managedUser.id}/permissions`, {
        method: 'PUT',
        token: adminToken,
        body: { permissions },
      })
      assertStatus(response, 200)
      assert.deepEqual(response.body.data.permissions['/vehicles'], ['view', 'create', 'edit', 'delete'])
      assert.deepEqual(response.body.data.permissions['/leads'], ['view', 'edit'])

      response = await api.request('/api/v1/vehicles', {
        token: userToken,
        body: {
          registrationNumber: 'RBAC-CAR-2',
          vehicleMake: 'Toyota',
          vehicleModel: 'Innova',
          vehicleType: 'SUV',
        },
      })
      assertStatus(response, 201)
      const vehicleId = response.body.data.id

      response = await api.request(`/api/v1/vehicles/${vehicleId}`, {
        method: 'PATCH',
        token: userToken,
        body: { vehicleModel: 'Innova Crysta' },
      })
      assertStatus(response, 200)

      response = await api.request(`/api/v1/vehicles/${vehicleId}`, {
        method: 'DELETE',
        token: userToken,
      })
      assertStatus(response, 200)
    })

    await t.test('supports Super Admin impersonation and a secure return to the actor', async () => {
      let response = await api.request(`/api/v1/auth/impersonate/${adminUser.id}`, {
        method: 'POST',
        token: adminToken,
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/auth/impersonate/missing-user', {
        method: 'POST',
        token: adminToken,
      })
      assertError(response, 404, 'NOT_FOUND')

      response = await api.request(`/api/v1/auth/impersonate/${managedUser.id}`, {
        method: 'POST',
        token: adminToken,
      })
      assertStatus(response, 200)
      const impersonatedToken = response.body.data.token
      assert.equal(response.body.data.user.id, managedUser.id)
      assert.equal(response.body.data.actor.id, adminUser.id)
      assert.equal(response.body.data.isImpersonating, true)

      response = await api.request('/api/v1/auth/me', { token: impersonatedToken })
      assertStatus(response, 200)
      assert.equal(response.body.data.isImpersonating, true)

      response = await api.request('/api/v1/users', { token: impersonatedToken })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request(`/api/v1/auth/impersonate/${managedUser.id}`, {
        method: 'POST',
        token: userToken,
      })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request('/api/v1/auth/stop-impersonating', {
        method: 'POST',
        token: impersonatedToken,
      })
      assertStatus(response, 200)
      const restoredToken = response.body.data.token
      assert.equal(response.body.data.user.id, adminUser.id)
      assert.equal(response.body.data.isImpersonating, false)

      response = await api.request('/api/v1/auth/me', { token: impersonatedToken })
      assertError(response, 401, 'UNAUTHORIZED')
      response = await api.request('/api/v1/users', { token: restoredToken })
      assertStatus(response, 200)

      response = await api.request('/api/v1/auth/stop-impersonating', {
        method: 'POST',
        token: restoredToken,
      })
      assertError(response, 422, 'VALIDATION_ERROR')
    })

    await t.test('blocks, unblocks, and deletes users while protecting Super Admin', async () => {
      let response = await api.request(`/api/v1/users/${adminUser.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { blocked: true },
      })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request(`/api/v1/users/${adminUser.id}`, {
        method: 'DELETE',
        token: adminToken,
      })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request(`/api/v1/users/${managedUser.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { blocked: true },
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.blocked, true)

      response = await api.request('/api/v1/auth/me', { token: userToken })
      assertError(response, 401, 'UNAUTHORIZED')
      response = await api.request('/api/v1/auth/login', {
        body: { email: 'updated.operator@skg.example', password: userPassword },
      })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request(`/api/v1/users/${managedUser.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { blocked: false },
      })
      assertStatus(response, 200)
      const unblocked = await api.login('updated.operator@skg.example', userPassword)
      assert.equal(unblocked.user.blocked, false)

      response = await api.request(`/api/v1/users/${managedUser.id}`, {
        method: 'DELETE',
        token: adminToken,
      })
      assertStatus(response, 200)

      response = await api.request(`/api/v1/users/${managedUser.id}`, { token: adminToken })
      assertError(response, 404, 'NOT_FOUND')
      response = await api.request('/api/v1/auth/me', { token: unblocked.token })
      assertError(response, 401, 'UNAUTHORIZED')
    })
  } finally {
    await api.close()
  }
})
