import { unprocessable } from './errors.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const RESERVED_KEYS = new Set(['_id', 'id', 'recordId', 'createdAt', 'updatedAt', '__v'])

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cleanValue(value, depth = 0) {
  if (depth > 12) throw unprocessable('Payload nesting is too deep')
  if (Array.isArray(value)) return value.slice(0, 500).map(item => cleanValue(item, depth + 1))
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !DANGEROUS_KEYS.has(key) && !key.startsWith('$') && !key.includes('.'))
    .map(([key, item]) => [key, cleanValue(item, depth + 1)]))
}

export function cleanPayload(body, { allowEmpty = false } = {}) {
  if (!isPlainObject(body)) throw unprocessable('Request body must be a JSON object')
  const cleaned = Object.fromEntries(Object.entries(cleanValue(body))
    .filter(([key]) => !RESERVED_KEYS.has(key)))
  if (!allowEmpty && Object.keys(cleaned).length === 0) throw unprocessable('Request body cannot be empty')
  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value === 'string' && value.length > 3 * 1024 * 1024) {
      throw unprocessable(`${key} is too long`, [{ field: key, issue: 'maximum length exceeded' }])
    }
  }
  return cleaned
}

export function validateRequired(payload, fields) {
  const missing = fields.filter(field => {
    const value = payload[field]
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  })
  if (missing.length) {
    throw unprocessable('Required fields are missing', missing.map(field => ({ field, issue: 'required' })))
  }
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function assertEmail(value, field = 'email') {
  const email = normalizeEmail(value)
  if (!EMAIL.test(email) || email.length > 254) {
    throw unprocessable('A valid email address is required', [{ field, issue: 'invalid email' }])
  }
  return email
}

export function assertPassword(value, field = 'password') {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128 ||
      !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw unprocessable('Password must be 8-128 characters and include uppercase, lowercase, number, and symbol', [
      { field, issue: 'weak password' },
    ])
  }
  return value
}

export function assertOptionalDate(value, field = 'date') {
  if (value === undefined || value === null || value === '') return null
  if (!['string', 'number'].includes(typeof value)) {
    throw unprocessable(`${field} must be a valid date`, [{ field, issue: 'invalid date' }])
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw unprocessable(`${field} must be a valid date`, [{ field, issue: 'invalid date' }])
  }
  return date
}

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
  if (!/^\d{10}$/.test(local)) {
    throw unprocessable('A valid 10-digit Indian phone number is required', [{ field: 'phone', issue: 'invalid phone' }])
  }
  return local
}

export function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(500, Math.max(1, Number.parseInt(query.limit, 10) || 100))
  const rawSearch = typeof query.search === 'string' ? query.search : query.q
  const search = typeof rawSearch === 'string' ? rawSearch.trim().slice(0, 200) : ''
  return { page, limit, search }
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
