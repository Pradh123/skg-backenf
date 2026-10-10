import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { lookupController } from '../controllers/lookupController.js'
import { forbidden } from '../utils/errors.js'

const lookupPermissions = Object.freeze({
  vehicles: [
    ['/vehicles', 'view'],
    ['/trips/regular', 'create'],
    ['/trips/regular', 'edit'],
    ['/trips/pickup-drop', 'create'],
    ['/trips/pickup-drop', 'edit'],
    ['/fuel', 'create'],
    ['/fuel', 'edit'],
    ['/issues', 'create'],
    ['/issues', 'edit'],
    ['/invoices', 'create'],
    ['/invoices', 'edit'],
  ],
  drivers: [
    ['/drivers', 'view'],
    ['/vehicles', 'create'],
    ['/vehicles', 'edit'],
  ],
  vendors: [
    ['/vendors', 'view'],
    ['/fuel', 'create'],
    ['/fuel', 'edit'],
  ],
  parties: [
    ['/parties', 'view'],
    ['/trips/regular', 'create'],
    ['/trips/regular', 'edit'],
    ['/trips/pickup-drop', 'create'],
    ['/trips/pickup-drop', 'edit'],
    ['/invoices', 'create'],
    ['/invoices', 'edit'],
  ],
})

function authorizeLookup(req, _res, next) {
  const requirements = lookupPermissions[req.params.resource]
  // The controller owns the 404 response for resources outside the allowlist.
  if (!requirements) return next()

  const user = req.auth?.user
  if (user?.role === 'Super Admin') return next()
  const allowed = requirements.some(([path, operation]) =>
    user?.permissions?.[path]?.includes(operation)
  )
  return allowed
    ? next()
    : next(forbidden(`Lookup access is not allowed for ${req.params.resource}`))
}

export const lookupRoutes = Router()
lookupRoutes.use(authenticate)
lookupRoutes.get('/:resource', authorizeLookup, lookupController.list)
