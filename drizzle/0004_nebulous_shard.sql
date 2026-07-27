ALTER TABLE `restriction_evidence` ADD `evidence_scope` text DEFAULT 'dish' NOT NULL;--> statement-breakpoint
ALTER TABLE `taste_profiles` ADD `occasion_weights` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `taste_profiles` ADD `allergen_strictness` text DEFAULT 'dish-aware' NOT NULL;--> statement-breakpoint
UPDATE `taste_profiles`
SET `allergens` = '[]'
WHERE `allergens` = '["peanut"]'
  AND `explicit_preferences` = '{}'
  AND `dietary_restrictions` = '[]';--> statement-breakpoint
INSERT OR IGNORE INTO `dish_cards` (
  `id`,
  `restaurant_id`,
  `title`,
  `description`,
  `dish_tags`,
  `price_display`,
  `is_published`,
  `created_at`,
  `updated_at`
) VALUES (
  'demo-fold-house-vegetable-wontons',
  'restaurant-fold-house',
  'Garden vegetable wontons',
  'Vegetable wontons with ginger broth from a fictional family-owned restaurant.',
  '["Wontons","Vegetarian","Comforting"]',
  '$',
  1,
  1785110400000,
  1785110400000
);--> statement-breakpoint
INSERT OR IGNORE INTO `restriction_evidence` (
  `id`,
  `restaurant_id`,
  `dish_card_id`,
  `restriction_key`,
  `status`,
  `evidence_scope`,
  `source_type`,
  `merchant_confirmed`,
  `verified_at`,
  `notes`
) VALUES
(
  'evidence-fold-wontons-peanut',
  'restaurant-fold-house',
  'demo-fold-house-vegetable-wontons',
  'peanut',
  'compatible',
  'dish',
  'merchant',
  1,
  1785110400000,
  'Fictional merchant-supplied dish-level ingredient confirmation; shared-kitchen cross-contact still requires direct confirmation.'
),
(
  'evidence-fold-kitchen-peanut',
  'restaurant-fold-house',
  NULL,
  'peanut',
  'unknown',
  'shared_kitchen',
  'merchant',
  0,
  1785110400000,
  'Fictional shared-kitchen warning; preparation separation has not been verified.'
);--> statement-breakpoint
INSERT OR IGNORE INTO `dish_cards` (
  `id`,
  `restaurant_id`,
  `title`,
  `description`,
  `dish_tags`,
  `price_display`,
  `is_published`,
  `created_at`,
  `updated_at`
) VALUES
(
  'demo-noodle-weather-broth',
  'restaurant-noodle-weather',
  'Ginger vegetable broth noodles',
  'A mild vegetable noodle bowl from a fictional independent restaurant.',
  '["Noodles","Vegetarian","Lunch"]',
  '$$',
  1,
  1785110400000,
  1785110400000
),
(
  'demo-day-moon-focaccia',
  'restaurant-day-moon',
  'Roasted mushroom focaccia',
  'A mushroom and herb focaccia from a fictional independent restaurant.',
  '["Vegetarian","Shareable","Dinner"]',
  '$$',
  1,
  1785110400000,
  1785110400000
),
(
  'demo-golden-hour-tostada',
  'restaurant-golden-hour',
  'Citrus black bean tostada',
  'A bright black bean tostada from a fictional independent taqueria.',
  '["Vegan","Crispy","Lunch"]',
  '$',
  1,
  1785110400000,
  1785110400000
),
(
  'demo-ember-grain-flatbread',
  'restaurant-ember-grain',
  'Lemon chickpea flatbread',
  'A chickpea and herb flatbread from a fictional small local restaurant group.',
  '["Vegan","Shareable","Dinner"]',
  '$$',
  1,
  1785110400000,
  1785110400000
),
(
  'demo-half-light-jasmine',
  'restaurant-half-light-tea',
  'Jasmine citrus fruit tea',
  'A dairy-free fruit tea from a fictional owner-operated tea shop.',
  '["Tea","Dairy-free","Afternoon"]',
  '$',
  1,
  1785110400000,
  1785110400000
),
(
  'demo-juniper-toast',
  'restaurant-juniper-cup',
  'Tomato herb breakfast toast',
  'A savory breakfast toast from a fictional independent cafe.',
  '["Breakfast","Vegetarian","Savory"]',
  '$',
  1,
  1785110400000,
  1785110400000
);--> statement-breakpoint
INSERT OR IGNORE INTO `restriction_evidence` (
  `id`,
  `restaurant_id`,
  `dish_card_id`,
  `restriction_key`,
  `status`,
  `evidence_scope`,
  `source_type`,
  `merchant_confirmed`,
  `verified_at`,
  `notes`
) VALUES
(
  'evidence-noodle-broth-peanut',
  'restaurant-noodle-weather',
  'demo-noodle-weather-broth',
  'peanut',
  'compatible',
  'dish',
  'merchant',
  1,
  1785110400000,
  'Fictional dish-level ingredient confirmation; confirm cross-contact directly.'
),
(
  'evidence-noodle-broth-vegetarian',
  'restaurant-noodle-weather',
  'demo-noodle-weather-broth',
  'vegetarian',
  'compatible',
  'dish',
  'merchant',
  1,
  1785110400000,
  'Fictional merchant-supplied vegetarian confirmation.'
),
(
  'evidence-day-focaccia-peanut',
  'restaurant-day-moon',
  'demo-day-moon-focaccia',
  'peanut',
  'compatible',
  'dish',
  'official_menu',
  1,
  1785110400000,
  'Fictional dish-level menu evidence; confirm severe allergies directly.'
),
(
  'evidence-day-focaccia-vegetarian',
  'restaurant-day-moon',
  'demo-day-moon-focaccia',
  'vegetarian',
  'compatible',
  'dish',
  'merchant',
  1,
  1785110400000,
  'Fictional merchant-supplied vegetarian confirmation.'
),
(
  'evidence-golden-tostada-vegan',
  'restaurant-golden-hour',
  'demo-golden-hour-tostada',
  'vegan',
  'compatible',
  'dish',
  'merchant',
  1,
  1785110400000,
  'Fictional merchant-supplied vegan confirmation.'
),
(
  'evidence-golden-tostada-vegetarian',
  'restaurant-golden-hour',
  'demo-golden-hour-tostada',
  'vegetarian',
  'compatible',
  'dish',
  'merchant',
  1,
  1785110400000,
  'Fictional merchant-supplied vegetarian confirmation.'
),
(
  'evidence-ember-flatbread-peanut',
  'restaurant-ember-grain',
  'demo-ember-grain-flatbread',
  'peanut',
  'compatible',
  'dish',
  'official_menu',
  0,
  1785110400000,
  'Fictional menu evidence; shared preparation still requires confirmation.'
),
(
  'evidence-ember-flatbread-vegan',
  'restaurant-ember-grain',
  'demo-ember-grain-flatbread',
  'vegan',
  'compatible',
  'dish',
  'merchant',
  1,
  1785110400000,
  'Fictional merchant-supplied vegan confirmation.'
),
(
  'evidence-half-light-jasmine-vegan',
  'restaurant-half-light-tea',
  'demo-half-light-jasmine',
  'vegan',
  'accommodates',
  'dish',
  'merchant',
  1,
  1785110400000,
  'Fictional confirmation that the drink can be prepared without dairy ingredients.'
),
(
  'evidence-half-light-jasmine-peanut',
  'restaurant-half-light-tea',
  'demo-half-light-jasmine',
  'peanut',
  'compatible',
  'dish',
  'official_menu',
  0,
  1785110400000,
  'Fictional menu evidence; topping and shared-preparation risk still requires confirmation.'
),
(
  'evidence-juniper-toast-vegetarian',
  'restaurant-juniper-cup',
  'demo-juniper-toast',
  'vegetarian',
  'compatible',
  'dish',
  'merchant',
  1,
  1785110400000,
  'Fictional merchant-supplied vegetarian confirmation.'
);--> statement-breakpoint
INSERT OR IGNORE INTO `restriction_evidence` (
  `id`,
  `restaurant_id`,
  `dish_card_id`,
  `restriction_key`,
  `status`,
  `evidence_scope`,
  `source_type`,
  `merchant_confirmed`,
  `verified_at`,
  `notes`
) VALUES
(
  'evidence-noodle-kitchen-peanut',
  'restaurant-noodle-weather',
  NULL,
  'peanut',
  'unknown',
  'shared_kitchen',
  'unknown',
  0,
  1785110400000,
  'Fictional shared-kitchen warning; preparation separation has not been verified.'
),
(
  'evidence-day-kitchen-peanut',
  'restaurant-day-moon',
  NULL,
  'peanut',
  'unknown',
  'shared_kitchen',
  'unknown',
  0,
  1785110400000,
  'Fictional shared-kitchen warning; preparation separation has not been verified.'
),
(
  'evidence-golden-kitchen-peanut',
  'restaurant-golden-hour',
  NULL,
  'peanut',
  'unknown',
  'shared_kitchen',
  'unknown',
  0,
  1785110400000,
  'Fictional shared-kitchen warning; preparation separation has not been verified.'
),
(
  'evidence-ember-kitchen-peanut',
  'restaurant-ember-grain',
  NULL,
  'peanut',
  'unknown',
  'shared_kitchen',
  'unknown',
  0,
  1785110400000,
  'Fictional shared-kitchen warning; preparation separation has not been verified.'
),
(
  'evidence-half-light-kitchen-peanut',
  'restaurant-half-light-tea',
  NULL,
  'peanut',
  'unknown',
  'shared_kitchen',
  'unknown',
  0,
  1785110400000,
  'Fictional shared-kitchen warning; preparation separation has not been verified.'
),
(
  'evidence-juniper-kitchen-peanut',
  'restaurant-juniper-cup',
  NULL,
  'peanut',
  'unknown',
  'shared_kitchen',
  'unknown',
  0,
  1785110400000,
  'Fictional shared-equipment warning; preparation separation has not been verified.'
);
