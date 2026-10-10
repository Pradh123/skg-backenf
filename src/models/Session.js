import mongoose from 'mongoose'

const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, immutable: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  expiresAt: { type: Date, required: true },
  lastSeenAt: { type: Date, default: Date.now },
  userAgent: { type: String, maxlength: 500, default: '' },
  ipAddress: { type: String, maxlength: 100, default: '' },
}, { timestamps: true })

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
sessionSchema.index({ user: 1, createdAt: -1 })

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema)
