-- Run once in the Supabase SQL Editor.
-- Browser visitors can INSERT, but cannot SELECT/UPDATE/DELETE saved answers.
-- No GitHub token, service_role key, or database password belongs in frontend code.
create table if not exists public.birthday_entries (
  id bigint generated always as identity primary key,
  client_event_id uuid not null unique,
  event_type text not null check (event_type in (
    'wish', 'quiz_answer', 'emoji_answer', 'math_answer',
    'color_answer', 'game_result', 'sudoku_result'
  )),
  content text not null check (char_length(content) between 1 and 500),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096),
  created_at timestamptz not null default now()
);

alter table public.birthday_entries enable row level security;
revoke all on public.birthday_entries from public, anon, authenticated;
grant usage on schema public to anon;
grant insert (client_event_id, event_type, content, details)
  on public.birthday_entries to anon;

drop policy if exists "birthday_visitors_insert_only" on public.birthday_entries;
create policy "birthday_visitors_insert_only"
  on public.birthday_entries
  for insert to anon
  with check (
    event_type in ('wish', 'quiz_answer', 'emoji_answer', 'math_answer',
                   'color_answer', 'game_result', 'sudoku_result')
    and char_length(content) between 1 and 500
    and jsonb_typeof(details) = 'object'
    and octet_length(details::text) <= 4096
  );

-- Check permissions: anonymous users must NOT have SELECT/UPDATE/DELETE.
-- Read responses privately in the Supabase dashboard Table Editor or SQL Editor:
-- select created_at, event_type, content, details
-- from public.birthday_entries order by created_at desc;
