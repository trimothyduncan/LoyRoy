-- APPLY-TO-REAL-PROJECT.sql — one-shot bring-up for the app database
-- (the project behind SUPABASE_URL on Render, host clepxujvgyhdahwhpsmx.supabase.co).
-- Paste the WHOLE file into Supabase Dashboard -> SQL editor -> New query -> Run.
-- Idempotent (IF NOT EXISTS / ON CONFLICT / policy guards): safe to re-run.
-- Contents: 001 pilot schema (10 tables + 5 tier seeds) + wallet-pass bucket +
-- 002 multi-tenant (7 tables, org_id defaults, RLS + 34 deny policies).
-- Trial-proven on dev project 2026-10-01. verify: 17 public tables, tiers=5.

-- Tiers ---------------------------------------------------------------
create table if not exists tiers (
  name text primary key,
  display_name text not null,
  min_points integer not null default 0 check (min_points >= 0),
  point_multiplier numeric(4,2) not null default 1.00,
  perks jsonb not null default '[]'::jsonb
);

insert into tiers (name, display_name, min_points, point_multiplier, perks) values
  ('bronze',   'Bronze',   0,    1.00, '[]'::jsonb),
  ('silver',   'Silver',   500,  1.10, '[]'::jsonb),
  ('gold',     'Gold',     1500, 1.25, '[]'::jsonb),
  ('platinum', 'Platinum', 5000, 1.50, '[]'::jsonb),
  ('vip',      'VIP',      15000, 2.00, '[]'::jsonb)
on conflict (name) do nothing;

-- Members --------------------------------------------------------------
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  phone text,
  tier text not null default 'bronze' references tiers (name),
  points_balance integer not null default 0 check (points_balance >= 0),
  pass_serial text unique,
  auth_token text,
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists members_pass_serial_idx on members (pass_serial);
create index if not exists members_tier_idx on members (tier);

-- Points ledger (append-only; points_balance is the denormalized cache) --
create table if not exists points_ledger (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  delta integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists points_ledger_member_idx on points_ledger (member_id, created_at desc);

-- Visits ----------------------------------------------------------------
create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  note text not null default '',
  visited_at timestamptz not null default now()
);
create index if not exists visits_member_idx on visits (member_id, visited_at desc);

-- Rewards & redemptions --------------------------------------------------
create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  cost_points integer not null check (cost_points > 0),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists redemptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  reward_id uuid not null references rewards (id),
  points_spent integer not null check (points_spent > 0),
  created_at timestamptz not null default now()
);
create index if not exists redemptions_member_idx on redemptions (member_id, created_at desc);

-- App-level device push tokens (section A /register-device) -------------
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  device_token text not null,
  platform text not null default 'ios',
  created_at timestamptz not null default now(),
  unique (member_id, device_token)
);

-- Apple Wallet Web Service state (section B) -----------------------------
create table if not exists apple_devices (
  device_library_id text primary key,
  push_token text not null,
  updated_at timestamptz not null default now()
);

create table if not exists apple_registrations (
  pass_type_id text not null,
  serial_number text not null,
  device_library_id text not null references apple_devices (device_library_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pass_type_id, serial_number, device_library_id)
);
create index if not exists apple_registrations_device_idx
  on apple_registrations (device_library_id);

-- Bump-tracking so "passes updated since <tag>" can be answered -----------
create table if not exists pass_updates (
  serial_number text primary key,
  updated_tag text not null,
  updated_at timestamptz not null default now()
);

-- Organizations ---------------------------------------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into organizations (id, name, slug) values
  ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default')
on conflict (id) do nothing;

-- Memberships (user_id references the future auth identity; plain uuid until then)
create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists organization_memberships_org_idx on organization_memberships (org_id);
create index if not exists organization_memberships_user_idx on organization_memberships (user_id);

