const definitions = [
  {
    route: 'vehicles',
    key: 'vehicles',
    permission: '/vehicles',
    required: ['registrationNumber', 'vehicleMake', 'vehicleModel', 'vehicleType'],
    unique: ['registrationNumber'],
    searchable: ['registrationNumber', 'vehicleMake', 'vehicleModel', 'driverName', 'status'],
  },
  {
    route: 'drivers',
    key: 'drivers',
    permission: '/drivers',
    required: ['employeeNumber', 'joiningDate', 'firstName', 'lastName', 'mobileNumber', 'location'],
    unique: ['employeeNumber'],
    searchable: ['employeeNumber', 'firstName', 'lastName', 'mobileNumber', 'location', 'email'],
  },
  {
    route: 'parties',
    key: 'parties',
    permission: '/parties',
    required: ['corporateName', 'contactName', 'phoneNumber', 'location'],
    searchable: ['corporateName', 'contactName', 'phoneNumber', 'location', 'email'],
  },
  {
    route: 'trips-regular',
    key: 'tripsRegular',
    permission: '/trips/regular',
    required: ['vehicleNumber', 'clientName', 'number', 'startDate', 'startTime', 'endDate', 'endTime', 'pickupAddress', 'dropAddress'],
    searchable: ['vehicleNumber', 'clientName', 'number', 'pickupAddress', 'dropAddress'],
  },
  {
    route: 'trips-pickup-drop',
    key: 'tripsPickupDrop',
    permission: '/trips/pickup-drop',
    required: ['vehicleNumber', 'tripDate', 'tripTime', 'partyName', 'number', 'pickupOrDrop', 'pickupDropPoint'],
    searchable: ['vehicleNumber', 'partyName', 'number', 'pickupDropPoint'],
  },
  {
    route: 'vendors',
    key: 'vendors',
    permission: '/vendors',
    required: ['vendorName', 'vendorNumber', 'vendorType', 'city'],
    searchable: ['vendorName', 'vendorNumber', 'vendorType', 'city', 'gstNumber'],
  },
  {
    route: 'fuel',
    key: 'fuel',
    permission: '/fuel',
    required: ['date', 'vehicleNumber', 'odometerReading', 'vendor', 'liters', 'pricePerUnit', 'paymentMethod'],
    searchable: ['vehicleNumber', 'vendor', 'paymentMethod', 'reference'],
  },
  {
    route: 'issues',
    key: 'issues',
    permission: '/issues',
    required: ['vehicleNumber', 'summary', 'priority', 'date', 'time', 'description'],
    searchable: ['vehicleNumber', 'summary', 'priority', 'status', 'assignedTo', 'description'],
  },
  {
    route: 'invoices',
    key: 'invoices',
    permission: '/invoices',
    required: ['date', 'vehicleNumber', 'clientName', 'clientAddress', 'invoiceNumber', 'serviceName', 'serviceQuantity', 'serviceRate'],
    unique: ['invoiceNumber'],
    searchable: ['invoiceNumber', 'vehicleNumber', 'clientName', 'customerId', 'serviceName'],
  },
  {
    route: 'branches',
    key: 'branches',
    permission: '/masters/branches',
    required: ['branchName'],
    unique: ['branchName'],
    searchable: ['branchName'],
  },
  {
    route: 'cities',
    key: 'cities',
    permission: '/masters/cities',
    required: ['cityName', 'slug'],
    unique: ['slug'],
    searchable: ['cityName', 'slug', 'seoTitle', 'status'],
    slugSource: ['cityName'],
  },
  {
    route: 'area-seo',
    key: 'area-seo',
    permission: '/cms/area-seo',
    required: ['areaName', 'cityName', 'slug', 'h1Title', 'seoTitle'],
    unique: ['slug'],
    searchable: ['areaName', 'cityName', 'slug', 'h1Title', 'seoTitle'],
    slugSource: ['areaName', 'cityName'],
    cms: true,
  },
  {
    route: 'route-seo',
    key: 'route-seo',
    permission: '/cms/route-seo',
    required: ['title'],
    unique: ['slug'],
    searchable: ['title', 'slug', 'metaTitle', 'status'],
    slugSource: ['title'],
    cms: true,
  },
  {
    route: 'blogs',
    key: 'blogs',
    permission: '/cms/blog',
    required: ['title'],
    unique: ['slug'],
    searchable: ['title', 'slug', 'metaTitle', 'status'],
    slugSource: ['title'],
    cms: true,
  },
  {
    route: 'chatgpt-prompts',
    key: 'chatgpt-prompts',
    permission: '/cms/chatgpt-prompts',
    required: ['title'],
    unique: ['slug'],
    searchable: ['title', 'slug', 'pageType', 'status'],
    slugSource: ['title'],
  },
]

export const RESOURCE_DEFINITIONS = Object.freeze(
  Object.fromEntries(definitions.map(definition => [definition.route, Object.freeze({
    unique: [],
    searchable: [],
    ...definition,
  })]))
)

export const RESOURCE_ROUTES = Object.freeze(Object.keys(RESOURCE_DEFINITIONS))
export const RECORD_RESOURCE_KEYS = Object.freeze([
  ...new Set([...definitions.map(definition => definition.key), 'leads']),
])
export const PUBLIC_CMS_RESOURCES = Object.freeze(['cities', 'area-seo', 'route-seo', 'blogs'])
export const ISSUE_STATUSES = Object.freeze(['Open', 'In Progress', 'Resolved', 'Closed'])
export const OPEN_ISSUE_STATUSES = Object.freeze(['Open', 'In Progress'])

export function getResourceDefinition(route) {
  return RESOURCE_DEFINITIONS[route] || null
}
