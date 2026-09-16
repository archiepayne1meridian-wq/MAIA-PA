CREATE TABLE `iris_voice_learnings` (
	`id` text PRIMARY KEY NOT NULL,
	`learning` text NOT NULL,
	`example_before` text,
	`example_after` text,
	`applied_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `iris_posts` ADD `user_edited` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `iris_posts` ADD `edit_delta` text;--> statement-breakpoint
ALTER TABLE `iris_posts` ADD `edit_notes` text;--> statement-breakpoint
ALTER TABLE `iris_posts` ADD `approved` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `iris_posts` ADD `post_type` text;--> statement-breakpoint
ALTER TABLE `iris_posts` ADD `engagement_signal` text;