# Plugging into Cloudflare R2

Image uploads (notes) are stored in a Cloudflare R2 bucket. R2 is S3-compatible,
so the app uses `@aws-sdk/client-s3` pointed at R2's endpoint (`src/lib/r2.ts`).

## How it works

- `POST /api/uploads` -> `uploadObject()` puts the file at `notes/<userId>/<uuid>-<name>`.
- `GET /api/media/<key>` streams the object back, only for the owning user.
- The bucket stays **private**; no public access or CORS is needed because all reads go through the app.

## Setup

1. **Create a bucket** - Cloudflare dashboard -> R2 Object Storage -> Create bucket (`scholar`).
2. **Create an API token** - R2 -> Manage R2 API Tokens -> Create API token.
   Permission: *Object Read & Write*, scoped to your bucket.
   Copy the **Access Key ID** and **Secret Access Key** (shown once).
3. **Find your Account ID** - shown on the R2 overview page. The S3 endpoint is
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. **Set env vars** in `.env.local` (and your hosting provider):

   ```bash
   R2_ACCOUNT_ID=<account id>
   R2_ACCESS_KEY_ID=<access key id>
   R2_SECRET_ACCESS_KEY=<secret access key>
   R2_BUCKET=scholar
   # optional: full endpoint override (e.g. EU jurisdiction buckets use
   # https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com)
   R2_ENDPOINT=
   ```

5. Restart the dev server and upload an image in a note.

## Notes

- Region is always `auto`.
- Never commit the access key / secret. Only the account ID and bucket name are non-secret.
- Migrating from Tigris: copy existing objects with `rclone` (or `aws s3 sync`) from
  the old bucket to R2 keeping the same keys; the app's stored URLs are `/api/media/<key>`, so no DB changes are needed.
- Troubleshooting: `R2_... is not configured` means a var is missing; `SignatureDoesNotMatch`
  usually means a wrong secret or a token scoped to a different bucket.
