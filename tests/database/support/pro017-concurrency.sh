#!/bin/bash
# PRO-017 R1：同一個邀請者的兩個連線同時呼叫 claim_referral_reward()，只能發放一次。
# 只在本機的資料庫執行（會 commit 合成資料，結束時刪除）：
#   tests/database/support/supabase-standin.sql → pwa/db 的 001～019 依序套用之後，
#   bash tests/database/support/pro017-concurrency.sh <資料庫名稱>
# 兩個情境，都要「只發一次、兩邊的期限相同」：
#   1. 第一個連線領取後 pg_sleep 2 秒才 commit；第二個連線在這期間領取。
#   2. 另一個連線先以 SELECT … FOR UPDATE 鎖住邀請者的 entitlement 列 2 秒，兩個領取同時開始，
#      等鎖放開後一起往下走。
# 019 有兩道防線：FOR UPDATE（讓同一個邀請者的領取排隊）與發放的 UPDATE … WHERE 標記 IS NULL。
# 情境 1 裡 INSERT … ON CONFLICT 也會等正在更新同一列的 transaction，兩道都拿掉仍然通過；
# 情境 2 的列只是被鎖住、沒有被更新，INSERT 不會等，兩道都拿掉時會發放兩次（本機實測），
# 所以情境 2 才驗證得到防線。只拿掉其中一道時兩個情境都仍然通過（另一道擋下）。
set -euo pipefail
DB=${1:?usage: pro017-concurrency.sh <local database>}
P=(psql -X -q -A -t -v ON_ERROR_STOP=1 -d "$DB")
A=00000000-0000-4000-8000-0000001700ca

if "${P[@]}" -c "select 1 from pg_roles where rolname = 'supabase_admin'" | grep -q 1; then
  echo "refusing to run: this looks like a real Supabase database" >&2
  exit 1
fi

OUT=$(mktemp -d)
cleanup() {
  "${P[@]}" -c "delete from auth.users where email like 'pro017-cc-%@example.invalid'" >/dev/null
  rm -rf "$OUT"
}
trap cleanup EXIT
"${P[@]}" -c "delete from auth.users where email like 'pro017-cc-%@example.invalid'" >/dev/null

"${P[@]}" <<SQL >/dev/null
begin;
insert into auth.users (id, email, created_at)
select ('00000000-0000-4000-8000-0000001700c' || x)::uuid, 'pro017-cc-' || x || '@example.invalid',
       case when x = 'a' then now() - interval '30 days' else now() - interval '8 days' end
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

check() {
  local name=$1 r1 r2 granted already
  r1=$(cat "$OUT/1.out"); r2=$(cat "$OUT/2.out")
  echo "$name first:  $r1"
  echo "$name second: $r2"
  granted=$(printf '%s\n%s\n' "$r1" "$r2" | grep -c '^granted ' || true)
  already=$(printf '%s\n%s\n' "$r1" "$r2" | grep -c '^already_granted ' || true)
  if [ "$granted" = 1 ] && [ "$already" = 1 ] && [ "${r1#* }" = "${r2#* }" ]; then
    echo "PASS ($name): exactly one grant; both report the same expiry"
  else
    echo "FAIL ($name): expected one granted and one already_granted with the same expiry" >&2
    exit 1
  fi
}

# 情境 1
claim 2 >"$OUT/1.out" &
first=$!
sleep 0.5
claim 0 >"$OUT/2.out"
wait $first
check "case 1"

# 情境 2：先把獎勵還原成還沒領，再讓另一個連線鎖住這一列
"${P[@]}" -c "update public.pro_entitlements set is_pro = false, pro_expires_at = null, referral_reward_granted_at = null where user_id = '$A'" >/dev/null
"${P[@]}" <<SQL >/dev/null &
begin;
select 1 from public.pro_entitlements where user_id = '$A' for update;
select pg_sleep(2);
commit;
SQL
holder=$!
sleep 0.5
claim 0 >"$OUT/1.out" &
c1=$!
claim 0 >"$OUT/2.out" &
c2=$!
wait $holder $c1 $c2
check "case 2"
