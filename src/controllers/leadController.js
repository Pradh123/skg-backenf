import { publicRecord } from '../models/Record.js'
import { createRecord, deleteRecord, getRecord, listRecords, updateRecord } from '../services/recordService.js'
import { sendData } from '../utils/response.js'
import { assertEmail, cleanPayload, normalizePhone, pagination } from '../utils/validation.js'
import { unprocessable } from '../utils/errors.js'

export const LEAD_STATUSES = Object.freeze(['New', 'Not Contacted', 'Contacted', 'Success'])
export const leadDefinition = Object.freeze({
  route: 'leads',
  key: 'leads',
  permission: '/leads',
  required: ['name', 'phone'],
  unique: [],
  searchable: ['name', 'phone', 'email', 'service', 'pickup', 'destination', 'status'],
})

function optionalDate(value, field) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw unprocessable(`${field} must be a valid date`, [{ field, issue: 'invalid date' }])
  return value
}

function normalizeLead(body) {
  const input = cleanPayload(body)
  const name = String(input.name || '').trim()
  if (!name || name.length > 120) throw unprocessable('Name is required and must be at most 120 characters', [{ field: 'name', issue: 'invalid' }])
  const phone = normalizePhone(input.phone || input.mobile)
  const email = input.email ? assertEmail(input.email) : ''
  return {
    name,
    phone,
    email,
    service: String(input.service || 'Website Enquiry').trim().slice(0, 160),
    pickup: String(input.pickup || input.from || '').trim().slice(0, 500),
    destination: String(input.destination || input.to || '').trim().slice(0, 500),
    travelDate: optionalDate(input.travelDate || input.pickupDate, 'travelDate'),
    returnDate: optionalDate(input.returnDate, 'returnDate'),
    tripType: String(input.tripType || '').trim().slice(0, 100),
    passengers: input.passengers ?? '',
    vehiclePreference: String(input.vehiclePreference || input.carName || '').trim().slice(0, 160),
    message: String(input.message || input.note || '').trim().slice(0, 10_000),
    source: String(input.source || 'skg-website').trim().slice(0, 100),
    formType: String(input.formType || 'general').trim().slice(0, 100),
    status: 'New',
  }
}

export const leadController = {
  createPublic: async (req, res) => sendData(res, await createRecord(leadDefinition, normalizeLead(req.body)), 201),
  list: async (req, res) => {
    const options = pagination(req.query)
    const result = await listRecords(leadDefinition, options)
    return sendData(res, result.records, 200, {
      page: options.page, limit: options.limit, total: result.total, pages: Math.ceil(result.total / options.limit),
    })
  },
  get: async (req, res) => sendData(res, publicRecord(await getRecord(leadDefinition, req.params.id))),
  status: async (req, res) => {
    const input = cleanPayload(req.body)
    if (!LEAD_STATUSES.includes(input.status)) {
      throw unprocessable('Lead status is invalid', [{ field: 'status', issue: 'invalid status' }])
    }
    const current = publicRecord(await getRecord(leadDefinition, req.params.id))
    const data = { ...current, status: input.status, statusUpdatedAt: new Date().toISOString() }
    delete data.id
    delete data.createdAt
    delete data.updatedAt
    return sendData(res, await updateRecord(leadDefinition, req.params.id, data))
  },
  remove: async (req, res) => sendData(res, await deleteRecord(leadDefinition, req.params.id)),
}
