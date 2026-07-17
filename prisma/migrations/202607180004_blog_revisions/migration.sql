CREATE TABLE IF NOT EXISTS "blog_post_revisions" (
    "id" VARCHAR(191) NOT NULL,
    "blog_post_id" VARCHAR(191) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "actor_id" VARCHAR(191),
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_post_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "blog_post_revisions_post_created_idx" ON "blog_post_revisions"("blog_post_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blog_post_revisions_blog_post_id_fkey'
  ) THEN
    ALTER TABLE "blog_post_revisions" ADD CONSTRAINT "blog_post_revisions_blog_post_id_fkey"
      FOREIGN KEY ("blog_post_id") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blog_post_revisions_actor_id_fkey'
  ) THEN
    ALTER TABLE "blog_post_revisions" ADD CONSTRAINT "blog_post_revisions_actor_id_fkey"
      FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
