import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMediaAccess,
  validateUpload,
  signedMediaUrl,
} from "../src/services/cloudinaryService.js";
import { mediaDTO } from "../src/models/Media.js";
import { validateImageValue } from "../src/services/mediaValidationService.js";
import { cleanPayload } from "../src/utils/validation.js";

test("images accept exactly 5 MB while PDFs retain a 2 MB limit", () => {
  const image = Buffer.alloc(5 * 1024 * 1024);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  const dataUrl = "data:image/png;base64," + image.toString("base64");
  assert.equal(validateUpload({ dataUrl, scope: "/gallery" }).size, image.length);
  assert.equal(validateUpload({ dataUrl, scope: "/drivers" }).size, image.length);
  assert.equal(validateImageValue(cleanPayload({ photo: dataUrl }).photo), dataUrl);
  const tooLarge = "data:image/png;base64," + Buffer.concat([image, Buffer.alloc(1)]).toString("base64");
  assert.throws(() => validateUpload({ dataUrl: tooLarge, scope: "/gallery" }), { status: 422 });
  assert.throws(() => validateImageValue(tooLarge), { status: 422 });
  const pdf = Buffer.alloc(2 * 1024 * 1024 + 1);
  pdf.write("%PDF-1.4");
  assert.throws(() => validateUpload({ dataUrl: "data:application/pdf;base64," + pdf.toString("base64"), scope: "/vehicles" }), { status: 422 });
});
test("media authorization separates public gallery and private scopes", () => {
  const user = {
    role: "Admin",
    permissions: { "/gallery": ["view", "create"], "/vehicles": ["view"] },
  };
  assertMediaAccess(user, "/gallery", "upload");
  assertMediaAccess(user, "/vehicles");
  assert.throws(() => assertMediaAccess(user, "/vehicles", "upload"), {
    status: 403,
  });
  assert.throws(() => assertMediaAccess(user, "/drivers"), { status: 403 });
  assert.throws(() => assertMediaAccess(null, "/gallery"), { status: 403 });
  assert.throws(() => assertMediaAccess({ role: "Super Admin" }, "/bogus"), {
    status: 422,
  });
});
test("private metadata never exposes cloudinary URL or public id", () => {
  const dto = mediaDTO({
    mediaId: "id",
    deliveryType: "authenticated",
    url: "secret",
    publicId: "secret-id",
  });
  assert.equal(dto.url, undefined);
  assert.equal(dto.publicId, undefined);
  assert.equal(dto.private, true);
});
test("uploads reject executable types, false MIME and oversized files", () => {
  for (const dataUrl of [
    "data:image/svg+xml;base64,PHN2Zz4=",
    "https://example.com/a.jpg",
    "data:image/png;base64,aGVsbG8=",
  ]) {
    assert.throws(() => validateUpload({ dataUrl, scope: "/gallery" }), {
      status: 422,
    });
  }
  const pdf =
    "data:application/pdf;base64," +
    Buffer.from("%PDF-1.4 test").toString("base64");
  assert.throws(() => validateUpload({ dataUrl: pdf, scope: "/gallery" }), {
    status: 422,
  });
  assert.equal(
    validateUpload({ dataUrl: pdf, scope: "/vehicles" }).mime,
    "application/pdf",
  );
  assert.throws(
    () =>
      validateUpload({
        dataUrl:
          "data:image/png;base64," +
          Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"),
      }),
    { status: 422 },
  );
});
test("authenticated downloads have a signature and short expiry", () => {
  const names = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const saved = names.map((name) => process.env[name]);
  names.forEach((name, i) => {
    process.env[name] = ["test-cloud", "test-key", "test-secret"][i];
  });
  try {
    const result = signedMediaUrl(
      { publicId: "skg/drivers/test", format: "png", resourceType: "image" },
      1700000000000,
    );
    const url = new URL(result.url);
    assert.equal(result.expiresAt, 1700000120);
    assert.equal(url.searchParams.get("type"), "authenticated");
    assert.equal(url.searchParams.get("expires_at"), "1700000120");
    assert.ok(url.searchParams.get("signature"));
    assert.equal(url.searchParams.get("api_secret"), null);
  } finally {
    names.forEach((name, i) => {
      if (saved[i] === undefined) delete process.env[name];
      else process.env[name] = saved[i];
    });
  }
});
