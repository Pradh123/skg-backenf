import { Router } from 'express'
import { RESOURCE_DEFINITIONS } from '../constants/resources.js'
import { createAuthRoutes } from './authRoutes.js'
import { userRoutes } from './userRoutes.js'
import { createResourceRoutes } from './resourceRoutes.js'
import { leadRoutes } from './leadRoutes.js'
import { publicRoutes } from './publicRoutes.js'
import { settingRoutes } from './settingRoutes.js'
import { profileRoutes } from './profileRoutes.js'
import { lookupRoutes } from './lookupRoutes.js'
import { authenticate } from '../middleware/authenticate.js'
import { requirePermission } from '../middleware/authorize.js'
import { dashboardController } from '../controllers/dashboardController.js'

export function createApiRoutes(config) {
  const router = Router()
  router.use('/auth', createAuthRoutes(config))
  router.use('/users', userRoutes)
  router.use('/public', publicRoutes)
  router.use('/leads', leadRoutes)
  router.use('/settings', settingRoutes)
  router.use('/profile', profileRoutes)
  router.use('/lookups', lookupRoutes)
  router.get('/dashboard', authenticate, requirePermission('/', 'view'), dashboardController.get)
  for (const definition of Object.values(RESOURCE_DEFINITIONS)) {
    router.use(`/${definition.route}`, createResourceRoutes(definition))
  }
  return router
}
