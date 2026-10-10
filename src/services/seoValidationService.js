import { unprocessable } from '../utils/errors.js'
export function validateSeoFields(data) {
 if (data.keywords !== undefined) {
  if(typeof data.keywords !== 'string' || data.keywords.length>2000)throw unprocessable('Keywords must be text up to 2000 characters')
  const seen=new Set();data.keywords=data.keywords.split(',').map(term=>term.trim()).filter(term=>{const key=term.toLowerCase();if(!term||seen.has(key))return false;seen.add(key);return true}).join(', ')
 }
 for(const field of ['headScripts','bodyScripts']) {
  const value=data[field];if(value===undefined || value==='')continue
  if(typeof value!=='string'||value.length>50000)throw unprocessable(field+' must be text up to 50000 characters')
  const pattern=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  const matches=[...value.matchAll(pattern)]
  const leftover=value.replace(pattern,'').replace(/<!--[\s\S]*?-->/g,'').trim()
  if(leftover)throw unprocessable(field+' accepts complete script tags only; place metadata in the SEO fields')
  for(const match of matches){
   const attrs=match[1]
   const type=attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] || 'text/javascript'
   if(!['application/ld+json','text/javascript','application/javascript','module'].includes(type))throw unprocessable('Unsupported script type')
   const src=attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
   if(src){const url=src[1]??src[2]??src[3];if(!/^https:\/\//i.test(url)&&!/^\/(?!\/)/.test(url))throw unprocessable('Script URLs must use HTTPS or a local path')}
   if(type==='application/ld+json'){if(src)throw unprocessable('JSON-LD must be inline JSON');try{const schema=JSON.parse(match[2]);if(!schema||typeof schema!=='object')throw Error()}catch{throw unprocessable('Invalid JSON-LD in '+field)}}
  }
 }
 return data
}
