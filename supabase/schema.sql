create extension if not exists pgcrypto;

create table if not exists public.daily_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  daily_score int,
  sleep_hours numeric(4, 1),
  sleep_quality int,
  somatic_level int,
  recharge_ease int,
  short_video_minutes int,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.weekly_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  score int,
  risk_flag boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.scared_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  respondent text,
  total int,
  total_elevated boolean not null default false,
  subscales jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.treehole_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  text text not null,
  ai_conversation_ready boolean not null default false,
  ai_draft text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  source text not null default 'manual_or_future_api',
  total_screen_minutes int,
  short_video_minutes int,
  social_minutes int,
  game_minutes int,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, source)
);

create table if not exists public.device_sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  device_type text not null,
  device_name text,
  synced_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_daily_records_updated_at on public.daily_records;
create trigger set_daily_records_updated_at before update on public.daily_records for each row execute function public.set_updated_at();

drop trigger if exists set_weekly_records_updated_at on public.weekly_records;
create trigger set_weekly_records_updated_at before update on public.weekly_records for each row execute function public.set_updated_at();

drop trigger if exists set_scared_records_updated_at on public.scared_records;
create trigger set_scared_records_updated_at before update on public.scared_records for each row execute function public.set_updated_at();

drop trigger if exists set_app_usage_records_updated_at on public.app_usage_records;
create trigger set_app_usage_records_updated_at before update on public.app_usage_records for each row execute function public.set_updated_at();

alter table public.daily_records enable row level security;
alter table public.weekly_records enable row level security;
alter table public.scared_records enable row level security;
alter table public.treehole_entries enable row level security;
alter table public.app_usage_records enable row level security;
alter table public.device_sync_events enable row level security;

drop policy if exists "own daily records" on public.daily_records;
create policy "own daily records" on public.daily_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own weekly records" on public.weekly_records;
create policy "own weekly records" on public.weekly_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own scared records" on public.scared_records;
create policy "own scared records" on public.scared_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own treehole entries" on public.treehole_entries;
create policy "own treehole entries" on public.treehole_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own app usage records" on public.app_usage_records;
create policy "own app usage records" on public.app_usage_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own device sync events" on public.device_sync_events;
create policy "own device sync events" on public.device_sync_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists daily_records_user_date_idx on public.daily_records (user_id, date desc);
create index if not exists weekly_records_user_date_idx on public.weekly_records (user_id, date desc);
create index if not exists scared_records_user_date_idx on public.scared_records (user_id, date desc);
create index if not exists treehole_entries_user_created_idx on public.treehole_entries (user_id, created_at desc);
create index if not exists app_usage_records_user_date_idx on public.app_usage_records (user_id, date desc);
create index if not exists device_sync_events_user_synced_idx on public.device_sync_events (user_id, synced_at desc);
