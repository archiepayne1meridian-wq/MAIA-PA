CREATE TABLE `apollo_global_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `linked_prospect_id` text;--> statement-breakpoint
ALTER TABLE `nexus_prospects` ADD `booked` integer DEFAULT 0 NOT NULL;