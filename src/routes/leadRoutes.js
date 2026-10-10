import { Router } from 'express'
import { leadController } from '../controllers/leadController.js'
import { authenticate } from '../middleware/authenticate.js'
import { requirePermission } from '../middleware/authorize.js'

export const leadRoutes = Router()
leadRoutes.use(authenticate)
leadRoutes.get('/', requirePermission('/leads', 'view'), leadController.list)
leadRoutes.get('/:id', requirePermission('/leads', 'view'), leadController.get)
leadRoutes.patch('/:id/status', requirePermission('/leads', 'edit'), leadController.status)
leadRoutes.patch('/:id', requirePermission('/leads', 'edit'), leadController.status)
leadRoutes.delete('/:id', requirePermission('/leads', 'delete'), leadController.remove)
