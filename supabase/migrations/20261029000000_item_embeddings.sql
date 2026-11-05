-- The meaning of each report's title and description as a list of numbers
-- (an embedding), for the matching engine's semantic score (WS3, matching/embed.js).
-- One row per item. text_hash says which text, model and size the numbers were
-- made from, so an edited report gets new numbers and an old row is never
-- compared with one from another model.
--
-- The numbers live in their own table, not on items, so item lists never send
-- them to the browser. Matching compares them in JavaScript, so no extension
-- (pgvector) is needed.
--
-- reset_all_tables() needs no change: it truncates items with cascade, which
-- empties this table too.

create table item_embeddings (
  item_id bigint primary key references items (id) on delete cascade,
  text_hash text not null,
  embedding real[] not null,
  created_at timestamptz not null default now()
);

-- Like every other table, only the server's secret key can read or write it
alter table item_embeddings enable row level security;
revoke all on item_embeddings from anon, authenticated;
grant all on item_embeddings to service_role;
