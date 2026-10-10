import { escapeRegex } from "../utils/validation.js";
import { Router } from "express";
import {
  uploadMedia,
  validatePublicMetadata,
} from "../services/mediaService.js";
import { authenticate } from "../middleware/authenticate.js";
import { Media, mediaDTO } from "../models/Media.js";
import {
  assertMediaAccess,
  signedMediaUrl,
  cloudinaryClient,
} from "../services/cloudinaryService.js";
import { sendData } from "../utils/response.js";
import { notFound, HttpError } from "../utils/errors.js";
export const mediaRoutes = Router();
mediaRoutes.use(authenticate);
mediaRoutes.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
mediaRoutes.get("/", async (req, res) => {
  const scope = String(req.query.scope || "/gallery");
  assertMediaAccess(req.auth.user, scope);
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(60, Math.max(1, requestedLimit || 24));
  const page = Math.min(
    1000000,
    Math.max(1, Number.parseInt(req.query.page, 10) || 1),
  );
  const filter =
    scope === "/gallery"
      ? { scope, deliveryType: "upload", resourceType: "image" }
      : { scope };
  const search = String(req.query.search || "")
    .trim()
    .slice(0, 200);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: pattern }, { alt: pattern }];
  }
  const [rows, total] = await Promise.all([
    Media.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Media.countDocuments(filter),
  ]);
  const pages = Math.max(1, Math.ceil(total / limit));
  sendData(res, {
    items: rows.map(mediaDTO),
    page,
    limit,
    total,
    pages,
    hasMore: page < pages,
  });
});
mediaRoutes.post("/", async (req, res) => {
  const scope = String(req.body.scope || "/gallery");
  assertMediaAccess(req.auth.user, scope, "upload");
  sendData(res, await uploadMedia(req.body, scope, req.auth.user.id), 201);
});
mediaRoutes.get("/:id/url", async (req, res) => {
  const row = await Media.findOne({ mediaId: req.params.id });
  if (!row) throw notFound("Media not found");
  assertMediaAccess(req.auth.user, row.scope);
  sendData(
    res,
    row.deliveryType === "authenticated"
      ? signedMediaUrl(row)
      : { url: row.url },
  );
});

mediaRoutes.patch("/:id", async (req, res) => {
  assertMediaAccess(req.auth.user, "/gallery", "edit");
  const metadata = validatePublicMetadata(req.body);
  const row = await Media.findOneAndUpdate(
    { mediaId: req.params.id, scope: "/gallery", deliveryType: "upload" },
    { $set: metadata },
    { new: true },
  );
  if (!row) throw notFound("Gallery image not found");
  sendData(res, mediaDTO(row));
});

mediaRoutes.delete("/:id", async (req, res) => {
  assertMediaAccess(req.auth.user, "/gallery", "delete");
  const row = await Media.findOne({
    mediaId: req.params.id,
    scope: "/gallery",
    deliveryType: "upload",
  });
  if (!row) throw notFound("Gallery image not found");
  try {
    const result = await cloudinaryClient().uploader.destroy(row.publicId, {
      resource_type: row.resourceType,
      type: "upload",
      invalidate: true,
    });
    if (!["ok", "not found"].includes(result.result))
      throw new Error("Deletion failed");
  } catch (error) {
    if (error.code === "MEDIA_NOT_CONFIGURED") throw error;
    throw new HttpError(
      502,
      "MEDIA_DELETE_FAILED",
      "Cloudinary image deletion failed. Please retry.",
    );
  }
  await Media.deleteOne({ _id: row._id });
  sendData(res, { id: row.mediaId, deleted: true });
});
