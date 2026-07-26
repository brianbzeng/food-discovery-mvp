CREATE TABLE `dish_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`media_asset_id` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`dish_tags` text NOT NULL,
	`price_display` text,
	`source_url` text,
	`is_published` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `dish_cards_restaurant_idx` ON `dish_cards` (`restaurant_id`);--> statement-breakpoint
CREATE INDEX `dish_cards_published_idx` ON `dish_cards` (`is_published`);--> statement-breakpoint
CREATE TABLE `interaction_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`guest_id` text,
	`session_id` text NOT NULL,
	`restaurant_id` text NOT NULL,
	`dish_card_id` text,
	`event_type` text NOT NULL,
	`reason_code` text,
	`context` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dish_card_id`) REFERENCES `dish_cards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `interaction_user_created_idx` ON `interaction_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `interaction_guest_created_idx` ON `interaction_events` (`guest_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `interaction_restaurant_idx` ON `interaction_events` (`restaurant_id`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`media_type` text NOT NULL,
	`alt_text` text NOT NULL,
	`rights_holder` text NOT NULL,
	`license_basis` text NOT NULL,
	`attribution_text` text,
	`attribution_url` text,
	`expires_at` integer,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_assets_review_status_idx` ON `media_assets` (`review_status`);--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`neighborhood` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`cuisine_tags` text NOT NULL,
	`price_tier` integer NOT NULL,
	`phone` text,
	`website_url` text,
	`menu_url` text,
	`directions_url` text,
	`service_modes` text NOT NULL,
	`source_refs` text NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `restaurants_slug_idx` ON `restaurants` (`slug`);--> statement-breakpoint
CREATE INDEX `restaurants_neighborhood_idx` ON `restaurants` (`neighborhood`);--> statement-breakpoint
CREATE TABLE `restriction_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`dish_card_id` text,
	`restriction_key` text NOT NULL,
	`status` text NOT NULL,
	`source_type` text NOT NULL,
	`source_url` text,
	`merchant_confirmed` integer DEFAULT false NOT NULL,
	`verified_at` integer,
	`notes` text,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dish_card_id`) REFERENCES `dish_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `restriction_restaurant_idx` ON `restriction_evidence` (`restaurant_id`);--> statement-breakpoint
CREATE INDEX `restriction_lookup_idx` ON `restriction_evidence` (`restriction_key`,`status`);--> statement-breakpoint
CREATE TABLE `taste_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`explicit_preferences` text NOT NULL,
	`learned_weights` text NOT NULL,
	`dietary_restrictions` text NOT NULL,
	`allergens` text NOT NULL,
	`show_unknown_allergy_matches` integer DEFAULT true NOT NULL,
	`hidden_restaurant_ids` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taste_profiles_user_id_unique` ON `taste_profiles` (`user_id`);