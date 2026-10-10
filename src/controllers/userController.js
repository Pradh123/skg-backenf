import { User, publicUser } from '../models/User.js'
import { Session } from '../models/Session.js'
import { ROLES, normalizePermissions, permissionsForRole } from '../constants/permissions.js'
import { createUser, saveUser } from '../services/userService.js'
import { hashPassword } from '../services/passwordService.js'
import { sendData, sendMessage } from '../utils/response.js'
import { assertEmail, assertOptionalDate, assertPassword, cleanPayload, escapeRegex, pagination } from '../utils/validation.js'
import { forbidden, notFound, unprocessable } from '../utils/errors.js'
import { validateImageValue } from '../services/mediaValidationService.js'
import { revokePasswordResets } from '../services/passwordResetService.js'

async function findUser(id, { password = false } = {}) {
  const query = User.findOne({ userId: id })
  if (password) query.select('+passwordHash')
  const user = await query
  if (!user) throw notFound('User not found')
  return user
}

function role(value) {
  if (!ROLES.includes(value)) throw unprocessable('Role is invalid', [{ field: 'role', issue: 'invalid role' }])
  return value
}

export const userController = {
  list: async (req, res) => {
    const { page, limit, search } = pagination(req.query)
    const query = search ? {
      $or: ['name', 'email', 'phone', 'role'].map(field => ({ [field]: new RegExp(escapeRegex(search), 'i') })),
    } : {}
    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(query),
    ])
    return sendData(res, users.map(publicUser), 200, {
      page, limit, total, pages: Math.ceil(total / limit),
    })
  },

  get: async (req, res) => sendData(res, publicUser(await findUser(req.params.userId))),

  create: async (req, res) => {
    const input = cleanPayload(req.body)
    const email = assertEmail(input.email)
    const password = assertPassword(input.password)
    const selectedRole = role(input.role || 'Admin')
    if (selectedRole === 'Super Admin') throw forbidden('Additional Super Admin accounts cannot be created through this endpoint')
    const firstName = String(input.firstName || '').trim()
    const lastName = String(input.lastName || '').trim()
    const name = String(input.name || `${firstName} ${lastName}`).trim()
    if (!name) throw unprocessable('Name is required', [{ field: 'name', issue: 'required' }])
    const user = await createUser({
      firstName,
      lastName,
      name,
      email,
      phone: String(input.phone || '').trim(),
      gender: String(input.gender || '').trim(),
      branch: String(input.branch || '').trim(),
      dob: assertOptionalDate(input.dob, 'dob'),
      address: String(input.address || '').trim(),
      photo: validateImageValue(input.photo, 'photo'),
      role: selectedRole,
      blocked: Boolean(input.blocked),
      passwordHash: await hashPassword(password),
      permissions: input.permissions || permissionsForRole(selectedRole),
    })
    return sendData(res, publicUser(user), 201)
  },

  update: async (req, res) => {
    const input = cleanPayload(req.body)
    const user = await findUser(req.params.userId, { password: Boolean(input.password) })
    const isSelf = user.userId === req.auth.user.id
    let revokeResets = false
    if (user.role === 'Super Admin') {
      if (input.role && input.role !== 'Super Admin') throw forbidden('The Super Admin role cannot be changed')
      if (input.blocked === true) throw forbidden('The Super Admin cannot be blocked')
      if (input.email && assertEmail(input.email) !== user.email) throw forbidden('The Super Admin email cannot be changed')
    }
    if (isSelf && input.blocked === true) throw forbidden('You cannot block your own account')

    if (input.firstName !== undefined) user.firstName = String(input.firstName).trim()
    if (input.lastName !== undefined) user.lastName = String(input.lastName).trim()
    if (input.name !== undefined) {
      const name = String(input.name).trim()
      if (!name) throw unprocessable('Name cannot be empty')
      user.name = name
    }
    if (input.email !== undefined) {
      const email = assertEmail(input.email)
      revokeResets ||= email !== user.email
      user.email = email
    }
    if (input.phone !== undefined) user.phone = String(input.phone).trim()
    if (input.gender !== undefined) user.gender = String(input.gender).trim()
    if (input.branch !== undefined) user.branch = String(input.branch).trim()
    if (input.dob !== undefined) user.dob = assertOptionalDate(input.dob, 'dob')
    if (input.address !== undefined) user.address = String(input.address).trim()
    if (input.photo !== undefined) user.photo = validateImageValue(input.photo, 'photo')
    if (input.role !== undefined) {
      const selectedRole = role(input.role)
      if (selectedRole === 'Super Admin') throw forbidden('Users cannot be promoted to Super Admin')
      if (selectedRole !== user.role) {
        user.role = selectedRole
        user.permissions = normalizePermissions(input.permissions, selectedRole)
        user.markModified('permissions')
      } else if (input.permissions !== undefined) {
        user.permissions = normalizePermissions(input.permissions, selectedRole)
        user.markModified('permissions')
      }
    } else if (input.permissions !== undefined) {
      user.permissions = normalizePermissions(input.permissions, user.role)
      user.markModified('permissions')
    }
    if (input.blocked !== undefined) {
      user.blocked = Boolean(input.blocked)
      revokeResets ||= user.blocked
    }
    if (input.password !== undefined) {
      user.passwordHash = await hashPassword(assertPassword(input.password))
      revokeResets = true
    }
    await saveUser(user)
    await Promise.all([
      input.blocked === true || input.password !== undefined
        ? Session.deleteMany({ user: user._id })
        : Promise.resolve(),
      revokeResets ? revokePasswordResets(user._id) : Promise.resolve(),
    ])
    return sendData(res, publicUser(user))
  },

  permissions: async (req, res) => {
    const input = cleanPayload(req.body)
    const user = await findUser(req.params.userId)
    if (user.role === 'Super Admin') throw forbidden('Super Admin permissions cannot be changed')
    user.permissions = normalizePermissions(input.permissions, user.role)
    user.markModified('permissions')
    await saveUser(user)
    return sendData(res, publicUser(user))
  },

  remove: async (req, res) => {
    const user = await findUser(req.params.userId)
    if (user.userId === req.auth.user.id) throw forbidden('You cannot delete your own account')
    if (user.role === 'Super Admin') throw forbidden('The Super Admin cannot be deleted')
    await User.deleteOne({ _id: user._id })
    await Promise.all([
      Session.deleteMany({ user: user._id }),
      revokePasswordResets(user._id),
    ])
    return sendMessage(res, 'User deleted successfully')
  },
}
