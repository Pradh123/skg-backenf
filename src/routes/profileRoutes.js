import { Router } from 'express'
import { profileController } from '../controllers/profileController.js'
import { authenticate } from '../middleware/authenticate.js'

export const profileRoutes = Router()
profileRoutes.use(authenticate)
profileRoutes.get('/', profileController.get)
profileRoutes.patch('/', profileController.update)
profileRoutes.put('/', profileController.update)
