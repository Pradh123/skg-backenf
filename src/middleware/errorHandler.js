import mongoose from 'mongoose'
import { HttpError } from '../utils/errors.js'

export function errorHandler(error, req, res, _next) {
  let status = error.status || 500
  let code = error.code || 'INTERNAL_ERROR'
  let message = error.message || 'An unexpected error occurred'
  let details = error.details

  if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
    status = 400
    code = 'INVALID_JSON'
    message = 'Request body contains invalid JSON'
  } else if (error.type === 'entity.too.large') {
    status = 413
    code = 'PAYLOAD_TOO_LARGE'
    message = 'Request body is too large'
  } else if (error instanceof mongoose.Error.ValidationError) {
    status = 422
    code = 'VALIDATION_ERROR'
    message = 'Database validation failed'
    details = Object.values(error.errors).map(item => ({ field: item.path, issue: item.message }))
  } else if (error instanceof mongoose.Error.CastError) {
    status = 422
    code = 'VALIDATION_ERROR'
    message = `${error.path} has an invalid value`
    details = [{ field: error.path, issue: 'invalid value' }]
  } else if (error?.code === 11000) {
    status = 409
    code = 'CONFLICT'
    message = 'A record with that unique value already exists'
    details = error.keyValue
  } else if (!(error instanceof HttpError) && status < 500) {
    code = 'REQUEST_ERROR'
  }

  if (status >= 500) {
    status = 500
    code = 'INTERNAL_ERROR'
    message = 'An unexpected error occurred'
    details = undefined
  }

  const payload = { error: { code, message, requestId: req.requestId } }
  if (details !== undefined) payload.error.details = details
  if (status >= 500 && process.env.NODE_ENV !== 'test') console.error(error)
  res.status(status).json(payload)
}
