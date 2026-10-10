import { findSession, revokeToken } from '../services/sessionService.js'
import { publicUser } from '../models/User.js'
import { unauthorized } from '../utils/errors.js'

export async function authenticate(req, _res, next) {
  const match = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)
  if (!match) return next(unauthorized())
  const found = await findSession(match[1])
  const invalidActor = Boolean(found?.actorUserId) && (
    !found.session.actorUser ||
    found.session.actorUser.blocked ||
    found.session.actorUser.role !== 'Super Admin'
  )
  if (!found || !found.session.user || found.session.user.blocked || invalidActor) {
    if (found?.tokenHash) await revokeToken(found.tokenHash)
    return next(unauthorized('Session is invalid or expired'))
  }
  found.session.lastSeenAt = new Date()
  await found.session.save()
  req.auth = {
    session: found.session,
    tokenHash: found.tokenHash,
    userDocument: found.session.user,
    actorDocument: found.session.actorUser || null,
    user: publicUser(found.session.user),
    actor: publicUser(found.session.actorUser),
    isImpersonating: Boolean(found.actorUserId),
  }
  return next()
}
