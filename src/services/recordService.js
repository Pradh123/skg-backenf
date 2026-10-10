import { RecordModel, publicRecord } from '../models/Record.js'
import { conflict, notFound } from '../utils/errors.js'
import { escapeRegex } from '../utils/validation.js'

function duplicateError(error) {
  return error?.code === 11000
}

function searchFilter(definition, search) {
  if (!search || !definition.searchable?.length) return {}
  const expression = new RegExp(escapeRegex(search), 'i')
  return { $or: definition.searchable.map(field => ({ [`data.${field}`]: expression })) }
}

export async function listRecords(definition, { page = 1, limit = 20, search = '', extraFilter = {} } = {}) {
  const query = {
    resource: definition.key,
    ...extraFilter,
    ...searchFilter(definition, search),
  }
  const [rows, total] = await Promise.all([
    RecordModel.find(query).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    RecordModel.countDocuments(query),
  ])
  return { records: rows.map(publicRecord), total }
}

export async function getRecord(definition, id) {
  const record = await RecordModel.findOne({ resource: definition.key, recordId: id })
  if (!record) throw notFound(`${definition.route} record not found`)
  return record
}

export async function assertUnique(definition, data, excludeId = null) {
  for (const field of definition.unique || []) {
    const value = data[field]
    if (value === undefined || value === null || value === '') continue
    const query = { resource: definition.key }
    query[`data.${field}`] = typeof value === 'string'
      ? new RegExp(`^${escapeRegex(value.trim())}$`, 'i')
      : value
    if (excludeId) query.recordId = { $ne: excludeId }
    const exists = await RecordModel.exists(query)
    if (exists) throw conflict(`${field} must be unique`, [{ field, issue: 'already exists' }])
  }
}

export async function createRecord(definition, data) {
  await assertUnique(definition, data)
  try {
    const record = await RecordModel.create({ resource: definition.key, data })
    return publicRecord(record)
  } catch (error) {
    if (duplicateError(error)) throw conflict('A record with the same unique value already exists')
    throw error
  }
}

export async function updateRecord(definition, id, data) {
  const record = await getRecord(definition, id)
  await assertUnique(definition, data, id)
  record.data = data
  record.markModified('data')
  try {
    await record.save()
    return publicRecord(record)
  } catch (error) {
    if (duplicateError(error)) throw conflict('A record with the same unique value already exists')
    throw error
  }
}

export async function deleteRecord(definition, id) {
  const record = await RecordModel.findOneAndDelete({ resource: definition.key, recordId: id })
  if (!record) throw notFound(`${definition.route} record not found`)
  return publicRecord(record)
}
