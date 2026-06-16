CREATE TABLE `kpi_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`log_date` integer NOT NULL,
	`metrics_json` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kpi_weekly` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` integer NOT NULL,
	`totals_json` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL
);
