import { Router } from 'express'
import { createResourceController } from '../controllers/resourceController.js'
import { authenticate } from '../middleware/authenticate.js'
import { requirePermission } from '../middleware/authorize.js'

export function createResourceRoutes(definition) {
  const router = Router()
  const controller = createResourceController(definition)
  router.use(authenticate)
  router.get('/', requirePermission(definition.permission, 'view'), controller.list)
  router.post('/', requirePermission(definition.permission, 'create'), controller.create)
  router.get('/:id', requirePermission(definition.permission, 'view'), controller.get)
  router.patch('/:id', requirePermission(definition.permission, 'edit'), controller.update)
  router.put('/:id', requirePermission(definition.permission, 'edit'), controller.update)
  router.delete('/:id', requirePermission(definition.permission, 'delete'), controller.remove)
  return router
}
