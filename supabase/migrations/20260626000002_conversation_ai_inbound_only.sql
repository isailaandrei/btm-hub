-- The AI knowledge base learns about a contact from what the contact says, not
-- from the business's own replies. So every admin-AI read path now uses INBOUND
-- messages only (in addition to the existing deactivated_at IS NULL filter).
-- Outbound messages stay fully visible in the contact thread for human context.

create or replace function public.search_conversation_embeddings(
  p_query_embedding extensions.vector(1536),
  p_contact_id uuid default null,
  p_limit integer default 40
)
returns table (
  message_id uuid,
  contact_id uuid,
  body text,
  happened_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    message.id as message_id,
    message.contact_id,
    message.body,
    message.happened_at,
    1 - (embedding.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.conversation_embeddings embedding
  join public.conversation_messages message
    on message.id = embedding.target_id
  where embedding.target_type = 'message'
    and message.deactivated_at is null
    and message.direction = 'inbound'
    and (p_contact_id is null or message.contact_id = p_contact_id)
  order by embedding.embedding operator(extensions.<=>) p_query_embedding
  limit p_limit;
$$;

create or replace function public.search_conversation_messages_fts(
  p_query text,
  p_contact_id uuid default null,
  p_limit integer default 40
)
returns table (
  message_id uuid,
  contact_id uuid,
  body text,
  happened_at timestamptz,
  rank double precision
)
language sql
stable
as $$
  with query as (
    select websearch_to_tsquery('english', coalesce(p_query, '')) as tsq
  )
  select
    message.id as message_id,
    message.contact_id,
    message.body,
    message.happened_at,
    ts_rank_cd(to_tsvector('english', message.body), query.tsq) as rank
  from public.conversation_messages message, query
  where message.deactivated_at is null
    and message.direction = 'inbound'
    and (p_contact_id is null or message.contact_id = p_contact_id)
    and (
      coalesce(p_query, '') = ''
      or to_tsvector('english', message.body) @@ query.tsq
    )
  order by rank desc, message.happened_at desc
  limit p_limit;
$$;

create or replace function public.list_undigested_conversation_messages(
  p_limit integer default 500
)
returns table (
  id uuid,
  contact_id uuid,
  direction text,
  body text,
  happened_at timestamptz
)
language sql
stable
as $$
  with digest_watermarks as (
    select
      contact_id,
      max(window_end) as latest_window_end
    from conversation_digests
    group by contact_id
  )
  select
    message.id,
    message.contact_id,
    message.direction,
    message.body,
    message.happened_at
  from conversation_messages message
  left join digest_watermarks watermark
    on watermark.contact_id = message.contact_id
  where message.contact_id is not null
    and message.deactivated_at is null
    and message.direction = 'inbound'
    and (
      watermark.latest_window_end is null
      or message.happened_at > watermark.latest_window_end
    )
  order by message.happened_at asc, message.id asc
  limit p_limit;
$$;

create or replace function public.list_conversation_messages_missing_embeddings(
  p_embedding_model text,
  p_embedding_version text,
  p_limit integer default 500
)
returns table (
  id uuid,
  body text
)
language sql
stable
as $$
  select
    message.id,
    message.body
  from conversation_messages message
  where message.deactivated_at is null
    and message.direction = 'inbound'
    and not exists (
      select 1
      from conversation_embeddings embedding
      where embedding.target_type = 'message'
        and embedding.target_id = message.id
        and embedding.embedding_model = p_embedding_model
        and embedding.embedding_version = p_embedding_version
    )
  order by message.happened_at asc, message.id asc
  limit p_limit;
$$;
