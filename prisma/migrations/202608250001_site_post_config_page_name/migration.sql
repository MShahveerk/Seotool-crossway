-- Keep Graph page titles so Meta projects stay visible after a failed live lookup.
ALTER TABLE `site_post_configs`
  ADD COLUMN `page_name` VARCHAR(255) NULL;
