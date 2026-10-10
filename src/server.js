import { createServer } from 'node:http'
import { loadConfig } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './database/connection.js'
import { createApp } from './app.js'

const config = loadConfig()
await connectDatabase(config.mongodbUri)
const app = await createApp(config)
const server = createServer(app)

server.listen(config.port, () => {
  console.log(`SKG Admin API listening on http://localhost:${config.port}`)
  if (config.nodeEnv !== 'production') {
    console.log(`Development Super Admin login: ${config.adminEmail} / ${config.adminPassword}`)
  }
})

let closing = false
async function shutdown(signal) {
  if (closing) return
  closing = true
  console.log(`${signal} received; shutting down`)
  server.close(async () => {
    await disconnectDatabase()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
