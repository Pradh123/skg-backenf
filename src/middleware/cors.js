import { forbidden } from '../utils/errors.js'

export function cors(config) {
  const allowed = new Set(config.corsOrigins)
  const allowAll = allowed.has('*')
  return (req, res, next) => {
    const origin = req.get('origin')
    if (origin && !allowAll && !allowed.has(origin)) return next(forbidden('Origin is not allowed'))
    if (origin) {
      res.set('Access-Control-Allow-Origin', allowAll ? '*' : origin)
      res.set('Vary', 'Origin')
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id')
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      res.set('Access-Control-Max-Age', '600')
    }
    if (req.method === 'OPTIONS') return res.status(204).end()
    return next()
  }
}
