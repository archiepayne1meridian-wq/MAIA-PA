CREATE TABLE `cassandra_seen_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cassandra_seen_articles_url_unique` ON `cassandra_seen_articles` (`url`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cassandra_items` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`url` text NOT NULL,
	`published` text,
	`summary` text NOT NULL,
	`key_quote` text,
	`call_angle` text,
	`content_angle` text,
	`relevance` text NOT NULL,
	`category` text NOT NULL,
	`used_on_call` integer DEFAULT 0 NOT NULL,
	`used_in_post` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_cassandra_items`("id", "date", "title", "source", "url", "published", "summary", "key_quote", "call_angle", "content_angle", "relevance", "category", "used_on_call", "used_in_post", "created_at") SELECT "id", "date", "title", "source", "url", "published", "summary", "key_quote", "call_angle", "content_angle", "relevance", "category", "used_on_call", "used_in_post", "created_at" FROM `cassandra_items`;--> statement-breakpoint
DROP TABLE `cassandra_items`;--> statement-breakpoint
ALTER TABLE `__new_cassandra_items` RENAME TO `cassandra_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;