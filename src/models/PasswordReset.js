import mongoose from 'mongoose'

const passwordResetSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, immutable: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true })

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const PasswordReset = mongoose.models.PasswordReset ||
  mongoose.model('PasswordReset', passwordResetSchema)
