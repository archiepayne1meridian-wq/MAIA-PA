CREATE TABLE `iris_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL,
	`pillar` integer NOT NULL,
	`topic` text NOT NULL,
	`copy` text NOT NULL,
	`image_prompt` text,
	`image_url` text,
	`format` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`slack_ts` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`preference_type` text NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
