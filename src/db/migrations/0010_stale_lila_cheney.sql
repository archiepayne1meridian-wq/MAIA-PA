CREATE TABLE `muse_change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`changed_at` integer NOT NULL,
	`change_summary` text NOT NULL,
	`previous_content` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `muse_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`sector` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`content` text NOT NULL,
	`brief_depth` text NOT NULL,
	`source` text NOT NULL,
	`source_agent` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`date_filed` integer NOT NULL,
	`last_updated` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `muse_links` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id_a` text NOT NULL,
	`entry_id_b` text NOT NULL,
	`link_type` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `muse_pending` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_agent` text,
	`suggested_sector` text NOT NULL,
	`suggested_title` text NOT NULL,
	`suggested_content` text NOT NULL,
	`suggested_depth` text NOT NULL,
	`suggested_links` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'awaiting' NOT NULL,
	`created_at` integer NOT NULL
);
