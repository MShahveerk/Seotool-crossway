-- Granular module permissions on users (Search Console, SEO, Social, Blogs)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "module_permissions" JSONB;
