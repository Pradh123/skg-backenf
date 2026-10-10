import test from 'node:test'
import assert from 'node:assert/strict'
import {validateSeoFields} from '../src/services/seoValidationService.js'
test('normalizes keywords and validates scripts for every CMS resource',()=>{
 const data=validateSeoFields({keywords:' taxi, Taxi, airport, ',headScripts:'<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>',bodyScripts:'<script src="https://example.com/track.js"></script>'})
 assert.equal(data.keywords,'taxi, airport')
 for(const headScripts of ['<script type="application/ld+json">bad</script>','<script src="javascript:bad()"></script>','<meta name="description" content="duplicate">'])assert.throws(()=>validateSeoFields({headScripts}),{status:422})
})
