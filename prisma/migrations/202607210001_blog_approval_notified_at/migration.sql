-- Track when approval notification emails were sent for a blog post,
-- so pulls can notify exactly once for blogs already in the queue.
ALTER TABLE `blog_posts` ADD COLUMN `approval_notified_at` DATETIME(3) NULL;
