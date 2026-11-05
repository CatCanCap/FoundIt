-- Feature 4: both people update the handoff. The finder marks the item handed
-- over (or dropped off), then the owner confirms they have it back. If the owner
-- never confirms, the daily job completes it 7 days after it was handed over.
alter table handoffs drop constraint handoffs_status_check;

alter table handoffs
  add constraint handoffs_status_check
    check (status in ('pending', 'handed_over', 'completed')),
  add column handed_over_at timestamptz,
  add column completed_at timestamptz;
