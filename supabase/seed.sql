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
-- Community seed data: threads, posts, replies, likes, mentions
-- =========================================================================

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
