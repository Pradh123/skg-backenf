import assert from 'node:assert/strict'
import test from 'node:test'
import { createTestServer } from './helpers/testServer.js'
import { assertError, assertStatus } from './helpers/assertions.js'

test('resource validation, derived values, and permission-scoped lookups', async t => {
  const api = await createTestServer()
  const { token: adminToken } = await api.login()
  const vehicle = {
    registrationNumber: 'LOOKUP-MH-01-1001',
    vehicleMake: 'Toyota',
    vehicleModel: 'Innova Crysta',
    vehicleType: 'MPV/MUV',
    driverName: 'Linked Driver',
    status: 'Active',
  }
  let pickupTripId
  let lookupUserId
  let lookupToken

  try {
    await t.test('creates lookup prerequisites and derives linked trip fields', async () => {
      const prerequisites = [
        ['/api/v1/vehicles', vehicle],
        ['/api/v1/drivers', {
          employeeNumber: 'LOOKUP-EMP-1001',
          joiningDate: '2026-01-10',
          firstName: 'Linked',
          lastName: 'Driver',
          mobileNumber: '9876543210',
          location: 'Mumbai',
          status: 'Active',
        }],
        ['/api/v1/vendors', {
          vendorName: 'Lookup Fuel Vendor',
          vendorNumber: 'LOOKUP-VENDOR-1001',
          vendorType: 'Fuel',
          city: 'Mumbai',
          status: 'Active',
        }],
        ['/api/v1/parties', {
          corporateName: 'Lookup Corporate',
          contactName: 'Lookup Contact',
          phoneNumber: '9876543211',
          location: 'Pune',
        }],
      ]
      for (const [path, body] of prerequisites) {
        const response = await api.request(path, { token: adminToken, body })
        assertStatus(response, 201, path)
      }

      let response = await api.request('/api/v1/trips-regular', {
        token: adminToken,
        body: {
          vehicleNumber: vehicle.registrationNumber,
          clientName: 'Linked Corporate',
          number: 'LINKED-REG-1001',
          startDate: '2026-11-01',
          startTime: '09:00',
          endDate: '2026-11-02',
          endTime: '18:00',
          pickupAddress: 'Mumbai',
          dropAddress: 'Pune',
        },
      })
      assertStatus(response, 201)
      assert.equal(response.body.data.driverName, vehicle.driverName)

      response = await api.request('/api/v1/trips-pickup-drop', {
        token: adminToken,
        body: {
          vehicleNumber: vehicle.registrationNumber,
          tripDate: '2026-11-03',
          tripTime: '10:30',
          partyName: 'Lookup Corporate',
          number: 'LINKED-PD-1001',
          pickupOrDrop: 'Drop',
          pickupDropPoint: 'Mumbai Airport',
          rate: '12.5',
          totalKm: '4',
        },
      })
      assertStatus(response, 201)
      pickupTripId = response.body.data.id
      assert.equal(response.body.data.rate, 12.5)
      assert.equal(response.body.data.totalKm, 4)
      assert.equal(response.body.data.totalRate, 50)
      assert.equal(response.body.data.driverName, vehicle.driverName)

      response = await api.request(`/api/v1/trips-pickup-drop/${pickupTripId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { rate: 20 },
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.totalRate, 80)
      assert.equal(response.body.data.driverName, vehicle.driverName)
    })

    await t.test('rejects invalid numeric values and out-of-range business values', async () => {
      let response = await api.request('/api/v1/vehicles', {
        token: adminToken,
        body: {
          ...vehicle,
          registrationNumber: 'INVALID-YEAR-1001',
          manufactureYear: 1899,
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/fuel', {
        token: adminToken,
        body: {
          date: '2026-10-05',
          vehicleNumber: vehicle.registrationNumber,
          odometerReading: 1000,
          vendor: 'Lookup Fuel Vendor',
          liters: -1,
          pricePerUnit: 100,
          paymentMethod: 'UPI',
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/fuel', {
        token: adminToken,
        body: {
          date: '2026-10-05',
          vehicleNumber: vehicle.registrationNumber,
          odometerReading: 'not-a-number',
          vendor: 'Lookup Fuel Vendor',
          liters: 10,
          pricePerUnit: 100,
          paymentMethod: 'UPI',
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/invoices', {
        token: adminToken,
        body: {
          date: '2026-10-05',
          vehicleNumber: vehicle.registrationNumber,
          clientName: 'Lookup Corporate',
          clientAddress: 'Mumbai',
          invoiceNumber: 'INVALID-GST-1001',
          serviceName: 'Taxi',
          serviceQuantity: 1,
          serviceRate: 1000,
          gst: 101,
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')
    })

    await t.test('rejects invalid dates and reversed trip ranges', async () => {
      let response = await api.request('/api/v1/drivers', {
        token: adminToken,
        body: {
          employeeNumber: 'INVALID-DATE-EMP',
          joiningDate: 'not-a-date',
          firstName: 'Invalid',
          lastName: 'Date',
          mobileNumber: '9876543212',
          location: 'Mumbai',
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/trips-regular', {
        token: adminToken,
        body: {
          vehicleNumber: vehicle.registrationNumber,
          clientName: 'Lookup Corporate',
          number: 'REVERSED-REG-1001',
          startDate: '2026-11-10',
          startTime: '09:00',
          endDate: '2026-11-09',
          endTime: '18:00',
          pickupAddress: 'Mumbai',
          dropAddress: 'Pune',
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')
    })

    await t.test('rejects unsafe URLs, malformed files, and invalid emails', async () => {
      let response = await api.request('/api/v1/area-seo', {
        token: adminToken,
        body: {
          areaName: 'Unsafe URL Area',
          cityName: 'Mumbai',
          h1Title: 'Unsafe URL H1',
          seoTitle: 'Unsafe URL SEO',
          canonicalUrl: 'javascript:alert(1)',
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/vehicles', {
        token: adminToken,
        body: {
          ...vehicle,
          registrationNumber: 'INVALID-FILE-1001',
          vehiclePhoto: { name: 'vehicle.jpg', size: 100, dataUrl: 'not-a-data-url' },
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/vehicles', {
        token: adminToken,
        body: {
          ...vehicle,
          registrationNumber: 'OVERSIZE-FILE-1001',
          vehiclePhoto: {
            name: 'vehicle.jpg',
            size: (2 * 1024 * 1024) + 1,
            dataUrl: 'data:image/jpeg;base64,AA==',
          },
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/drivers', {
        token: adminToken,
        body: {
          employeeNumber: 'INVALID-EMAIL-EMP',
          joiningDate: '2026-10-05',
          firstName: 'Invalid',
          lastName: 'Email',
          mobileNumber: '9876543213',
          location: 'Mumbai',
          email: 'invalid-email',
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')
    })

    await t.test('enforces case-insensitive uniqueness and required fields on updates', async () => {
      let response = await api.request('/api/v1/vehicles', {
        token: adminToken,
        body: { ...vehicle, registrationNumber: vehicle.registrationNumber.toLowerCase() },
      })
      assertError(response, 409, 'CONFLICT')

      response = await api.request(`/api/v1/trips-pickup-drop/${pickupTripId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { pickupDropPoint: '' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')
    })

    await t.test('returns only safe lookup projections to Super Admin', async () => {
      let response = await api.request('/api/v1/lookups/vehicles', { token: adminToken })
      assertStatus(response, 200)
      const lookedUpVehicle = response.body.data.find(item =>
        item.registrationNumber === vehicle.registrationNumber
      )
      assert.ok(lookedUpVehicle)
      assert.equal(lookedUpVehicle.driverName, vehicle.driverName)
      assert.equal(Object.hasOwn(lookedUpVehicle, 'vehicleMake'), false)

      for (const resource of ['drivers', 'vendors', 'parties']) {
        response = await api.request(`/api/v1/lookups/${resource}`, { token: adminToken })
        assertStatus(response, 200, resource)
        assert.ok(response.body.data.length >= 1)
      }

      response = await api.request('/api/v1/lookups/branches', { token: adminToken })
      assertError(response, 404, 'NOT_FOUND')
      response = await api.request('/api/v1/lookups/not-a-resource', { token: adminToken })
      assertError(response, 404, 'NOT_FOUND')
      response = await api.request('/api/v1/lookups/vehicles')
      assertError(response, 401, 'UNAUTHORIZED')
    })

    await t.test('denies unrelated lookup access and allows related create workflows', async () => {
      let response = await api.request('/api/v1/users', {
        token: adminToken,
        body: {
          name: 'Lookup Workflow User',
          email: 'lookup.workflow@skg.example',
          password: 'LookupUser123!',
          role: 'Admin',
          permissions: { '/': ['view'] },
        },
      })
      assertStatus(response, 201)
      lookupUserId = response.body.data.id
      lookupToken = (await api.login('lookup.workflow@skg.example', 'LookupUser123!')).token

      for (const resource of ['vehicles', 'drivers', 'vendors', 'parties']) {
        response = await api.request(`/api/v1/lookups/${resource}`, { token: lookupToken })
        assertError(response, 403, 'FORBIDDEN')
      }

      response = await api.request(`/api/v1/users/${lookupUserId}/permissions`, {
        method: 'PUT',
        token: adminToken,
        body: {
          permissions: {
            '/': ['view'],
            '/trips/regular': ['create'],
            '/fuel': ['create'],
          },
        },
      })
      assertStatus(response, 200)

      for (const resource of ['vehicles', 'vendors', 'parties']) {
        response = await api.request(`/api/v1/lookups/${resource}`, { token: lookupToken })
        assertStatus(response, 200, resource)
      }
      response = await api.request('/api/v1/lookups/drivers', { token: lookupToken })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request(`/api/v1/users/${lookupUserId}/permissions`, {
        method: 'PUT',
        token: adminToken,
        body: { permissions: { '/': ['view'], '/vehicles': ['create'] } },
      })
      assertStatus(response, 200)
      response = await api.request('/api/v1/lookups/drivers', { token: lookupToken })
      assertStatus(response, 200)
    })

    await t.test('defaults issue status to Open, allows resolving, and rejects invalid statuses', async () => {
      let response = await api.request('/api/v1/issues', {
        token: adminToken,
        body: {
          vehicleNumber: vehicle.registrationNumber,
          summary: 'Lookup issue to resolve',
          priority: 'High',
          date: '2026-10-06',
          time: '11:00',
          description: 'Created to verify issue resolution.',
        },
      })
      assertStatus(response, 201)
      assert.equal(response.body.data.status, 'Open')
      const issueId = response.body.data.id

      response = await api.request(`/api/v1/issues/${issueId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'Resolved', resolutionNotes: 'Inspected and closed after a demo check.' },
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.status, 'Resolved')
      assert.ok(response.body.data.resolvedAt)
      assert.equal(response.body.data.resolutionNotes, 'Inspected and closed after a demo check.')

      response = await api.request(`/api/v1/issues/${issueId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'Ignored' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')
    })

    await t.test('validates blog SEO fields and keeps a stable publish date', async () => {
      let response = await api.request('/api/v1/blogs', {
        token: adminToken,
        body: {
          title: 'SEO Validation Article',
          metaTitle: 'SEO Validation Article | SKG Travels',
          metaDescription: 'Verifying SEO field validation for blog records.',
          ogImage: 'javascript:alert(1)',
        },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/blogs', {
        token: adminToken,
        body: {
          title: 'SEO Validation Article',
          metaTitle: 'SEO Validation Article | SKG Travels',
          metaDescription: 'Verifying SEO field validation for blog records.',
          image: 'https://cdn.example.com/seo-validation.webp',
          ogImage: 'https://cdn.example.com/seo-validation-og.webp',
          status: 'Published',
        },
      })
      assertStatus(response, 201)
      const blog = response.body.data
      assert.equal(blog.status, 'Published')
      assert.ok(blog.publishedAt, 'publishedAt is set on first publish')
      const originalPublishedAt = blog.publishedAt

      response = await api.request(`/api/v1/blogs/${blog.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { metaDescription: 'Updated description keeps the original publish date.' },
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.publishedAt, originalPublishedAt)

      response = await api.request(`/api/v1/blogs/${blog.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'Draft' },
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.status, 'Draft')
      assert.equal(response.body.data.publishedAt, undefined)
    })
  } finally {
    await api.close()
  }
})
