import test from 'node:test'
import assert from 'node:assert/strict'
import { validateResourceData } from '../src/services/resourceValidationService.js'

test('FAQs validate titles and rich answers in all three CMS modules', () => {
  for (const key of ['blogs', 'route-seo', 'area-seo']) {
    const data = { faqs: [{ title: '  Can I book a cab?  ', description: '<p>Yes, <strong>online</strong>.</p>', unknown: 'ignored' }] }
    validateResourceData({ key }, data)
    assert.deepEqual(data.faqs, [{ title: 'Can I book a cab?', description: '<p>Yes, <strong>online</strong>.</p>' }])
    for (const faqs of [null, {}, [null], [{ title: '', description: '<p>Answer</p>' }], [{ title: 'Title', description: '<p><br></p>' }], [{ title: 'Title', description: '<p>&nbsp;</p>' }], [{ title: 'Title', description: 123 }], Array(31).fill(data.faqs[0])]) {
      assert.throws(() => validateResourceData({ key }, { faqs }), { status: 422 })
    }
    validateResourceData({ key }, { faqs: [] })
    validateResourceData({ key }, {})
  }
})
