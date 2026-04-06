-- Seed forum_topics with the initial set of topics.
-- These were previously hardcoded in src/lib/community/topics.ts.
INSERT INTO public.forum_topics (slug, name, description, sort_order) VALUES
  ('trip-reports', 'Trip Reports', 'Share your dive adventures and trip experiences from around the world.', 1),
  ('underwater-filmmaking-photography', 'Underwater Filmmaking & Photography', 'Techniques, critiques, and inspiration for shooting beneath the surface.', 2),
  ('gear-talk', 'Gear Talk', 'Discuss cameras, housings, lights, fins, and everything in between.', 3),
  ('marine-life', 'Marine Life', 'Identify species, share sightings, and discuss ocean conservation.', 4),
  ('freediving', 'Freediving', 'Training tips, breath-hold techniques, and freediving stories.', 5),
  ('beginner-questions', 'Beginner Questions', 'New to diving or underwater content creation? Ask anything here.', 6)
ON CONFLICT (slug) DO NOTHING;
