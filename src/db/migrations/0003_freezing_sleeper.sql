CREATE TABLE `research_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`markets_json` text NOT NULL,
	`headlines_json` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL
);
