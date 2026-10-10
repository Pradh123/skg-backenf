import { randomBytes } from 'node:crypto'
import { PasswordReset } from '../models/PasswordReset.js'
import { tokenHash } from './sessionService.js'

export async function createPasswordReset(user, ttlMs) {
  await PasswordReset.deleteMany({ user: user._id })
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ttlMs)
  await PasswordReset.create({ tokenHash: tokenHash(token), user: user._id, expiresAt })
  return { token, expiresAt }
}

export async function consumePasswordReset(token) {
  if (!token || typeof token !== 'string' || token.length > 500) return null
  const reset = await PasswordReset.findOneAndDelete({ tokenHash: tokenHash(token) }).populate('user')
  if (!reset || !reset.user || reset.expiresAt.getTime() <= Date.now()) return null
  return reset.user
}

export async function revokePasswordResets(userId) {
  if (userId) await PasswordReset.deleteMany({ user: userId })
}
