CREATE TABLE `muse_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`tag` text NOT NULL,
	`entry_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `muse_tags_tag_unique` ON `muse_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `muse_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`scenario` text,
	`angle` text,
	`subject` text,
	`body` text NOT NULL,
	`medium` text DEFAULT 'email' NOT NULL,
	`times_used` integer DEFAULT 0 NOT NULL,
	`last_used` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `privacy_tier` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `entry_type` text DEFAULT 'knowledge' NOT NULL;--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `linked_entries` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `source_scenario` text;--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `times_accessed` integer DEFAULT 0 NOT NULL;