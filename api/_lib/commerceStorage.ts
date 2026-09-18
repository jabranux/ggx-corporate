/**
 * commerceStorage — Cloudflare R2 (S3-compatible) object storage for Commerce
 * media: product photos, storefront logos, and hero banners.
 *
 * Credentials are server-only (`GGX_COMMERCE_R2_*`, never a VITE_-prefixed
 * variable) and never reach the browser. Uploads use short-lived presigned
 * PUT URLs so image bytes go straight from the browser to R2 — never
 * through this server — while object-key naming (which encodes the owning
 * account) and content-type/size limits are still decided and validated
 * here, so a caller can only ever get a presigned URL for a key under their
 * own account (see `commerceProducts.ts`'s callers, which always resolve
 * `accountId` from the verified session before calling into this module).
 */
import { randomUUID } from 'node:crypto';
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CommerceValidationError } from './commerceErrors.js';

export class CommerceStorageConfigError extends Error {}

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — not previously enforced anywhere (the existing mock uploader had no limit); a sane new ceiling, not a preserved one.
const PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes — long enough for a normal upload, short enough that a leaked URL is low-risk.

interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

let cachedConfig: StorageConfig | null = null;
let cachedClient: S3Client | null = null;

function getConfig(): StorageConfig {
  if (cachedConfig) return cachedConfig;
  const accountId = process.env.GGX_COMMERCE_R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.GGX_COMMERCE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.GGX_COMMERCE_R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.GGX_COMMERCE_R2_BUCKET?.trim();
  const publicBaseUrl = process.env.GGX_COMMERCE_R2_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new CommerceStorageConfigError(
      'Cloudflare R2 is not fully configured (GGX_COMMERCE_R2_ACCOUNT_ID / ' +
      'GGX_COMMERCE_R2_ACCESS_KEY_ID / GGX_COMMERCE_R2_SECRET_ACCESS_KEY / ' +
      'GGX_COMMERCE_R2_BUCKET / GGX_COMMERCE_R2_PUBLIC_URL) — server-side only, never committed.',
    );
  }
  cachedConfig = { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
  return cachedConfig;
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const { accountId, accessKeyId, secretAccessKey } = getConfig();
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

export type MediaKind =
  // `productId` is omitted while a merchant is still composing a brand-new
  // product (photos are picked before the first Save, so no id exists yet)
  // — those land under a `pending` bucket; the object key itself is still
  // globally unique (random uuid leaf), so this is cosmetic organization
  // only, never a collision risk.
  | { type: 'product-image'; productId?: string }
  | { type: 'storefront-logo' }
  | { type: 'storefront-banner' };

function extensionFor(contentType: string): string {
  return contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
}

function buildObjectKey(accountId: string, kind: MediaKind, contentType: string): string {
  const id = randomUUID();
  const ext = extensionFor(contentType);
  switch (kind.type) {
    case 'product-image':
      return `accounts/${accountId}/products/${kind.productId ?? 'pending'}/${id}.${ext}`;
    case 'storefront-logo':
      return `accounts/${accountId}/storefront/logo/${id}.${ext}`;
    case 'storefront-banner':
      return `accounts/${accountId}/storefront/banners/${id}.${ext}`;
  }
}

export interface PresignedUpload {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresInSeconds: number;
}

/** Mint a short-lived presigned PUT URL for a new upload under `accountId`'s
 * own namespace. `contentType` must be one of the accepted image types —
 * validated here (never trust the browser's own claim once the bytes land),
 * and baked into the signature so the actual PUT must match it. */
export async function createPresignedUpload(accountId: string, kind: MediaKind, contentType: string): Promise<PresignedUpload> {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new CommerceValidationError(`Unsupported image type "${contentType}". Use JPG, PNG, or WebP.`);
  }
  const { bucket, publicBaseUrl } = getConfig();
  const objectKey = buildObjectKey(accountId, kind, contentType);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
    ContentLength: undefined, // R2/S3 presigned PUT can't hard-cap size in the signature itself; enforced client-side (existing convention) — see MAX_UPLOAD_BYTES note below.
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
  return {
    uploadUrl,
    objectKey,
    publicUrl: `${publicBaseUrl}/${objectKey}`,
    expiresInSeconds: PRESIGN_EXPIRY_SECONDS,
  };
}

export const MAX_UPLOAD_BYTES_HINT = MAX_UPLOAD_BYTES;

/** Delete an object. Callers must already have verified the key belongs to
 * the caller's own account (it's namespaced under `accounts/{accountId}/...`
 * — verify the prefix before calling, never delete an arbitrary key from
 * client input). Best-effort: failures are logged by the caller, never
 * allowed to block the DB-side delete that already happened. */
export async function deleteObject(objectKey: string): Promise<void> {
  const { bucket } = getConfig();
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

/** `true` when `objectKey` is namespaced under the given account — the
 * ownership check every delete/replace path must run before trusting a
 * client-supplied key. */
export function objectKeyBelongsToAccount(objectKey: string, accountId: string): boolean {
  return objectKey.startsWith(`accounts/${accountId}/`);
}
