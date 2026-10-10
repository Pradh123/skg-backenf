import {
  connectDatabase,
  disconnectDatabase,
} from "../src/database/connection.js";
import { loadConfig } from "../src/config/env.js";
import { RecordModel } from "../src/models/Record.js";
import { uploadMedia } from "../src/services/mediaService.js";
import { cloudinaryClient } from "../src/services/cloudinaryService.js";
const fields = {
  vehicles: ["vehiclePhoto", "rcBook", "insurance", "puc"],
  drivers: ["driverPhoto", "drivingLicence", "aadhaarCard", "panCard"],
  fuel: ["fuelSlipPhoto"],
  issues: ["issuePhoto", "issueDocument"],
};
const apply = process.argv.includes("--apply");
let pending = 0,
  migrated = 0,
  external = 0;
if (apply) cloudinaryClient();
await connectDatabase(loadConfig().mongodbUri);
try {
  for await (const record of RecordModel.find({
    resource: { $in: Object.keys(fields) },
  }).cursor()) {
    for (const field of fields[record.resource]) {
      const value = record.data[field];
      if (!value || value.mediaId) continue;
      const dataUrl = typeof value === "string" ? value : value.dataUrl;
      if (!dataUrl?.startsWith("data:")) {
        external++;
        console.log("Re-upload required:", record.recordId, field);
        continue;
      }
      pending++;
      if (!apply) continue;
      const media = await uploadMedia(
        { dataUrl, name: value.name || field },
        "/" + record.resource,
        "migration",
      );
      record.data[field] = media;
      record.markModified("data");
      await record.save();
      migrated++;
    }
  }
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      pending,
      migrated,
      external,
    }),
  );
} finally {
  await disconnectDatabase();
}
