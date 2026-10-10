# Gallery and protected documents

Admin uses the operating system font stack. Gallery is available at /gallery for public blog images only. The upload area supports drag and drop, file browsing, multiple uploads and progress. Listing requests use server-side page/limit pagination (24 images per page), total count, stable ordering, previous/next and page navigation. Picker selections are preserved across pages.

## Configuration
Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in the backend .env (see .env.example), then restart the backend. Never place the secret in frontend VITE_ variables. Use a Cloudinary environment with unsigned upload presets disabled or tightly restricted. The app always uploads through the authenticated backend.

Grant /gallery view permission to users who should browse and insert website images. Grant create or edit for uploads. Existing users need this new permission assigned through Permissions. Vehicle/driver/fuel/issue files require the corresponding module permission. There is no public endpoint for private documents.

## Use
Upload images in Gallery. The editor image icon opens the gallery dialog; select one or multiple images and insert them at the saved cursor. Featured and social images use the same picker in single-select mode. Upload vehicle and driver attachments through their existing form fields; they are automatically stored as authenticated Cloudinary assets. Gallery is exclusively for public blog images. Private documents use their existing vehicle/driver upload fields and are not listed in Gallery.

Website images are intentionally public and can be embedded in CMS HTML. All CRM attachments are authenticated assets, including RC, insurance, PUC, licences, Aadhaar and PAN. Records store opaque media references, not base64 or signed URLs. The backend validates references against stored metadata and scope. An authorized View private file action generates a signed download URL valid for 120 seconds, with no-store response headers. URLs are bearer links usable by someone who receives one during that short window; they are not bound to an individual browser. Refresh access to obtain a new URL. Cloudinary authenticated assets protect original and derived files; plain signed CDN URLs alone do not implement expiry. This implementation uses private_download_url with expires_at.

Images: JPEG, PNG, WEBP, GIF. Private attachments also accept PDF. Maximum 2 MB per file, enforced server-side with MIME and signature checks. Cloudinary and database errors never disclose the API secret.

## Existing documents
Run npm run media:migrate for a dry run. With credentials configured, run npm run media:migrate -- --apply to migrate existing base64 CRM attachments. The script saves each successful attachment independently and can be resumed. Old external URLs must be re-uploaded manually; the script never fetches arbitrary URLs. New saves reject inline or external CRM attachments. Complete migration before editing older records containing legacy attachments. Copies previously published to public storage must be removed from that original storage separately. Migration has not been executed automatically.

## Validation
npm test in both admin and backend; npm run build in admin. Media tests cover permission separation, private metadata, MIME validation, signed expiry, authenticated upload type, unauthorized list/download/upload, and rejection of public or cross-scope document references. Integration tests mock Cloudinary upload and use an isolated MongoDB database. A real upload/download/expiry check requires configured Cloudinary credentials.

## Image names, alt text and search
Selecting or dropping files adds a details queue. Each public image requires a name (up to 200 characters) and descriptive alt text (up to 300 characters) before upload; the backend enforces both. Gallery and picker share a debounced server search over name and alt text, with pagination applied to matching records. Users with Gallery edit permission can edit name/alt in the image card. The editor uses the stored alt text when inserting images. Older images with missing alt can be updated through Edit name / alt.
