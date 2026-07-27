CREATE TABLE `restaurant_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`opens_at` text,
	`closes_at` text,
	`is_closed` integer DEFAULT false NOT NULL,
	`source_type` text NOT NULL,
	`verified_at` integer,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `restaurant_hours_restaurant_day_idx` ON `restaurant_hours` (`restaurant_id`,`day_of_week`);--> statement-breakpoint
CREATE TABLE `saved_restaurants` (
	`id` text PRIMARY KEY NOT NULL,
	`principal_id` text NOT NULL,
	`restaurant_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_principal_restaurant_idx` ON `saved_restaurants` (`principal_id`,`restaurant_id`);--> statement-breakpoint
CREATE INDEX `saved_principal_created_idx` ON `saved_restaurants` (`principal_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `address_line_1` text;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `city` text;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `region` text;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `postal_code` text;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `timezone` text;--> statement-breakpoint
UPDATE `restaurants`
SET
  `address_line_1` = CASE `id`
    WHEN 'restaurant-noodle-weather' THEN '811 Valencia St'
    WHEN 'restaurant-day-moon' THEN '244 Brannan St'
    WHEN 'restaurant-golden-hour' THEN '3254 21st St'
    WHEN 'restaurant-ember-grain' THEN '402 Clement St'
    WHEN 'restaurant-fold-house' THEN '1248 9th Ave'
    WHEN 'restaurant-half-light-tea' THEN '510 Octavia St'
    WHEN 'restaurant-juniper-cup' THEN '628 Haight St'
  END,
  `city` = 'San Francisco',
  `region` = 'CA',
  `postal_code` = '94100',
  `timezone` = 'America/Los_Angeles',
  `phone` = CASE `id`
    WHEN 'restaurant-noodle-weather' THEN '+14155550101'
    WHEN 'restaurant-day-moon' THEN '+14155550102'
    WHEN 'restaurant-golden-hour' THEN '+14155550103'
    WHEN 'restaurant-ember-grain' THEN '+14155550104'
    WHEN 'restaurant-fold-house' THEN '+14155550105'
    WHEN 'restaurant-half-light-tea' THEN '+14155550106'
    WHEN 'restaurant-juniper-cup' THEN '+14155550107'
  END,
  `website_url` = 'https://example.com/' || `slug`,
  `menu_url` = 'https://example.com/' || `slug` || '/menu',
  `directions_url` = 'https://www.google.com/maps/search/?api=1&query=' || REPLACE(`name`, ' ', '+') || '+San+Francisco',
  `verified_at` = 1785110400000
WHERE `id` IN (
  'restaurant-noodle-weather',
  'restaurant-day-moon',
  'restaurant-golden-hour',
  'restaurant-ember-grain',
  'restaurant-fold-house',
  'restaurant-half-light-tea',
  'restaurant-juniper-cup'
);--> statement-breakpoint
WITH RECURSIVE `days`(`day`) AS (
  VALUES(0)
  UNION ALL
  SELECT `day` + 1 FROM `days` WHERE `day` < 6
)
INSERT OR IGNORE INTO `restaurant_hours` (`id`,`restaurant_id`,`day_of_week`,`opens_at`,`closes_at`,`is_closed`,`source_type`,`verified_at`)
SELECT
  `restaurants`.`id` || '-hours-' || `days`.`day`,
  `restaurants`.`id`,
  `days`.`day`,
  CASE
    WHEN `restaurants`.`venue_type` = 'cafe' THEN '07:00'
    WHEN `restaurants`.`venue_type` = 'boba' THEN '11:00'
    ELSE '11:30'
  END,
  CASE
    WHEN `restaurants`.`venue_type` = 'cafe' THEN '18:00'
    WHEN `restaurants`.`venue_type` = 'boba' THEN '20:00'
    ELSE '22:00'
  END,
  0,
  'provider',
  1785110400000
FROM `restaurants`
CROSS JOIN `days`
WHERE `restaurants`.`id` IN (
  'restaurant-noodle-weather',
  'restaurant-day-moon',
  'restaurant-golden-hour',
  'restaurant-ember-grain',
  'restaurant-fold-house',
  'restaurant-half-light-tea',
  'restaurant-juniper-cup'
);
