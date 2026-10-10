import { Media } from '../models/Media.js'
import { User, publicUser } from '../models/User.js'
import { Session } from '../models/Session.js'
import { RecordModel } from '../models/Record.js'
import { Setting } from '../models/Setting.js'
import { PasswordReset } from '../models/PasswordReset.js'
import { permissionsForRole, normalizePermissions } from '../constants/permissions.js'
import { DEFAULT_ADMIN_PASSWORD } from '../config/env.js'
import { hashPassword, verifyPassword } from './passwordService.js'
import { conflict } from '../utils/errors.js'

function duplicateError(error) {
  return error?.code === 11000
}

export async function initializeModels() {
  await Promise.all([
    User.createIndexes(),
    Media.createIndexes(),
    Session.createIndexes(),
    RecordModel.createIndexes(),
    Setting.createIndexes(),
    PasswordReset.createIndexes(),
  ])
}

export async function ensureSuperAdmin(config) {
  const existing = await User.findOne({ email: config.adminEmail }).select('+passwordHash')
  if (existing) {
    let changed = false
    let passwordRotated = false
    if (existing.role !== 'Super Admin') {
      existing.role = 'Super Admin'
      changed = true
    }
    if (existing.blocked) {
      existing.blocked = false
      changed = true
    }
    if (
      config.nodeEnv === 'production'
      && config.adminPassword !== DEFAULT_ADMIN_PASSWORD
      && await verifyPassword(DEFAULT_ADMIN_PASSWORD, existing.passwordHash)
    ) {
      existing.passwordHash = await hashPassword(config.adminPassword)
      changed = true
      passwordRotated = true
    } else if (
      config.nodeEnv !== 'production'
      && !(await verifyPassword(config.adminPassword, existing.passwordHash))
    ) {
      existing.passwordHash = await hashPassword(config.adminPassword)
      changed = true
      passwordRotated = true
    }
    if (changed) {
      await existing.save()
      if (passwordRotated) {
        await Promise.all([
          Session.deleteMany({ $or: [{ user: existing._id }, { actorUser: existing._id }] }),
          PasswordReset.deleteMany({ user: existing._id }),
        ])
      }
    }
    return existing
  }
  try {
    return await User.create({
      firstName: 'Super',
      lastName: 'Admin',
      name: 'Super Admin',
      email: config.adminEmail,
      role: 'Super Admin',
      passwordHash: await hashPassword(config.adminPassword),
      permissions: permissionsForRole('Super Admin'),
    })
  } catch (error) {
    if (duplicateError(error)) return User.findOne({ email: config.adminEmail })
    throw error
  }
}

export async function createUser(input) {
  try {
    const role = input.role || 'Admin'
    return await User.create({
      ...input,
      role,
      permissions: normalizePermissions(input.permissions, role),
    })
  } catch (error) {
    if (duplicateError(error)) throw conflict('A user with this email already exists')
    throw error
  }
}

export async function saveUser(user) {
  try {
    return await user.save()
  } catch (error) {
    if (duplicateError(error)) throw conflict('A user with this email already exists')
    throw error
  }
}

export { publicUser }
