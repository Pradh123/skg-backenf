import test from 'node:test'
import assert from 'node:assert/strict'
import { RecordModel } from '../src/models/Record.js'
import { validateAreaCity } from '../src/services/recordService.js'

test('Area SEO validates and normalizes its city against master cities', async t => {
  const queries = []
  t.mock.method(RecordModel, 'findOne', query => {
    queries.push(query)
    return { select: () => ({ lean: async () => query['data.cityName'].test('Mumbai') ? { data: { cityName: 'Mumbai' } } : null }) }
  })
  const data = { cityName: ' mUmBaI ' }
  await validateAreaCity({ key: 'area-seo' }, data)
  assert.equal(data.cityName, 'Mumbai')
  assert.equal(queries[0].resource, 'cities')
  const route = { cityName: ' mUmBaI ' }
  await validateAreaCity({ key: 'route-seo' }, route)
  assert.equal(route.cityName, 'Mumbai')
  for (const cityName of ['', 'Unknown city', 'Mumbai.*']) {
    await assert.rejects(validateAreaCity({ key: 'area-seo' }, { cityName }), error => error.status === 422 && error.details[0].field === 'cityName')
    await assert.rejects(validateAreaCity({ key: 'route-seo' }, { cityName }), error => error.status === 422 && error.details[0].field === 'cityName')
  }
  const count = queries.length
  await validateAreaCity({ key: 'blogs' }, {})
  assert.equal(queries.length, count)
})
