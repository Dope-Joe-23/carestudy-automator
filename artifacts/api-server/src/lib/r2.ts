import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

// Cloudflare R2 is an S3-compatible object store with zero egress fees. When
// configured, uploaded documents (study files + library ebooks/articles) are
// stored durably in a bucket instead of on the server's local disk, and the
// browser uploads directly to the bucket via presigned URLs — so a file's
// size is no longer capped by the API server's request-body limit.
//
// Everything in this module is a no-op/disabled until the four env vars are
// set, in which case the app transparently keeps using local-disk storage.
//
// Bucket CORS: the presigned PUTs come from the browser, so the bucket must
// allow cross-origin uploads. In the R2 dashboard, add a CORS policy that
// allows PUT + HEAD from your app's origin with the Content-Type header:
//
//   [
//     {
//       "AllowedOrigins": ["*"],
//       "AllowedMethods": ["PUT", "HEAD"],
//       "AllowedHeaders": ["Content-Type"],
//       "MaxAgeSeconds": 3600
//     }
//   ]

/** Prefix marking a storedPath as an R2 object reference ("r2://<key>"). */
export const R2_KEY_PREFIX = "r2://";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "";
const SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "";
const BUCKET = process.env.R2_BUCKET_NAME ?? "";

export function isR2Configured(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
      // The browser performs the PUT with a plain fetch() — no SDK — so the
      // presigned URL must not carry SDK-added checksum requirements (the SDK
      // otherwise appends x-amz-checksum-crc32 query params computed over an
      // empty body, which would make the upload fail).
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }
  return client;
}

/** A presigned PUT URL the browser can upload directly to (15-minute expiry). */
export async function createPresignedPutUrl(
  key: string,
  contentType: string,
): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 15 * 60 },
  );
}

/** True when the object exists, plus its size (null when unknown). */
export async function headObject(
  key: string,
): Promise<{ exists: boolean; size: number | null }> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { exists: true, size: head.ContentLength ?? null };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (status === 404 || (err as { name?: string }).name === "NotFound") {
      return { exists: false, size: null };
    }
    throw err;
  }
}

/** Download an object's bytes to a local file (used to hand files to the
 *  Python extraction engine, which reads from disk). */
export async function downloadObjectToFile(key: string, destPath: string): Promise<void> {
  const response = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!response.Body) throw new Error("R2 returned an empty body");
  const source =
    response.Body as unknown as Parameters<typeof pipeline>[0] & NodeJS.ReadableStream;
  await pipeline(source, createWriteStream(destPath));
}

/** Delete an object. Throws on real errors (callers treat cleanup best-effort). */
export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
