-- Create trigger for auto-creating profiles (not captured by db pull since it's on auth schema)
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Test user (regular member)
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  role, aud, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  is_sso_user, is_anonymous
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '00000000-0000-0000-0000-000000000000',
  'test@btmhub.com',
  extensions.crypt('TestPass123', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"display_name": "Test User"}'::jsonb,
  now(), now(),
  'authenticated', 'authenticated', '', '',
  '', '', '',
  false, false
);

-- Admin user
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  role, aud, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  is_sso_user, is_anonymous
) VALUES (
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  '00000000-0000-0000-0000-000000000000',
  'admin@btmhub.com',
  extensions.crypt('AdminPass123', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"display_name": "Admin User"}'::jsonb,
  now(), now(),
  'authenticated', 'authenticated', '', '',
  '', '', '',
  false, false
);

-- Set admin role (profile was auto-created by trigger)
UPDATE public.profiles SET role = 'admin' WHERE id = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

-- Community mock users
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  role, aud, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  is_sso_user, is_anonymous
) VALUES
  ('c3d4e5f6-a7b8-9012-cdef-234567890123', '00000000-0000-0000-0000-000000000000', 'sarah@btmhub.com', extensions.crypt('TestPass123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Sarah Chen"}'::jsonb, now() - interval '30 days', now(), 'authenticated', 'authenticated', '', '', '', '', '', false, false),
  ('d4e5f6a7-b8c9-0123-defa-345678901234', '00000000-0000-0000-0000-000000000000', 'marco@btmhub.com', extensions.crypt('TestPass123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Marco Rivera"}'::jsonb, now() - interval '25 days', now(), 'authenticated', 'authenticated', '', '', '', '', '', false, false),
  ('e5f6a7b8-c9d0-1234-efab-456789012345', '00000000-0000-0000-0000-000000000000', 'emma@btmhub.com', extensions.crypt('TestPass123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Emma Thompson"}'::jsonb, now() - interval '20 days', now(), 'authenticated', 'authenticated', '', '', '', '', '', false, false),
  ('f6a7b8c9-d0e1-2345-fabc-567890123456', '00000000-0000-0000-0000-000000000000', 'jake@btmhub.com', extensions.crypt('TestPass123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Jake Miller"}'::jsonb, now() - interval '15 days', now(), 'authenticated', 'authenticated', '', '', '', '', '', false, false),
  ('a7b8c9d0-e1f2-3456-abcd-678901234567', '00000000-0000-0000-0000-000000000000', 'aisha@btmhub.com', extensions.crypt('TestPass123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Aisha Patel"}'::jsonb, now() - interval '10 days', now(), 'authenticated', 'authenticated', '', '', '', '', '', false, false);

-- Create an identity for each user (required for email/password login)
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at
) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', '{"sub":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","email":"test@btmhub.com"}'::jsonb, 'email', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', now(), now(), now()),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', '{"sub":"b2c3d4e5-f6a7-8901-bcde-f12345678901","email":"admin@btmhub.com"}'::jsonb, 'email', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', now(), now(), now()),
  ('c3d4e5f6-a7b8-9012-cdef-234567890123', 'c3d4e5f6-a7b8-9012-cdef-234567890123', '{"sub":"c3d4e5f6-a7b8-9012-cdef-234567890123","email":"sarah@btmhub.com"}'::jsonb, 'email', 'c3d4e5f6-a7b8-9012-cdef-234567890123', now(), now(), now()),
  ('d4e5f6a7-b8c9-0123-defa-345678901234', 'd4e5f6a7-b8c9-0123-defa-345678901234', '{"sub":"d4e5f6a7-b8c9-0123-defa-345678901234","email":"marco@btmhub.com"}'::jsonb, 'email', 'd4e5f6a7-b8c9-0123-defa-345678901234', now(), now(), now()),
  ('e5f6a7b8-c9d0-1234-efab-456789012345', 'e5f6a7b8-c9d0-1234-efab-456789012345', '{"sub":"e5f6a7b8-c9d0-1234-efab-456789012345","email":"emma@btmhub.com"}'::jsonb, 'email', 'e5f6a7b8-c9d0-1234-efab-456789012345', now(), now(), now()),
  ('f6a7b8c9-d0e1-2345-fabc-567890123456', 'f6a7b8c9-d0e1-2345-fabc-567890123456', '{"sub":"f6a7b8c9-d0e1-2345-fabc-567890123456","email":"jake@btmhub.com"}'::jsonb, 'email', 'f6a7b8c9-d0e1-2345-fabc-567890123456', now(), now(), now()),
  ('a7b8c9d0-e1f2-3456-abcd-678901234567', 'a7b8c9d0-e1f2-3456-abcd-678901234567', '{"sub":"a7b8c9d0-e1f2-3456-abcd-678901234567","email":"aisha@btmhub.com"}'::jsonb, 'email', 'a7b8c9d0-e1f2-3456-abcd-678901234567', now(), now(), now());

-- Update display names for community users (trigger sets them from raw_user_meta_data)
UPDATE public.profiles SET display_name = 'Sarah Chen', bio = 'Underwater photographer based in Bali. 500+ dives.' WHERE id = 'c3d4e5f6-a7b8-9012-cdef-234567890123';
UPDATE public.profiles SET display_name = 'Marco Rivera', bio = 'Freediver and spearfisher. Depth PB: 62m.' WHERE id = 'd4e5f6a7-b8c9-0123-defa-345678901234';
UPDATE public.profiles SET display_name = 'Emma Thompson', bio = 'Marine biologist studying coral reef ecosystems.' WHERE id = 'e5f6a7b8-c9d0-1234-efab-456789012345';
UPDATE public.profiles SET display_name = 'Jake Miller', bio = 'Gear nerd. If it goes underwater, I''ve tested it.' WHERE id = 'f6a7b8c9-d0e1-2345-fabc-567890123456';
UPDATE public.profiles SET display_name = 'Aisha Patel', bio = 'Travel diver exploring the world''s best dive sites.' WHERE id = 'a7b8c9d0-e1f2-3456-abcd-678901234567';

-- =========================================================================
-- Community seed data: topics, threads, posts, replies, likes, mentions
-- =========================================================================

-- Forum topics (must exist before threads due to FK constraint)
INSERT INTO public.forum_topics (slug, name, description, sort_order) VALUES
  ('trip-reports', 'Trip Reports', 'Share your dive adventures and trip experiences from around the world.', 1),
  ('underwater-filmmaking-photography', 'Underwater Filmmaking & Photography', 'Techniques, critiques, and inspiration for shooting beneath the surface.', 2),
  ('gear-talk', 'Gear Talk', 'Discuss cameras, housings, lights, fins, and everything in between.', 3),
  ('marine-life', 'Marine Life', 'Identify species, share sightings, and discuss ocean conservation.', 4),
  ('freediving', 'Freediving', 'Training tips, breath-hold techniques, and freediving stories.', 5),
  ('beginner-questions', 'Beginner Questions', 'New to diving or underwater content creation? Ask anything here.', 6)
ON CONFLICT (slug) DO NOTHING;

-- Thread 1: Pinned post by admin (HTML, topic: beginner-questions)
INSERT INTO public.forum_threads (id, author_id, topic, title, slug, pinned, created_at, updated_at, last_reply_at)
VALUES ('10000000-0000-4000-a000-000000000001', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'beginner-questions', 'Welcome to the BTM Community!', 'welcome-to-btm-community', true, now() - interval '28 days', now() - interval '28 days', now() - interval '1 day');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
'<h2>Welcome!</h2><p>Hey everyone, welcome to the <strong>BTM Hub community</strong>. This is your space to share stories, ask questions, and connect with fellow ocean lovers.</p><p>A few ground rules:</p><ul><li>Be respectful and supportive</li><li>Share your experiences — trip reports, gear reviews, photos</li><li>Use <strong>@mentions</strong> to tag people in conversations</li><li>Use topic tags to help others find your posts</li></ul><p>Dive in!</p>',
'html', true, now() - interval '28 days', now() - interval '28 days');

-- Reply to thread 1 by Sarah
INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'c3d4e5f6-a7b8-9012-cdef-234567890123',
'<p>Thanks for setting this up! Excited to be here. Looking forward to sharing some of my recent shots from Raja Ampat 📸</p>',
'html', false, now() - interval '27 days', now() - interval '27 days');

-- Reply to thread 1 by Marco
INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', 'd4e5f6a7-b8c9-0123-defa-345678901234',
'<p>Great initiative! <span data-type="mention" data-id="b2c3d4e5-f6a7-8901-bcde-f12345678901" data-label="Admin User">@Admin User</span> — will there be a freediving-specific section?</p>',
'html', false, now() - interval '26 days', now() - interval '26 days');

-- Reply by admin
INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000001', 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
'<p><span data-type="mention" data-id="d4e5f6a7-b8c9-0123-defa-345678901234" data-label="Marco Rivera">@Marco Rivera</span> absolutely! Just use the "Freediving" topic tag when posting. We''re keeping it all in one feed so nothing gets buried.</p>',
'html', false, now() - interval '25 days', now() - interval '25 days');

-- Reply by Aisha (late joiner)
INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000001', 'a7b8c9d0-e1f2-3456-abcd-678901234567',
'<p>Just joined — stoked to find a community like this! Been diving for 3 years now, mostly in Southeast Asia.</p>',
'html', false, now() - interval '1 day', now() - interval '1 day');

