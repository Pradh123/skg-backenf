import mongoose from 'mongoose'

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, maxlength: 300 },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    default: {},
    validate: {
      validator: value => value && typeof value === 'object' && !Array.isArray(value),
      message: 'data must be an object',
    },
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false })

export const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema)
