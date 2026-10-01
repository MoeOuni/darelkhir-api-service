# Product Image Upload Feature

## Overview

Each product supports a single hero image stored in two formats:
- **JPEG** (`images/{uuid}.jpg`) — for the mobile app
- **WebP** (`images/{uuid}.webp`) — for the web client (smaller, faster)

Cropping is enforced on the frontend (1:1 aspect ratio) before upload, so the backend always receives a square JPEG.

---

## Flow

```
Dashboard
    │
    ├─ 1. User picks a file (any format)
    │
    ├─ 2. Crop modal opens (react-easy-crop, forced 1:1, no escape)
    │       └─ canvas.toBlob('image/jpeg', 0.9) → cropped square JPEG blob
    │
    ├─ 3. POST /products/:id/image/upload-url
    │       └─ Returns { uploadUrl, key, expiresIn: 300 }
    │            uploadUrl is an S3 presigned PUT URL with content-length-range enforced
    │
    ├─ 4. PUT <uploadUrl>  (direct browser → S3, bypasses Lambda/API Gateway limits)
    │
    └─ S3 ObjectCreated on uploads/*
            └─ 5. ImageProcessingLambda triggers
                    ├─ Download raw from S3
                    ├─ sharp(buffer).resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
                    │       ├─ .jpeg({ quality: 85, progressive: true }) → images/{uuid}.jpg
                    │       └─ .webp({ quality: 80 })                   → images/{uuid}.webp
                    ├─ Upload both to S3
                    ├─ Delete original from uploads/
                    └─ UpdateItem on ProductsTable: imageUrl + imageUrlWebp
```

---

## New API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/products/:id/image/upload-url` | Admin | Returns presigned S3 upload URL |
| `DELETE` | `/products/:id/image` | Admin | Deletes both S3 objects and clears fields on the product |

### POST /products/:id/image/upload-url

**Response:**
```json
{
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/...",
    "key": "uploads/{productId}/{uuid}-raw",
    "expiresIn": 300
  }
}
```

The presigned URL is generated with `content-length-range: [1, 15728640]` (max 15 MB) — S3 rejects uploads outside this range without involving any Lambda.

---

## S3 Bucket Layout

```
bucket/
  uploads/              ← temporary raw files (S3 lifecycle: auto-delete after 1h)
    {productId}/
      {uuid}-raw
  images/               ← final processed files (public or CloudFront-served)
    {uuid}.jpg
    {uuid}.webp
```

---

## Image Processing Rules

| Condition | Action |
|-----------|--------|
| Width or height > 1080px | Resize down (preserve 1:1, never upscale) |
| Already ≤ 1080px | Keep original dimensions |
| JPEG input (from browser crop) | Recompress at quality 85, progressive |
| Any input | Also produce WebP at quality 80 |

**Sharp pipeline (single pass):**
```ts
const resized = await sharp(buffer)
  .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
  .toBuffer()

await Promise.all([
  sharp(resized).jpeg({ quality: 85, progressive: true }).toBuffer()
    .then(buf => s3.putObject({ Key: `images/${uuid}.jpg`, Body: buf, ContentType: 'image/jpeg' })),
  sharp(resized).webp({ quality: 80 }).toBuffer()
    .then(buf => s3.putObject({ Key: `images/${uuid}.webp`, Body: buf, ContentType: 'image/webp' })),
])
```

---

## Schema Changes

**`IProduct` interface** — add one field:
```ts
imageUrlWebp?: string   // WebP version for web client
// imageUrl (already exists) → becomes the JPEG URL
```

No DynamoDB table structure changes needed — just new optional string attributes on the product item.

---

## New Lambda: `ProcessProductImage`

| Property | Value |
|----------|-------|
| Trigger | S3 `ObjectCreated` on `uploads/*` |
| Runtime | Node 18 |
| Memory | 512 MB |
| Timeout | 30s |
| Package | `@img/sharp-linux-x64` bundled (esbuild-compatible, no Lambda Layer needed) |

**IAM permissions needed:**
- S3: `GetObject`, `PutObject`, `DeleteObject` on the storage bucket
- DynamoDB: `UpdateItem` on ProductsTable

---

## Frontend (shop-dashboard)

**Library:** `react-easy-crop` (smoother UX than react-image-crop, supports pinch-zoom for tablet admins)

**Crop UI:** Modal inside the product edit dialog.

**Upload sequence:**
1. File input triggers crop modal
2. User crops → confirm
3. `canvas.toBlob('image/jpeg', 0.9)` → blob
4. Call `POST /products/:id/image/upload-url`
5. `fetch(uploadUrl, { method: 'PUT', body: blob })`
6. Poll product endpoint every 2s (up to 30s) until `imageUrl` is populated
7. Show thumbnail once available

---

## Open Questions

- [ ] CloudFront in front of S3? WebP negotiation via `Vary: Accept` header is much cleaner with CloudFront. Decide before production.
- [ ] Multiple images per product in the future? Current schema is single hero image (`imageUrl` + `imageUrlWebp`). If multi-image is needed later, schema becomes an array.
- [ ] Polling vs WebSocket for processing status? Polling every 2s is simplest for now.