-- Thread 2: Sarah's trip report (HTML, topic: trip-reports)
INSERT INTO public.forum_threads (id, author_id, topic, title, slug, created_at, updated_at, last_reply_at)
VALUES ('10000000-0000-4000-a000-000000000002', 'c3d4e5f6-a7b8-9012-cdef-234567890123', 'trip-reports', 'Raja Ampat — 10 Days of Pure Magic', 'raja-ampat-10-days-of-pure-magic', now() - interval '20 days', now() - interval '20 days', now() - interval '5 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000010', '10000000-0000-4000-a000-000000000002', 'c3d4e5f6-a7b8-9012-cdef-234567890123',
'<h2>Raja Ampat Trip Report</h2><p>Just got back from 10 incredible days in <strong>Raja Ampat</strong>, and I''m still processing it all. The biodiversity there is unlike anything I''ve ever seen.</p><h3>Highlights</h3><ul><li><strong>Manta Sandy</strong> — 6 mantas circling at once. I nearly forgot to breathe.</li><li><strong>Cape Kri</strong> — counted 300+ species on a single dive. The density is unreal.</li><li><strong>Arborek Jetty</strong> — night dive with walking sharks right under the pier.</li></ul><blockquote><p>If you haven''t been to Raja Ampat yet, make it your next trip. Seriously.</p></blockquote><p>Happy to answer any questions about logistics, liveaboard vs. homestay, gear I brought, etc. <span data-type="mention" data-id="f6a7b8c9-d0e1-2345-fabc-567890123456" data-label="Jake Miller">@Jake Miller</span> — I finally tested that housing you recommended!</p>',
'html', true, now() - interval '20 days', now() - interval '20 days');

-- Replies to thread 2
INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000011', '10000000-0000-4000-a000-000000000002', 'f6a7b8c9-d0e1-2345-fabc-567890123456',
'<p>YES! How did the housing hold up? I''ve been recommending it to everyone but haven''t taken it below 30m myself. Those manta shots must be incredible.</p>',
'html', false, now() - interval '19 days', now() - interval '19 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000012', '10000000-0000-4000-a000-000000000002', 'c3d4e5f6-a7b8-9012-cdef-234567890123',
'<p><span data-type="mention" data-id="f6a7b8c9-d0e1-2345-fabc-567890123456" data-label="Jake Miller">@Jake Miller</span> it was flawless down to 35m. No fogging issues at all. The port seals are solid. I''ll post a full gear review separately.</p>',
'html', false, now() - interval '18 days', now() - interval '18 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000013', '10000000-0000-4000-a000-000000000002', 'e5f6a7b8-c9d0-1234-efab-456789012345',
'<p>Amazing report! I was at Cape Kri last year for research. The species count there is well-documented — it holds the world record at 374 species on a single dive. <span data-type="mention" data-id="c3d4e5f6-a7b8-9012-cdef-234567890123" data-label="Sarah Chen">@Sarah Chen</span> did you notice any coral bleaching compared to previous years?</p>',
'html', false, now() - interval '15 days', now() - interval '15 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000014', '10000000-0000-4000-a000-000000000002', 'a7b8c9d0-e1f2-3456-abcd-678901234567',
'<p>This is making me want to book flights right now. How much did the whole trip cost roughly? And did you go liveaboard or homestay?</p>',
'html', false, now() - interval '5 days', now() - interval '5 days');

-- Thread 3: Marco's freediving post (HTML, topic: freediving)
INSERT INTO public.forum_threads (id, author_id, topic, title, slug, created_at, updated_at, last_reply_at)
VALUES ('10000000-0000-4000-a000-000000000003', 'd4e5f6a7-b8c9-0123-defa-345678901234', 'freediving', 'Hit my 60m depth PB — here is what changed', 'hit-my-60m-depth-pb', now() - interval '14 days', now() - interval '14 days', now() - interval '7 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000020', '10000000-0000-4000-a000-000000000003', 'd4e5f6a7-b8c9-0123-defa-345678901234',
'<p>After months stuck at 52m, I finally broke through to <strong>60m CWT</strong> last week. Here''s what made the difference:</p><h3>The Mental Game</h3><p>I was doing everything right physically — diaphragm stretches, FRC dives, CO2 tables. But my mind kept hitting a wall around 50m. The urge to turn was overwhelming.</p><p>What changed: I started <strong>visualization sessions</strong> every morning. 10 minutes, eyes closed, mentally rehearsing the entire dive. Freefall, equalization at depth, the turn. Over and over.</p><h3>Equalization Fix</h3><p>Switched from Frenzel to <strong>mouthfill</strong> earlier in the dive (starting at 25m instead of 35m). Game changer. No more failed equalizations at depth.</p><h3>The Dive</h3><p>60m clean. Surfaced with a smile. No samba, no blackout. SP was great.</p><p>If you''re stuck on a plateau, I really recommend the mental training side. It''s underrated.</p>',
'html', true, now() - interval '14 days', now() - interval '14 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000021', '10000000-0000-4000-a000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
'<p>Congrats! The mental game is so real. I''ve been stuck at 35m for months. How long were your visualization sessions before you saw results?</p>',
'html', false, now() - interval '13 days', now() - interval '13 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000022', '10000000-0000-4000-a000-000000000003', 'd4e5f6a7-b8c9-0123-defa-345678901234',
'<p><span data-type="mention" data-id="a1b2c3d4-e5f6-7890-abcd-ef1234567890" data-label="Test User">@Test User</span> about 3 weeks of daily practice before the mental shift happened. It felt silly at first, but then one day during a dive I just... wasn''t scared anymore. The depth felt familiar.</p>',
'html', false, now() - interval '12 days', now() - interval '12 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000023', '10000000-0000-4000-a000-000000000003', 'e5f6a7b8-c9d0-1234-efab-456789012345',
'<p>From a physiological perspective, this makes total sense. Visualization activates the same neural pathways as actual practice. There''s solid research backing this for athletes. Great job <span data-type="mention" data-id="d4e5f6a7-b8c9-0123-defa-345678901234" data-label="Marco Rivera">@Marco Rivera</span>!</p>',
'html', false, now() - interval '7 days', now() - interval '7 days');

-- Thread 4: Jake's gear review (HTML, topic: gear-talk)
INSERT INTO public.forum_threads (id, author_id, topic, title, slug, created_at, updated_at, last_reply_at)
VALUES ('10000000-0000-4000-a000-000000000004', 'f6a7b8c9-d0e1-2345-fabc-567890123456', 'gear-talk', 'Nauticam NA-A7RV vs Ikelite A7RV — honest comparison', 'nauticam-vs-ikelite-a7rv-comparison', now() - interval '10 days', now() - interval '10 days', now() - interval '3 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000030', '10000000-0000-4000-a000-000000000004', 'f6a7b8c9-d0e1-2345-fabc-567890123456',
'<p>I''ve had both housings for 6 months now. Here''s my honest take:</p><h3>Nauticam NA-A7RV</h3><ul><li><strong>Build:</strong> Incredible. Machined aluminum, everything feels premium.</li><li><strong>Ergonomics:</strong> Best in class. Every button is where you''d expect it.</li><li><strong>Port system:</strong> The N120 system is the industry standard for a reason.</li><li><strong>Price:</strong> $$$$$. The housing alone is more than most people''s entire setup.</li></ul><h3>Ikelite A7RV</h3><ul><li><strong>Build:</strong> Clear polycarbonate. You can see inside — actually useful for spotting leaks.</li><li><strong>Ergonomics:</strong> Good, not great. Some buttons require a reach.</li><li><strong>Port system:</strong> Solid but fewer third-party options.</li><li><strong>Price:</strong> $$. Roughly 1/3 the cost of Nauticam.</li></ul><h3>Verdict</h3><p>If money is no object, Nauticam wins. But the Ikelite is <em>90% as good</em> at a fraction of the price. For most recreational shooters, I''d recommend the Ikelite.</p><p><span data-type="mention" data-id="c3d4e5f6-a7b8-9012-cdef-234567890123" data-label="Sarah Chen">@Sarah Chen</span> this is the housing I was telling you about.</p>',
'html', true, now() - interval '10 days', now() - interval '10 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000031', '10000000-0000-4000-a000-000000000004', 'c3d4e5f6-a7b8-9012-cdef-234567890123',
'<p>Great comparison <span data-type="mention" data-id="f6a7b8c9-d0e1-2345-fabc-567890123456" data-label="Jake Miller">@Jake Miller</span>! I ended up going with the Nauticam and I agree it''s worth it if you''re shooting professionally. But for anyone starting out, don''t let gear hold you back — the Ikelite produces amazing results.</p>',
'html', false, now() - interval '9 days', now() - interval '9 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000032', '10000000-0000-4000-a000-000000000004', 'a7b8c9d0-e1f2-3456-abcd-678901234567',
'<p>This is exactly what I needed. I''ve been going back and forth for weeks. Going with the Ikelite — saving the difference for a dive trip!</p>',
'html', false, now() - interval '3 days', now() - interval '3 days');

