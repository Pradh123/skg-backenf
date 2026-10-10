import { RecordModel } from '../models/Record.js'
import { User } from '../models/User.js'
import { OPEN_ISSUE_STATUSES, RESOURCE_DEFINITIONS } from '../constants/resources.js'
import { sendData } from '../utils/response.js'

const number = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const displayNumber = value => new Intl.NumberFormat('en-IN').format(value)
const displayMoney = value => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(value)

function dateText(value) {
  if (!value) return 'No trips yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No trips yet'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date)
}

function latestTripDate(regular, pickup) {
  return [
    ...regular.map(item => item.data?.startDate),
    ...pickup.map(item => item.data?.tripDate),
  ].filter(Boolean).sort((left, right) => new Date(right) - new Date(left))[0] || null
}

function canView(user, path) {
  return user?.role === 'Super Admin' || Boolean(user?.permissions?.[path]?.includes('view'))
}

export const dashboardController = {
  get: async (req, res) => {
    const keys = [...new Set(Object.values(RESOURCE_DEFINITIONS).map(item => item.key))]
    const [grouped, leadStatuses, vehicles, regularTrips, pickupTrips, invoices, issues, userCount] =
      await Promise.all([
        RecordModel.aggregate([
          { $match: { resource: { $in: [...keys, 'leads'] } } },
          { $group: { _id: '$resource', count: { $sum: 1 } } },
        ]),
        RecordModel.aggregate([
          { $match: { resource: 'leads' } },
          { $group: { _id: { $ifNull: ['$data.status', 'New'] }, count: { $sum: 1 } } },
        ]),
        RecordModel.find({ resource: 'vehicles' }).select('data.status').lean(),
        RecordModel.find({ resource: 'tripsRegular' }).select('data').lean(),
        RecordModel.find({ resource: 'tripsPickupDrop' }).select('data').lean(),
        RecordModel.find({ resource: 'invoices' }).select('data.totalAmount').lean(),
        RecordModel.find({ resource: 'issues' }).select('data.status').lean(),
        User.countDocuments(),
      ])

    const rawCounts = Object.fromEntries([...keys, 'leads'].map(key => [key, 0]))
    grouped.forEach(item => { rawCounts[item._id] = item.count })
    const access = {
      vehicles: canView(req.auth.user, '/vehicles'),
      drivers: canView(req.auth.user, '/drivers'),
      regular: canView(req.auth.user, '/trips/regular'),
      pickup: canView(req.auth.user, '/trips/pickup-drop'),
      fuel: canView(req.auth.user, '/fuel'),
      invoices: canView(req.auth.user, '/invoices'),
      leads: canView(req.auth.user, '/leads'),
      parties: canView(req.auth.user, '/parties'),
      vendors: canView(req.auth.user, '/vendors'),
      issues: canView(req.auth.user, '/issues'),
      users: req.auth.user.role === 'Super Admin' && !req.auth.isImpersonating,
    }
    const regularCount = access.regular ? rawCounts.tripsRegular : 0
    const pickupCount = access.pickup ? rawCounts.tripsPickupDrop : 0
    const tripCount = regularCount + pickupCount
    const vehicleCount = access.vehicles ? rawCounts.vehicles : 0
    const activeVehicles = access.vehicles
      ? vehicles.filter(item => String(item.data?.status || 'Active').toLowerCase() === 'active').length
      : 0
    const invoicedValue = access.invoices
      ? invoices.reduce((total, item) => total + number(item.data?.totalAmount), 0)
      : 0
    const openIssues = access.issues
      ? issues.filter(item => OPEN_ISSUE_STATUSES.includes(item.data?.status || 'Open')).length
      : 0
    const today = new Date().toISOString().slice(0, 10)
    const todayRegular = access.regular
      ? regularTrips.filter(item => String(item.data?.startDate || '').slice(0, 10) === today).length
      : 0
    const upcoming = access.regular
      ? regularTrips.filter(item => String(item.data?.startDate || '').slice(0, 10) > today).length
      : 0
    const todayPickup = access.pickup
      ? pickupTrips.filter(item => String(item.data?.tripDate || '').slice(0, 10) === today).length
      : 0

    const stats = [
      access.vehicles && { label: 'Total Vehicles', value: displayNumber(vehicleCount), detail: 'in the fleet', icon: 'car', tone: 'blue' },
      access.drivers && { label: 'Total Drivers', value: displayNumber(rawCounts.drivers), detail: 'on the roster', icon: 'driver', tone: 'blue' },
      (access.regular || access.pickup) && { label: 'Total Trips', value: displayNumber(tripCount), detail: `${displayNumber(regularCount)} regular · ${displayNumber(pickupCount)} pick up/drop`, icon: 'route', tone: 'green' },
      access.fuel && { label: 'Fuel Entries', value: displayNumber(rawCounts.fuel), detail: 'logged to date', icon: 'fuel', tone: 'amber' },
      access.invoices && { label: 'Invoiced Value', value: displayMoney(invoicedValue), detail: `across ${displayNumber(rawCounts.invoices)} invoice(s)`, icon: 'rupee', tone: 'green' },
    ].filter(Boolean)

    const quickStats = [
      access.leads && { label: 'Inquiries', value: displayNumber(rawCounts.leads), icon: 'message' },
      access.parties && { label: 'Parties', value: displayNumber(rawCounts.parties), icon: 'users' },
      access.vendors && { label: 'Vendors', value: displayNumber(rawCounts.vendors), icon: 'vendor' },
      access.issues && { label: 'Issues', value: displayNumber(openIssues), icon: 'alert' },
      access.invoices && { label: 'Invoices', value: displayNumber(rawCounts.invoices), icon: 'invoice' },
      access.users && { label: 'Users', value: displayNumber(userCount), icon: 'user' },
    ].filter(Boolean)

    const visibleCounts = {}
    for (const definition of Object.values(RESOURCE_DEFINITIONS)) {
      if (canView(req.auth.user, definition.permission)) {
        visibleCounts[definition.key] = rawCounts[definition.key]
      }
    }
    if (access.leads) visibleCounts.leads = rawCounts.leads
    if (access.users) visibleCounts.users = userCount

    return sendData(res, {
      stats,
      charts: {
        trips: { total: tripCount, regular: regularCount, pickup: pickupCount },
        vehicles: { total: vehicleCount, active: activeVehicles, inactive: Math.max(0, vehicleCount - activeVehicles) },
        latestTrip: access.regular || access.pickup
          ? dateText(latestTripDate(access.regular ? regularTrips : [], access.pickup ? pickupTrips : []))
          : 'No trips yet',
      },
      trips: {
        todayRegular: { title: "Today's Trip Regular", columns: ['Party Name', 'Trip No.', 'Time', 'Vehicle', 'Driver'], empty: todayRegular ? `${todayRegular} regular trip(s) scheduled today.` : 'No regular trips scheduled for today.', total: `Total trips: ${todayRegular}` },
        upcoming: { title: 'Upcoming Trips', columns: ['Date', 'Party Name', 'Time', 'Vehicle', 'Driver'], empty: upcoming ? `${upcoming} upcoming regular trip(s).` : 'No upcoming regular trips.', total: `Total upcoming trips: ${upcoming}` },
        todayPickup: { title: "Today's Pick Up / Drop", columns: ['Time', 'Party Name', 'Type', 'Vehicle', 'Driver'], empty: todayPickup ? `${todayPickup} pick up/drop trip(s) scheduled today.` : 'No pick up / drop trips for today.', total: `Total trips: ${todayPickup}` },
      },
      quickStats,
      counts: visibleCounts,
      totalRecords: Object.values(visibleCounts).reduce((total, value) => total + value, 0),
      leadStatuses: access.leads
        ? Object.fromEntries(leadStatuses.map(item => [item._id, item.count]))
        : {},
      generatedAt: new Date().toISOString(),
    })
  },
}
