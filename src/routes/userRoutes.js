import { Router } from 'express'
import { userController } from '../controllers/userController.js'
import { authenticate } from '../middleware/authenticate.js'
import { requireSuperAdmin } from '../middleware/authorize.js'

export const userRoutes = Router()
userRoutes.use(authenticate, requireSuperAdmin)
userRoutes.get('/', userController.list)
userRoutes.post('/', userController.create)
userRoutes.get('/:userId', userController.get)
userRoutes.patch('/:userId', userController.update)
userRoutes.put('/:userId', userController.update)
userRoutes.put('/:userId/permissions', userController.permissions)
userRoutes.delete('/:userId', userController.remove)