-- Thread 5: Emma's marine life post (HTML, topic: marine-life)
INSERT INTO public.forum_threads (id, author_id, topic, title, slug, created_at, updated_at, last_reply_at)
VALUES ('10000000-0000-4000-a000-000000000005', 'e5f6a7b8-c9d0-1234-efab-456789012345', 'marine-life', 'Spotted a blue-ringed octopus in Lembeh — here is what to know', 'blue-ringed-octopus-lembeh', now() - interval '8 days', now() - interval '8 days', now() - interval '2 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000040', '10000000-0000-4000-a000-000000000005', 'e5f6a7b8-c9d0-1234-efab-456789012345',
'<p>Spotted a <strong>blue-ringed octopus</strong> during a muck dive in Lembeh Strait last week. Always a thrilling find, but here''s what every diver should know:</p><h3>Key Facts</h3><ul><li>One of the <strong>most venomous marine animals</strong> in the world</li><li>Venom contains tetrodotoxin — same toxin as pufferfish</li><li>They''re tiny — usually only 5-8cm across</li><li>The blue rings only appear when the animal is <strong>stressed or threatened</strong></li></ul><h3>Safety Rules</h3><ol><li><strong>Never touch them.</strong> This should go without saying, but I''ve seen divers try to pick them up for photos.</li><li>Keep a safe distance — at least 30cm.</li><li>Don''t use your pointer stick to poke at them.</li><li>If bitten, seek medical attention <em>immediately</em>. CPR may be needed as the venom can cause respiratory failure.</li></ol><p>They''re beautiful creatures and an incredible find on any dive. Just respect their space.</p>',
'html', true, now() - interval '8 days', now() - interval '8 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000041', '10000000-0000-4000-a000-000000000005', 'd4e5f6a7-b8c9-0123-defa-345678901234',
'<p>I saw a divemaster in the Philippines literally pick one up to show tourists once. Absolute madness. Thanks for posting this <span data-type="mention" data-id="e5f6a7b8-c9d0-1234-efab-456789012345" data-label="Emma Thompson">@Emma Thompson</span>. Important stuff.</p>',
'html', false, now() - interval '7 days', now() - interval '7 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000042', '10000000-0000-4000-a000-000000000005', 'c3d4e5f6-a7b8-9012-cdef-234567890123',
'<p>Incredible find! They''re so photogenic but definitely one to shoot with a long macro lens. Was it out in the open or hiding in a shell?</p>',
'html', false, now() - interval '6 days', now() - interval '6 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000043', '10000000-0000-4000-a000-000000000005', 'e5f6a7b8-c9d0-1234-efab-456789012345',
'<p><span data-type="mention" data-id="c3d4e5f6-a7b8-9012-cdef-234567890123" data-label="Sarah Chen">@Sarah Chen</span> it was tucked inside a coconut shell! Classic Lembeh muck diving find. Took about 20 minutes to get a good shot without disturbing it.</p>',
'html', false, now() - interval '5 days', now() - interval '5 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000044', '10000000-0000-4000-a000-000000000005', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
'<p>Scary but cool. How deep was it? I''m doing my AOW cert soon and Lembeh is on my list.</p>',
'html', false, now() - interval '2 days', now() - interval '2 days');

-- Thread 6: Aisha's no-topic post (HTML, no topic tag)
INSERT INTO public.forum_threads (id, author_id, topic, title, slug, created_at, updated_at, last_reply_at)
VALUES ('10000000-0000-4000-a000-000000000006', 'a7b8c9d0-e1f2-3456-abcd-678901234567', NULL, 'What got you into diving?', 'what-got-you-into-diving', now() - interval '4 days', now() - interval '4 days', now() - interval '6 hours');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000050', '10000000-0000-4000-a000-000000000006', 'a7b8c9d0-e1f2-3456-abcd-678901234567',
'<p>Simple question — <strong>what got you into diving?</strong></p><p>For me, it was snorkeling in the Maldives when I was 12. Saw a sea turtle for the first time and thought: <em>"I need to go deeper."</em> Got certified at 18 and never looked back.</p><p>What''s your origin story?</p>',
'html', true, now() - interval '4 days', now() - interval '4 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000051', '10000000-0000-4000-a000-000000000006', 'c3d4e5f6-a7b8-9012-cdef-234567890123',
'<p>My dad was a commercial diver. I grew up around regulators and BCDs. Did my first pool dive at 8, open water cert at 15. It was just... inevitable 😄</p>',
'html', false, now() - interval '3 days', now() - interval '3 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000052', '10000000-0000-4000-a000-000000000006', 'd4e5f6a7-b8c9-0123-defa-345678901234',
'<p>Freediving actually came first for me. I was a competitive swimmer and a friend took me spearfishing. The feeling of being weightless underwater with no gear, just you and the ocean — I was hooked. SCUBA came later when I wanted to explore deeper wrecks.</p>',
'html', false, now() - interval '2 days', now() - interval '2 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000053', '10000000-0000-4000-a000-000000000006', 'f6a7b8c9-d0e1-2345-fabc-567890123456',
'<p>Blue Planet documentary. David Attenborough made it look so magical that I booked a discover scuba dive the next week. Been addicted ever since. Now I spend more on dive gear than rent 😅</p>',
'html', false, now() - interval '1 day', now() - interval '1 day');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000054', '10000000-0000-4000-a000-000000000006', 'e5f6a7b8-c9d0-1234-efab-456789012345',
'<p>Marine biology degree. Started as work, became a passion. Now I can''t imagine a life that doesn''t involve being underwater regularly. <span data-type="mention" data-id="a7b8c9d0-e1f2-3456-abcd-678901234567" data-label="Aisha Patel">@Aisha Patel</span> love this question — it''s so cool seeing everyone''s different paths!</p>',
'html', false, now() - interval '6 hours', now() - interval '6 hours');

-- Thread 7: Legacy markdown post by Test User (markdown, topic: underwater-filmmaking-photography)
INSERT INTO public.forum_threads (id, author_id, topic, title, slug, created_at, updated_at, last_reply_at)
VALUES ('10000000-0000-4000-a000-000000000007', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'underwater-filmmaking-photography', 'Best settings for GoPro underwater?', 'best-settings-for-gopro-underwater', now() - interval '22 days', now() - interval '22 days', now() - interval '21 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000060', '10000000-0000-4000-a000-000000000007', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
'# GoPro Underwater Settings

I just got a GoPro Hero 13 and I''m taking it diving next week. What settings do you recommend?

Currently thinking:
- **4K @ 60fps** for video
- **SuperView** FOV for wide shots
- **Auto** white balance (or manual?)

Any tips on color correction in post? I''m using DaVinci Resolve.

Thanks in advance!',
'markdown', true, now() - interval '22 days', now() - interval '22 days');

INSERT INTO public.forum_posts (id, thread_id, author_id, body, body_format, is_op, created_at, updated_at)
VALUES ('20000000-0000-4000-a000-000000000061', '10000000-0000-4000-a000-000000000007', 'c3d4e5f6-a7b8-9012-cdef-234567890123',
'Solid starting point! A few tweaks:

1. Use **Linear** FOV instead of SuperView — less distortion on reef shots
2. Lock white balance to **5500K** — auto WB goes crazy with color shifts underwater
3. Shoot in **flat** color profile if available — gives you more latitude in Resolve
4. Bring a **red filter** if you''re diving deeper than 5m without lights

For Resolve, check out the "Underwater Color Correction" LUT pack by Divefilm — it''s free and a great starting point.',
'markdown', false, now() - interval '21 days', now() - interval '21 days');

-- =========================================================================
-- Update reply counts (trigger only fires on new inserts, not seed data)
-- =========================================================================
UPDATE public.forum_threads SET reply_count = 4 WHERE id = '10000000-0000-4000-a000-000000000001';
UPDATE public.forum_threads SET reply_count = 4 WHERE id = '10000000-0000-4000-a000-000000000002';
UPDATE public.forum_threads SET reply_count = 3 WHERE id = '10000000-0000-4000-a000-000000000003';
UPDATE public.forum_threads SET reply_count = 2 WHERE id = '10000000-0000-4000-a000-000000000004';
UPDATE public.forum_threads SET reply_count = 4 WHERE id = '10000000-0000-4000-a000-000000000005';
UPDATE public.forum_threads SET reply_count = 4 WHERE id = '10000000-0000-4000-a000-000000000006';
UPDATE public.forum_threads SET reply_count = 1 WHERE id = '10000000-0000-4000-a000-000000000007';

-- =========================================================================
-- Likes — spread across posts and replies
-- =========================================================================

