#!/bin/bash
# PRO-017 R1：同一個邀請者的兩個連線同時呼叫 claim_referral_reward()，只能發放一次。
# 只在本機的資料庫執行（會 commit 合成資料，結束時刪除）：
#   tests/database/support/supabase-standin.sql → pwa/db 的 001～019 依序套用之後，
#   bash tests/database/support/pro017-concurrency.sh <資料庫名稱>
# 做法：第一個連線在 transaction 裡領取後 pg_sleep 2 秒才 commit（一直鎖著 entitlement 列）；
# 第二個連線在這期間領取，必須等第一個 commit，然後看到「已領過」。
# 這個腳本驗證的是結果（只發一次、兩邊的期限相同），分不出是哪一道防線擋下的：019 的
# INSERT … ON CONFLICT DO NOTHING 碰到正在被另一個 transaction 更新的同一列時也會等它 commit，
# 所以拿掉 FOR UPDATE 與 UPDATE 的 WHERE … IS NULL 之後這裡仍然通過（本機實測）。三道防線都保留。
set -euo pipefail
DB=${1:?usage: pro017-concurrency.sh <local database>}
P=(psql -X -q -A -t -v ON_ERROR_STOP=1 -d "$DB")
A=00000000-0000-4000-8000-0000001700ca

if "${P[@]}" -c "select 1 from pg_roles where rolname = 'supabase_admin'" | grep -q 1; then
  echo "refusing to run: this looks like a real Supabase database" >&2
  exit 1
fi

cleanup() {
  "${P[@]}" -c "delete from auth.users where email like 'pro017-cc-%@example.invalid'" >/dev/null
}
trap cleanup EXIT
cleanup

"${P[@]}" <<SQL >/dev/null
begin;
insert into auth.users (id, email, created_at)
select ('00000000-0000-4000-8000-0000001700c' || x)::uuid, 'pro017-cc-' || x || '@example.invalid',
       case when x = 'a' then now() - interval '30 days' else now() - interval '6 days' end
from unnest(array['a', '1', '2', '3']) as x;
-- 邀請者通常已經有 entitlement 列（試用時建立），讓兩個連線走 FOR UPDATE 的路
insert into public.pro_entitlements (user_id, trial_started_at) values ('$A'::uuid, now() - interval '40 days');
insert into public.referrals (invitee_id, inviter_id)
select ('00000000-0000-4000-8000-0000001700c' || x)::uuid, '$A'::uuid from unnest(array['1', '2', '3']) as x;
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select ('00000000-0000-4000-8000-0000001700c' || x)::uuid, 'pro017 cc', (now() at time zone 'UTC')::date - g,
       now(), now(), 30, 'complete', 50, 50, 10, 0, 'task', 'growth', 'A', 1.0, true
from unnest(array['1', '2', '3']) as x cross join generate_series(0, 6) g;
commit;
SQL

claim() {
  "${P[@]}" <<SQL
begin;
select set_config('request.jwt.claims', '{"sub":"$A","role":"authenticated"}', true) \\g /dev/null
set local role authenticated;
select status || ' ' || coalesce(expires_at::text, '-') from public.claim_referral_reward();
select pg_sleep($1) \\g /dev/null
commit;
SQL
}

claim 2 >/tmp/pro017-cc-1.out &
first=$!
sleep 0.5
claim 0 >/tmp/pro017-cc-2.out
wait $first

r1=$(cat /tmp/pro017-cc-1.out); r2=$(cat /tmp/pro017-cc-2.out)
echo "first:  $r1"
echo "second: $r2"
granted=$(printf '%s\n%s\n' "$r1" "$r2" | grep -c '^granted ' || true)
already=$(printf '%s\n%s\n' "$r1" "$r2" | grep -c '^already_granted ' || true)
e1=${r1#* }; e2=${r2#* }
if [ "$granted" = 1 ] && [ "$already" = 1 ] && [ "$e1" = "$e2" ]; then
  echo "PASS: exactly one grant; both report the same expiry"
else
  echo "FAIL: expected one granted and one already_granted with the same expiry" >&2
  exit 1
fi
