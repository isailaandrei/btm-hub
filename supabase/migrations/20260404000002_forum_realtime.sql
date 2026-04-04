-- Enable Realtime for forum tables (for live thread updates)
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."forum_posts";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."forum_threads";
