create index if not exists services_profile_sort_order_idx
on services(profile_id, sort_order);

create index if not exists services_profile_active_sort_order_idx
on services(profile_id, is_active, sort_order);

create index if not exists availability_rules_profile_weekday_idx
on availability_rules(profile_id, weekday);

create index if not exists blocked_slots_profile_starts_at_idx
on blocked_slots(profile_id, starts_at);

create index if not exists bookings_profile_status_starts_at_idx
on bookings(profile_id, status, starts_at);

create index if not exists bookings_profile_status_created_at_idx
on bookings(profile_id, status, created_at);

create index if not exists bookings_profile_starts_at_idx
on bookings(profile_id, starts_at);

create index if not exists clients_profile_last_booking_at_idx
on clients(profile_id, last_booking_at desc);

create index if not exists notification_events_profile_created_at_idx
on notification_events(profile_id, created_at desc);
