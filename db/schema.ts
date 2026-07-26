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
    neighborhood: text("neighborhood").notNull(),
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
  dietaryRestrictions: text("dietary_restrictions", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  allergens: text("allergens", { mode: "json" }).$type<string[]>().notNull(),
  showUnknownAllergyMatches: integer("show_unknown_allergy_matches", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
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
