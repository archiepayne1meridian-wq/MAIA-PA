CREATE TABLE `apollo_coaching_profile` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`profile_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `apollo_debrief_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `objections_raised_json` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `tone_notes` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `what_resonated` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `debrief_summary` text;