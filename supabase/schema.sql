-- Knight Vision AI — run this once in Supabase SQL Editor
-- Dashboard → SQL → New query → Run

create extension if not exists pgcrypto;

create table if not exists public.kv_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_normalized text not null unique,
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists kv_users_name_normalized_idx
  on public.kv_users (name_normalized);

alter table public.kv_users enable row level security;

-- Demo/hackathon policies: allow register + login from the browser
drop policy if exists "kv_users_select" on public.kv_users;
drop policy if exists "kv_users_insert" on public.kv_users;

create policy "kv_users_select"
  on public.kv_users
  for select
  to anon, authenticated
  using (true);

create policy "kv_users_insert"
  on public.kv_users
  for insert
  to anon, authenticated
  with check (true);
