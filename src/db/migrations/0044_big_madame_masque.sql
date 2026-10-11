CREATE TABLE `nexus_import_log` (
	`id` text PRIMARY KEY NOT NULL,
	`added` integer NOT NULL,
	`skipped` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