-- Tenant scope on existing tables (default org keeps current inserts working)
alter table members add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references organizations (id);
create index if not exists members_org_idx on members (org_id);

alter table rewards add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references organizations (id);
create index if not exists rewards_org_idx on rewards (org_id);

-- Pass templates ----------------------------------------------------------
create table if not exists pass_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-0000-0000-000000000001' references organizations (id) on delete cascade,
  name text not null,
  platform text not null default 'apple' check (platform in ('apple', 'google')),
  style jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pass_templates_org_idx on pass_templates (org_id);

-- Passes (lifecycle source of truth going forward) --------------------------
create table if not exists passes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-0000-0000-000000000001' references organizations (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  template_id uuid references pass_templates (id) on delete set null,
  platform text not null default 'apple' check (platform in ('apple', 'google')),
  provider_serial text,
  provider_token text,
  status text not null default 'active' check (status in ('active', 'archived', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, provider_serial)
);
create index if not exists passes_org_idx on passes (org_id);
create index if not exists passes_member_idx on passes (member_id);

-- Wallet installations (cross-provider; apple_* tables kept during transition)
create table if not exists wallet_installations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-0000-0000-000000000001' references organizations (id) on delete cascade,
  pass_id uuid references passes (id) on delete cascade,
  platform text not null default 'apple' check (platform in ('apple', 'google', 'web')),
  device_ref text not null,
  push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, device_ref, pass_id)
);
create index if not exists wallet_installations_pass_idx on wallet_installations (pass_id);

-- Analytics events (append-only; metrics derive from here) -------------------
create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-0000-0000-000000000001' references organizations (id) on delete cascade,
  event_type text not null,
  member_id uuid references members (id) on delete set null,
  pass_id uuid references passes (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_org_time_idx on analytics_events (org_id, created_at desc);
create index if not exists analytics_events_type_idx on analytics_events (event_type);

-- Audit logs (append-only) ----------------------------------------------------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-0000-0000-000000000001' references organizations (id) on delete cascade,
  actor text not null default '',
  action text not null,
  entity text not null default '',
  entity_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_org_time_idx on audit_logs (org_id, created_at desc);

-- RLS: enable everywhere; deny anon/authenticated; service_role bypasses -------
alter table organizations enable row level security;
alter table organization_memberships enable row level security;
alter table members enable row level security;
alter table tiers enable row level security;
alter table points_ledger enable row level security;
alter table visits enable row level security;
alter table rewards enable row level security;
alter table redemptions enable row level security;
alter table devices enable row level security;
alter table apple_devices enable row level security;
alter table apple_registrations enable row level security;
alter table pass_updates enable row level security;
alter table pass_templates enable row level security;
alter table passes enable row level security;
alter table wallet_installations enable row level security;
alter table analytics_events enable row level security;
alter table audit_logs enable row level security;

do $$ declare t text; begin
  -- Trial-proven on dev project cwasokjmtcurrdwdlwin 2026-10-01: 34 policies across 17 tables.
  -- CREATE POLICY has no IF NOT EXISTS, so guard on pg_policies for idempotent re-runs.
  foreach t in array array['organizations','organization_memberships','members','tiers','points_ledger','visits','rewards','redemptions','devices','apple_devices','apple_registrations','pass_updates','pass_templates','passes','wallet_installations','analytics_events','audit_logs'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'deny_anon_all') then
      execute format('create policy deny_anon_all on %I for all to anon using (false)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'deny_authenticated_all') then
      execute format('create policy deny_authenticated_all on %I for all to authenticated using (false)', t);
    end if;
  end loop;
end $$;
-- Future per-tenant policies keyed on auth.uid() -> organization_memberships -> org_id arrive
-- with the dashboard session work (backend phases), not in this migration.

-- Storage bucket for pass art (public: backend serves getPublicUrl links) ------
insert into storage.buckets (id, name, public) values ('wallet-pass', 'wallet-pass', true)
on conflict (id) do nothing;
