-- Migration 003 — pass art studio state (additive, idempotent).
-- One row per (tier, slot): draft art staged by merchants in the Art Studio,
-- flipped to published when applied to passes/<tier>.pass/.
-- Applied 2026-10-01 to Supabase project qaltolfejxgazwuxwnpr via SQL API.

create table if not exists public.pass_art (
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum', 'vip')),
  slot text not null check (slot in ('logo', 'strip', 'icon')),
  storage_path text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now(),
  primary key (tier, slot)
);

alter table public.pass_art enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pass_art' and policyname = 'deny_anon_all'
  ) then
    execute 'create policy deny_anon_all on public.pass_art for all to anon using (false)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pass_art' and policyname = 'deny_authenticated_all'
  ) then
    execute 'create policy deny_authenticated_all on public.pass_art for all to authenticated using (false)';
  end if;
end $$;
