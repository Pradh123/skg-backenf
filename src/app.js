import express from 'express'
import { loadConfig } from './config/env.js'
import { databaseHealth } from './database/connection.js'
import { initializeModels, ensureSuperAdmin } from './services/userService.js'
import { createApiRoutes } from './routes/index.js'
import { cors } from './middleware/cors.js'
import { requestContext, securityHeaders } from './middleware/requestContext.js'
import { notFoundHandler } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'
import { sendData } from './utils/response.js'

export async function createApp(configOverrides = {}) {
  const config = loadConfig(configOverrides)
  await initializeModels()
  await ensureSuperAdmin(config)

  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxy) app.set('trust proxy', 1)
  app.locals.config = config

  app.use(requestContext)
  app.use(securityHeaders)
  app.use(cors(config))
  app.use(express.json({ limit: config.jsonLimit, strict: true }))

  const health = (_req, res) => {
    const database = databaseHealth()
    return sendData(res, {
      status: database.state === 'connected' ? 'ok' : 'degraded',
      service: 'skg-admin-backend',
      database: { state: database.state },
      timestamp: new Date().toISOString(),
    }, database.state === 'connected' ? 200 : 503)
  }
  app.get('/health', health)
  app.get('/api/v1/health', health)
  app.use('/api/v1', createApiRoutes(config))
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
