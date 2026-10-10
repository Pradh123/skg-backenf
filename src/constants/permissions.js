import { RESOURCE_DEFINITIONS } from './resources.js'

export const ROLES = Object.freeze(['Super Admin', 'Admin', 'Inquiry'])
export const OPERATIONS = Object.freeze(['view', 'create', 'edit', 'delete'])

const limited = Object.freeze({
  '/': ['view'],
  '/leads': ['view', 'edit'],
  '/cms/area-seo': ['view', 'create', 'edit'],
  '/masters/invoice-settings': ['view', 'edit'],
})

export const PERMISSION_PATHS = Object.freeze([
  '/',
  '/leads',
  ...new Set(Object.values(RESOURCE_DEFINITIONS).map(resource => resource.permission)),
  '/masters/invoice-settings',
])

export function operationsForPath(path) {
  return [...(limited[path] || OPERATIONS)]
}

export function permissionsForRole(role = 'Admin') {
  if (role === 'Inquiry') return { '/': ['view'], '/leads': ['view', 'edit'] }
  return Object.fromEntries(PERMISSION_PATHS.map(path => [path, operationsForPath(path)]))
}

export function normalizePermissions(value, role = 'Admin') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return permissionsForRole(role)
  return Object.fromEntries(PERMISSION_PATHS.map(path => {
    const allowed = operationsForPath(path)
    let selected = Array.isArray(value[path]) ? value[path].filter(item => allowed.includes(item)) : []
    selected = [...new Set(selected)]
    if (selected.some(operation => operation !== 'view') && allowed.includes('view')) {
      selected.unshift('view')
    }
    if (!selected.includes('view')) selected = []
    return [path, allowed.filter(operation => selected.includes(operation))]
  }))
}
