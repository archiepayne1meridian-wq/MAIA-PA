CREATE TABLE `mercury_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`tab` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
