import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';

const apiUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

const apiHost = new URL(apiUrl).hostname;
if (apiHost !== '127.0.0.1' && apiHost !== 'localhost') {
  throw new Error(`Refusing to run PRO-014L data mutations against non-local host: ${apiHost}`);
}

const password = 'Orbit-Pro014L-Local-Only-01!';
const commonHeaders = {
  apikey: anonKey,
  authorization: `Bearer ${anonKey}`,
  'content-type': 'application/json',
};

async function request(path, { method = 'GET', token = anonKey, body, expectOk = true } = {}) {
  const response = await globalThis.fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...commonHeaders,
      authorization: `Bearer ${token}`,
      prefer: 'return=representation',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (expectOk && !response.ok) {
    const detail = await response.text();
    throw new Error(`${method} ${path} failed with HTTP ${response.status}: ${detail}`);
  }
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

async function signUp(label) {
  const response = await request('/auth/v1/signup', {
    method: 'POST',
    body: {
      email: `pro014l-${label}-${randomUUID()}@example.test`,
      password,
      data: { name: `PRO-014L ${label}` },
    },
  });
  if (!response.data?.access_token || !response.data?.user?.id) {
    throw new Error(`Local Auth did not issue a token for ${label}`);
  }
  return response.data;
}

function localIsoDate(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function effectiveSession(userId, offsetDays) {
  const date = localIsoDate(offsetDays);
  return {
    id: randomUUID(),
    user_id: userId,
    task_id: null,
    task_name: 'Effective task',
    task_emoji: null,
    date,
    started_at: `${date}T09:00:00.000Z`,
    completed_at: `${date}T09:30:00.000Z`,
    duration_minutes: 30,
    result: 'complete',
    base_xp: 50,
    final_xp: 50,
    energy_cost: 10,
    energy_gain: 0,
    impact_type: 'task',
    task_nature: 'growth',
    value: 'A',
    resistance: 1,
    is_productive_xp: true,
  };
}

const eligible = await signUp('eligible');
const other = await signUp('other');

await request('/rest/v1/sessions', {
  method: 'POST',
  token: eligible.access_token,
  body: Array.from({ length: 45 }, (_, index) => effectiveSession(eligible.user.id, -index)),
});

const [firstConcurrent, secondConcurrent] = await Promise.all([
  request('/rest/v1/rpc/grant_streak_unlock', {
    method: 'POST', token: eligible.access_token, body: {},
  }),
  request('/rest/v1/rpc/grant_streak_unlock', {
    method: 'POST', token: eligible.access_token, body: {},
  }),
]);
const concurrentRows = [firstConcurrent.data?.[0], secondConcurrent.data?.[0]];
const statuses = concurrentRows.map(row => row?.status).sort();

const repeat = await request('/rest/v1/rpc/grant_streak_unlock', {
  method: 'POST', token: eligible.access_token, body: {},
});
const notEligible = await request('/rest/v1/rpc/grant_streak_unlock', {
  method: 'POST', token: other.access_token, body: {},
});
const ownEntitlement = await request(
  '/rest/v1/pro_entitlements?select=user_id,is_pro,pro_expires_at,streak_unlock_granted_at',
  { token: eligible.access_token },
);
const anonymousRpc = await request('/rest/v1/rpc/grant_streak_unlock', {
  method: 'POST', body: {}, expectOk: false,
});
const forgedArgs = await request('/rest/v1/rpc/grant_streak_unlock', {
  method: 'POST',
  token: other.access_token,
  body: { streak_days: 45, expires_at: '2099-01-01T00:00:00Z' },
  expectOk: false,
});
const directMarkerReset = await request('/rest/v1/pro_entitlements', {
  method: 'PATCH',
  token: eligible.access_token,
  body: { streak_unlock_granted_at: null },
  expectOk: false,
});

const [grantedRow, alreadyRow] = concurrentRows
  .sort((a, b) => String(a?.status).localeCompare(String(b?.status)));
const checks = {
  concurrentStatuses: statuses,
  concurrentSameExpiry: grantedRow?.expires_at === alreadyRow?.expires_at,
  concurrentSameGrantedAt: grantedRow?.granted_at === alreadyRow?.granted_at,
  repeatStatus: repeat.data?.[0]?.status,
  notEligibleStatus: notEligible.data?.[0]?.status,
  ownEntitlementRows: ownEntitlement.data?.length,
  ownMarkerPresent: Boolean(ownEntitlement.data?.[0]?.streak_unlock_granted_at),
  anonymousRpcHttpStatus: anonymousRpc.status,
  forgedArgsHttpStatus: forgedArgs.status,
  directMarkerResetHttpStatus: directMarkerReset.status,
};

if (JSON.stringify(statuses) !== JSON.stringify(['already_granted', 'granted'])) {
  throw new Error(`Concurrent once-only claim failed: ${JSON.stringify(checks)}`);
}
if (!checks.concurrentSameExpiry || !checks.concurrentSameGrantedAt) {
  throw new Error(`Concurrent results disagree: ${JSON.stringify(checks)}`);
}
if (checks.repeatStatus !== 'already_granted' || checks.notEligibleStatus !== 'not_eligible') {
  throw new Error(`RPC state contract failed: ${JSON.stringify(checks)}`);
}
if (checks.ownEntitlementRows !== 1 || !checks.ownMarkerPresent) {
  throw new Error(`Entitlement persistence failed: ${JSON.stringify(checks)}`);
}
if (
  checks.anonymousRpcHttpStatus < 400
  || checks.forgedArgsHttpStatus < 400
  || checks.directMarkerResetHttpStatus < 400
) {
  throw new Error(`Data API permission/input boundary failed: ${JSON.stringify(checks)}`);
}

globalThis.console.log(JSON.stringify(checks, null, 2));
