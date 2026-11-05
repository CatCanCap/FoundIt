-- The finder's hidden question, set when reporting a found item (feature 1).
-- The owner answers it before the handoff chat opens (feature 4).
-- Only the bcrypt hash of the answer is stored, and it never leaves the server.
-- Items reported before this change have no question, so both columns may be empty.
alter table items
  add column claim_question text,
  add column claim_answer_hash text;

-- Only found items have a question, and a question always comes with its answer
alter table items
  add constraint items_claim_found_only
    check (type = 'found' or (claim_question is null and claim_answer_hash is null)),
  add constraint items_claim_question_with_answer
    check ((claim_question is null) = (claim_answer_hash is null));
