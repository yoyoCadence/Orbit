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
  throw new Error(`Refusing to run PRO-014D data mutations against non-local host: ${apiHost}`);
}

const password = 'Orbit-Pro014D-Local-Only-29!';
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
    throw new Error(`${method} ${path} failed with HTTP ${response.status}`);
  }

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

async function signUp(label) {
  const response = await request('/auth/v1/signup', {
    method: 'POST',
    body: {
      email: `pro014d-${label}-${randomUUID()}@example.test`,
      password,
    },
  });
  if (!response.data?.access_token || !response.data?.user?.id) {
    throw new Error(`Local Auth did not issue a token for ${label}`);
  }
  return response.data;
}

const userA = await signUp('api-a');
const userB = await signUp('api-b');

const firstTrial = await request('/rest/v1/rpc/start_trial', {
  method: 'POST',
  token: userA.access_token,
  body: {},
});
const repeatedTrial = await request('/rest/v1/rpc/start_trial', {
  method: 'POST',
  token: userA.access_token,
  body: {},
});
const statusA = await request('/rest/v1/rpc/my_pro_status', {
  method: 'POST',
  token: userA.access_token,
  body: {},
});
const ownerRowsBefore = await request('/rest/v1/pro_entitlements?select=user_id', {
  token: userA.access_token,
});
const otherRowsBefore = await request('/rest/v1/pro_entitlements?select=user_id', {
  token: userB.access_token,
});

await request('/rest/v1/rpc/start_trial', {
  method: 'POST',
  token: userB.access_token,
  body: {},
});

const ownerRowsAfter = await request('/rest/v1/pro_entitlements?select=user_id', {
  token: userA.access_token,
});
const anonymousRpc = await request('/rest/v1/rpc/my_pro_status', {
  method: 'POST',
  body: {},
  expectOk: false,
});
const directInsert = await request('/rest/v1/pro_entitlements', {
  method: 'POST',
  token: userA.access_token,
  body: { user_id: userA.user.id, is_pro: true },
  expectOk: false,
});

const checks = {
  signupTokensIssued: Boolean(userA.access_token && userB.access_token),
  repeatedTrialSameTimestamp: firstTrial.data === repeatedTrial.data,
  rpcStatusActive: statusA.data?.[0]?.is_active === true,
  ownerRowCountBefore: ownerRowsBefore.data?.length,
  otherRowCountBefore: otherRowsBefore.data?.length,
  ownerRowCountAfterOtherTrial: ownerRowsAfter.data?.length,
  anonymousRpcHttpStatus: anonymousRpc.status,
  directInsertHttpStatus: directInsert.status,
};

if (!checks.repeatedTrialSameTimestamp || !checks.rpcStatusActive) {
  throw new Error(`RPC contract failed: ${JSON.stringify(checks)}`);
}
if (
  checks.ownerRowCountBefore !== 1
  || checks.otherRowCountBefore !== 0
  || checks.ownerRowCountAfterOtherTrial !== 1
) {
  throw new Error(`RLS owner isolation failed: ${JSON.stringify(checks)}`);
}
if (checks.anonymousRpcHttpStatus < 400 || checks.directInsertHttpStatus < 400) {
  throw new Error(`Data API permission boundary failed: ${JSON.stringify(checks)}`);
}

globalThis.console.log(JSON.stringify(checks, null, 2));
