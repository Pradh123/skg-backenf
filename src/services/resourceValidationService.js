import { ISSUE_STATUSES } from '../constants/resources.js'
import { unprocessable } from '../utils/errors.js'

const numericFields = Object.freeze({
  vehicles: ['manufactureYear', 'currentOdometer', 'seatingCapacity', 'fuelCapacity', 'engineOilCapacity'],
  drivers: ['salary'],
  parties: ['perKmRate'],
  tripsRegular: ['perKmRate', 'advanceAmount'],
  tripsPickupDrop: ['rate', 'totalKm', 'advance'],
  fuel: ['odometerReading', 'liters', 'pricePerUnit'],
  invoices: ['serviceQuantity', 'serviceRate', 'driverDa', 'extraKmDriven', 'extraKmRate', 'gst'],
  cities: ['displayOrder'],
})

const dateFields = Object.freeze({
  vehicles: ['registrationDate', 'registrationUpto', 'insuranceValidFrom', 'insuranceValidUpto', 'pucValidFrom', 'pucValidUpto'],
  drivers: ['joiningDate', 'dateOfBirth', 'licenceValidUpto'],
  tripsRegular: ['startDate', 'endDate'],
  tripsPickupDrop: ['tripDate'],
  fuel: ['date'],
  issues: ['date'],
  invoices: ['date'],
})

const fileFields = Object.freeze({
  vehicles: ['vehiclePhoto', 'rcBook', 'insurance', 'puc'],
  drivers: ['driverPhoto', 'drivingLicence', 'aadhaarCard', 'panCard'],
  fuel: ['fuelSlipPhoto'],
  issues: ['issuePhoto', 'issueDocument'],
})

function invalid(field, issue, message = `${field} is invalid`) {
  throw unprocessable(message, [{ field, issue }])
}

function validateDate(field, value) {
  if (value === undefined || value === null || value === '') return
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) invalid(field, 'invalid date', `${field} must be a valid date`)
}

function validateFile(field, value) {
  if (value === undefined || value === null || value === '') return
  if (typeof value === 'string') {
    if (value.length > 3 * 1024 * 1024) invalid(field, 'maximum size exceeded', `${field} is too large`)
    return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(field, 'invalid file', `${field} must be a file object`)
  }
  const size = Number(value.size)
  if (!Number.isFinite(size) || size < 0 || size > 2 * 1024 * 1024) {
    invalid(field, 'maximum size exceeded', `${field} must be no larger than 2 MB`)
  }
  if (typeof value.name !== 'string' || !value.name.trim()) invalid(field, 'missing file name')
  if (typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith('data:')) {
    invalid(field, 'invalid file data')
  }
  if (value.dataUrl.length > 3 * 1024 * 1024) {
    invalid(field, 'maximum size exceeded', `${field} encoded data is too large`)
  }
}

function validateUrl(field, value) {
  if (!value || String(value).startsWith('data:')) return
  try {
    const url = new URL(String(value))
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol')
  } catch {
    invalid(field, 'invalid URL', `${field} must be an HTTP or HTTPS URL`)
  }
}

export function validateResourceData(definition, data) {
  for (const field of numericFields[definition.key] || []) {
    const value = data[field]
    if (value === undefined || value === null || value === '') continue
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
      invalid(field, 'invalid number', `${field} must be a non-negative number`)
    }
    data[field] = parsed
  }

  for (const field of dateFields[definition.key] || []) validateDate(field, data[field])
  for (const field of fileFields[definition.key] || []) validateFile(field, data[field])
  for (const field of ['canonicalUrl', 'image', 'heroImage', 'ogImage']) validateUrl(field, data[field])

  if (definition.key === 'vehicles' && data.manufactureYear) {
    const maximum = new Date().getFullYear() + 1
    if (data.manufactureYear < 1900 || data.manufactureYear > maximum) {
      invalid('manufactureYear', 'out of range')
    }
  }
  if (definition.key === 'invoices' && number(data.gst) > 100) {
    invalid('gst', 'out of range', 'gst must be between 0 and 100')
  }
  if (definition.key === 'tripsRegular' && data.startDate && data.endDate &&
      new Date(data.endDate) < new Date(data.startDate)) {
    invalid('endDate', 'before start date', 'endDate cannot be before startDate')
  }
  if (definition.key === 'issues' && data.status && !ISSUE_STATUSES.includes(data.status)) {
    invalid('status', 'invalid status', 'Issue status is invalid')
  }
  return data
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
