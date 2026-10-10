import { randomUUID } from "node:crypto";
import { Media, mediaDTO } from "../models/Media.js";
import { cloudinaryClient, validateUpload } from "./cloudinaryService.js";
import { HttpError, unprocessable } from "../utils/errors.js";
export async function uploadMedia(body, scope, owner) {
  const { mime, size } = validateUpload({ ...body, scope });
  const metadata =
    scope === "/gallery"
      ? validatePublicMetadata(body)
      : { name: String(body.name || "File").slice(0, 200), alt: "" };
  const client = cloudinaryClient();
  const resourceType = mime === "application/pdf" ? "raw" : "image";
  const deliveryType = scope === "/gallery" ? "upload" : "authenticated";
  const publicId =
    "skg/" +
    scope.slice(1) +
    "/" +
    randomUUID() +
    (resourceType === "raw" ? ".pdf" : "");
  let result;
  try {
    result = await client.uploader.upload(body.dataUrl, {
      // The SDK signs these server-owned parameters with the backend API secret.
      // Explicitly disable unsigned uploads, including any global SDK setting.
      unsigned: false,
      public_id: publicId,
      resource_type: resourceType,
      type: deliveryType,
      overwrite: false,
      timeout: 60000,
    });
  } catch {
    throw new HttpError(502, "MEDIA_UPLOAD_FAILED", "Cloudinary upload failed");
  }
  try {
    const row = await Media.create({
      publicId: result.public_id,
      ...metadata,
      mime,
      size,
      format: result.format || "pdf",
      resourceType,
      deliveryType,
      scope,
      url: deliveryType === "upload" ? result.secure_url : undefined,
      owner: owner,
    });
    return mediaDTO(row);
  } catch (error) {
    await client.uploader
      .destroy(result.public_id, {
        resource_type: resourceType,
        type: deliveryType,
      })
      .catch(() => {});
    throw error;
  }
}
// Validate persisted references against server-owned metadata, never trust client URLs or scope.
export async function validateMediaReferences(data, definition) {
  const privateFields = {
    vehicles: ["vehiclePhoto", "rcBook", "insurance", "puc"],
    drivers: ["driverPhoto", "drivingLicence", "aadhaarCard", "panCard"],
    fuel: ["fuelSlipPhoto"],
    issues: ["issuePhoto", "issueDocument"],
  };
  for (const field of privateFields[definition.key] || []) {
    const value = data[field];
    if (!value) continue;
    if (!value.mediaId)
      throw unprocessable(field + " must be uploaded to secure storage first");
    const row = await Media.findOne({
      mediaId: value.mediaId,
      scope: definition.permission,
      deliveryType: "authenticated",
    });
    if (!row) throw unprocessable("Invalid private media reference: " + field);
    data[field] = mediaDTO(row);
  }
}

export function validatePublicMetadata(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const alt = typeof body.alt === "string" ? body.alt.trim() : "";
  if (!name || name.length > 200)
    throw unprocessable("Image name is required (maximum 200 characters)");
  if (!alt || alt.length > 300)
    throw unprocessable("Alt text is required (maximum 300 characters)");
  return { name, alt };
}