-- Thread 1 (welcome post) — lots of likes on OP
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000001', 'c3d4e5f6-a7b8-9012-cdef-234567890123'),
  ('20000000-0000-4000-a000-000000000001', 'd4e5f6a7-b8c9-0123-defa-345678901234'),
  ('20000000-0000-4000-a000-000000000001', 'e5f6a7b8-c9d0-1234-efab-456789012345'),
  ('20000000-0000-4000-a000-000000000001', 'f6a7b8c9-d0e1-2345-fabc-567890123456'),
  ('20000000-0000-4000-a000-000000000001', 'a7b8c9d0-e1f2-3456-abcd-678901234567'),
  ('20000000-0000-4000-a000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

-- Likes on Sarah's Raja Ampat OP
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000010', 'd4e5f6a7-b8c9-0123-defa-345678901234'),
  ('20000000-0000-4000-a000-000000000010', 'e5f6a7b8-c9d0-1234-efab-456789012345'),
  ('20000000-0000-4000-a000-000000000010', 'f6a7b8c9-d0e1-2345-fabc-567890123456'),
  ('20000000-0000-4000-a000-000000000010', 'a7b8c9d0-e1f2-3456-abcd-678901234567'),
  ('20000000-0000-4000-a000-000000000010', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
  ('20000000-0000-4000-a000-000000000010', 'b2c3d4e5-f6a7-8901-bcde-f12345678901');

-- Likes on replies
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000013', 'c3d4e5f6-a7b8-9012-cdef-234567890123'),
  ('20000000-0000-4000-a000-000000000013', 'd4e5f6a7-b8c9-0123-defa-345678901234'),
  ('20000000-0000-4000-a000-000000000013', 'f6a7b8c9-d0e1-2345-fabc-567890123456');

-- Marco's freediving post — popular
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000020', 'c3d4e5f6-a7b8-9012-cdef-234567890123'),
  ('20000000-0000-4000-a000-000000000020', 'e5f6a7b8-c9d0-1234-efab-456789012345'),
  ('20000000-0000-4000-a000-000000000020', 'a7b8c9d0-e1f2-3456-abcd-678901234567'),
  ('20000000-0000-4000-a000-000000000020', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
  ('20000000-0000-4000-a000-000000000020', 'b2c3d4e5-f6a7-8901-bcde-f12345678901');

-- Emma's science reply liked
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000023', 'd4e5f6a7-b8c9-0123-defa-345678901234'),
  ('20000000-0000-4000-a000-000000000023', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

-- Jake's gear review
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000030', 'c3d4e5f6-a7b8-9012-cdef-234567890123'),
  ('20000000-0000-4000-a000-000000000030', 'a7b8c9d0-e1f2-3456-abcd-678901234567'),
  ('20000000-0000-4000-a000-000000000030', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
  ('20000000-0000-4000-a000-000000000030', 'd4e5f6a7-b8c9-0123-defa-345678901234');

-- Blue-ringed octopus post
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000040', 'c3d4e5f6-a7b8-9012-cdef-234567890123'),
  ('20000000-0000-4000-a000-000000000040', 'd4e5f6a7-b8c9-0123-defa-345678901234'),
  ('20000000-0000-4000-a000-000000000040', 'f6a7b8c9-d0e1-2345-fabc-567890123456'),
  ('20000000-0000-4000-a000-000000000040', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

-- Aisha's "what got you into diving" post
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000050', 'c3d4e5f6-a7b8-9012-cdef-234567890123'),
  ('20000000-0000-4000-a000-000000000050', 'e5f6a7b8-c9d0-1234-efab-456789012345'),
  ('20000000-0000-4000-a000-000000000050', 'f6a7b8c9-d0e1-2345-fabc-567890123456');

-- Likes on individual replies in "what got you into diving"
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000051', 'a7b8c9d0-e1f2-3456-abcd-678901234567'),
  ('20000000-0000-4000-a000-000000000051', 'd4e5f6a7-b8c9-0123-defa-345678901234'),
  ('20000000-0000-4000-a000-000000000052', 'c3d4e5f6-a7b8-9012-cdef-234567890123'),
  ('20000000-0000-4000-a000-000000000052', 'e5f6a7b8-c9d0-1234-efab-456789012345'),
  ('20000000-0000-4000-a000-000000000053', 'a7b8c9d0-e1f2-3456-abcd-678901234567'),
  ('20000000-0000-4000-a000-000000000053', 'c3d4e5f6-a7b8-9012-cdef-234567890123'),
  ('20000000-0000-4000-a000-000000000054', 'a7b8c9d0-e1f2-3456-abcd-678901234567'),
  ('20000000-0000-4000-a000-000000000054', 'd4e5f6a7-b8c9-0123-defa-345678901234'),
  ('20000000-0000-4000-a000-000000000054', 'f6a7b8c9-d0e1-2345-fabc-567890123456');

-- GoPro post likes
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000061', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
  ('20000000-0000-4000-a000-000000000061', 'f6a7b8c9-d0e1-2345-fabc-567890123456');

-- Marco's "scary divemaster" reply liked
INSERT INTO public.forum_likes (post_id, user_id) VALUES
  ('20000000-0000-4000-a000-000000000041', 'e5f6a7b8-c9d0-1234-efab-456789012345'),
  ('20000000-0000-4000-a000-000000000041', 'c3d4e5f6-a7b8-9012-cdef-234567890123'),
  ('20000000-0000-4000-a000-000000000041', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

-- =========================================================================
-- Fix reply_count (trigger blocks non-admin updates, no auth context in seed)
-- =========================================================================
ALTER TABLE public.forum_threads DISABLE TRIGGER forum_threads_restrict_update;

UPDATE public.forum_threads ft
SET reply_count = sub.cnt
FROM (
    SELECT thread_id, COUNT(*) AS cnt
    FROM public.forum_posts
    WHERE is_op = false
    GROUP BY thread_id
) sub
WHERE sub.thread_id = ft.id;

ALTER TABLE public.forum_threads ENABLE TRIGGER forum_threads_restrict_update;

-- =========================================================================
-- Direct Message seed data
-- =========================================================================

-- Conversation between Sarah (c3d4...) and Marco (d4e5...)
-- Sarah < Marco alphabetically by UUID, so Sarah = user1
INSERT INTO public.dm_conversations (id, user1_id, user2_id, last_message_at, created_at)
VALUES (
  '30000000-0000-4000-a000-000000000001',
  'c3d4e5f6-a7b8-9012-cdef-234567890123',
  'd4e5f6a7-b8c9-0123-defa-345678901234',
  now() - interval '1 hour',
  now() - interval '2 days'
);

-- Messages in the Sarah-Marco conversation
INSERT INTO public.dm_messages (id, conversation_id, sender_id, body, body_format, created_at, updated_at)
VALUES
  ('40000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'c3d4e5f6-a7b8-9012-cdef-234567890123',
   '<p>Hey Marco! Loved your freediving post. Have you been to Dahab?</p>', 'html', now() - interval '2 days', now() - interval '2 days'),
  ('40000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001', 'd4e5f6a7-b8c9-0123-defa-345678901234',
   '<p>Thanks Sarah! Not yet but it is on my list. The Blue Hole looks <strong>incredible</strong> for depth training.</p>', 'html', now() - interval '1 day', now() - interval '1 day'),
  ('40000000-0000-4000-a000-000000000003', '30000000-0000-4000-a000-000000000001', 'c3d4e5f6-a7b8-9012-cdef-234567890123',
   '<p>You should go! I can recommend some good guides there.</p>', 'html', now() - interval '1 hour', now() - interval '1 hour');

-- Conversation between Test User (a1b2...) and Emma (e5f6...)
-- a1b2 < e5f6 so Test User = user1
INSERT INTO public.dm_conversations (id, user1_id, user2_id, last_message_at, created_at)
VALUES (
  '30000000-0000-4000-a000-000000000002',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'e5f6a7b8-c9d0-1234-efab-456789012345',
  now() - interval '3 hours',
  now() - interval '1 day'
);

-- Messages in the Test User-Emma conversation
INSERT INTO public.dm_messages (id, conversation_id, sender_id, body, body_format, created_at, updated_at)
VALUES
  ('40000000-0000-4000-a000-000000000010', '30000000-0000-4000-a000-000000000002', 'e5f6a7b8-c9d0-1234-efab-456789012345',
   '<p>Hi! I saw your GoPro question. Want me to share some underwater settings presets?</p>', 'html', now() - interval '1 day', now() - interval '1 day'),
  ('40000000-0000-4000-a000-000000000011', '30000000-0000-4000-a000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   '<p>That would be amazing! Thank you so much.</p>', 'html', now() - interval '3 hours', now() - interval '3 hours');

-- Conversation between Test User (a1b2...) and Admin (b2c3...)
-- a1b2 < b2c3 so Test User = user1
INSERT INTO public.dm_conversations (id, user1_id, user2_id, last_message_at, created_at)
VALUES (
  '30000000-0000-4000-a000-000000000003',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  now() - interval '10 minutes',
  now() - interval '3 days'
);

-- Messages in the Test User-Admin conversation (longer back-and-forth)
INSERT INTO public.dm_messages (id, conversation_id, sender_id, body, body_format, created_at, updated_at)
VALUES
  ('40000000-0000-4000-a000-000000000020', '30000000-0000-4000-a000-000000000003', 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
   '<p>Hey! Welcome to the BTM community. Let me know if you have any questions about the platform.</p>', 'html', now() - interval '3 days', now() - interval '3 days'),
  ('40000000-0000-4000-a000-000000000021', '30000000-0000-4000-a000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   '<p>Thanks! I am really enjoying it so far. Quick question — how do I tag topics when creating a new thread?</p>', 'html', now() - interval '2 days 20 hours', now() - interval '2 days 20 hours'),
  ('40000000-0000-4000-a000-000000000022', '30000000-0000-4000-a000-000000000003', 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
   '<p>When you click <strong>New Post</strong>, there is a dropdown at the top where you can pick a channel. That acts as the topic tag.</p>', 'html', now() - interval '2 days 19 hours', now() - interval '2 days 19 hours'),
  ('40000000-0000-4000-a000-000000000023', '30000000-0000-4000-a000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   '<p>Got it, that makes sense. Also, is there a way to get notified when someone replies to my threads?</p>', 'html', now() - interval '2 days 18 hours', now() - interval '2 days 18 hours'),
  ('40000000-0000-4000-a000-000000000024', '30000000-0000-4000-a000-000000000003', 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
   '<p>Not yet — that is on our roadmap! For now, you can check back on your threads to see new replies. We will add notifications soon.</p>', 'html', now() - interval '2 days 17 hours', now() - interval '2 days 17 hours'),
  ('40000000-0000-4000-a000-000000000025', '30000000-0000-4000-a000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   '<p>No worries, looking forward to it! By the way, I just posted my first thread about GoPro settings. Would love some feedback.</p>', 'html', now() - interval '1 day', now() - interval '1 day'),
  ('40000000-0000-4000-a000-000000000026', '30000000-0000-4000-a000-000000000003', 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
   '<p>Just saw it — <strong>great first post!</strong> Sarah left a really helpful reply about white balance and color profiles. Definitely worth checking out.</p>', 'html', now() - interval '20 hours', now() - interval '20 hours'),
  ('40000000-0000-4000-a000-000000000027', '30000000-0000-4000-a000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   '<p>Yeah I saw that! Super useful. This community is awesome.</p>', 'html', now() - interval '18 hours', now() - interval '18 hours'),
  ('40000000-0000-4000-a000-000000000028', '30000000-0000-4000-a000-000000000003', 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
   '<p>Glad to hear it! Also, we are planning a group dive trip in Bali next month. Keep an eye on the Trip Reports channel for details.</p>', 'html', now() - interval '2 hours', now() - interval '2 hours'),
  ('40000000-0000-4000-a000-000000000029', '30000000-0000-4000-a000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   '<p>That sounds incredible! I have always wanted to dive in Bali. Count me in!</p>', 'html', now() - interval '10 minutes', now() - interval '10 minutes');

-- Read receipts: both users have read their conversations
INSERT INTO public.dm_read_receipts (conversation_id, user_id, last_read_at) VALUES
  ('30000000-0000-4000-a000-000000000001', 'c3d4e5f6-a7b8-9012-cdef-234567890123', now()),
  ('30000000-0000-4000-a000-000000000001', 'd4e5f6a7-b8c9-0123-defa-345678901234', now() - interval '2 hours'),
  ('30000000-0000-4000-a000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', now()),
  ('30000000-0000-4000-a000-000000000002', 'e5f6a7b8-c9d0-1234-efab-456789012345', now() - interval '4 hours'),
  ('30000000-0000-4000-a000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', now()),
  ('30000000-0000-4000-a000-000000000003', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', now() - interval '15 minutes');

-- =========================================================================
-- Academy applications (and their contacts) — representative fixtures
-- =========================================================================
--
-- 13 synthetic applications covering all 4 programs plus every edge case
-- that the Phase A form alignment + normalization migration needs to
-- exercise:
--   - Canonical values for every enum
--   - Legacy typos that the migration normalizes ("54+", "aproject",
--     "thats", and the referral_source split-array bug)
--   - Free-text "Other" values (filmmaking involvement_level, photography
--     physical_fitness, internship "24 years old") so the admin filter's
--     "Other" bucket has something to match
--   - Multi-select stored as both comma-joined strings (certification_level,
--     languages) and JSONB arrays (referral_source, content_created)
--   - Internship numeric ages, to exercise Phase B bucket matching later
--
-- Contacts are keyed 11111111-1111-1111-1111-000000000001..013; applications
-- use 22222222-2222-2222-2222-000000000001..013.

INSERT INTO public.contacts (id, email, name, phone) VALUES
  ('11111111-1111-1111-1111-000000000001', 'alice@example.com',   'Alice Sample',   '+10000000001'),
  ('11111111-1111-1111-1111-000000000002', 'bob@example.com',     'Bob Legacy',     '+10000000002'),
  ('11111111-1111-1111-1111-000000000003', 'charlie@example.com', 'Charlie Other',  '+10000000003'),
  ('11111111-1111-1111-1111-000000000004', 'diana@example.com',   'Diana Dual',     '+10000000004'),
  ('11111111-1111-1111-1111-000000000005', 'evan@example.com',    'Evan Clean',     '+10000000005'),
  ('11111111-1111-1111-1111-000000000006', 'fiona@example.com',   'Fiona Typo',     '+10000000006'),
  ('11111111-1111-1111-1111-000000000007', 'george@example.com',  'George Split',   '+10000000007'),
  ('11111111-1111-1111-1111-000000000008', 'helen@example.com',   'Helen Free',     '+10000000008'),
  ('11111111-1111-1111-1111-000000000009', 'ivan@example.com',    'Ivan Migrated',  '+10000000009'),
  ('11111111-1111-1111-1111-000000000010', 'julia@example.com',   'Julia SSI',      '+10000000010'),
  ('11111111-1111-1111-1111-000000000011', 'kyle@example.com',    'Kyle Intern',    '+10000000011'),
  ('11111111-1111-1111-1111-000000000012', 'luna@example.com',    'Luna Master',    '+10000000012'),
  ('11111111-1111-1111-1111-000000000013', 'mika@example.com',    'Mika Age',       '+10000000013');

-- Filmmaking — 4 rows
INSERT INTO public.applications (id, program, status, contact_id, answers, submitted_at) VALUES
  -- f1: fully canonical, BEGINNER, no typos, no Other
  ('22222222-2222-2222-2222-000000000001', 'filmmaking', 'reviewing',
   '11111111-1111-1111-1111-000000000001',
   jsonb_build_object(
     'first_name', 'Alice', 'last_name', 'Sample', 'nickname', 'Ali',
     'email', 'alice@example.com', 'phone', '+10000000001',
     'age', '25-34', 'gender', 'Female',
     'nationality', 'Portuguese', 'country_of_residence', 'Portugal',
     'languages', 'English, Spanish', 'current_occupation', 'Marine biologist',
     'physical_fitness', 'Excellent - Regular exercise, no health concerns',
     'health_conditions', 'No health conditions affecting diving',
     'diving_types', jsonb_build_array('Recreational Scuba diving', 'Freediving'),
     'certification_level', 'Open Water, Advanced Open Water',
     'number_of_dives', '51-250',
     'last_dive_date', '2026-03-10',
     'diving_environments', jsonb_build_array('Tropical Reefs', 'Cold water'),
     'buoyancy_skill', 7,
     'equipment_owned', jsonb_build_array('No equipment yet'),
     'filming_equipment', 'Nothing yet — starting fresh.',
     'planning_to_invest', 'Yes, within the near future',
     'years_experience', 'Less than 1 year',
     'skill_camera_settings', 3, 'skill_lighting', 2, 'skill_post_production', 2,
     'skill_color_correction', 1, 'skill_storytelling', 4, 'skill_drone', 1, 'skill_over_water', 2,
     'btm_category', 'BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)',
     'content_created', jsonb_build_array('None yet, excited to start'),
     'involvement_level', 'Hobby only',
     'online_presence', jsonb_build_array('Active social media'),
     'online_links', 'https://instagram.com/alice',
     'income_from_filming', 'No, that''s not my goal.',
     'primary_goal', 'Learn basics of underwater filming as a hobby',
     'secondary_goal', 'Improve content creation for social media',
     'learning_aspects', jsonb_build_array('Basic equipment setup and operation', 'Lighting techniques'),
     'content_to_create', jsonb_build_array('Personal/travel memories'),
     'learning_approach', jsonb_build_array('One-on-one mentorship'),
     'marine_subjects', jsonb_build_array('Coral reefs', 'Marine behavior'),
     'time_availability', '1 week to 10 days for a workshop, a project or individual training',
     'travel_willingness', 'Depends on duration and location',
     'budget', 'Moderate budget (1,000 - 3,000 €/USD)',
     'start_timeline', 'Within next 3 months',
     'ultimate_vision', 'Learn to tell stories with my underwater footage.',
     'inspiration_to_apply', 'Saw a BTM film on YouTube and fell in love with the style.',
     'referral_source', jsonb_build_array('Word of mouth'),
     'anything_else', ''
   ),
   now() - interval '14 days'),
  -- f2: LEGACY TYPOS — age "54+", time_availability "aproject", certification
  --     with Other text concatenated, referral_source split-array bug
  ('22222222-2222-2222-2222-000000000002', 'filmmaking', 'reviewing',
   '11111111-1111-1111-1111-000000000002',
   jsonb_build_object(
     'first_name', 'Bob', 'last_name', 'Legacy', 'nickname', 'Bobby',
     'email', 'bob@example.com', 'phone', '+10000000002',
     'age', '54+',
     'gender', 'Male',
     'nationality', 'German', 'country_of_residence', 'Germany',
     'languages', 'English, German',
     'current_occupation', 'Retired diver',
     'physical_fitness', 'Good - Moderately active, no major health concerns',
     'health_conditions', 'No health conditions affecting diving',
     'diving_types', jsonb_build_array('Recreational Scuba diving', 'Technical Scuba diving'),
     'certification_level', 'Divemaster, Technical Diving certification, Certified Freediver, please specify level below:, PFI INTERMEDIATE FREEDIVER',
     'number_of_dives', '250+',
     'last_dive_date', '2026-01-20',
     'diving_environments', jsonb_build_array('Cold water', 'Deep diving', 'Cave/Wreck diving'),
     'buoyancy_skill', 10,
     'equipment_owned', jsonb_build_array('Professional video camera', 'Lighting equipment'),
     'filming_equipment', 'Red camera with Nauticam housing, Keldan lights.',
     'planning_to_invest', 'No immediate plans',
     'years_experience', '5+ years',
     'skill_camera_settings', 9, 'skill_lighting', 8, 'skill_post_production', 7,
     'skill_color_correction', 7, 'skill_storytelling', 6, 'skill_drone', 5, 'skill_over_water', 6,
     'btm_category', 'INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)',
     'content_created', jsonb_build_array('Documentary style', 'Commercial work'),
     'involvement_level', 'Part-time professional',
     'online_presence', jsonb_build_array('Personal website', 'Client base'),
     'online_links', 'https://boblegacy.example.com',
     'income_from_filming', 'Occasionally (few projects per year)',
     'primary_goal', 'Enhance existing professional skills',
     'secondary_goal', 'Document marine conservation/research',
     'learning_aspects', jsonb_build_array('Post-production and editing', 'Business aspects of underwater filming'),
     'content_to_create', jsonb_build_array('Documentary style films', 'Conservation stories'),
     'learning_approach', jsonb_build_array('One-on-one mentorship'),
     'marine_subjects', jsonb_build_array('Big marine life (sharks, whales, etc.)'),
     'time_availability', '2-3 entire weeks at a time for a workshop, aproject or individual training',
     'travel_willingness', 'Yes, willing to travel internationally',
     'budget', 'Advanced budget (3,000 - 6,000 €/USD)',
     'start_timeline', 'Flexible/Not sure yet',
     'ultimate_vision', 'Tell stories that protect the reefs I love.',
     'inspiration_to_apply', 'Long-time fan of the Academy filmmakers.',
     'referral_source', '["Social Media (Instagram", "Facebook", "etc.)"]'::jsonb,
     'anything_else', ''
   ),
   now() - interval '40 days'),
  -- f3: free-text Other values — involvement_level custom text
  ('22222222-2222-2222-2222-000000000003', 'filmmaking', 'reviewing',
   '11111111-1111-1111-1111-000000000003',
   jsonb_build_object(
     'first_name', 'Charlie', 'last_name', 'Other',
     'email', 'charlie@example.com', 'phone', '+10000000003',
     'age', '35-44', 'gender', 'Non-binary',
     'nationality', 'French', 'country_of_residence', 'France',
     'languages', 'French, English',
     'current_occupation', 'Freelance filmmaker',
     'physical_fitness', 'Excellent - Regular exercise, no health concerns',
     'health_conditions', 'No health conditions affecting diving',
     'diving_types', jsonb_build_array('Recreational Scuba diving'),
     'certification_level', 'Advanced Open Water, Rescue Diver',
     'number_of_dives', '51-250', 'last_dive_date', '2026-02-15',
     'diving_environments', jsonb_build_array('Tropical Reefs'),
     'buoyancy_skill', 8,
     'equipment_owned', jsonb_build_array('DSLR/Mirrorless with housing'),
     'filming_equipment', 'Sony A7S III + Nauticam housing.',
     'planning_to_invest', 'Yes, within the next years',
     'years_experience', '3-5 years',
     'skill_camera_settings', 7, 'skill_lighting', 6, 'skill_post_production', 8,
     'skill_color_correction', 7, 'skill_storytelling', 7, 'skill_drone', 4, 'skill_over_water', 5,
     'btm_category', 'ASPIRING PROFESSIONAL (Part-time professional aiming for full-time career)',
     'content_created', jsonb_build_array('Social media content', 'Documentary style'),
     -- OTHER free-text value (not in the canonical INVOLVEMENT_LEVELS list)
     'involvement_level', 'just for me, because i hate "jobs". i just do what i like.',
     'online_presence', jsonb_build_array('Active social media'),
     'online_links', 'https://instagram.com/charlie',
     'income_from_filming', 'Regular part-time income',
     'primary_goal', 'Transform hobby into professional career',
     'secondary_goal', 'Improve content creation for social media',
     'learning_aspects', jsonb_build_array('Storytelling and content planning'),
     'content_to_create', jsonb_build_array('Documentary style films'),
     'learning_approach', jsonb_build_array('Mixed approach (combination of group and individual)'),
     'marine_subjects', jsonb_build_array('Big marine life (sharks, whales, etc.)'),
     'time_availability', '2-3 entire weeks at a time for a workshop, a project or individual training',
     'travel_willingness', 'Yes, willing to travel internationally',
     'budget', 'Small budget (under 1,000 €/USD)',
     'start_timeline', 'Ready to start immediately',
     'ultimate_vision', 'Make films nobody else is making.',
     'inspiration_to_apply', 'I want mentorship from working pros.',
     'referral_source', jsonb_build_array('Diving community'),
     'anything_else', ''
   ),
   now() - interval '7 days'),
  -- f4: OCEAN STEWARD, canonical values, large team category
  ('22222222-2222-2222-2222-000000000004', 'filmmaking', 'reviewing',
   '11111111-1111-1111-1111-000000000004',
   jsonb_build_object(
     'first_name', 'Diana', 'last_name', 'Dual',
     'email', 'diana@example.com', 'phone', '+10000000004',
     'age', '45-54', 'gender', 'Female',
     'nationality', 'American', 'country_of_residence', 'USA',
     'languages', 'English',
     'current_occupation', 'NGO director',
     'physical_fitness', 'Good - Moderately active, no major health concerns',
     'health_conditions', 'Yes, but cleared by doctor for diving',
     'diving_types', jsonb_build_array('Recreational Scuba diving', 'Freediving', 'Snorkeling'),
     'certification_level', 'Rescue Diver',
     'number_of_dives', '51-250', 'last_dive_date', '2026-03-01',
     'diving_environments', jsonb_build_array('Tropical Reefs', 'Cold water', 'Night diving'),
     'buoyancy_skill', 8,
     'equipment_owned', jsonb_build_array('Action camera (GoPro, Osmo, Insta360, etc)'),
     'filming_equipment', 'GoPro Hero 12, basic tray.',
     'planning_to_invest', 'Yes, within the near future',
     'years_experience', '1-3 years',
     'skill_camera_settings', 5, 'skill_lighting', 4, 'skill_post_production', 3,
     'skill_color_correction', 3, 'skill_storytelling', 7, 'skill_drone', 6, 'skill_over_water', 5,
     'btm_category', 'OCEAN STEWARD (NGO/scientific focus, conservation-driven)',
     'content_created', jsonb_build_array('Social media content', 'Scientific/Research documentation'),
     'involvement_level', 'Conservation/Scientific work',
     'online_presence', jsonb_build_array('Professional portfolio'),
     'online_links', 'https://dianadual.org',
     'income_from_filming', 'No, that''s not my goal.',
     'primary_goal', 'Document marine conservation/research',
     'secondary_goal', 'Improve content creation for social media',
     'learning_aspects', jsonb_build_array('Conservation documentation', 'Storytelling and content planning'),
     'content_to_create', jsonb_build_array('Conservation stories'),
     'learning_approach', jsonb_build_array('Group workshops (within a group of approx. 10 persons)'),
     'marine_subjects', jsonb_build_array('Coral reefs', 'Conservation stories'),
     'time_availability', '1 week to 10 days for a workshop, a project or individual training',
     'travel_willingness', 'Yes, willing to travel internationally',
     'budget', 'All-In budget (>12,000 €/USD)',
     'start_timeline', 'Within next 6 months',
     'ultimate_vision', 'Produce films that drive marine policy.',
     'inspiration_to_apply', 'Saw the BTM conservation series and knew this was the right fit.',
     'referral_source', jsonb_build_array('Conservation organisation'),
     'anything_else', ''
   ),
   now() - interval '22 days');

-- Photography — 3 rows
INSERT INTO public.applications (id, program, status, contact_id, answers, submitted_at) VALUES
  -- p5: canonical photography
  ('22222222-2222-2222-2222-000000000005', 'photography', 'reviewing',
   '11111111-1111-1111-1111-000000000005',
   jsonb_build_object(
     'first_name', 'Evan', 'last_name', 'Clean',
     'email', 'evan@example.com', 'phone', '+10000000005',
     'age', '25-34', 'gender', 'Male',
     'nationality', 'British', 'country_of_residence', 'UK',
     'languages', 'English, French',
     'current_occupation', 'Photographer',
     'physical_fitness', 'Excellent - Regular exercise, no health concerns',
     'health_conditions', 'No health conditions affecting diving',
     'diving_types', jsonb_build_array('Recreational Scuba diving'),
     'certification_level', 'Advanced Open Water',
     'number_of_dives', '51-250', 'last_dive_date', '2026-02-10',
     'diving_environments', jsonb_build_array('Tropical Reefs'),
     'buoyancy_skill', 7,
     'equipment_owned', jsonb_build_array('DSLR/Mirrorless with housing', 'Lighting equipment'),
     'photography_equipment', 'Canon R5 + Ikelite housing + dual Inon strobes.',
     'planning_to_invest', 'Yes, within the near future',
     'years_experience', '3-5 years',
     'skill_camera_settings', 8, 'skill_lighting', 7, 'skill_post_production', 7,
     'skill_color_correction', 7, 'skill_composition', 8, 'skill_drone', 3, 'skill_over_water', 6,
     'btm_category', 'DEDICATED ACHIEVER (Business-focused, seeking intensive mentorship)',
     'content_created', jsonb_build_array('Personal vacation photography', 'Social media content'),
     'involvement_level', 'Part-time professional',
     'online_presence', jsonb_build_array('Active social media', 'Personal website'),
     'online_links', 'https://evanclean.photo',
     'income_from_photography', 'Regular part-time income',
     'primary_goal', 'Transform hobby into professional career',
     'secondary_goal', 'Enhance existing professional skills',
     'learning_aspects', jsonb_build_array('Composition and content planning', 'Business aspects of underwater photography'),
     'content_to_create', jsonb_build_array('Documentary style photo series'),
     'learning_approach', jsonb_build_array('One-on-one mentorship'),
     'marine_subjects', jsonb_build_array('Macro subjects', 'Coral reefs'),
     'time_availability', '2-3 entire weeks at a time for a workshop, a project or individual training',
     'travel_willingness', 'Yes, willing to travel internationally',
     'budget', 'Professional budget (6,000 - 12,000 €/USD)',
     'start_timeline', 'Within next 3 months',
     'ultimate_vision', 'Go full-time in the next two years.',
     'inspiration_to_apply', 'The business mentorship track is exactly what I need.',
     'referral_source', jsonb_build_array('Word of mouth'),
     'anything_else', ''
   ),
   now() - interval '9 days'),
  -- p6: LEGACY TYPOS — age "54+", thats typo, aproject typo
  ('22222222-2222-2222-2222-000000000006', 'photography', 'reviewing',
   '11111111-1111-1111-1111-000000000006',
   jsonb_build_object(
     'first_name', 'Fiona', 'last_name', 'Typo',
     'email', 'fiona@example.com', 'phone', '+10000000006',
     'age', '54+',
     'gender', 'Female',
     'nationality', 'Australian', 'country_of_residence', 'Australia',
     'languages', 'English',
     'current_occupation', '',
     -- OTHER free-text value in physical_fitness
     'physical_fitness', 'VERY ACTIVE AND REGULAR EXERCISE.REMISSION FROM CANCER.',
     'health_conditions', 'Yes, but cleared by doctor for diving',
     'diving_types', jsonb_build_array('Recreational Scuba diving'),
     'certification_level', 'Open Water, Advanced Open Water, Certified Freediver, please specify level below:, SSI Free 20',
     'number_of_dives', '250+', 'last_dive_date', '2025-11-01',
     'diving_environments', jsonb_build_array('Tropical Reefs'),
     'buoyancy_skill', 9,
     'equipment_owned', jsonb_build_array('Professional photo/video camera'),
     'photography_equipment', 'Nikon Z9, Nauticam housing.',
     'planning_to_invest', 'No immediate plans',
     'years_experience', '5+ years',
     'skill_camera_settings', 9, 'skill_lighting', 9, 'skill_post_production', 8,
     'skill_color_correction', 8, 'skill_composition', 9, 'skill_drone', 2, 'skill_over_water', 7,
     'btm_category', 'INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)',
     'content_created', jsonb_build_array('Personal vacation photography', 'Documentary style'),
     'involvement_level', 'Hobby only',
     'online_presence', jsonb_build_array('Personal website'),
     'online_links', 'https://fionatypo.net',
     'income_from_photography', 'No, thats not my goal.',
     'primary_goal', 'Enhance existing professional skills',
     'secondary_goal', 'Learn basics of underwater photography as a hobby',
     'learning_aspects', jsonb_build_array('Composition and content planning'),
     'content_to_create', jsonb_build_array('Personal/travel memories'),
     'learning_approach', jsonb_build_array('Small group workshop (within a group of approx. 4 persons)'),
     'marine_subjects', jsonb_build_array('Coral reefs'),
     'time_availability', '2-3 entire weeks at a time for a workshop, aproject or individual training',
     'travel_willingness', 'Depends on duration and location',
     'budget', 'Moderate budget (1,000 - 3,000 €/USD)',
     'start_timeline', 'Flexible/Not sure yet',
     'ultimate_vision', 'Keep exploring reefs around the world.',
     'inspiration_to_apply', 'Post-treatment life goal.',
     'referral_source', jsonb_build_array('Online search'),
     'anything_else', ''
   ),
   now() - interval '55 days'),
  -- p7: referral_source split-array bug
  ('22222222-2222-2222-2222-000000000007', 'photography', 'reviewing',
   '11111111-1111-1111-1111-000000000007',
   jsonb_build_object(
     'first_name', 'George', 'last_name', 'Split',
     'email', 'george@example.com', 'phone', '+10000000007',
     'age', '18-24', 'gender', 'Male',
     'nationality', 'Italian', 'country_of_residence', 'Italy',
     'languages', 'Italian, English',
     'current_occupation', 'Student',
     'physical_fitness', 'Excellent - Regular exercise, no health concerns',
     'health_conditions', 'No health conditions affecting diving',
     'diving_types', jsonb_build_array('Recreational Scuba diving', 'Snorkeling'),
     'certification_level', 'No certification yet',
     'number_of_dives', '0-50', 'last_dive_date', '2026-01-05',
     'diving_environments', jsonb_build_array('Tropical Reefs'),
     'buoyancy_skill', 3,
     'equipment_owned', jsonb_build_array('Action camera (GoPro, Osmo, Insta360, etc)'),
     'photography_equipment', 'GoPro Hero 11.',
     'planning_to_invest', 'Yes, within the next years',
     'years_experience', 'Less than 1 year',
     'skill_camera_settings', 3, 'skill_lighting', 2, 'skill_post_production', 3,
     'skill_color_correction', 2, 'skill_composition', 4, 'skill_drone', 1, 'skill_over_water', 3,
     'btm_category', 'BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)',
     'content_created', jsonb_build_array('None yet, excited to start'),
     'involvement_level', 'Complete beginner',
     'online_presence', jsonb_build_array('None of the above'),
     'online_links', '',
     'income_from_photography', 'No, that''s not my goal.',
     'primary_goal', 'Learn basics of underwater photography as a hobby',
     'secondary_goal', 'Improve content creation for social media',
     'learning_aspects', jsonb_build_array('Basic equipment setup and operation'),
     'content_to_create', jsonb_build_array('Social media content'),
     'learning_approach', jsonb_build_array('Group workshops (within a group of approx. 10 persons)'),
     'marine_subjects', jsonb_build_array('Coral reefs'),
     'time_availability', '1 week to 10 days for a workshop, a project or individual training',
     'travel_willingness', 'Yes, but within my region only',
     'budget', 'Very limited budget. I basically have no financial means to be spent on this.',
     'start_timeline', 'Within next 6 months',
     'ultimate_vision', 'Start taking better photos on my holidays.',
     'inspiration_to_apply', 'A friend recommended BTM.',
     'referral_source', '["Social Media (Instagram", "Facebook", "etc.)"]'::jsonb,
     'anything_else', ''
   ),
   now() - interval '3 days');

-- Freediving & Modelling — 3 rows
INSERT INTO public.applications (id, program, status, contact_id, answers, submitted_at) VALUES
  -- fd8: canonical freediving
  ('22222222-2222-2222-2222-000000000008', 'freediving', 'reviewing',
   '11111111-1111-1111-1111-000000000008',
   jsonb_build_object(
     'first_name', 'Helen', 'last_name', 'Free',
     'email', 'helen@example.com', 'phone', '+10000000008',
     'age', '25-34', 'gender', 'Female',
     'nationality', 'Greek', 'country_of_residence', 'Greece',
     'languages', 'Greek, English',
     'current_occupation', 'Yoga instructor',
     'physical_fitness', 'Excellent - Regular exercise, no health concerns',
     'health_conditions', 'No health conditions affecting freediving',
     'certification_level', 'AIDA 2 or equivalent',
     'number_of_sessions', '0-50',
     'practice_duration', 'Less than 1 year',
     'last_session_date', '2026-02-20',
     'comfortable_max_depth', '15m',
     'breath_hold_time', '2:30 static',
     'personal_best', 'CWT 18m',
     'diving_environments', jsonb_build_array('Tropical Reefs', 'Pool'),
     'performance_experience', 'Less than 1 year',
     'land_movement_sports', 'Yoga',
     'choreography_experience', 'No',
     'filmed_underwater', 'No',
     'comfort_without_dive_line', 4,
     'comfort_without_fins', 5,
     'comfort_without_mask', 3,
     'freediving_equipment', 'Mares Razor fins, Cressi Nano mask, 3mm suit.',
     'btm_category', 'BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)',
     'online_presence', jsonb_build_array('Active social media'),
     'online_links', 'https://instagram.com/helenfree',
     'primary_goal', 'Learn basics of expressive underwater movement as a hobby',
     'secondary_goal', 'Improve content creation for social media',
     'learning_aspects', jsonb_build_array('Body awareness', 'Creative self-expression'),
     'learning_approach', jsonb_build_array('One-on-one mentorship', 'Group workshops (within a group of approx. 10 persons)'),
     'professional_material_purpose', 'Yes, for personal/travel memories',
     'time_availability', '1 week to 10 days for a workshop, a project or individual training',
     'travel_willingness', 'Yes, willing to travel internationally',
     'budget', 'Small budget (under 1,000 €/USD)',
     'start_timeline', 'Ready to start immediately',
     'ultimate_vision', 'Blend yoga and freediving into a practice I can teach.',
     'inspiration_to_apply', 'Followed the BTM freediving community for years.',
     'referral_source', jsonb_build_array('Word of mouth'),
     'anything_else', ''
   ),
   now() - interval '11 days'),
  -- fd9: age "54+" legacy migration
  ('22222222-2222-2222-2222-000000000009', 'freediving', 'reviewing',
   '11111111-1111-1111-1111-000000000009',
   jsonb_build_object(
     'first_name', 'Ivan', 'last_name', 'Migrated',
     'email', 'ivan@example.com', 'phone', '+10000000009',
     'age', '54+',
     'gender', 'Male',
     'nationality', 'Russian', 'country_of_residence', 'Cyprus',
     'languages', 'Russian, English',
     'current_occupation', 'Engineer',
     'physical_fitness', 'Excellent - Regular exercise, no health concerns',
     'health_conditions', 'No health conditions affecting freediving',
     'certification_level', 'AIDA 4 or equivalent',
     'number_of_sessions', '250+',
     'practice_duration', '> 5 years',
     'last_session_date', '2026-03-05',
     'comfortable_max_depth', '45m',
     'breath_hold_time', '5:30 static, 3:30 dynamic',
     'personal_best', 'CWT 52m',
     'diving_environments', jsonb_build_array('Open water', 'Deep diving'),
     'performance_experience', '3-5 years',
     'land_movement_sports', 'Martial Arts',
     'choreography_experience', 'Yes, little experience',
     'filmed_underwater', 'Yes, extended experience',
     'comfort_without_dive_line', 9,
     'comfort_without_fins', 8,
     'comfort_without_mask', 7,
     'freediving_equipment', 'Molchanovs carbon fins, custom weight belt, 1.5mm suit.',
     'btm_category', 'INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)',
     'online_presence', jsonb_build_array('Active social media', 'Personal website'),
     'online_links', 'https://ivanmigrated.com',
     'primary_goal', 'Enhance existing professional skills',
     'secondary_goal', 'Enjoy the community, network and socialise with likeminded people',
     'learning_aspects', jsonb_build_array('Techniques for expressive underwater movement'),
     'learning_approach', jsonb_build_array('Project-based learning (within a BTM project)'),
     'professional_material_purpose', 'Yes, for commercial purposes',
     'time_availability', '2-3 entire weeks at a time for a workshop, a project or individual training',
     'travel_willingness', 'Yes, willing to travel internationally',
     'budget', 'Advanced budget (3,000 - 6,000 €/USD)',
     'start_timeline', 'Within next 3 months',
     'ultimate_vision', 'Build a freediving film project in the Mediterranean.',
     'inspiration_to_apply', 'Want to work with the BTM team on a longer project.',
     'referral_source', jsonb_build_array('Diving community'),
     'anything_else', ''
   ),
   now() - interval '18 days'),
  -- fd10: LEGACY "SSI level 2" certification value — not in current enum;
  --       should appear in the Other filter bucket after Phase A ships.
  ('22222222-2222-2222-2222-000000000010', 'freediving', 'reviewing',
   '11111111-1111-1111-1111-000000000010',
   jsonb_build_object(
     'first_name', 'Julia', 'last_name', 'SSI',
     'email', 'julia@example.com', 'phone', '+10000000010',
     'age', '35-44', 'gender', 'Female',
     'nationality', 'Spanish', 'country_of_residence', 'Spain',
     'languages', 'Spanish, English',
     'current_occupation', 'Artist',
     'physical_fitness', 'Good - Moderately active, no major health concerns',
     'health_conditions', 'No health conditions affecting freediving',
     'certification_level', 'SSI level 2',
     'number_of_sessions', '51-250',
     'practice_duration', '> 2 years',
     'last_session_date', '2026-02-28',
     'comfortable_max_depth', '25m',
     'breath_hold_time', '3:30 static',
     'personal_best', 'CNF 22m',
     'diving_environments', jsonb_build_array('Pool', 'Open water'),
     'performance_experience', '1-3 years',
     'land_movement_sports', 'Dance',
     'choreography_experience', 'Yes, extended experience',
     'filmed_underwater', 'Yes, little experience',
     'comfort_without_dive_line', 7,
     'comfort_without_fins', 9,
     'comfort_without_mask', 6,
     'freediving_equipment', 'Molchanovs fins, monofin, 3mm suit.',
     'btm_category', 'INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)',
     'online_presence', jsonb_build_array('Active social media', 'Professional portfolio'),
     'online_links', 'https://juliassi.art',
     'primary_goal', 'Transform hobby into professional career',
     'secondary_goal', 'Enhance existing professional skills',
     'learning_aspects', jsonb_build_array('Creating individual movements sequences and choreography', 'Creative self-expression'),
     'learning_approach', jsonb_build_array('Mixed approach (combination of group and individual)'),
     'professional_material_purpose', 'Yes, for commercial purposes',
     'time_availability', '2-3 entire weeks at a time for a workshop, a project or individual training',
     'travel_willingness', 'Yes, willing to travel internationally',
     'budget', 'Moderate budget (1,000 - 3,000 €/USD)',
     'start_timeline', 'Within next 3 months',
     'ultimate_vision', 'Perform underwater dance pieces that are shown in galleries.',
     'inspiration_to_apply', 'The community of performers at BTM.',
     'referral_source', jsonb_build_array('Word of mouth'),
     'anything_else', ''
   ),
   now() - interval '30 days');

-- Internship — 3 rows (numeric ages)
INSERT INTO public.applications (id, program, status, contact_id, answers, submitted_at) VALUES
  ('22222222-2222-2222-2222-000000000011', 'internship', 'reviewing',
   '11111111-1111-1111-1111-000000000011',
   jsonb_build_object(
     'first_name', 'Kyle', 'last_name', 'Intern',
     'email', 'kyle@example.com', 'phone', '+10000000011',
     'age', '23',
     'gender', 'Male',
     'nationality', 'Canadian', 'country_of_residence', 'Canada',
     'languages', 'English, French',
     'current_occupation', 'Film student',
     'education_level', 'Bachelor''s degree',
     'field_of_study', 'Film Production',
     'recent_activities', 'Finished my BA in film, interning part-time at a local studio.',
     'online_links', 'https://instagram.com/kylepixels',
     'accommodation_ties', 'No, I would need help finding accommodation.',
     'filmmaking_experience', 'A few short documentaries on land; zero underwater so far.',
     'filming_equipment', 'Sony A7 III, a couple of lenses, no underwater housing yet.',
     'content_created', jsonb_build_array('Documentary style', 'Social media content'),
     'inspiration_to_apply', 'Want to specialize in underwater conservation filmmaking.',
     'ultimate_vision', 'Work as a marine DP on conservation features.',
     'internship_hopes', 'Learn the full production cycle of an underwater film.',
     'candidacy_reason', 'I have strong storytelling fundamentals and I am hungry to learn.',
     'physical_fitness', 'Excellent - Regular exercise, no health concerns',
     'health_conditions', 'No health conditions affecting diving',
     'diving_types', jsonb_build_array('Recreational Scuba diving'),
     'certification_level', 'Advanced Open Water',
     'number_of_dives', '0-50', 'last_dive_date', '2026-01-15',
     'diving_environments', jsonb_build_array('Tropical Reefs', 'Cold water'),
     'buoyancy_skill', 5,
     'referral_source', jsonb_build_array('Online search'),
     'anything_else', ''
   ),
   now() - interval '5 days'),
  ('22222222-2222-2222-2222-000000000012', 'internship', 'reviewing',
   '11111111-1111-1111-1111-000000000012',
   jsonb_build_object(
     'first_name', 'Luna', 'last_name', 'Master',
     'email', 'luna@example.com', 'phone', '+10000000012',
     'age', '30',
     'gender', 'Female',
     'nationality', 'Dutch', 'country_of_residence', 'Netherlands',
     'languages', 'Dutch, English, German',
     'current_occupation', 'Marine biologist',
     'education_level', 'Master''s degree',
     'field_of_study', 'Marine Biology',
     'recent_activities', 'MSc research on seagrass restoration; freelance nature photo on the side.',
     'online_links', 'https://lunamaster.bio',
     'accommodation_ties', 'I have a friend on Faial who offered a room.',
     'filmmaking_experience', 'Photography-first, but shot a few expedition clips with a GoPro.',
     'filming_equipment', 'GoPro Hero 12, small tripod, no housing yet.',
     'content_created', jsonb_build_array('Scientific/Research documentation', 'Overwater photography', 'Underwater photography'),
     'inspiration_to_apply', 'Turn my research into compelling films.',
     'ultimate_vision', 'Bridge marine science and visual storytelling.',
     'internship_hopes', 'Practical filmmaking skills tailored to scientific work.',
     'candidacy_reason', 'Domain expertise in marine ecology and an existing photo portfolio.',
     'physical_fitness', 'Excellent - Regular exercise, no health concerns',
     'health_conditions', 'No health conditions affecting diving',
     'diving_types', jsonb_build_array('Recreational Scuba diving', 'Freediving'),
     'certification_level', 'Rescue Diver, Certified Freediver, specify level below, AIDA2',
     'number_of_dives', '51-250', 'last_dive_date', '2026-02-18',
     'diving_environments', jsonb_build_array('Tropical Reefs', 'Open water', 'Cold water'),
     'buoyancy_skill', 8,
     'referral_source', jsonb_build_array('Diving community'),
     'anything_else', ''
   ),
   now() - interval '12 days'),
  -- i13: internship age "24 years old" — malformed free-text edge case;
  --      should surface under the Other bucket in the admin age filter
  --      once Phase B's range-bucket normalization ships. Phase A keeps
  --      it as-is.
  ('22222222-2222-2222-2222-000000000013', 'internship', 'reviewing',
   '11111111-1111-1111-1111-000000000013',
   jsonb_build_object(
     'first_name', 'Mika', 'last_name', 'Age',
     'email', 'mika@example.com', 'phone', '+10000000013',
     'age', '24 years old',
     'gender', 'Non-binary',
     'nationality', 'Japanese', 'country_of_residence', 'Japan',
     'languages', 'Japanese, English',
     'current_occupation', 'Freelance editor',
     'education_level', 'High school diploma',
     'field_of_study', 'Self-taught',
     'recent_activities', 'Editing wedding videos to pay the bills; skating and shooting every weekend.',
     'online_links', 'https://instagram.com/mikaage',
     'accommodation_ties', '',
     'filmmaking_experience', 'Wedding and event editing, a few underwater shots on vacation.',
     'filming_equipment', 'iPhone 15 Pro.',
     'content_created', jsonb_build_array('Commercial work', 'Personal vacation videos'),
     'inspiration_to_apply', 'I want to pivot from weddings to ocean storytelling.',
     'ultimate_vision', 'Make narrative shorts about the Pacific.',
     'internship_hopes', 'Shadow experienced pros and find my voice.',
     'candidacy_reason', 'Editing instincts and a work ethic sharpened by freelance life.',
     'physical_fitness', 'Good - Moderately active, no major health concerns',
     'health_conditions', 'No health conditions affecting diving',
     'diving_types', jsonb_build_array('Snorkeling'),
     'certification_level', 'No certification yet',
     'number_of_dives', '0-50', 'last_dive_date', '2025-12-20',
     'diving_environments', jsonb_build_array('Tropical Reefs'),
     'buoyancy_skill', 3,
     'referral_source', jsonb_build_array('Social Media (Instagram, Facebook, etc.)'),
     'anything_else', ''
   ),
   now() - interval '2 days');

-- =========================================================================
-- Re-run the normalization migration against the fixture rows inserted
-- above. (`supabase db reset` applies migrations BEFORE seed.sql, so the
-- legacy fixture rows still contain raw Google Forms shapes until we
-- re-normalize them here. The statements below mirror
-- supabase/migrations/20260411000001_normalize_application_answers.sql
-- exactly and are idempotent — safe to re-run.)
-- =========================================================================

UPDATE public.applications
SET answers = jsonb_set(answers, '{age}', '"55+"'::jsonb)
WHERE program IN ('filmmaking', 'photography', 'freediving')
  AND answers->>'age' = '54+';

UPDATE public.applications
SET answers = jsonb_set(
  answers,
  '{time_availability}',
  to_jsonb(replace(answers->>'time_availability', 'aproject', 'a project'))
)
WHERE program IN ('filmmaking', 'photography')
  AND answers->>'time_availability' LIKE '%aproject%';

UPDATE public.applications
SET answers = jsonb_set(
  answers,
  '{income_from_photography}',
  '"No, that''s not my goal."'::jsonb
)
WHERE program = 'photography'
  AND answers->>'income_from_photography' = 'No, thats not my goal.';

UPDATE public.applications
SET answers = jsonb_set(
  answers,
  '{referral_source}',
  COALESCE(
    (
      SELECT jsonb_agg(x)
      FROM jsonb_array_elements_text(answers->'referral_source') AS x
      WHERE x NOT IN (
        'Social Media (Instagram',
        'Facebook',
        'etc.)'
      )
    ),
    '[]'::jsonb
  ) || '["Social Media (Instagram, Facebook, etc.)"]'::jsonb
)
WHERE answers->'referral_source' @> '["Social Media (Instagram"]'::jsonb
  AND answers->'referral_source' @> '["Facebook"]'::jsonb
  AND answers->'referral_source' @> '["etc.)"]'::jsonb;
