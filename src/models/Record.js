import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { RECORD_RESOURCE_KEYS } from '../constants/resources.js'

const recordSchema = new mongoose.Schema({
  resource: { type: String, required: true, enum: RECORD_RESOURCE_KEYS, index: true, immutable: true },
  recordId: { type: String, required: true, default: randomUUID, immutable: true },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    validate: {
      validator: value => value && typeof value === 'object' && !Array.isArray(value),
      message: 'data must be an object',
    },
  },
}, { timestamps: true, minimize: false })

recordSchema.index({ resource: 1, recordId: 1 }, { unique: true })
recordSchema.index({ resource: 1, updatedAt: -1 })
recordSchema.index(
  { resource: 1, 'data.slug': 1 },
  { unique: true, partialFilterExpression: { 'data.slug': { $type: 'string' } } }
)

export const RecordModel = mongoose.models.Record || mongoose.model('Record', recordSchema)

export function publicRecord(record) {
  const value = typeof record?.toObject === 'function' ? record.toObject() : record
  if (!value) return null
  return {
    ...(value.data || {}),
    id: value.recordId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}
