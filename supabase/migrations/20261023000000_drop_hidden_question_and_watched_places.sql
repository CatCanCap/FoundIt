-- Moved here from supabase/pending/ with the WS5 claim routes, which no
-- longer use the hidden question (see docs/v2-handoff-notes.md).
-- applies it to both projects.
--
-- It removes what the final proposal dropped: the hidden question on found
-- items and on claims, and watched places.

-- 1. No hidden question on found items
alter table items
  drop constraint if exists items_claim_found_only,
  drop constraint if exists items_claim_question_with_answer,
  drop column if exists claim_question,
  drop column if exists claim_answer_hash;

-- 2. Claims: question attempts that never opened a chat are dropped, every
--    other claim gets its claimer, and the question columns go
delete from claims where question is not null and not verified;

update claims
set claimer_id = items.posted_by
from matches
join items on items.id = matches.lost_item_id
where matches.id = claims.match_id and claims.claimer_id is null;

alter table claims
  alter column claimer_id set not null,
  drop column question,
  drop column answer_hash,
  drop column attempts,
  drop column verified;

-- 3. No watched places
drop table if exists watched_places;
