import { RecordModel, publicRecord } from '../models/Record.js'
import { getResourceDefinition } from '../constants/resources.js'
import { listRecords } from '../services/recordService.js'
import { sendData } from '../utils/response.js'
import { notFound } from '../utils/errors.js'
import { pagination } from '../utils/validation.js'

function publishedFilter(route) {
  if (route === 'area-seo' || route === 'cities') {
    return { 'data.published': true, 'data.active': { $ne: false } }
  }
  return { 'data.status': 'Published' }
}

export const cmsController = {
  list: async (req, res) => {
    const definition = getResourceDefinition(req.params.resource)
    const options = pagination(req.query)
    const result = await listRecords(definition, { ...options, extraFilter: publishedFilter(req.params.resource) })
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return sendData(res, result.records, 200, {
      page: options.page, limit: options.limit, total: result.total, pages: Math.ceil(result.total / options.limit),
    })
  },
  getBySlug: async (req, res) => {
    const definition = getResourceDefinition(req.params.resource)
    const record = await RecordModel.findOne({
      resource: definition.key,
      'data.slug': req.params.slug,
      ...publishedFilter(req.params.resource),
    }).lean()
    if (!record) throw notFound('Published content not found')
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return sendData(res, publicRecord(record))
  },
}
