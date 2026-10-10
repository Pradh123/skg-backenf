import assert from 'node:assert/strict'
import test from 'node:test'
import { RESOURCE_DEFINITIONS } from '../src/constants/resources.js'
import { createTestServer } from './helpers/testServer.js'
import { assertError, assertStatus } from './helpers/assertions.js'
import { RESOURCE_CASES } from './helpers/resourceFixtures.js'

test('all allowlisted admin resources support validated and authorized CRUD', async t => {
  const api = await createTestServer()
  const { token } = await api.login()

  try {
    await t.test('rejects anonymous resource access', async () => {
      const response = await api.request('/api/v1/vehicles')
      assertError(response, 401, 'UNAUTHORIZED')
    })

    for (const fixture of RESOURCE_CASES) {
      await t.test(`${fixture.route} create, list, search, get, update, and delete`, async () => {
        const definition = RESOURCE_DEFINITIONS[fixture.route]
        assert.ok(definition, `Missing backend definition for ${fixture.route}`)

        if (fixture.route === 'area-seo') {
          const city = await api.request('/api/v1/cities', { token, body: { cityName: fixture.body.cityName, slug: 'area-test-master-city' } })
          assertStatus(city, 201)
        }
        let response = await api.request(`/api/v1/${fixture.route}`, {
          token,
          body: {},
        })
        assertError(response, 422, 'VALIDATION_ERROR')

        response = await api.request(`/api/v1/${fixture.route}`, {
          token,
          body: fixture.body,
        })
        assertStatus(response, 201)
        const created = response.body.data
        assert.equal(typeof created.id, 'string')
        assert.ok(created.createdAt)
        assert.ok(created.updatedAt)
        for (const [field, expected] of Object.entries(fixture.expected || {})) {
          assert.equal(created[field], expected, `${fixture.route}.${field}`)
        }

        response = await api.request(`/api/v1/${fixture.route}/${created.id}`, { token })
        assertStatus(response, 200)
        assert.equal(response.body.data.id, created.id)

        const searchField = definition.searchable[0]
        const searchValue = created[searchField]
        response = await api.request(
          `/api/v1/${fixture.route}?search=${encodeURIComponent(String(searchValue))}&limit=1`,
          { token }
        )
        assertStatus(response, 200)
        assert.equal(response.body.data.length, 1)
        assert.equal(response.body.data[0].id, created.id)
        assert.equal(response.body.meta.total, 1)

        response = await api.request(`/api/v1/${fixture.route}/${created.id}`, {
          method: 'PATCH',
          token,
          body: { id: 'client-controlled-id', auditNote: `updated ${fixture.route}` },
        })
        assertStatus(response, 200)
        assert.equal(response.body.data.id, created.id)
        assert.equal(response.body.data.auditNote, `updated ${fixture.route}`)

        if (definition.unique.length) {
          response = await api.request(`/api/v1/${fixture.route}`, {
            token,
            body: fixture.body,
          })
          assertError(response, 409, 'CONFLICT')
        }

        response = await api.request(`/api/v1/${fixture.route}/${created.id}`, {
          method: 'DELETE',
          token,
        })
        assertStatus(response, 200)
        assert.equal(response.body.data.id, created.id)

        response = await api.request(`/api/v1/${fixture.route}/${created.id}`, { token })
        assertError(response, 404, 'NOT_FOUND')
      })
    }

    await t.test('paginates collection results and treats search text as a literal', async () => {
      for (const branchName of ['Regex [Hub] Alpha', 'Regex [Hub] Beta', 'Different Branch']) {
        const response = await api.request('/api/v1/branches', {
          token,
          body: { branchName },
        })
        assertStatus(response, 201)
      }

      let response = await api.request('/api/v1/branches?search=%5BHub%5D&limit=1&page=1', { token })
      assertStatus(response, 200)
      assert.equal(response.body.data.length, 1)
      assert.equal(response.body.meta.total, 2)
      assert.equal(response.body.meta.pages, 2)

      response = await api.request('/api/v1/branches?search=%5BHub%5D&limit=1&page=2', { token })
      assertStatus(response, 200)
      assert.equal(response.body.data.length, 1)
      assert.equal(response.body.meta.page, 2)
    })

    await t.test('removes reserved and Mongo operator keys from record payloads', async () => {
      const payload = JSON.parse(`{
        "registrationNumber": "SAFE-CAR-1",
        "vehicleMake": "Toyota",
        "vehicleModel": "Innova",
        "vehicleType": "SUV",
        "id": "forged-id",
        "$where": "dangerous",
        "nested.value": "dangerous",
        "constructor": "dangerous",
        "__proto__": { "polluted": true }
      }`)
      const response = await api.request('/api/v1/vehicles', { token, body: payload })
      assertStatus(response, 201)
      const record = response.body.data
      assert.notEqual(record.id, 'forged-id')
      assert.equal(record.$where, undefined)
      assert.equal(record['nested.value'], undefined)
      assert.equal(record.constructor, Object.prototype.constructor)
      assert.equal(record.polluted, undefined)
    })
  } finally {
    await api.close()
  }
})
