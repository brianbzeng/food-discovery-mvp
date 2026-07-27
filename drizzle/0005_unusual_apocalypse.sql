CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_principal_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`require_shared_dish` integer DEFAULT false NOT NULL,
	`fairness_strategy` text DEFAULT 'least-misery' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parties_creator_created_idx` ON `parties` (`creator_principal_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `parties_status_updated_idx` ON `parties` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `party_members` (
	`id` text PRIMARY KEY NOT NULL,
	`party_id` text NOT NULL,
	`principal_id` text,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`invite_token_hash` text,
	`invite_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`responded_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `party_member_principal_idx` ON `party_members` (`party_id`,`principal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `party_member_invite_token_idx` ON `party_members` (`invite_token_hash`);--> statement-breakpoint
CREATE INDEX `party_member_party_status_idx` ON `party_members` (`party_id`,`status`);--> statement-breakpoint
CREATE INDEX `party_member_principal_status_idx` ON `party_members` (`principal_id`,`status`);