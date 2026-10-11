import { unprocessable } from '../utils/errors.js'

export function validateFaqs(data) {
  if (data.faqs === undefined) return
  if (!Array.isArray(data.faqs) || data.faqs.length > 30) {
    throw unprocessable('FAQs must be a list of up to 30 entries', [{ field: 'faqs', issue: 'invalid list' }])
  }
  data.faqs = data.faqs.map((faq, index) => {
    const field = `faqs.${index}`
    if (!faq || typeof faq !== 'object' || Array.isArray(faq) ||
      typeof faq.title !== 'string' || !faq.title.trim() || faq.title.length > 300 ||
      typeof faq.description !== 'string' || faq.description.length > 50000 ||
      !faq.description.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim()) {
      throw unprocessable(`FAQ ${index + 1} needs a title and description`, [{ field, issue: 'invalid FAQ' }])
    }
    return { title: faq.title.trim(), description: faq.description.trim() }
  })
}
