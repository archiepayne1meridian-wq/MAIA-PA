CREATE TABLE `watchlist` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_symbol_unique` ON `watchlist` (`symbol`);