CREATE TABLE `visualizer_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`underlying_asset` text NOT NULL,
	`autocall_barrier` real NOT NULL,
	`coupon_barrier` real NOT NULL,
	`capital_protection` real NOT NULL,
	`coupon_rate` real NOT NULL,
	`term_years` integer NOT NULL,
	`observation_frequency` text NOT NULL,
	`investment_amount` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
