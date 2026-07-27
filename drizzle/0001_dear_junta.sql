ALTER TABLE `restaurants` ADD `venue_type` text DEFAULT 'restaurant' NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `ownership_type` text DEFAULT 'independent' NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `discovery_status` text DEFAULT 'review' NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `discovery_exclusion_reason` text;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `location_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `restaurants_discovery_idx` ON `restaurants` (`discovery_status`,`ownership_type`);--> statement-breakpoint
CREATE INDEX `restaurants_venue_type_idx` ON `restaurants` (`venue_type`);--> statement-breakpoint
INSERT OR IGNORE INTO `restaurants` (`id`,`slug`,`name`,`venue_type`,`ownership_type`,`discovery_status`,`location_count`,`neighborhood`,`latitude`,`longitude`,`cuisine_tags`,`price_tier`,`service_modes`,`source_refs`,`created_at`,`updated_at`) VALUES
('restaurant-noodle-weather','noodle-weather','Noodle Weather','restaurant','independent','eligible',1,'Mission',37.7599,-122.4148,'["Chinese","Noodles"]',2,'["Dine-in","Pickup","Delivery"]','[{"provider":"demo"}]',1785110400000,1785110400000),
('restaurant-day-moon','day-moon','Day Moon','restaurant','independent','eligible',1,'SoMa',37.7785,-122.3950,'["Italian","Pizza"]',2,'["Dine-in","Pickup"]','[{"provider":"demo"}]',1785110400000,1785110400000),
('restaurant-golden-hour','golden-hour-taqueria','Golden Hour Taquería','restaurant','independent','eligible',1,'Mission',37.7560,-122.4192,'["Mexican","Tacos"]',1,'["Dine-in","Pickup","Delivery"]','[{"provider":"demo"}]',1785110400000,1785110400000),
('restaurant-ember-grain','ember-and-grain','Ember & Grain','restaurant','local_group','eligible',3,'Inner Richmond',37.7801,-122.4662,'["Mediterranean","Bowls"]',2,'["Dine-in","Pickup"]','[{"provider":"demo"}]',1785110400000,1785110400000),
('restaurant-fold-house','fold-house','Fold House','restaurant','independent','eligible',1,'Inner Sunset',37.7624,-122.4665,'["Chinese","Dumplings"]',1,'["Dine-in","Delivery"]','[{"provider":"demo"}]',1785110400000,1785110400000),
('restaurant-half-light-tea','half-light-tea','Half-Light Tea','boba','independent','eligible',1,'Hayes Valley',37.7764,-122.4242,'["Taiwanese","Tea","Boba"]',1,'["Walk-in","Pickup"]','[{"provider":"demo"}]',1785110400000,1785110400000),
('restaurant-juniper-cup','juniper-cup','Juniper Cup','cafe','independent','eligible',1,'Lower Haight',37.7721,-122.4322,'["Coffee","Pastry"]',1,'["Dine-in","Walk-in","Pickup"]','[{"provider":"demo"}]',1785110400000,1785110400000);--> statement-breakpoint
INSERT OR IGNORE INTO `dish_cards` (`id`,`restaurant_id`,`title`,`description`,`dish_tags`,`price_display`,`is_published`,`created_at`,`updated_at`) VALUES
('demo-noodle-weather','restaurant-noodle-weather','Chili crisp sesame noodles','A spicy vegetarian noodle dish from a fictional independent restaurant.','["Spicy","Vegetarian","Quick"]','$$',1,1785110400000,1785110400000),
('demo-day-moon','restaurant-day-moon','Charred tomato sourdough pizza','A wood-fired pizza from a fictional independent restaurant.','["Wood-fired","Shareable","Lively"]','$$',1,1785110400000,1785110400000),
('demo-golden-hour','restaurant-golden-hour','Crispy mushroom tacos','Vegetarian tacos from a fictional independent taquería.','["Crispy","Vegetarian","Casual"]','$',1,1785110400000,1785110400000),
('demo-ember-grain','restaurant-ember-grain','Smoky eggplant rice bowl','A vegan rice bowl from a fictional small local restaurant group.','["Smoky","Vegan","Comforting"]','$$',1,1785110400000,1785110400000),
('demo-fold-house','restaurant-fold-house','Ginger scallion dumplings','Dumplings from a fictional family-owned neighborhood restaurant.','["Dumplings","Cozy","Quick"]','$',1,1785110400000,1785110400000),
('demo-half-light-tea','restaurant-half-light-tea','Roasted oolong brown-sugar boba','A tea-forward drink from a fictional owner-operated boba shop.','["Boba","Roasted tea","Afternoon"]','$',1,1785110400000,1785110400000),
('demo-juniper-cup','restaurant-juniper-cup','Black sesame maple latte','A specialty latte from a fictional independent café.','["Coffee","Cozy","Oat milk"]','$',1,1785110400000,1785110400000);
