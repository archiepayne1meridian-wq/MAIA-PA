CREATE TABLE `maia_preference_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_key` text NOT NULL,
	`rule_value` text NOT NULL,
	`category` text NOT NULL,
	`reason` text,
	`rejection_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maia_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`rule_type` text NOT NULL,
	`rule_key` text NOT NULL,
	`rule_value` text NOT NULL,
	`confirmed` integer DEFAULT 1 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
