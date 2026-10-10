import { v2 as cloudinary } from "cloudinary";
import { HttpError, unprocessable, forbidden } from "../utils/errors.js";
export const SCOPES = ["/gallery", "/vehicles", "/drivers", "/fuel", "/issues"];
export function assertMediaAccess(user, scope, operation = "view") {
  if (!SCOPES.includes(scope)) throw unprocessable("Invalid media scope");
  if (user?.role === "Super Admin") return;
  const operations = user?.permissions?.[scope] || [];
  const allowed =
    operation === "upload"
      ? operations.includes("create") || operations.includes("edit")
      : operations.includes(operation);
  if (!allowed) throw forbidden("You do not have access to these files");
}
export function cloudinaryClient() {
  const {
    CLOUDINARY_CLOUD_NAME: cloud_name,
    CLOUDINARY_API_KEY: api_key,
    CLOUDINARY_API_SECRET: api_secret,
  } = process.env;
  if (!cloud_name || !api_key || !api_secret)
    throw new HttpError(
      503,
      "MEDIA_NOT_CONFIGURED",
      "Cloudinary is not configured on the server",
    );
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return cloudinary;
}
export function validateUpload(body) {
  const match =
    typeof body.dataUrl === "string" &&
    body.dataUrl.match(
      /^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
  if (!match)
    throw unprocessable("Only JPEG, PNG, WEBP, GIF and PDF files are allowed");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 2 * 1024 * 1024)
    throw unprocessable("File must be no larger than 2 MB");
  const mime = match[1];
  const valid =
    mime === "image/jpeg"
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : mime === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === "image/webp"
          ? bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          : mime === "image/gif"
            ? /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))
            : bytes.toString("ascii", 0, 5) === "%PDF-";
  if (!valid) throw unprocessable("File content does not match its type");
  if (body.scope === "/gallery" && mime === "application/pdf")
    throw unprocessable("Gallery accepts images only");
  return { mime, size: bytes.length };
}
export function signedMediaUrl(media, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + 120;
  const url = cloudinaryClient().utils.private_download_url(
    media.publicId,
    media.format,
    {
      resource_type: media.resourceType,
      type: "authenticated",
      expires_at: expiresAt,
      attachment: false,
    },
  );
  return { url, expiresAt };
}
