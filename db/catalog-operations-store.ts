import { fetchOpenStreetMapCandidates } from "../app/lib/providers/openstreetmap";
import { getD1 } from "./index";
import { queueCatalogImport } from "./catalog-intake-store";

export async function discoverOpenStreetMapArea(input: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  endpoint?: string;
}) {
  const candidates = await fetchOpenStreetMapCandidates(input);
  const queued = [];
  for (const candidate of candidates.slice(0, 250)) {
    queued.push(await queueCatalogImport(candidate));
  }
  return { discovered: candidates.length, queued: queued.length };
}

export async function listPendingCatalogReviews(limit = 100) {
  const db = await getD1();
  const result = await db
    .prepare(
      `SELECT
        id,
        provider,
        provider_place_id,
        normalized_name,
        raw_payload,
        ownership_signals,
        suggested_ownership_type,
        suggested_discovery_status,
        imported_at
       FROM catalog_imports
       WHERE status = 'pending'
       ORDER BY imported_at ASC
       LIMIT ?1`,
    )
    .bind(Math.max(1, Math.min(250, limit)))
    .all();
  return result.results ?? [];
}

export async function quarantineStaleCatalog(
  now = Date.now(),
  staleAfterDays = 90,
) {
  const db = await getD1();
  const cutoff = now - staleAfterDays * 24 * 60 * 60 * 1000;
  const result = await db
    .prepare(
      `UPDATE restaurants
       SET discovery_status = 'review',
           discovery_exclusion_reason = 'stale-source',
           updated_at = ?1
       WHERE discovery_status = 'eligible'
         AND (verified_at IS NULL OR verified_at < ?2)`,
    )
    .bind(now, cutoff)
    .run();
  return Number(result.meta.changes ?? 0);
}

export async function quarantineExpiredMedia(now = Date.now()) {
  const db = await getD1();
  const result = await db
    .prepare(
      `UPDATE media_assets
       SET review_status = 'rejected'
       WHERE review_status = 'approved'
         AND expires_at IS NOT NULL
         AND expires_at <= ?1`,
    )
    .bind(now)
    .run();
  return Number(result.meta.changes ?? 0);
}

