CREATE TABLE `iris_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`draft_post_id` text,
	`created_at` integer NOT NULL
);
