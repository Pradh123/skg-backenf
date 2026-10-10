import { RecordModel } from '../models/Record.js'
import { sendData } from '../utils/response.js'
import { notFound } from '../utils/errors.js'

const lookupDefinitions = Object.freeze({
  vehicles: { resource: 'vehicles', fields: ['registrationNumber', 'driverName', 'status'] },
  drivers: { resource: 'drivers', fields: ['firstName', 'lastName', 'employeeNumber', 'status'] },
  vendors: { resource: 'vendors', fields: ['vendorName', 'vendorType', 'status'] },
  parties: { resource: 'parties', fields: ['corporateName', 'contactName', 'status'] },
})

export const lookupController = {
  list: async (req, res) => {
    const definition = lookupDefinitions[req.params.resource]
    if (!definition) throw notFound('Lookup resource not found')
    const records = await RecordModel.find({ resource: definition.resource })
      .sort({ 'data.name': 1, updatedAt: -1 })
      .limit(500)
      .lean()
    return sendData(res, records.map(record => ({
      id: record.recordId,
      ...Object.fromEntries(definition.fields
        .filter(field => record.data?.[field] !== undefined)
        .map(field => [field, record.data[field]])),
    })))
  },
}
