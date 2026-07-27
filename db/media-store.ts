import { mediaCanPublish } from "../app/lib/catalog-operations";
import { getD1 } from "./index";

export type ApprovedMediaInput = {
  dishCardId: string;
  bytes: ArrayBuffer | Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "video/mp4";
  altText: string;
  rightsHolder: string;
  licenseBasis: string;
  attributionText?: string;
  attributionUrl?: string;
  expiresAt?: number;
};

function extension(contentType: ApprovedMediaInput["contentType"]): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    default:
      return "jpg";
  }
}

async function getMediaBucket() {
  const { env } = await import("cloudflare:workers");
  if (!env.MEDIA) throw new Error("Cloudflare R2 binding `MEDIA` is unavailable.");
  return env.MEDIA;
}

export async function storeApprovedMediaAsset(input: ApprovedMediaInput) {
  const policy = {
    rightsHolder: input.rightsHolder,
    licenseBasis: input.licenseBasis,
    reviewStatus: "approved" as const,
    expiresAt: input.expiresAt,
  };
  if (!mediaCanPublish(policy)) {
    throw new Error("Media rights are incomplete or expired.");
  }

  const id = crypto.randomUUID();
  const storageKey = `catalog/${id}.${extension(input.contentType)}`;
  const bucket = await getMediaBucket();
  const db = await getD1();

  await bucket.put(storageKey, input.bytes, {
    httpMetadata: { contentType: input.contentType },
    customMetadata: {
      rightsHolder: input.rightsHolder.slice(0, 200),
      licenseBasis: input.licenseBasis.slice(0, 200),
    },
  });

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO media_assets (
            id,
            storage_key,
            media_type,
            alt_text,
            rights_holder,
            license_basis,
            attribution_text,
            attribution_url,
            expires_at,
            review_status,
            created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'approved', ?10)`,
        )
        .bind(
          id,
          storageKey,
          input.contentType.startsWith("video/") ? "video" : "image",
          input.altText.trim().slice(0, 300),
          input.rightsHolder.trim().slice(0, 200),
          input.licenseBasis.trim().slice(0, 200),
          input.attributionText?.trim().slice(0, 300) ?? null,
          input.attributionUrl?.trim().slice(0, 500) ?? null,
          input.expiresAt ?? null,
          Date.now(),
        ),
      db
        .prepare(
          `UPDATE dish_cards
           SET media_asset_id = ?1, updated_at = ?2
           WHERE id = ?3 AND is_published = 1`,
        )
        .bind(id, Date.now(), input.dishCardId),
    ]);
  } catch (error) {
    await bucket.delete(storageKey);
    throw error;
  }

  return { id, storageKey };
}

export async function getPublishedMedia(dishCardId: string) {
  const db = await getD1();
  const row = await db
    .prepare(
      `SELECT
        m.storage_key,
        m.media_type,
        m.alt_text,
        m.attribution_text,
        m.attribution_url,
        m.expires_at
       FROM dish_cards d
       INNER JOIN media_assets m ON m.id = d.media_asset_id
       WHERE d.id = ?1
         AND d.is_published = 1
         AND m.review_status = 'approved'
         AND (m.expires_at IS NULL OR m.expires_at > ?2)`,
    )
    .bind(dishCardId, Date.now())
    .first<{
      storage_key: string;
      media_type: string;
      alt_text: string;
      attribution_text: string | null;
      attribution_url: string | null;
      expires_at: number | null;
    }>();
  if (!row) return null;

  const bucket = await getMediaBucket();
  const object = await bucket.get(row.storage_key);
  if (!object) return null;

  return {
    object,
    mediaType: row.media_type,
    altText: row.alt_text,
    attributionText: row.attribution_text,
    attributionUrl: row.attribution_url,
    expiresAt: row.expires_at,
  };
}

