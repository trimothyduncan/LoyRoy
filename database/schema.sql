-- LoyRoy Supabase schema (Postgres). Run in a fresh project via the
-- Supabase SQL editor or `psql $DATABASE_URL -f database/schema.sql`.
-- Service-role usage bypasses RLS; no RLS policies are defined here on
-- purpose (all access goes through the backend with the service key).

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
