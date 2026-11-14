# Cloudflare R2 (S3-compatible) quickstart

R2 is Cloudflare's object storage. It speaks the S3 API, so any S3 SDK works by
pointing it at your R2 endpoint. No egress fees.

## 1. Create a bucket

Cloudflare dashboard -> **R2 Object Storage** -> **Create bucket**. Pick a name
(e.g. `my-bucket`). Buckets are private by default.

## 2. Create API credentials

R2 overview -> **API Tokens** -> **Manage** -> **Create Account API token**.

- Permission: **Object Read & Write**
- Scope: **Apply to specific buckets only** -> choose your bucket
- After creating, copy the **Access Key ID** and **Secret Access Key**
  (the secret is shown once). The "Token value" is for the Cloudflare API and is
  not needed for S3 access.

## 3. Collect connection details

| Value             | Where to find it                                   |
| ----------------- | -------------------------------------------------- |
| Account ID        | R2 overview page (right side)                      |
| Endpoint          | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`    |
| Region            | always `auto`                                      |
| Access Key ID     | from the token screen                              |
| Secret Access Key | from the token screen                              |
| Bucket            | the name you chose                                 |

Jurisdiction-specific buckets use `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`
(EU) or `.fedramp.` instead.

Keep credentials in environment variables and never commit them:

```bash
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
```

## 4. Upload a file - TypeScript / Node

```bash
npm i @aws-sdk/client-s3
```

```ts
import { readFile } from "node:fs/promises";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// Upload
await r2.send(
  new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: "uploads/photo.png",
    Body: await readFile("./photo.png"),
    ContentType: "image/png",
  }),
);

// Download
const res = await r2.send(
  new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: "uploads/photo.png" }),
);
const bytes = await res.Body!.transformToByteArray();
```

Temporary signed URL (browser can upload/download directly):

```bash
npm i @aws-sdk/s3-request-presigner
```

```ts
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const url = await getSignedUrl(
  r2,
  new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: "uploads/photo.png" }),
  { expiresIn: 600 }, // seconds
);
// Browser: fetch(url, { method: "PUT", body: file })
```

Direct browser uploads/downloads need a CORS rule on the bucket
(bucket -> Settings -> CORS policy) allowing your origin and the `PUT`/`GET` methods.

## 5. Upload a file - Python

```bash
pip install boto3
```

```python
import os
import boto3

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name="auto",
)
bucket = os.environ["R2_BUCKET"]

# Upload (handles large files with multipart automatically)
r2.upload_file(
    "photo.png", bucket, "uploads/photo.png",
    ExtraArgs={"ContentType": "image/png"},
)

# Download
r2.download_file(bucket, "uploads/photo.png", "photo-copy.png")

# List
for obj in r2.list_objects_v2(Bucket=bucket, Prefix="uploads/").get("Contents", []):
    print(obj["Key"], obj["Size"])

# Presigned URL (valid 10 minutes)
url = r2.generate_presigned_url(
    "get_object", Params={"Bucket": bucket, "Key": "uploads/photo.png"}, ExpiresIn=600
)
```

## 6. Serving files

- **Through your backend**: read with `GetObject` and stream it (lets you enforce auth).
- **Presigned URLs**: short-lived links, works with private buckets.
- **Public access**: bucket -> Settings -> enable the `r2.dev` URL (dev only) or
  connect a custom domain for production.

## Troubleshooting

| Error                                | Likely cause                                           |
| ------------------------------------ | ------------------------------------------------------ |
| `SignatureDoesNotMatch`              | wrong secret, or whitespace in the env var             |
| `AccessDenied`                       | token not scoped to this bucket or lacks write         |
| `NoSuchBucket`                       | wrong bucket name or wrong jurisdiction endpoint       |
| CORS error in browser                | add a CORS policy to the bucket                        |
| Connection / DNS error               | wrong account ID in the endpoint                       |

## Migrating from another S3 provider

```bash
rclone copy old-remote:old-bucket r2:my-bucket --progress
```

Configure both remotes with `rclone config` (R2 uses provider `Cloudflare`).
