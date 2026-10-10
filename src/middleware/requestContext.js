import { randomUUID } from 'node:crypto'

export function requestContext(req, res, next) {
  const provided = req.get('x-request-id')
  req.requestId = provided && provided.length <= 100 ? provided : randomUUID()
  res.set('x-request-id', req.requestId)
  next()
}

export function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store',
  })
  next()
}
