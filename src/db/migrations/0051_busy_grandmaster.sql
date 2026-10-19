CREATE TABLE `map_companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'company' NOT NULL,
	`sector` text,
	`employees_est` integer,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`area` text,
	`hq_location` text,
	`swiss_offices` text,
	`office_type` text DEFAULT 'office' NOT NULL,
	`ai_summary` text,
	`ai_summary_updated_at` integer,
	`prospect_priority` text DEFAULT 'normal' NOT NULL,
	`avoid_reason` text,
	`cassandra_notes` text,
	`cassandra_updated_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `company_name` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `prospect_nationality` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `lead_source` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `rapport_notes` text;