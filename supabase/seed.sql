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

-- Create an identity for each user (required for email/password login)
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '{"sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "email": "test@btmhub.com"}'::jsonb,
  'email', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  now(), now(), now()
), (
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  '{"sub": "b2c3d4e5-f6a7-8901-bcde-f12345678901", "email": "admin@btmhub.com"}'::jsonb,
  'email', 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  now(), now(), now()
);
