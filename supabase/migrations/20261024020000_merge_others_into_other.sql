-- Folds the stray "Others" category into "Other".
--
-- A teammate branch had its own migration, 20261023010000_add_others_category.sql,
-- that added "Others" while dev added "Other" (20261023040000_other_category.sql).
-- That file shared its version number with 20261023010000_real_building_positions.sql,
-- which stopped `supabase db push`, so it is removed. A database reseeded from that
-- branch has "Others" and no "Other", and the app only knows "Other".
--
-- Safe on any database: it adds "Other" if missing, moves items across, then
-- drops "Others". Where "Others" never existed, nothing changes.

insert into categories (name, related) values ('Other', '{}')
on conflict (name) do nothing;

update items set category = 'Other' where category = 'Others';

update categories set related = array_remove(related, 'Others') where 'Others' = any (related);

delete from categories where name = 'Others';
