import assert from 'node:assert/strict'

export function assertStatus(response, expected, label = 'response') {
  assert.equal(
    response.status,
    expected,
    `${label}: expected HTTP ${expected}, received ${response.status}: ${JSON.stringify(response.body)}`
  )
  return response.body
}

export function assertError(response, status, code) {
  assertStatus(response, status, code)
  assert.equal(response.body?.error?.code, code)
  assert.equal(typeof response.body?.error?.message, 'string')
  assert.equal(typeof response.body?.error?.requestId, 'string')
  return response.body.error
}

export async function createAdminUser(api, token, overrides = {}) {
  const suffix = overrides.suffix || Math.random().toString(36).slice(2, 10)
  const response = await api.request('/api/v1/users', {
    token,
    body: {
      firstName: 'Integration',
      lastName: 'User',
      name: 'Integration User',
      email: `integration.${suffix}@skg.example`,
      password: 'UserTest123!',
      role: 'Admin',
      ...overrides,
      suffix: undefined,
    },
  })
  assertStatus(response, 201, 'create test user')
  return response.body.data
}
