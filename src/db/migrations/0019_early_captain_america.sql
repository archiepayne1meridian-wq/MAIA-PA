CREATE TABLE `mercury_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`medium` text NOT NULL,
	`description` text NOT NULL,
	`system_prompt_addition` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
