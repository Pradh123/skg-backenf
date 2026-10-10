import { createHash, randomBytes } from 'node:crypto'
import { Session } from '../models/Session.js'

export function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession({ user, actorUser = null, ttlMs, userAgent = '', ipAddress = '' }) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ttlMs)
  const session = await Session.create({
    tokenHash: tokenHash(token),
    user: user._id,
    actorUser: actorUser?._id || null,
    expiresAt,
    userAgent: String(userAgent || '').slice(0, 500),
    ipAddress: String(ipAddress || '').slice(0, 100),
  })
  return { token, expiresAt, session }
}

export async function findSession(token) {
  if (!token || typeof token !== 'string' || token.length > 500) return null
  const hash = tokenHash(token)
  const session = await Session.findOne({ tokenHash: hash })
  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await Session.deleteOne({ _id: session._id })
    return null
  }
  const actorUserId = session.actorUser ? String(session.actorUser) : null
  await session.populate('user')
  await session.populate('actorUser')
  return { session, tokenHash: hash, actorUserId }
}

export async function revokeToken(hash) {
  if (hash) await Session.deleteOne({ tokenHash: hash })
}

export async function revokeUserSessions(userId, exceptHash = null) {
  const query = { $or: [{ user: userId }, { actorUser: userId }] }
  if (exceptHash) query.tokenHash = { $ne: exceptHash }
  await Session.deleteMany(query)
}
