import { publicUser } from '../models/User.js'
import { saveUser } from '../services/userService.js'
import { sendData } from '../utils/response.js'
import { assertEmail, assertOptionalDate, cleanPayload } from '../utils/validation.js'
import { forbidden, unprocessable } from '../utils/errors.js'
import { validateImageValue } from '../services/mediaValidationService.js'
import { revokePasswordResets } from '../services/passwordResetService.js'

const editableFields = new Set([
  'firstName',
  'lastName',
  'name',
  'email',
  'phone',
  'gender',
  'branch',
  'dob',
  'address',
  'photo',
])

export const profileController = {
  get: async (req, res) => sendData(res, publicUser(req.auth.userDocument)),

  update: async (req, res) => {
    const input = cleanPayload(req.body)
    const user = req.auth.userDocument
    let revokeResets = false
    const rejected = Object.keys(input).filter(field => !editableFields.has(field))
    if (rejected.length) {
      throw unprocessable('Profile contains fields that cannot be changed here',
        rejected.map(field => ({ field, issue: 'not editable' })))
    }

    if (input.firstName !== undefined) user.firstName = String(input.firstName).trim()
    if (input.lastName !== undefined) user.lastName = String(input.lastName).trim()
    if (input.name !== undefined) {
      const name = String(input.name).trim()
      if (!name) throw unprocessable('Name cannot be empty', [{ field: 'name', issue: 'required' }])
      user.name = name
    }
    if (input.email !== undefined) {
      const email = assertEmail(input.email)
      if (user.role === 'Super Admin' && email !== user.email) {
        throw forbidden('The Super Admin email cannot be changed')
      }
      revokeResets = email !== user.email
      user.email = email
    }
    if (input.phone !== undefined) user.phone = String(input.phone).trim()
    if (input.gender !== undefined) user.gender = String(input.gender).trim()
    if (input.branch !== undefined) user.branch = String(input.branch).trim()
    if (input.dob !== undefined) user.dob = assertOptionalDate(input.dob, 'dob')
    if (input.address !== undefined) user.address = String(input.address).trim()
    if (input.photo !== undefined) user.photo = validateImageValue(input.photo, 'photo')

    await saveUser(user)
    if (revokeResets) await revokePasswordResets(user._id)
    return sendData(res, publicUser(user))
  },
}
