import { Router } from 'express'
import { settingController } from '../controllers/settingController.js'
import { authenticate } from '../middleware/authenticate.js'
import { requireAnyPermission, requirePermission } from '../middleware/authorize.js'

export const settingRoutes = Router()
settingRoutes.use(authenticate)
settingRoutes.get('/invoice', requireAnyPermission([
  ['/masters/invoice-settings', 'view'],
  ['/invoices', 'view'],
]), settingController.getInvoice)
settingRoutes.put('/invoice', requirePermission('/masters/invoice-settings', 'edit'), settingController.updateInvoice)
settingRoutes.get('/preferences', settingController.getPreferences)
settingRoutes.put('/preferences', settingController.updatePreferences)
