import assert from 'node:assert/strict'
import test from 'node:test'
import { resetPublicLeadLimiter } from '../src/middleware/publicLeadLimiter.js'
import { createTestServer } from './helpers/testServer.js'
import { assertError, assertStatus } from './helpers/assertions.js'

test('public APIs, CMS, settings, dashboard, CORS, and HTTP error behavior', async t => {
  const api = await createTestServer({ jsonLimit: '32kb' })
  const { token: adminToken } = await api.login()
  let leadId
  let limitedUser
  let limitedToken

  try {
    await t.test('reports database health and applies request/security/CORS headers', async () => {
      const requestId = 'integration-request-id'
      let response = await api.request('/health', {
        headers: { Origin: 'http://allowed.test', 'X-Request-Id': requestId },
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.status, 'ok')
      assert.equal(response.body.data.database.state, 'connected')
      assert.equal(response.body.data.database.database, undefined)
      assert.equal(response.headers.get('x-request-id'), requestId)
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('x-frame-options'), 'DENY')
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://allowed.test')

      response = await api.request('/api/v1/health', {
        method: 'OPTIONS',
        headers: { Origin: 'http://allowed.test' },
      })
      assertStatus(response, 204)
      assert.match(response.headers.get('access-control-allow-methods'), /PATCH/)

      response = await api.request('/health', {
        headers: { Origin: 'http://denied.test' },
      })
      assertError(response, 403, 'FORBIDDEN')
      assert.equal(response.headers.get('access-control-allow-origin'), null)
    })

    await t.test('returns consistent errors for unknown routes, malformed JSON, and large bodies', async () => {
      let response = await api.request('/api/v1/does-not-exist')
      const notFound = assertError(response, 404, 'NOT_FOUND')
      assert.match(notFound.message, /Route GET/)

      response = await api.request('/api/v1/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        rawBody: '{"name":',
      })
      assertError(response, 400, 'INVALID_JSON')

      response = await api.request('/api/v1/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        rawBody: JSON.stringify({
          name: 'Large Payload',
          phone: '9876543210',
          message: 'x'.repeat(40 * 1024),
        }),
      })
      assertError(response, 413, 'PAYLOAD_TOO_LARGE')
    })

    await t.test('normalizes website leads and validates public submissions', async () => {
      resetPublicLeadLimiter()
      let response = await api.request('/api/v1/public/leads', {
        body: {
          name: '  Website Lead  ',
          mobile: '+91 98765-43210',
          email: 'lead@skg.example',
          from: 'Mumbai',
          to: 'Pune',
          pickupDate: '2026-10-20',
          carName: 'Innova Crysta',
          note: 'Four passengers',
        },
      })
      assertStatus(response, 201)
      const lead = response.body.data
      leadId = lead.id
      assert.equal(lead.name, 'Website Lead')
      assert.equal(lead.phone, '9876543210')
      assert.equal(lead.pickup, 'Mumbai')
      assert.equal(lead.destination, 'Pune')
      assert.equal(lead.travelDate, '2026-10-20')
      assert.equal(lead.vehiclePreference, 'Innova Crysta')
      assert.equal(lead.message, 'Four passengers')
      assert.equal(lead.status, 'New')
      assert.equal(response.headers.get('ratelimit-limit'), '20')

      response = await api.request('/api/v1/public/leads', {
        body: { name: '', phone: '123' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/public/leads', {
        body: { name: 'Bad Email', phone: '9876543210', email: 'not-email' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/public/leads', {
        body: { name: 'Bad Date', phone: '9876543210', travelDate: 'not-a-date' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')
    })

    await t.test('rate limits repeated public lead submissions', async () => {
      resetPublicLeadLimiter()
      for (let index = 0; index < 20; index += 1) {
        const response = await api.request('/api/v1/public/leads', { body: {} })
        assert.equal(response.status, 422, `request ${index + 1} should reach validation`)
      }
      const response = await api.request('/api/v1/public/leads', { body: {} })
      assertError(response, 429, 'RATE_LIMITED')
      assert.equal(response.headers.get('ratelimit-remaining'), '0')
      resetPublicLeadLimiter()
    })

    await t.test('lets authorized admins search, inspect, transition, and delete leads', async () => {
      let response = await api.request('/api/v1/leads?search=Website%20Lead', { token: adminToken })
      assertStatus(response, 200)
      assert.equal(response.body.data.length, 1)
      assert.equal(response.body.data[0].id, leadId)

      response = await api.request(`/api/v1/leads/${leadId}`, { token: adminToken })
      assertStatus(response, 200)

      response = await api.request(`/api/v1/leads/${leadId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'Contacted' },
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.status, 'Contacted')
      assert.ok(response.body.data.statusUpdatedAt)

      response = await api.request(`/api/v1/leads/${leadId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'Invalid status' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')
    })

    await t.test('serves only active, published CMS content to public clients', async () => {
      const records = [
        { route: 'cities', body: { cityName: 'Published City', slug: 'published-city', published: true, active: true, keywords: 'city, taxi', headScripts: '<script type="application/ld+json">{"@type":"Place"}</script>' } },
        { route: 'cities', body: { cityName: 'Draft City', slug: 'draft-city', published: false, active: true } },
        { route: 'cities', body: { cityName: 'Inactive City', slug: 'inactive-city', published: true, active: false } },
        {
          route: 'area-seo',
          body: {
            areaName: 'Published Area', cityName: 'Published City', h1Title: 'Published H1',
            seoTitle: 'Published SEO', slug: 'published-area', published: true, active: true,
          },
        },
        {
          route: 'area-seo',
          body: {
            areaName: 'Draft Area', cityName: 'Published City', h1Title: 'Draft H1',
            seoTitle: 'Draft SEO', slug: 'draft-area', published: false, active: true,
          },
        },
        {
          route: 'area-seo',
          body: {
            areaName: 'Inactive Area', cityName: 'Published City', h1Title: 'Inactive H1',
            seoTitle: 'Inactive SEO', slug: 'inactive-area', published: true, active: false,
          },
        },
        {
          route: 'area-seo',
          body: {
            areaName: 'Contradictory Area', cityName: 'Published City', h1Title: 'Contradictory H1',
            seoTitle: 'Contradictory SEO', slug: 'contradictory-area',
            status: 'Published', published: false, active: true,
          },
        },
        {
          route: 'route-seo',
          body: { title: 'Published Route', slug: 'published-route', status: 'Published' },
        },
        {
          route: 'route-seo',
          body: { title: 'Draft Route', slug: 'draft-route', status: 'Draft', published: true },
        },
        {
          route: 'blogs',
          body: { title: 'Published Blog', slug: 'published-blog', status: 'Published' },
        },
      ]
      for (const record of records) {
        const response = await api.request(`/api/v1/${record.route}`, {
          token: adminToken,
          body: record.body,
        })
        assertStatus(response, 201)
      }

      let response = await api.request('/api/v1/public/cms/area-seo?limit=100')
      assertStatus(response, 200)
      assert.deepEqual(response.body.data.map(item => item.slug), ['published-area'])
      assert.match(response.headers.get('cache-control'), /public/)

      response = await api.request('/api/v1/public/cms/cities')
      assertStatus(response, 200)
      assert.deepEqual(response.body.data.map(item => item.slug), ['published-city'])
      response = await api.request('/api/v1/public/cms/cities/published-city')
      assertStatus(response, 200)
      assert.equal(response.body.data.keywords, 'city, taxi')
      assert.match(response.body.data.headScripts, /application\/ld\+json/)
      for (const slug of ['draft-city', 'inactive-city']) {
        response = await api.request(`/api/v1/public/cms/cities/${slug}`)
        assertError(response, 404, 'NOT_FOUND')
      }

      response = await api.request('/api/v1/public/cms/area-seo/published-area')
      assertStatus(response, 200)
      assert.equal(response.body.data.areaName, 'Published Area')

      response = await api.request('/api/v1/public/cms/area-seo/draft-area')
      assertError(response, 404, 'NOT_FOUND')
      response = await api.request('/api/v1/public/cms/area-seo/inactive-area')
      assertError(response, 404, 'NOT_FOUND')
      response = await api.request('/api/v1/public/cms/area-seo/contradictory-area')
      assertError(response, 404, 'NOT_FOUND')

      response = await api.request('/api/v1/public/cms/route-seo/published-route')
      assertStatus(response, 200)
      response = await api.request('/api/v1/public/cms/route-seo/draft-route')
      assertError(response, 404, 'NOT_FOUND')
      response = await api.request('/api/v1/public/cms/blogs/published-blog')
      assertStatus(response, 200)
      response = await api.request('/api/v1/public/cms/users')
      assertError(response, 404, 'NOT_FOUND')
    })

    await t.test('stores invoice settings by permission and isolates user preferences', async () => {
      const invoiceSettings = {
        bankName: 'HDFC Bank',
        accountName: 'SKG Travels',
        accountNumber: 'SKG ACCOUNT 1001',
        ifscCode: 'hdfc0001234',
        branchName: 'Mumbai Central',
        upiId: 'billing@skg',
        qrImage: '',
      }
      let response = await api.request('/api/v1/settings/invoice', {
        method: 'PUT',
        token: adminToken,
        body: { ...invoiceSettings, unsupported: true },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/settings/invoice', {
        method: 'PUT',
        token: adminToken,
        body: { ...invoiceSettings, accountName: '', ifscCode: 'INVALID' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/settings/invoice', {
        method: 'PUT',
        token: adminToken,
        body: { ...invoiceSettings, ifscCode: 'INVALID' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/settings/invoice', {
        method: 'PUT',
        token: adminToken,
        body: invoiceSettings,
      })
      assertStatus(response, 200)
      assert.equal(response.body.data.ifscCode, 'HDFC0001234')
      response = await api.request('/api/v1/settings/invoice', { token: adminToken })
      assertStatus(response, 200)
      assert.deepEqual(response.body.data, { ...invoiceSettings, ifscCode: 'HDFC0001234' })

      response = await api.request('/api/v1/settings/preferences', {
        method: 'PUT', token: adminToken,
        body: {
          notifications: true,
          emailAlerts: true,
          pushNotifications: false,
          language: 'English',
          timezone: 'UTC+05:30',
        },
      })
      assertStatus(response, 200)

      response = await api.request('/api/v1/settings/preferences', {
        method: 'PUT', token: adminToken, body: { theme: 'dark' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/settings/preferences', {
        method: 'PUT', token: adminToken,
        body: { notifications: 'yes', timezone: 'Asia/Kolkata' },
      })
      assertError(response, 422, 'VALIDATION_ERROR')

      response = await api.request('/api/v1/users', {
        token: adminToken,
        body: {
          name: 'Preferences User',
          email: 'preferences.user@skg.example',
          password: 'PrefsUser123!',
          role: 'Admin',
          permissions: { '/': ['view'], '/masters/invoice-settings': ['view'] },
        },
      })
      assertStatus(response, 201)
      limitedUser = response.body.data
      limitedToken = (await api.login('preferences.user@skg.example', 'PrefsUser123!')).token

      response = await api.request('/api/v1/settings/invoice', { token: limitedToken })
      assertStatus(response, 200)
      response = await api.request('/api/v1/settings/invoice', {
        method: 'PUT', token: limitedToken, body: { defaultGst: 5 },
      })
      assertError(response, 403, 'FORBIDDEN')

      response = await api.request('/api/v1/settings/preferences', { token: limitedToken })
      assertStatus(response, 200)
      assert.deepEqual(response.body.data, {})
      response = await api.request('/api/v1/settings/preferences', {
        method: 'PUT', token: limitedToken, body: { language: 'Hindi' },
      })
      assertStatus(response, 200)

      response = await api.request('/api/v1/settings/preferences', { token: adminToken })
      assertStatus(response, 200)
      assert.equal(response.body.data.language, 'English')
      assert.equal(response.body.data.notifications, true)
      assert.equal(response.body.data.timezone, 'UTC+05:30')

      response = await api.request(`/api/v1/users/${limitedUser.id}/permissions`, {
        method: 'PUT', token: adminToken,
        body: { permissions: { '/': ['view'], '/masters/invoice-settings': ['view', 'edit'] } },
      })
      assertStatus(response, 200)
      response = await api.request('/api/v1/settings/invoice', {
        method: 'PUT', token: limitedToken,
        body: { ...invoiceSettings, bankName: 'Updated HDFC Bank' },
      })
      assertStatus(response, 200)
      assert.deepEqual(response.body.data, {
        ...invoiceSettings,
        bankName: 'Updated HDFC Bank',
        ifscCode: 'HDFC0001234',
      })
    })

    await t.test('builds the complete admin dashboard contract from MongoDB data', async () => {
      const today = new Date().toISOString().slice(0, 10)
      const payloads = [
        ['/api/v1/vehicles', {
          registrationNumber: 'DASH-ACTIVE', vehicleMake: 'Toyota', vehicleModel: 'Innova',
          vehicleType: 'SUV', status: 'Active',
        }],
        ['/api/v1/vehicles', {
          registrationNumber: 'DASH-INACTIVE', vehicleMake: 'Tata', vehicleModel: 'Safari',
          vehicleType: 'SUV', status: 'Inactive',
        }],
        ['/api/v1/trips-regular', {
          vehicleNumber: 'DASH-ACTIVE', clientName: 'Dashboard Client', number: 'DASH-REG-1',
          startDate: today, startTime: '09:00', endDate: today, endTime: '18:00',
          pickupAddress: 'Mumbai', dropAddress: 'Pune',
        }],
        ['/api/v1/trips-pickup-drop', {
          vehicleNumber: 'DASH-ACTIVE', tripDate: today, tripTime: '10:00',
          partyName: 'Dashboard Client', number: 'DASH-PD-1', pickupOrDrop: 'Pickup',
          pickupDropPoint: 'Airport',
        }],
        ['/api/v1/invoices', {
          date: today, vehicleNumber: 'DASH-ACTIVE', clientName: 'Dashboard Client',
          clientAddress: 'Mumbai', invoiceNumber: 'DASH-INV-1', serviceName: 'Taxi',
          serviceQuantity: 1, serviceRate: 1000, gst: 18,
        }],
      ]
      for (const [path, body] of payloads) {
        const response = await api.request(path, { token: adminToken, body })
        assertStatus(response, 201)
      }

      const response = await api.request('/api/v1/dashboard', { token: adminToken })
      assertStatus(response, 200)
      const dashboard = response.body.data
      assert.ok(Array.isArray(dashboard.stats))
      assert.ok(Array.isArray(dashboard.quickStats))
      assert.equal(dashboard.counts.vehicles, 2)
      assert.equal(dashboard.counts.tripsRegular, 1)
      assert.equal(dashboard.counts.tripsPickupDrop, 1)
      assert.equal(dashboard.counts.invoices, 1)
      assert.equal(dashboard.counts.leads, 1)
      assert.equal(dashboard.counts.users, 2)
      assert.deepEqual(dashboard.charts.trips, { total: 2, regular: 1, pickup: 1 })
      assert.deepEqual(dashboard.charts.vehicles, { total: 2, active: 1, inactive: 1 })
      assert.equal(dashboard.leadStatuses.Contacted, 1)
      assert.equal(dashboard.trips.todayRegular.total, 'Total trips: 1')
      assert.equal(dashboard.trips.todayPickup.total, 'Total trips: 1')
      assert.ok(dashboard.generatedAt)
    })

    await t.test('deletes the admin lead and reports it missing afterwards', async () => {
      let response = await api.request(`/api/v1/leads/${leadId}`, {
        method: 'DELETE', token: adminToken,
      })
      assertStatus(response, 200)
      response = await api.request(`/api/v1/leads/${leadId}`, { token: adminToken })
      assertError(response, 404, 'NOT_FOUND')
    })
  } finally {
    resetPublicLeadLimiter()
    await api.close()
  }
})
