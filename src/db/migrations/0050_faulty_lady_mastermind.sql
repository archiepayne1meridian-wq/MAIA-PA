CREATE TABLE `maia_reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
