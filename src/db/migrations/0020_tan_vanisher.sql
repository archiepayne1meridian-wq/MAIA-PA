CREATE TABLE `muse_case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`event_type` text NOT NULL,
	`date` text NOT NULL,
	`summary` text NOT NULL,
	`what_suggested` text,
	`adviser_recommendation` text,
	`worked` text,
	`apollo_call_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `muse_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`company` text,
	`location` text,
	`occupation` text,
	`financial_profile` text,
	`status` text DEFAULT 'active' NOT NULL,
	`outcome` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
