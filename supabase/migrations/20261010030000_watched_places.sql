-- Feature 5: the campus spots each user wants an alert for when a found item is
-- reported there. No live location is stored, only the spots the user picked.
create table watched_places (
  user_id bigint not null references users (id) on delete cascade,
  spot_id bigint not null references campus_spots (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, spot_id)
);

create index watched_places_spot_idx on watched_places (spot_id);

-- Same rule as every other table: only the server's key may read or write.
-- reset_all_tables() empties it too, because it truncates users with cascade.
alter table watched_places enable row level security;
revoke all on watched_places from anon, authenticated;
grant all on watched_places to service_role;
