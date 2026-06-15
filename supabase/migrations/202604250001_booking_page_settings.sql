-- Per-master customization of the public booking page (stage 1: headline,
-- subheadline, comment field mode). Stored as JSONB so future settings can be
-- added without new migrations.
alter table profiles
  add column if not exists booking_page_settings jsonb not null default '{}'::jsonb;
