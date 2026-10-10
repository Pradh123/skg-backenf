export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details)
export const unauthorized = (message = 'Authentication is required') => new HttpError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'You do not have permission to perform this action') => new HttpError(403, 'FORBIDDEN', message)
export const notFound = (message = 'Resource not found') => new HttpError(404, 'NOT_FOUND', message)
export const conflict = (message, details) => new HttpError(409, 'CONFLICT', message, details)
export const unprocessable = (message, details) => new HttpError(422, 'VALIDATION_ERROR', message, details)
