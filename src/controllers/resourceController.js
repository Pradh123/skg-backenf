import { RecordModel, publicRecord } from '../models/Record.js'
import { createRecord, deleteRecord, getRecord, listRecords, updateRecord } from '../services/recordService.js'
import { sendData } from '../utils/response.js'
import { assertEmail, cleanPayload, pagination, validateRequired } from '../utils/validation.js'
import slugify from '../utils/slugify.js'
import { randomUUID } from 'node:crypto'
import { validateResourceData } from '../services/resourceValidationService.js'
import { ISSUE_STATUSES } from '../constants/resources.js'

function asNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function vehicleDocumentStatus(values) {
  const dates = [values.registrationUpto, values.insuranceValidUpto, values.pucValidUpto]
    .filter(Boolean)
    .map(value => new Date(`${String(value).slice(0, 10)}T00:00:00`))
    .filter(date => !Number.isNaN(date.getTime()))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (!dates.length && !values.rcBook && !values.insurance && !values.puc) return 'Missing docs'
  if (dates.some(date => date < today)) return 'Expired'
  const dueSoon = new Date(today)
  dueSoon.setDate(dueSoon.getDate() + 30)
  if (dates.some(date => date <= dueSoon)) return 'Renewal due'
  return 'Up to date'
}

function prepare(definition, input, existing = null) {
  const data = { ...input }
  if (definition.slugSource && !String(data.slug || '').trim()) {
    data.slug = slugify(definition.slugSource.map(field => data[field]).filter(Boolean).join(' '))
  }
  if (data.slug !== undefined) data.slug = slugify(data.slug)
  if (definition.cms) {
    if (definition.key === 'area-seo') {
      if (data.published === true) data.status = 'Published'
      else if (data.published === false) data.status = 'Draft'
      else data.status = data.status || 'Draft'
      if (data.active === undefined) data.active = true
      if (data.published === undefined) data.published = data.status === 'Published'
    } else {
      data.status = data.status === 'Published' ? 'Published' : 'Draft'
    }
    // Publish date is captured once so the public site can emit a stable datePublished.
    if (data.status === 'Published' && !data.publishedAt && !existing?.publishedAt) {
      data.publishedAt = new Date().toISOString()
    }
    if (data.status !== 'Published') delete data.publishedAt
  }
  if (definition.key === 'tripsPickupDrop') {
    data.totalRate = asMoney(asNumber(data.rate) * asNumber(data.totalKm))
  }
  if (definition.key === 'fuel') {
    data.totalAmount = asMoney(asNumber(data.liters) * asNumber(data.pricePerUnit))
  }
  if (definition.key === 'invoices') {
    const serviceAmount = asMoney(asNumber(data.serviceQuantity) * asNumber(data.serviceRate))
    const extraKmAmount = asMoney(asNumber(data.extraKmDriven) * asNumber(data.extraKmRate))
    const subTotalAmount = asMoney(serviceAmount + asNumber(data.driverDa) + extraKmAmount)
    data.serviceAmount = serviceAmount
    data.subTotalAmount = subTotalAmount
    data.totalAmount = asMoney(subTotalAmount + (subTotalAmount * asNumber(data.gst)) / 100)
    data.customerId = existing?.customerId || data.customerId || `CUST-${randomUUID().slice(0, 8).toUpperCase()}`
  }
  if (definition.key === 'cities') {
    data.routes = existing?.routes ?? 0
    data.status = data.published ? 'Published' : data.active ? 'Active' : 'Inactive'
  }
  if (definition.key === 'vehicles') {
    data.documentStatus = vehicleDocumentStatus(data)
    data.kmsDone = existing?.kmsDone ?? 0
    data.lastTrip = existing?.lastTrip || 'No trips yet'
    data.status = data.status || existing?.status || 'Active'
  }
  if (definition.key === 'parties') {
    data.registeredDate = existing?.registeredDate || data.registeredDate || new Date().toISOString().slice(0, 10)
    data.status = data.status || existing?.status || 'Active'
  }
  if (definition.key === 'issues') {
    if (data.status === undefined || data.status === null || data.status === '') {
      data.status = existing?.status || 'Open'
    }
    if (ISSUE_STATUSES.includes(data.status)) {
      if (['Resolved', 'Closed'].includes(data.status)) {
        data.resolvedAt = data.resolvedAt || new Date().toISOString()
      } else {
        data.resolvedAt = ''
      }
    }
  }
  for (const [field, value] of Object.entries(data)) {
    if (/email/i.test(field) && value) data[field] = assertEmail(value, field)
  }
  return data
}

async function withLinkedValues(definition, data) {
  if (['tripsRegular', 'tripsPickupDrop'].includes(definition.key) && data.vehicleNumber) {
    const vehicle = await RecordModel.findOne({
      resource: 'vehicles',
      'data.registrationNumber': data.vehicleNumber,
    }).select('data.driverName').lean()
    if (vehicle?.data?.driverName) data.driverName = vehicle.data.driverName
  }
  return data
}

export function createResourceController(definition) {
  return {
    list: async (req, res) => {
      const options = pagination(req.query)
      const result = await listRecords(definition, options)
      return sendData(res, result.records, 200, {
        page: options.page,
        limit: options.limit,
        total: result.total,
        pages: Math.ceil(result.total / options.limit),
      })
    },
    get: async (req, res) => sendData(res, publicRecord(await getRecord(definition, req.params.id))),
    create: async (req, res) => {
      const data = await withLinkedValues(definition, prepare(definition, cleanPayload(req.body)))
      validateRequired(data, definition.required)
      validateResourceData(definition, data)
      return sendData(res, await createRecord(definition, data), 201)
    },
    update: async (req, res) => {
      const patch = cleanPayload(req.body)
      const existing = publicRecord(await getRecord(definition, req.params.id))
      const data = await withLinkedValues(
        definition,
        prepare(definition, { ...existing, ...patch }, existing)
      )
      delete data.id
      delete data.createdAt
      delete data.updatedAt
      validateRequired(data, definition.required)
      validateResourceData(definition, data)
      return sendData(res, await updateRecord(definition, req.params.id, data))
    },
    remove: async (req, res) => sendData(res, await deleteRecord(definition, req.params.id)),
  }
}
