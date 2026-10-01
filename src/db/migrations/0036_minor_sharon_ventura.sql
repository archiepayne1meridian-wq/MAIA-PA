CREATE TABLE `maia_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent` text NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`last_updated` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maia_conversations_agent_unique` ON `maia_conversations` (`agent`);--> statement-breakpoint
CREATE TABLE `maia_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_text` text NOT NULL,
	`goal_type` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `maia_goals` (`id`, `goal_text`, `goal_type`, `sort_order`) VALUES
('877de1cd-d5a5-46b8-8742-c77f6c01fc45', 'Book 10 meetings every week', 'short_term', 0),
('100fa507-3752-4953-a2fa-0755c35d358f', 'Post on LinkedIn every day', 'short_term', 1),
('e6bb68a6-b552-4367-b026-eb66d04fecdd', 'Wake up at 5am every day', 'short_term', 2),
('c6c9dbdd-0f6c-4f61-a1de-8d6b06577c77', 'Pass R01', 'short_term', 3),
('122bb57a-8cae-4777-9121-10a860d7ca79', 'Never let anyone swerve a meeting', 'short_term', 4),
('ac44f9e5-9cca-4f95-9b80-f553fa4f73d5', '£100k of business in a year', 'short_term', 5),
('1d80608d-20f5-4f7c-9d05-3241cba50886', 'Best BDA in the company', 'long_term', 0),
('a69e501d-e0e1-4e59-96ef-f7e15843b553', 'Step up to adviser', 'long_term', 1),
('40363e0d-7c4f-4898-915d-efb23b3fbcdf', 'Buy an Aston Martin 🏎', 'long_term', 2);
