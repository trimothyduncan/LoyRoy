-- GHOST-PASS-WIPE.sql — run in the APP database SQL editor (Supabase Dashboard).
-- Purpose: remove server-side registrations / update-tags for deleted or superseded
-- passes (e.g. after the iOS Authentication-failure retry loop). Idempotent: safe to re-run.
-- NOTE: run AFTER the idempotent-unregister deploy is live, and AFTER deleting the
-- passes from the iPhone Wallet (each delete fires one final unregister, now a 200).

-- 1) Audit: what is currently registered -------------------------------------
select pass_type_id, serial_number, device_library_id, created_at
  from apple_registrations order by created_at desc;
select serial_number, updated_at from pass_updates order by updated_at desc;

-- 2) Wipe one ghost serial (repeat the two lines per stale serial) -----------
-- Known stale serial from the 2026-10-01 incident:
delete from apple_registrations where serial_number = 'LOYROY-8fd21587-00a4-42b8-b1a6-ea2f7b371502';
delete from pass_updates where serial_number = 'LOYROY-8fd21587-00a4-42b8-b1a6-ea2f7b371502';

-- 3) Verify clean --------------------------------------------------------------
select count(*) as registrations_remaining from apple_registrations;
-- Expect 0 rows here after all passes are deleted from the device.
-- Fresh installs re-register automatically (201) on next Add to Wallet.
