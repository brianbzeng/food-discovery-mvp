import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const restaurants = sqliteTable(
  "restaurants",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    venueType: text("venue_type", {
      enum: [
        "restaurant",
        "cafe",
        "boba",
        "tea_house",
        "bakery",
        "dessert",
        "juice_bar",
      ],
    })
      .notNull()
      .default("restaurant"),
    ownershipType: text("ownership_type", {
      enum: [
        "independent",
        "local_group",
        "franchise",
        "regional_chain",
        "national_chain",
      ],
    })
      .notNull()
      .default("independent"),
    discoveryStatus: text("discovery_status", {
      enum: ["eligible", "review", "excluded"],
    })
      .notNull()
      .default("review"),
    discoveryExclusionReason: text("discovery_exclusion_reason"),
    locationCount: integer("location_count").notNull().default(1),
    neighborhood: text("neighborhood").notNull(),
    addressLine1: text("address_line_1"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    timezone: text("timezone"),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    cuisineTags: text("cuisine_tags", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    priceTier: integer("price_tier").notNull(),
    phone: text("phone"),
    websiteUrl: text("website_url"),
    menuUrl: text("menu_url"),
    directionsUrl: text("directions_url"),
    serviceModes: text("service_modes", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    sourceRefs: text("source_refs", { mode: "json" })
      .$type<Array<{ provider: string; id?: string; url?: string }>>()
      .notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("restaurants_slug_idx").on(table.slug),
    index("restaurants_neighborhood_idx").on(table.neighborhood),
    index("restaurants_discovery_idx").on(
      table.discoveryStatus,
      table.ownershipType,
    ),
    index("restaurants_venue_type_idx").on(table.venueType),
  ],
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    storageKey: text("storage_key").notNull(),
    mediaType: text("media_type", { enum: ["image", "video"] }).notNull(),
    altText: text("alt_text").notNull(),
    rightsHolder: text("rights_holder").notNull(),
    licenseBasis: text("license_basis").notNull(),
    attributionText: text("attribution_text"),
    attributionUrl: text("attribution_url"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    reviewStatus: text("review_status", {
      enum: ["pending", "approved", "rejected"],
    })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("media_assets_review_status_idx").on(table.reviewStatus)],
);

export const dishCards = sqliteTable(
  "dish_cards",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    mediaAssetId: text("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    dishTags: text("dish_tags", { mode: "json" }).$type<string[]>().notNull(),
    priceDisplay: text("price_display"),
    sourceUrl: text("source_url"),
    isPublished: integer("is_published", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("dish_cards_restaurant_idx").on(table.restaurantId),
    index("dish_cards_published_idx").on(table.isPublished),
  ],
);

export const restrictionEvidence = sqliteTable(
  "restriction_evidence",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    dishCardId: text("dish_card_id").references(() => dishCards.id, {
      onDelete: "cascade",
    }),
    restrictionKey: text("restriction_key").notNull(),
    status: text("status", {
      enum: ["contains", "compatible", "accommodates", "unknown"],
    }).notNull(),
    evidenceScope: text("evidence_scope", {
      enum: ["dish", "shared_kitchen", "venue"],
    })
      .notNull()
      .default("dish"),
    sourceType: text("source_type", {
      enum: ["merchant", "official_menu", "team_review", "unknown"],
    }).notNull(),
    sourceUrl: text("source_url"),
    merchantConfirmed: integer("merchant_confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
  },
  (table) => [
    index("restriction_restaurant_idx").on(table.restaurantId),
    index("restriction_lookup_idx").on(
      table.restrictionKey,
      table.status,
    ),
  ],
);

export const tasteProfiles = sqliteTable("taste_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  explicitPreferences: text("explicit_preferences", { mode: "json" })
    .$type<Record<string, number>>()
    .notNull(),
  learnedWeights: text("learned_weights", { mode: "json" })
    .$type<Record<string, number>>()
    .notNull(),
  occasionWeights: text("occasion_weights", { mode: "json" })
    .$type<Record<string, Record<string, number>>>()
    .notNull()
    .default({}),
  dietaryRestrictions: text("dietary_restrictions", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  allergens: text("allergens", { mode: "json" }).$type<string[]>().notNull(),
  showUnknownAllergyMatches: integer("show_unknown_allergy_matches", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  allergenStrictness: text("allergen_strictness", {
    enum: ["dish-aware", "strict"],
  })
    .notNull()
    .default("dish-aware"),
  hiddenRestaurantIds: text("hidden_restaurant_ids", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const interactionEvents = sqliteTable(
  "interaction_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    guestId: text("guest_id"),
    sessionId: text("session_id").notNull(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    dishCardId: text("dish_card_id").references(() => dishCards.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type", {
      enum: [
        "view",
        "pass",
        "like",
        "save",
        "unsave",
        "detail",
        "share",
        "handoff",
        "never_show",
      ],
    }).notNull(),
    reasonCode: text("reason_code"),
    context: text("context", { mode: "json" })
      .$type<Record<string, string | number | boolean | string[]>>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("interaction_user_created_idx").on(table.userId, table.createdAt),
    index("interaction_guest_created_idx").on(table.guestId, table.createdAt),
    index("interaction_restaurant_idx").on(table.restaurantId),
  ],
);

export const catalogImports = sqliteTable(
  "catalog_imports",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerPlaceId: text("provider_place_id").notNull(),
    normalizedName: text("normalized_name").notNull(),
    rawPayload: text("raw_payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    ownershipSignals: text("ownership_signals", { mode: "json" })
      .$type<Record<string, string | number | boolean>>()
      .notNull(),
    suggestedOwnershipType: text("suggested_ownership_type", {
      enum: [
        "independent",
        "local_group",
        "franchise",
        "regional_chain",
        "national_chain",
      ],
    }).notNull(),
    suggestedDiscoveryStatus: text("suggested_discovery_status", {
      enum: ["eligible", "review", "excluded"],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "rejected"],
    })
      .notNull()
      .default("pending"),
    importedAt: integer("imported_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("catalog_import_provider_place_idx").on(
      table.provider,
      table.providerPlaceId,
    ),
    index("catalog_import_status_idx").on(table.status, table.importedAt),
  ],
);

export const catalogReviewEvents = sqliteTable(
  "catalog_review_events",
  {
    id: text("id").primaryKey(),
    catalogImportId: text("catalog_import_id")
      .notNull()
      .references(() => catalogImports.id, { onDelete: "cascade" }),
    restaurantId: text("restaurant_id").references(() => restaurants.id, {
      onDelete: "set null",
    }),
    reviewerId: text("reviewer_id").notNull(),
    action: text("action", {
      enum: ["accept", "reject", "needs_more_evidence"],
    }).notNull(),
    ownershipType: text("ownership_type", {
      enum: [
        "independent",
        "local_group",
        "franchise",
        "regional_chain",
        "national_chain",
      ],
    }).notNull(),
    discoveryStatus: text("discovery_status", {
      enum: ["eligible", "review", "excluded"],
    }).notNull(),
    reasonCode: text("reason_code").notNull(),
    evidenceUrls: text("evidence_urls", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("catalog_review_import_idx").on(
      table.catalogImportId,
      table.createdAt,
    ),
    index("catalog_review_restaurant_idx").on(table.restaurantId),
  ],
);

export const restaurantHours = sqliteTable(
  "restaurant_hours",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    opensAt: text("opens_at"),
    closesAt: text("closes_at"),
    isClosed: integer("is_closed", { mode: "boolean" })
      .notNull()
      .default(false),
    sourceType: text("source_type", {
      enum: ["merchant", "official_site", "provider", "unknown"],
    }).notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("restaurant_hours_restaurant_day_idx").on(
      table.restaurantId,
      table.dayOfWeek,
    ),
  ],
);

export const savedRestaurants = sqliteTable(
  "saved_restaurants",
  {
    id: text("id").primaryKey(),
    principalId: text("principal_id").notNull(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("saved_principal_restaurant_idx").on(
      table.principalId,
      table.restaurantId,
    ),
    index("saved_principal_created_idx").on(
      table.principalId,
      table.createdAt,
    ),
  ],
);

export const parties = sqliteTable(
  "parties",
  {
    id: text("id").primaryKey(),
    creatorPrincipalId: text("creator_principal_id").notNull(),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["active", "archived"],
    })
      .notNull()
      .default("active"),
    requireSharedDish: integer("require_shared_dish", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    fairnessStrategy: text("fairness_strategy", {
      enum: ["least-misery", "min-average"],
    })
      .notNull()
      .default("least-misery"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("parties_creator_created_idx").on(
      table.creatorPrincipalId,
      table.createdAt,
    ),
    index("parties_status_updated_idx").on(table.status, table.updatedAt),
  ],
);

export const partyMembers = sqliteTable(
  "party_members",
  {
    id: text("id").primaryKey(),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    principalId: text("principal_id"),
    displayName: text("display_name").notNull(),
    role: text("role", {
      enum: ["creator", "member"],
    }).notNull(),
    status: text("status", {
      enum: ["invited", "accepted", "declined", "revoked"],
    }).notNull(),
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: integer("invite_expires_at", {
      mode: "timestamp_ms",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    respondedAt: integer("responded_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("party_member_principal_idx").on(
      table.partyId,
      table.principalId,
    ),
    uniqueIndex("party_member_invite_token_idx").on(table.inviteTokenHash),
    index("party_member_party_status_idx").on(table.partyId, table.status),
    index("party_member_principal_status_idx").on(
      table.principalId,
      table.status,
    ),
  ],
);
