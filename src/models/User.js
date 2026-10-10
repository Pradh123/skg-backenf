import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { ROLES } from '../constants/permissions.js'

const userSchema = new mongoose.Schema({
  userId: { type: String, default: randomUUID, required: true, unique: true, immutable: true },
  firstName: { type: String, trim: true, maxlength: 100, default: '' },
  lastName: { type: String, trim: true, maxlength: 100, default: '' },
  name: { type: String, trim: true, maxlength: 200, required: true },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, required: true, unique: true },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  gender: { type: String, trim: true, maxlength: 50, default: '' },
  branch: { type: String, trim: true, maxlength: 160, default: '' },
  dob: { type: Date, default: null },
  address: { type: String, trim: true, maxlength: 2000, default: '' },
  photo: { type: String, default: '' },
  role: { type: String, enum: ROLES, default: 'Admin', required: true },
  passwordHash: { type: String, required: true, select: false },
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
  blocked: { type: Boolean, default: false, index: true },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true, minimize: false })

userSchema.index({ role: 1, createdAt: -1 })

export const User = mongoose.models.User || mongoose.model('User', userSchema)

export function publicUser(user) {
  const value = typeof user?.toObject === 'function' ? user.toObject() : user
  if (!value) return null
  return {
    id: value.userId,
    firstName: value.firstName || '',
    lastName: value.lastName || '',
    name: value.name,
    email: value.email,
    phone: value.phone || '',
    gender: value.gender || '',
    branch: value.branch || '',
    dob: value.dob ? new Date(value.dob).toISOString().slice(0, 10) : null,
    address: value.address || '',
    photo: value.photo || '',
    role: value.role,
    permissions: value.permissions || {},
    blocked: Boolean(value.blocked),
    lastLoginAt: value.lastLoginAt || null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}
