import { unprocessable } from '../utils/errors.js'

export function validateImageValue(value, field = 'image', { required = false } = {}) {
  const image = String(value || '').trim()
  if (!image) {
    if (required) throw unprocessable(`${field} is required`, [{ field, issue: 'required' }])
    return ''
  }
  if (image.length > 3 * 1024 * 1024) {
    throw unprocessable(`${field} is too large`, [{ field, issue: 'maximum size exceeded' }])
  }
  if (image.startsWith('data:')) {
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image)) {
      throw unprocessable(`${field} must be a PNG, JPG, WEBP, or GIF image`,
        [{ field, issue: 'unsupported image type' }])
    }
    return image
  }
  try {
    const url = new URL(image)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol')
    return image
  } catch {
    throw unprocessable(`${field} must be a valid image URL`, [{ field, issue: 'invalid URL' }])
  }
}
