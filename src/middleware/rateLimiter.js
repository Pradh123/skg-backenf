import { HttpError } from '../utils/errors.js'

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 200)
}

/**
 * Small, dependency-free limiter for a single Node.js process. Buckets are
 * bounded and opportunistically pruned so rotated client addresses cannot
 * grow the Map without limit.
 */
export function createRateLimiter({
  windowMs,
  max,
  maxBuckets = 10_000,
  code = 'RATE_LIMITED',
  message = 'Too many requests. Please try again later.',
} = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('Rate limiter windowMs must be a positive number')
  }
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error('Rate limiter max must be a positive integer')
  }
  if (!Number.isInteger(maxBuckets) || maxBuckets <= 0) {
    throw new Error('Rate limiter maxBuckets must be a positive integer')
  }
  const buckets = new Map()
  let requestsSincePrune = 0

  function prune(now, force = false) {
    requestsSincePrune += 1
    if (!force && requestsSincePrune < 100) return
    requestsSincePrune = 0
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }

  function makeRoom(now) {
    if (buckets.size < maxBuckets) return
    prune(now, true)
    while (buckets.size >= maxBuckets) {
      const oldest = buckets.keys().next().value
      if (oldest === undefined) break
      buckets.delete(oldest)
    }
  }

  const limiter = (req, res, next) => {
    const now = Date.now()
    prune(now)
    const key = clientKey(req)
    let bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      if (!bucket) makeRoom(now)
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count += 1
    const remaining = Math.max(0, max - bucket.count)
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    res.set('RateLimit-Limit', String(max))
    res.set('RateLimit-Remaining', String(remaining))
    res.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > max) {
      res.set('Retry-After', String(resetSeconds))
      return next(new HttpError(429, code, message))
    }
    return next()
  }

  limiter.reset = () => {
    buckets.clear()
    requestsSincePrune = 0
  }
  limiter.bucketCount = () => buckets.size
  return limiter
}
