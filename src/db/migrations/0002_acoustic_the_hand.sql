CREATE TABLE `holdings` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`name` text,
	`quantity` real NOT NULL,
	`avg_cost` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolio_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`taken_at` integer NOT NULL,
	`base_currency` text DEFAULT 'GBP' NOT NULL,
	`total_value` real NOT NULL,
	`total_cost` real NOT NULL,
	`day_change` real NOT NULL,
	`holdings_json` text NOT NULL
);
