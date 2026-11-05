-- One handoff at a time on each match. The finder accepts a claim by planning
-- the handoff; two clicks sent at the same moment both passed the "this match
-- already has a handoff" check in handoffs-controller.js and made two pending
-- handoffs. With this index the second insert fails, and the API answers 409.
-- Completed handoffs are left out of the rule, as the controller already does.
--
-- If a database already has two unfinished handoffs on one match, this fails:
-- check first with
--   select match_id, count(*) from handoffs where status <> 'completed'
--   group by match_id having count(*) > 1;
-- and delete the newer duplicate before pushing.

create unique index if not exists handoffs_one_open_per_match
  on handoffs (match_id)
  where status <> 'completed';
