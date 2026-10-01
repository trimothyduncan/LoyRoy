-- Migration 004 — Poster Generic art slots (additive, idempotent).
-- Adds the two iOS 27+ Poster Generic image slots to the Art Studio so
-- merchants can upload the full-bleed background and the logo drawn over it.
-- Requires 003-pass-art.sql (the pass_art table + its slot CHECK).
--
-- ONE statement on purpose. Migration 003 was originally sent as a
-- multi-statement batch and the SQL API silently skipped everything after
-- the first statement (see TASK_LEDGER STUDIO-001). A single DO block
-- cannot half-apply: either the whole swap happens or none of it does.
--
-- The 003 CHECK is unnamed, so its generated name is not guaranteed. This
-- drops every CHECK on the slot column regardless of name instead of
-- guessing one, then adds a single named constraint.

do $$
declare
  stale text;
  slot_attnum smallint;
begin
  -- Fail loudly if 003 was never applied, instead of silently no-oping.
  select attnum into slot_attnum
  from pg_attribute
  where attrelid = 'public.pass_art'::regclass and attname = 'slot';

  if slot_attnum is null then
    raise exception 'public.pass_art.slot not found — apply 003-pass-art.sql first';
  end if;

  -- Drop all existing CHECK constraints on pass_art.slot.
  for stale in
    select conname
    from pg_constraint
    where conrelid = 'public.pass_art'::regclass
      and contype = 'c'
      and conkey = array[slot_attnum]
  loop
    execute format('alter table public.pass_art drop constraint %I', stale);
  end loop;

  -- One named constraint covering both the legacy and the poster slots.
  -- The tier/status CHECKs are untouched: only slot-scoped ones are dropped.
  alter table public.pass_art
    add constraint pass_art_slot_check
    check (slot in ('logo', 'strip', 'icon', 'artwork', 'primaryLogo'));
end $$;

-- Verify (expect the definition below, then 5 rows of art eventually):
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.pass_art'::regclass
--     and conname = 'pass_art_slot_check';
