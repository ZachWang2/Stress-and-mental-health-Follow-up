create extension if not exists pgcrypto;

alter table if exists public.daily_records
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  add column if not exists date date,
  add column if not exists daily_score int,
  add column if not exists sleep_hours numeric(4, 1),
  add column if not exists sleep_quality int,
  add column if not exists somatic_level int,
  add column if not exists recharge_ease int,
  add column if not exists short_video_minutes int,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.weekly_records
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  add column if not exists date date,
  add column if not exists score int,
  add column if not exists risk_flag boolean not null default false,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.scared_records
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  add column if not exists date date,
  add column if not exists respondent text,
  add column if not exists total int,
  add column if not exists total_elevated boolean not null default false,
  add column if not exists subscales jsonb not null default '[]'::jsonb,
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.treehole_entries
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  add column if not exists text text,
  add column if not exists ai_conversation_ready boolean not null default false,
  add column if not exists ai_draft text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  alter table public.daily_records add constraint daily_records_user_date_unique unique (user_id, date);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.weekly_records add constraint weekly_records_user_date_unique unique (user_id, date);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.scared_records add constraint scared_records_user_date_unique unique (user_id, date);
exception when duplicate_object then null;
end $$;

alter table if exists public.daily_records enable row level security;
alter table if exists public.weekly_records enable row level security;
alter table if exists public.scared_records enable row level security;
alter table if exists public.treehole_entries enable row level security;
