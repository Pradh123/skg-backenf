import mongoose from 'mongoose'

export async function connectDatabase(uri) {
  if (!uri || typeof uri !== 'string') throw new Error('A valid MONGODB_URI is required')
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    autoIndex: true,
  })
  return mongoose.connection
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}

export function databaseHealth() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting']
  return {
    state: states[mongoose.connection.readyState] || 'unknown',
    database: mongoose.connection.name || null,
  }
}
