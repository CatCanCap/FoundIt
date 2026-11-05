-- Adds an "Other" category, for things that fit none of the 15 (glasses, a
-- cap, a ring). Until now there was nothing to pick, and items must have a
-- category from this table. Only adds a row, so nothing stored changes.
-- Matching gives two "Other" items half the category score, not the full
-- score for the same category (server/matching/category.js).

insert into categories (name, related) values ('Other', '{}')
on conflict (name) do nothing;
