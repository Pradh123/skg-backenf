import { forbidden } from '../utils/errors.js'

export function requirePermission(path, operation) {
  return (req, _res, next) => {
    const user = req.auth?.user
    if (!user) return next(forbidden())
    if (user.role === 'Super Admin' || user.permissions?.[path]?.includes(operation)) return next()
    return next(forbidden(`Permission ${operation} is required for ${path}`))
  }
}

export function requireSuperAdmin(req, _res, next) {
  if (req.auth?.user?.role === 'Super Admin' && !req.auth.isImpersonating) return next()
  return next(forbidden('Super Admin access is required'))
}

export function requireAnyPermission(requirements) {
  return (req, _res, next) => {
    const user = req.auth?.user
    if (!user) return next(forbidden())
    if (user.role === 'Super Admin') return next()
    const allowed = requirements.some(([path, operation]) =>
      user.permissions?.[path]?.includes(operation)
    )
    return allowed
      ? next()
      : next(forbidden('One of the required permissions is missing'))
  }
}
