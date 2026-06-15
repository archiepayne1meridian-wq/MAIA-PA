CREATE TABLE `diana_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`slack_user` text NOT NULL,
	`scenario` text,
	`difficulty` text DEFAULT 'neutral' NOT NULL,
	`transcript_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`ended_at` integer
);
