import { Setting } from '../models/Setting.js'
import { cleanPayload } from '../utils/validation.js'
import { sendData } from '../utils/response.js'
import { unprocessable } from '../utils/errors.js'
import { validateImageValue } from '../services/mediaValidationService.js'

const invoiceFields = new Set([
  'bankName', 'accountName', 'accountNumber', 'ifscCode', 'branchName', 'upiId', 'qrImage',
])
const preferenceFields = new Set([
  'notifications', 'emailAlerts', 'pushNotifications', 'language', 'timezone',
])

function rejectUnknown(data, allowed) {
  const unknown = Object.keys(data).filter(field => !allowed.has(field))
  if (unknown.length) {
    throw unprocessable('Settings contain unsupported fields',
      unknown.map(field => ({ field, issue: 'unsupported' })))
  }
}

function invoiceSettings(body) {
  const data = cleanPayload(body, { allowEmpty: true })
  rejectUnknown(data, invoiceFields)
  const normalized = Object.fromEntries([...invoiceFields].map(field => [
    field,
    typeof data[field] === 'string' ? data[field].trim() : '',
  ]))
  const missing = ['bankName', 'accountName', 'accountNumber', 'ifscCode']
    .filter(field => !normalized[field])
  if (missing.length) {
    throw unprocessable('Required invoice settings are missing',
      missing.map(field => ({ field, issue: 'required' })))
  }
  if (!/^[A-Za-z0-9 -]{4,40}$/.test(normalized.accountNumber)) {
    throw unprocessable('Account number is invalid', [{ field: 'accountNumber', issue: 'invalid' }])
  }
  normalized.ifscCode = normalized.ifscCode.toUpperCase()
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized.ifscCode)) {
    throw unprocessable('IFSC code is invalid', [{ field: 'ifscCode', issue: 'invalid' }])
  }
  for (const field of ['bankName', 'accountName', 'branchName', 'upiId']) {
    if (normalized[field].length > 200) {
      throw unprocessable(`${field} is too long`, [{ field, issue: 'maximum length exceeded' }])
    }
  }
  normalized.qrImage = validateImageValue(normalized.qrImage, 'qrImage')
  return normalized
}

function preferenceSettings(body) {
  const data = cleanPayload(body, { allowEmpty: true })
  rejectUnknown(data, preferenceFields)
  for (const field of ['notifications', 'emailAlerts', 'pushNotifications']) {
    if (data[field] !== undefined && typeof data[field] !== 'boolean') {
      throw unprocessable(`${field} must be a boolean`, [{ field, issue: 'invalid type' }])
    }
  }
  if (data.language !== undefined && !['English', 'Hindi', 'Spanish'].includes(data.language)) {
    throw unprocessable('Language is invalid', [{ field: 'language', issue: 'invalid' }])
  }
  if (data.timezone !== undefined && !['UTC+05:30', 'UTC+00:00', 'UTC-05:00'].includes(data.timezone)) {
    throw unprocessable('Timezone is invalid', [{ field: 'timezone', issue: 'invalid' }])
  }
  return data
}

async function read(key) {
  const setting = await Setting.findOne({ key }).lean()
  return setting?.data || {}
}

async function write(key, data, userId) {
  const setting = await Setting.findOneAndUpdate(
    { key },
    { $set: { data, updatedBy: userId } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  )
  return setting.data
}

export const settingController = {
  getInvoice: async (_req, res) => sendData(res, await read('invoice')),
  updateInvoice: async (req, res) => sendData(res, await write(
    'invoice',
    invoiceSettings(req.body),
    req.auth.userDocument._id
  )),
  getPreferences: async (req, res) => sendData(res, await read(`preferences:${req.auth.user.id}`)),
  updatePreferences: async (req, res) => sendData(res, await write(
    `preferences:${req.auth.user.id}`,
    preferenceSettings(req.body),
    req.auth.userDocument._id
  )),
}
