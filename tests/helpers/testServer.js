import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../../src/database/connection.js'
import { createApp } from '../../src/app.js'

export const TEST_ADMIN = Object.freeze({
  email: 'admin.test@skg.example',
  password: 'TestAdmin123!',
})

function uniqueTestUri() {
  const base = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skg_admin'
  const parsed = new URL(base)
  const name = `skg_admin_test_${Date.now().toString(36)}_${process.pid.toString(36)}_${randomBytes(4).toString('hex')}`
  parsed.pathname = `/${name}`
  return { uri: parsed.toString(), name }
}

export async function createTestServer(overrides = {}) {
  const { uri, name } = uniqueTestUri()
  if (!name.startsWith('skg_admin_test_')) throw new Error('Unsafe test database name')
  await connectDatabase(uri)
  if (mongoose.connection.name !== name) throw new Error('Connected to an unexpected test database')

  const config = {
    nodeEnv: 'test',
    mongodbUri: uri,
    adminEmail: TEST_ADMIN.email,
    adminPassword: TEST_ADMIN.password,
    corsOrigins: ['http://allowed.test'],
    sessionTtlMs: 60 * 60 * 1000,
    passwordResetTtlMs: 60 * 60 * 1000,
    authRateLimitWindowMs: 60 * 1000,
    loginRateLimitMax: 100,
    forgotPasswordRateLimitMax: 100,
    resetPasswordRateLimitMax: 100,
    jsonLimit: '32kb',
    ...overrides,
  }
  const app = await createApp(config)
  const server = createServer(app)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) }
    if (options.token) headers.Authorization = `Bearer ${options.token}`
    let body = options.rawBody
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || (body === undefined ? 'GET' : 'POST'),
      headers,
      body,
    })
    const text = await response.text()
    let payload = null
    if (text) {
      try { payload = JSON.parse(text) } catch { payload = text }
    }
    return { status: response.status, headers: response.headers, body: payload }
  }

  async function login(email = TEST_ADMIN.email, password = TEST_ADMIN.password) {
    const response = await request('/api/v1/auth/login', { body: { email, password } })
    if (response.status !== 200) throw new Error(`Test login failed: ${JSON.stringify(response.body)}`)
    return response.body.data
  }

  async function close() {
    await new Promise(resolve => server.close(resolve))
    const activeName = mongoose.connection.name
    if (!activeName?.startsWith('skg_admin_test_') || activeName !== name) {
      throw new Error(`Refusing to drop unsafe database: ${activeName}`)
    }
    await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  }

  return { app, server, baseUrl, request, login, close, databaseName: name, config }
}
