CREATE TABLE `catalog_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_place_id` text NOT NULL,
	`normalized_name` text NOT NULL,
	`raw_payload` text NOT NULL,
	`ownership_signals` text NOT NULL,
	`suggested_ownership_type` text NOT NULL,
	`suggested_discovery_status` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`imported_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_import_provider_place_idx` ON `catalog_imports` (`provider`,`provider_place_id`);--> statement-breakpoint
CREATE INDEX `catalog_import_status_idx` ON `catalog_imports` (`status`,`imported_at`);--> statement-breakpoint
CREATE TABLE `catalog_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`catalog_import_id` text NOT NULL,
	`restaurant_id` text,
	`reviewer_id` text NOT NULL,
	`action` text NOT NULL,
	`ownership_type` text NOT NULL,
	`discovery_status` text NOT NULL,
	`reason_code` text NOT NULL,
	`evidence_urls` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`catalog_import_id`) REFERENCES `catalog_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `catalog_review_import_idx` ON `catalog_review_events` (`catalog_import_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `catalog_review_restaurant_idx` ON `catalog_review_events` (`restaurant_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `restriction_evidence` (`id`,`restaurant_id`,`dish_card_id`,`restriction_key`,`status`,`source_type`,`merchant_confirmed`,`verified_at`,`notes`) VALUES
('evidence-day-moon-peanut','restaurant-day-moon','demo-day-moon','peanut','compatible','official_menu',1,1785110400000,'Fictional demo evidence; confirm severe allergies directly.'),
('evidence-day-moon-vegetarian','restaurant-day-moon','demo-day-moon','vegetarian','compatible','merchant',1,1785110400000,'Fictional merchant-supplied vegetarian confirmation.'),
('evidence-golden-hour-vegetarian','restaurant-golden-hour','demo-golden-hour','vegetarian','compatible','merchant',1,1785110400000,'Fictional merchant-supplied vegetarian confirmation.'),
('evidence-ember-peanut','restaurant-ember-grain','demo-ember-grain','peanut','compatible','official_menu',0,1785110400000,'Fictional official-menu evidence; cross-contact still requires confirmation.'),
('evidence-ember-vegan','restaurant-ember-grain','demo-ember-grain','vegan','compatible','merchant',1,1785110400000,'Fictional merchant-supplied vegan preparation.'),
('evidence-ember-vegetarian','restaurant-ember-grain','demo-ember-grain','vegetarian','compatible','merchant',1,1785110400000,'Fictional merchant-supplied vegetarian preparation.'),
('evidence-fold-peanut','restaurant-fold-house','demo-fold-house','peanut','contains','official_menu',1,1785110400000,'Fictional demo dish contains peanut ingredients.'),
('evidence-half-light-peanut','restaurant-half-light-tea','demo-half-light-tea','peanut','compatible','official_menu',0,1785110400000,'Fictional menu evidence; shared preparation requires confirmation.'),
('evidence-juniper-peanut','restaurant-juniper-cup','demo-juniper-cup','peanut','compatible','official_menu',0,1785110400000,'Fictional menu evidence; shared equipment requires confirmation.'),
('evidence-juniper-vegan','restaurant-juniper-cup','demo-juniper-cup','vegan','accommodates','merchant',1,1785110400000,'Fictional oat-milk substitution confirmation.');
