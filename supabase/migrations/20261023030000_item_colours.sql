-- An item can have up to 3 colours (a navy bag with a white strap), not just
-- one. Two new tables:
--
--   colours       the fixed list of colours, moved from server/data/colours.json
--                 into the database (the JSON file stays as the seed's copy)
--   item_colours  one row per colour of an item, position 1 to 3; position 1
--                 is the main colour
--
-- items.colour stays and always holds the main colour, so everything that
-- reads it keeps working while the pages move to the full list. Nothing is
-- removed: every item's current colour is copied into item_colours.

create table colours (
  name text primary key,
  hex text,
  related text[] not null default '{}',
  sort_order integer not null default 0
);

insert into colours (name, hex, related, sort_order) values
  ('Black', '#1a1a1a', '{Navy,Grey}', 1),
  ('White', '#f5f5f5', '{Beige,Silver}', 2),
  ('Grey', '#808080', '{Silver,Black}', 3),
  ('Silver', '#c0c0c0', '{Grey,White}', 4),
  ('Gold', '#c9a43b', '{Yellow,Beige}', 5),
  ('Blue', '#2f6fd6', '{Navy}', 6),
  ('Navy', '#1f2a5a', '{Blue,Black}', 7),
  ('Red', '#c62828', '{Pink,Orange}', 8),
  ('Pink', '#f48fb1', '{Red,Purple}', 9),
  ('Purple', '#7b4fa0', '{Pink}', 10),
  ('Green', '#2e7d32', '{}', 11),
  ('Yellow', '#f2c94c', '{Gold,Orange}', 12),
  ('Orange', '#ef7d22', '{Red,Yellow}', 13),
  ('Brown', '#7b4a2a', '{Beige}', 14),
  ('Beige', '#d8c3a0', '{Brown,White,Gold}', 15),
  ('Clear', null, '{}', 16),
  ('Multicolour', null, '{}', 17)
on conflict (name) do nothing;

create table item_colours (
  item_id bigint not null references items (id) on delete cascade,
  colour text not null references colours (name) on update cascade,
  position smallint not null check (position between 1 and 3),
  primary key (item_id, position),
  unique (item_id, colour)
);

-- Copy every item's colour as its main colour (only names on the list, which
-- is all the API ever accepted)
insert into item_colours (item_id, colour, position)
select id, colour, 1
from items
where colour in (select name from colours);

-- Like every other table, only the server's secret key can read or write these
alter table colours enable row level security;
alter table item_colours enable row level security;
revoke all on colours, item_colours from anon, authenticated;
grant all on colours, item_colours to service_role;

-- The seed script and the API tests empty the item tables, item_colours
-- included. The colour list is reference data kept by this migration (the seed
-- refreshes it from colours.json), so it is not emptied.
create or replace function reset_all_tables() returns void
language sql security definer set search_path = public as $$
  truncate table admin_actions, reports, disputes, handoffs, messages, claims,
    matches, item_colours, item_trail_points, items, campus_spots, categories, users
    restart identity cascade;
$$;

revoke execute on function reset_all_tables() from public, anon, authenticated;
grant execute on function reset_all_tables() to service_role;
