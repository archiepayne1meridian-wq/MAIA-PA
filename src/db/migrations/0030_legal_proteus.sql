CREATE TABLE `oracle_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`prospect_name` text,
	`current_employer` text,
	`current_role` text,
	`current_location` text,
	`raw_linkedin_text` text,
	`analysis_json` text NOT NULL,
	`muse_case_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
