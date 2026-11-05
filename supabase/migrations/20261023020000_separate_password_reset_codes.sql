-- Password reset codes get their own columns. Until now a reset used the same
-- columns as the code that confirms an SMU email, so anyone who typed someone
-- else's email into "Forgot password?" could replace that person's email code,
-- or lock it with wrong guesses. Now the two codes are kept apart, and each
-- follows the same rules (lib/verify-code.js): 15 minutes, at most one email a
-- minute, and 5 wrong tries per half hour.
--
-- Only adds columns, so nothing already stored changes. Like the email code,
-- only the code's hash is kept, and none of these leave the server
-- (User.toPublic leaves them out).

alter table users
  add column reset_code_hash text,
  add column reset_code_expires_at timestamptz,
  add column reset_code_sent_at timestamptz,
  add column reset_attempts integer not null default 0;
