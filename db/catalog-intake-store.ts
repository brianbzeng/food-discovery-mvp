import {
  assessOwnership,
  type OwnershipSignals,
} from "../app/lib/catalog-intake";
import type { OwnershipType } from "../app/lib/discovery-policy";
import { getD1 } from "./index";

export type CatalogImportInput = {
  provider: string;
  providerPlaceId: string;
  normalizedName: string;
  rawPayload: Record<string, unknown>;
  ownershipSignals: OwnershipSignals;
};

export type CatalogReviewInput = {
  catalogImportId: string;
  restaurantId?: string;
  reviewerId: string;
  action: "accept" | "reject" | "needs_more_evidence";
  ownershipType: OwnershipType;
  reasonCode: string;
  evidenceUrls: string[];
};

function shortText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function cleanEvidenceUrls(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .slice(0, 12)
        .map((value) => value.trim())
        .filter((value) => {
          try {
            const url = new URL(value);
            return url.protocol === "https:" || url.protocol === "http:";
          } catch {
            return false;
          }
        }),
    ),
  );
}

export async function queueCatalogImport(input: CatalogImportInput) {
  const db = await getD1();
  const provider = shortText(input.provider, 80);
  const providerPlaceId = shortText(input.providerPlaceId, 160);
  const normalizedName = shortText(input.normalizedName, 160);
  if (!provider || !providerPlaceId || !normalizedName) {
    throw new Error("Provider, provider place id, and name are required.");
  }

  const assessment = assessOwnership(input.ownershipSignals);
  const id = crypto.randomUUID();
  const importedAt = Date.now();

  await db
    .prepare(
      `INSERT INTO catalog_imports (
        id,
        provider,
        provider_place_id,
        normalized_name,
        raw_payload,
        ownership_signals,
        suggested_ownership_type,
        suggested_discovery_status,
        status,
        imported_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9)
      ON CONFLICT(provider, provider_place_id) DO UPDATE SET
        normalized_name = excluded.normalized_name,
        raw_payload = excluded.raw_payload,
        ownership_signals = excluded.ownership_signals,
        suggested_ownership_type = excluded.suggested_ownership_type,
        suggested_discovery_status = excluded.suggested_discovery_status,
        imported_at = excluded.imported_at`,
    )
    .bind(
      id,
      provider,
      providerPlaceId,
      normalizedName,
      JSON.stringify(input.rawPayload),
      JSON.stringify(input.ownershipSignals),
      assessment.suggestedOwnershipType,
      assessment.suggestedDiscoveryStatus,
      importedAt,
    )
    .run();

  return { id, assessment, importedAt };
}

export async function reviewCatalogImport(input: CatalogReviewInput) {
  const db = await getD1();
  const reviewerId = shortText(input.reviewerId, 160);
  const reasonCode = shortText(input.reasonCode, 100);
  const evidenceUrls = cleanEvidenceUrls(input.evidenceUrls);
  const isLocal =
    input.ownershipType === "independent" ||
    input.ownershipType === "local_group";

  if (!reviewerId || !reasonCode) {
    throw new Error("Reviewer and reason code are required.");
  }
  if (input.action === "accept" && !isLocal) {
    throw new Error("Chains and franchises cannot be accepted.");
  }
  if (input.action === "accept" && (!input.restaurantId || evidenceUrls.length === 0)) {
    throw new Error(
      "Publishing requires a restaurant record and ownership evidence.",
    );
  }

  const discoveryStatus =
    input.action === "accept"
      ? "eligible"
      : input.action === "reject"
        ? "excluded"
        : "review";
  const importStatus =
    input.action === "accept"
      ? "accepted"
      : input.action === "reject"
        ? "rejected"
        : "pending";
  const reviewedAt = Date.now();
  const statements = [
    db
      .prepare(
        `UPDATE catalog_imports
         SET status = ?1, reviewed_at = ?2
         WHERE id = ?3`,
      )
      .bind(importStatus, reviewedAt, input.catalogImportId),
    db
      .prepare(
        `INSERT INTO catalog_review_events (
          id,
          catalog_import_id,
          restaurant_id,
          reviewer_id,
          action,
          ownership_type,
          discovery_status,
          reason_code,
          evidence_urls,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      )
      .bind(
        crypto.randomUUID(),
        input.catalogImportId,
        input.restaurantId ?? null,
        reviewerId,
        input.action,
        input.ownershipType,
        discoveryStatus,
        reasonCode,
        JSON.stringify(evidenceUrls),
        reviewedAt,
      ),
  ];

  if (input.restaurantId) {
    statements.push(
      db
        .prepare(
          `UPDATE restaurants
           SET ownership_type = ?1,
               discovery_status = ?2,
               discovery_exclusion_reason = ?3,
               updated_at = ?4
           WHERE id = ?5`,
        )
        .bind(
          input.ownershipType,
          discoveryStatus,
          input.action === "reject" ? reasonCode : null,
          reviewedAt,
          input.restaurantId,
        ),
    );
  }

  await db.batch(statements);
  return { discoveryStatus, importStatus, reviewedAt };
}

