CREATE TABLE `cassandra_items` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`url` text NOT NULL,
	`published` text,
	`summary` text NOT NULL,
	`key_quote` text,
	`call_angle` text NOT NULL,
	`content_angle` text,
	`relevance` text NOT NULL,
	`category` text NOT NULL,
	`used_on_call` integer DEFAULT 0 NOT NULL,
	`used_in_post` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
