create extension if not exists btree_gist;

alter table if exists profiles
add column if not exists booking_window_days integer not null default 30,
add column if not exists slot_interval_minutes integer not null default 30,
add column if not exists buffer_minutes integer not null default 15,
add column if not exists cancellation_notice_hours integer not null default 2;

alter table if exists bookings
add column if not exists busy_until timestamptz;

update bookings as booking
set busy_until = booking.ends_at + make_interval(mins => greatest(coalesce(profile.buffer_minutes, 0), 0))
from profiles as profile
where profile.id = booking.profile_id
  and booking.busy_until is null;

update bookings
set busy_until = ends_at
where busy_until is null;

alter table if exists bookings
alter column busy_until set not null;

alter table if exists bookings
drop constraint if exists bookings_no_overlap_excl;

alter table if exists bookings
add constraint bookings_no_overlap_excl
exclude using gist (
  profile_id with =,
  tstzrange(starts_at, busy_until, '[)') with &&
)
where (status = 'confirmed');
