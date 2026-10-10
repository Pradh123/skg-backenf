import test from "node:test";
import assert from "node:assert/strict";
import { v2 as cloudinary } from "cloudinary";
import { createTestServer } from "./helpers/testServer.js";
import { Media } from "../src/models/Media.js";
test("media API protects documents and accepts only server-owned references", async () => {
  const names = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const saved = names.map((name) => process.env[name]);
  names.forEach((name, i) => {
    process.env[name] = ["test", "key", "secret"][i];
  });
  const original = cloudinary.uploader.upload;
  const originalDestroy = cloudinary.uploader.destroy;
  const destroyed = [];
  cloudinary.uploader.destroy = async (id,options) => {destroyed.push({id,options});return {result:"ok"}};
  const calls = [];
  cloudinary.uploader.upload = async (_file, options) => {
    calls.push(options);
    return {
      public_id: options.public_id,
      format: "png",
      secure_url: "https://res.cloudinary.com/test/image/upload/public.png",
    };
  };
  const api = await createTestServer();
  try {
    const { token } = await api.login();
    assert.equal((await api.request("/api/v1/media")).status, 401);
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6XcAAAAASUVORK5CYII=";
    const gallery = await api.request("/api/v1/media", {
      token,
      body: {
        scope: "/gallery",
        name: "Public.png",
        alt: "Taxi beside a hotel",
        dataUrl,
      },
    });
    assert.equal(gallery.status, 201);
    assert.equal(gallery.body.data.private, false);
    const doc = await api.request("/api/v1/media", {
      token,
      body: { scope: "/vehicles", name: "RC.png", dataUrl, unsigned: true, type: "upload", upload_preset: "unsigned", public_id: "client-id" },
    });
    assert.equal(doc.status, 201);
    assert.equal(doc.body.data.private, true);
    assert.equal(doc.body.data.url, undefined);
    assert.equal(calls[0].type, "upload");
    assert.equal(calls[1].type, "authenticated");
    assert.equal(calls[1].unsigned, false);
    assert.equal(calls[1].overwrite, false);
    assert.equal(calls[1].upload_preset, undefined);
    assert.notEqual(calls[1].public_id, "client-id");
    const list = await api.request("/api/v1/media?scope=/gallery", { token });
    assert.equal(list.body.data.items.length, 1);
    await Media.create(
      Array.from({ length: 26 }, (_, i) => ({
        publicId: "pagination/" + i,
        name: "Page image " + i,
        mime: "image/png",
        size: 100,
        format: "png",
        resourceType: "image",
        deliveryType: "upload",
        scope: "/gallery",
        url: "https://res.cloudinary.com/test/image/upload/" + i + ".png",
      })),
    );
    const firstPage = await api.request(
      "/api/v1/media?scope=/gallery&page=1&limit=24",
      { token },
    );
    const searchResult = await api.request("/api/v1/media?search=taxi", {
      token,
    });
    assert.equal(searchResult.body.data.total, 1);
    assert.equal(searchResult.body.data.items[0].alt, "Taxi beside a hotel");
    const noMatch = await api.request("/api/v1/media?search=%5Bmissing%5D", {
      token,
    });
    assert.equal(noMatch.body.data.total, 0);
    const missingAlt = await api.request("/api/v1/media", {
      token,
      body: { scope: "/gallery", name: "Missing", dataUrl },
    });
    assert.equal(missingAlt.status, 422);
    const edit = await api.request("/api/v1/media/" + gallery.body.data.id, {
      token,
      method: "PATCH",
      body: { name: "Taxi photo", alt: "Updated taxi description" },
    });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.data.alt, "Updated taxi description");
    const emptyAlt = await api.request(
      "/api/v1/media/" + gallery.body.data.id,
      { token, method: "PATCH", body: { name: "Taxi", alt: "  " } },
    );
    assert.equal(emptyAlt.status, 422);
    const secondPage = await api.request(
      "/api/v1/media?scope=/gallery&page=2&limit=24",
      { token },
    );
    assert.equal(firstPage.body.data.items.length, 24);
    assert.equal(firstPage.body.data.total, 27);
    assert.equal(firstPage.body.data.pages, 2);
    assert.equal(secondPage.body.data.items.length, 3);
    assert.equal(secondPage.body.data.hasMore, false);
    assert.ok(
      secondPage.body.data.items.every(
        (item) =>
          !firstPage.body.data.items.some((first) => first.id === item.id),
      ),
    );
    assert.ok(firstPage.body.data.items.every((item) => !item.private));
    const emptyPage = await api.request(
      "/api/v1/media?scope=/gallery&page=3&limit=24",
      { token },
    );
    assert.deepEqual(emptyPage.body.data.items, []);
    const limited = await api.request("/api/v1/media?limit=999", { token });
    assert.equal(limited.body.data.limit, 60);
    const download = await api.request(
      "/api/v1/media/" + doc.body.data.id + "/url",
      { token },
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("cache-control"), "no-store");
    assert.ok(new URL(download.body.data.url).searchParams.get("signature"));
    assert.equal(
      (await api.request("/api/v1/media/" + doc.body.data.id + "/url")).status,
      401,
    );
    const user = await api.request("/api/v1/users", {
      token,
      body: {
        firstName: "Gallery",
        lastName: "Viewer",
        email: "gallery@test.example",
        password: "GalleryTest123!",
        role: "Admin",
        permissions: { "/gallery": ["view"] },
      },
    });
    assert.equal(user.status, 201);
    const login = await api.login("gallery@test.example", "GalleryTest123!");
    assert.equal(
      (
        await api.request("/api/v1/media?scope=/vehicles", {
          token: login.token,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api.request("/api/v1/media/" + doc.body.data.id + "/url", {
          token: login.token,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api.request("/api/v1/media", {
          token: login.token,
          body: { dataUrl },
        })
      ).status,
      403,
    );
    const vehicle = {
      registrationNumber: "TEST-MEDIA-1",
      vehicleMake: "Toyota",
      vehicleModel: "Innova",
      vehicleType: "MPV/MUV",
    };
    const attach = await api.request("/api/v1/vehicles", {
      token,
      body: {
        ...vehicle,
        rcBook: {
          mediaId: doc.body.data.id,
          url: "https://attacker.example/public",
        },
      },
    });
    assert.equal(attach.status, 201);
    assert.equal(attach.body.data.rcBook.url, undefined);
    assert.equal(
      (
        await api.request("/api/v1/vehicles", {
          token,
          body: {
            ...vehicle,
            registrationNumber: "TEST-MEDIA-2",
            rcBook: { mediaId: gallery.body.data.id },
          },
        })
      ).status,
      422,
    );
    const denyDelete = await api.request('/api/v1/media/'+gallery.body.data.id, {token:login.token,method:'DELETE'});
    assert.equal(denyDelete.status,403);
    const privateDelete = await api.request('/api/v1/media/'+doc.body.data.id, {token,method:'DELETE'});
    assert.equal(privateDelete.status,404);
    const removed = await api.request('/api/v1/media/'+gallery.body.data.id, {token,method:'DELETE'});
    assert.equal(removed.status,200);
    assert.equal(await Media.findOne({mediaId:gallery.body.data.id}),null);
    assert.equal(destroyed.length,1);
    assert.equal(destroyed[0].options.invalidate,true);
    assert.equal((await api.request('/api/v1/media/'+gallery.body.data.id+'/url',{token})).status,404);
    const row = await Media.findOne({ mediaId: doc.body.data.id });
    assert.equal(row.url, undefined);
  } finally {
    cloudinary.uploader.upload = original;
    cloudinary.uploader.destroy = originalDestroy;
    await api.close();
    names.forEach((name, i) => {
      if (saved[i] === undefined) delete process.env[name];
      else process.env[name] = saved[i];
    });
  }
});
