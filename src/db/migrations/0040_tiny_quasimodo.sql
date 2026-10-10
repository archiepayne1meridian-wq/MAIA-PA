CREATE TABLE `nexus_prospects` (
	`id` text PRIMARY KEY NOT NULL,
	`last_name` text,
	`first_name` text,
	`company` text,
	`job_role` text,
	`employment_status` text DEFAULT 'Employee' NOT NULL,
	`lead_channel` text DEFAULT 'Cold - LinkedIn' NOT NULL,
	`country` text DEFAULT 'Switzerland' NOT NULL,
	`linkedin_url` text,
	`wash_result` text,
	`batch` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
