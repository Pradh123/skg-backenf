import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
const schema = new mongoose.Schema(
  {
    mediaId: { type: String, default: randomUUID, unique: true },
    publicId: { type: String, required: true },
    name: String,
    alt: String,
    mime: String,
    size: Number,
    format: String,
    resourceType: { type: String, enum: ["image", "raw"], required: true },
    deliveryType: {
      type: String,
      enum: ["upload", "authenticated"],
      required: true,
    },
    scope: { type: String, required: true, index: true },
    url: String,
    owner: String,
  },
  { timestamps: true },
);
export const Media = mongoose.models.Media || mongoose.model("Media", schema);
export function mediaDTO(row) {
  return {
    id: row.mediaId,
    mediaId: row.mediaId,
    name: row.name,
    alt: row.alt || "",
    type: row.mime,
    size: row.size,
    scope: row.scope,
    private: row.deliveryType === "authenticated",
    url: row.deliveryType === "upload" ? row.url : undefined,
    createdAt: row.createdAt,
  };
}
