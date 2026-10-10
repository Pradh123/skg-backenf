import { promisify } from 'node:util'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const scryptAsync = promisify(scrypt)
const KEY_LENGTH = 64

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url')
  const derived = await scryptAsync(password, salt, KEY_LENGTH)
  return `scrypt$${salt}$${Buffer.from(derived).toString('base64url')}`
}

export async function verifyPassword(password, stored) {
  try {
    const [algorithm, salt, encoded] = String(stored || '').split('$')
    if (algorithm !== 'scrypt' || !salt || !encoded) return false
    const expected = Buffer.from(encoded, 'base64url')
    const actual = Buffer.from(await scryptAsync(password, salt, expected.length))
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
