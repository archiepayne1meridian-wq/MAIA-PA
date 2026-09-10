CREATE TABLE `hermes_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`angle` text,
	`opener` text NOT NULL,
	`fact_find_questions` text NOT NULL,
	`enlarge_points` text NOT NULL,
	`disturb_points` text NOT NULL,
	`product_pathway` text NOT NULL,
	`product_questions` text NOT NULL,
	`close_script` text NOT NULL,
	`soft_landing` text NOT NULL,
	`objections` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
