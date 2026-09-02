CREATE TABLE `hermes_script` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`personas_json` text,
	`shared_json` text,
	`objections_json` text,
	`updated_at` integer DEFAULT (unixepoch())
);
