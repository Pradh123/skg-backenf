import { Router } from 'express'
import { leadController } from '../controllers/leadController.js'
import { cmsController } from '../controllers/cmsController.js'
import { PUBLIC_CMS_RESOURCES } from '../constants/resources.js'
import { notFound } from '../utils/errors.js'
import { publicLeadLimiter } from '../middleware/publicLeadLimiter.js'

export const publicRoutes = Router()
publicRoutes.post('/leads', publicLeadLimiter(), leadController.createPublic)
publicRoutes.param('resource', (req, _res, next, value) => {
  if (!PUBLIC_CMS_RESOURCES.includes(value)) return next(notFound('Public CMS resource not found'))
  return next()
})
publicRoutes.get('/cms/:resource', cmsController.list)
publicRoutes.get('/cms/:resource/:slug', cmsController.getBySlug)
