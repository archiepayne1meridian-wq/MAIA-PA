CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`remind_date` text NOT NULL,
	`message` text NOT NULL,
	`prospect_id` text,
	`dismissed` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `meeting_date` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `meeting_type` text DEFAULT 'call' NOT NULL;