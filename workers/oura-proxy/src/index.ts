/**
 * Oura Ring OAuth Proxy + Data Sync Worker
 * Handles: OAuth flow, token exchange, data sync from Oura API → Supabase
 */

interface Env {
  OURA_CLIENT_ID: string;
  OURA_CLIENT_SECRET: string;
  OURA_AUTHORIZE_URL: string;
  OURA_TOKEN_URL: string;
  OURA_API_BASE: string;
  FRONTEND_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ─── Step 1: Start OAuth — redirect user to Oura ───
      if (path === '/auth/start') {
        const memberId = url.searchParams.get('member_id');
        const ownerId = url.searchParams.get('owner_id');
        if (!memberId || !ownerId) {
          return json({ error: 'member_id and owner_id required' }, 400);
        }

        const state = btoa(JSON.stringify({ member_id: memberId, owner_id: ownerId }));
        const redirectUri = `${url.origin}/auth/callback`;

        const authUrl = new URL(env.OURA_AUTHORIZE_URL);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', env.OURA_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', 'daily heartrate personal spo2 session workout');
        authUrl.searchParams.set('state', state);

        return Response.redirect(authUrl.toString(), 302);
      }

      // ─── Step 2: OAuth Callback — exchange code for token ───
      if (path === '/auth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          return Response.redirect(`${env.FRONTEND_URL}/wearables?error=${error}`, 302);
        }
        if (!code || !state) {
          return Response.redirect(`${env.FRONTEND_URL}/wearables?error=missing_code`, 302);
        }

        let stateData: { member_id: string; owner_id: string };
        try {
          stateData = JSON.parse(atob(state));
        } catch {
          return Response.redirect(`${env.FRONTEND_URL}/wearables?error=invalid_state`, 302);
        }

        const redirectUri = `${url.origin}/auth/callback`;

        // Exchange code for tokens
        const tokenRes = await fetch(env.OURA_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: env.OURA_CLIENT_ID,
            client_secret: env.OURA_CLIENT_SECRET,
          }),
        });

        if (!tokenRes.ok) {
          const err = await tokenRes.text();
          console.error('Token exchange failed:', err);
          return Response.redirect(`${env.FRONTEND_URL}/wearables?error=token_exchange_failed`, 302);
        }

        const tokens = await tokenRes.json() as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
          token_type: string;
        };

        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        // Upsert wearable connection in Supabase
        const { member_id, owner_id } = stateData;

        // Check for existing connection
        const existingRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/wearable_connections?owner_id=eq.${owner_id}&member_id=eq.${member_id}&provider=eq.oura&select=id`,
          {
            headers: {
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            },
          }
        );
        const existing = await existingRes.json() as { id: string }[];

        const connectionData = {
          owner_id,
          member_id,
          provider: 'oura',
          status: 'connected',
          access_token_encrypted: tokens.access_token,
          refresh_token_encrypted: tokens.refresh_token,
          token_expires_at: expiresAt,
          last_sync_at: new Date().toISOString(),
          metadata: { scopes: 'daily heartrate personal spo2 session workout' },
        };

        if (existing && existing.length > 0) {
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/wearable_connections?id=eq.${existing[0].id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify(connectionData),
            }
          );
        } else {
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/wearable_connections`,
            {
              method: 'POST',
              headers: {
                'apikey': env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify(connectionData),
            }
          );
        }

        // Trigger initial sync
        await syncOuraData(env, tokens.access_token, member_id, owner_id);

        return Response.redirect(`${env.FRONTEND_URL}/wearables?connected=oura`, 302);
      }

      // ─── Step 3: Manual Sync ───
      if (path === '/sync' && request.method === 'POST') {
        const body = await request.json() as { connection_id: string };
        if (!body.connection_id) {
          return json({ error: 'connection_id required' }, 400);
        }

        // Fetch connection from Supabase
        const connRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/wearable_connections?id=eq.${body.connection_id}&select=*`,
          {
            headers: {
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            },
          }
        );
        const conns = await connRes.json() as Array<{
          id: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          token_expires_at: string;
          member_id: string;
          owner_id: string;
        }>;

        if (!conns || conns.length === 0) {
          return json({ error: 'Connection not found' }, 404);
        }

        const conn = conns[0];
        let accessToken = conn.access_token_encrypted;

        // Check if token expired, refresh if needed
        if (new Date(conn.token_expires_at) < new Date()) {
          const refreshed = await refreshToken(env, conn.refresh_token_encrypted);
          if (refreshed) {
            accessToken = refreshed.access_token;
            // Update tokens in DB
            await fetch(
              `${env.SUPABASE_URL}/rest/v1/wearable_connections?id=eq.${conn.id}`,
              {
                method: 'PATCH',
                headers: {
                  'apikey': env.SUPABASE_SERVICE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal',
                },
                body: JSON.stringify({
                  access_token_encrypted: refreshed.access_token,
                  refresh_token_encrypted: refreshed.refresh_token,
                  token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
                }),
              }
            );
          } else {
            // Mark connection as error
            await fetch(
              `${env.SUPABASE_URL}/rest/v1/wearable_connections?id=eq.${conn.id}`,
              {
                method: 'PATCH',
                headers: {
                  'apikey': env.SUPABASE_SERVICE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal',
                },
                body: JSON.stringify({ status: 'error' }),
              }
            );
            return json({ error: 'Token refresh failed. Please reconnect.' }, 401);
          }
        }

        const result = await syncOuraData(env, accessToken, conn.member_id, conn.owner_id);

        // Update last_sync_at
        await fetch(
          `${env.SUPABASE_URL}/rest/v1/wearable_connections?id=eq.${conn.id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ last_sync_at: new Date().toISOString() }),
          }
        );

        return json({ success: true, ...result });
      }

      // ─── Health check ───
      if (path === '/health') {
        return json({ status: 'ok', service: 'oura-proxy' });
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: 'Internal server error', details: String(err) }, 500);
    }
  },
};

/* ─── Refresh Oura Token ─── */
async function refreshToken(env: Env, refreshToken: string) {
  const res = await fetch(env.OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.OURA_CLIENT_ID,
      client_secret: env.OURA_CLIENT_SECRET,
    }),
  });

  if (!res.ok) return null;
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

/* ─── Sync Oura Data → Supabase vitals ─── */
async function syncOuraData(
  env: Env,
  accessToken: string,
  memberId: string,
  ownerId: string
): Promise<{ synced: number; errors: string[] }> {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const headers = { Authorization: `Bearer ${accessToken}` };
  const errors: string[] = [];
  const vitals: Array<Record<string, unknown>> = [];

  // ─── Daily Sleep ───
  try {
    const res = await fetch(`${env.OURA_API_BASE}/daily_sleep?start_date=${weekAgo}&end_date=${today}`, { headers });
    if (res.ok) {
      const data = await res.json() as { data: Array<{ day: string; score: number; contributors: Record<string, number> }> };
      for (const d of data.data ?? []) {
        vitals.push({
          member_id: memberId,
          owner_id: ownerId,
          vital_type: 'sleep_score',
          value_primary: d.score,
          unit: 'score',
          source: 'wearable',
          notes: `Oura Ring sleep score`,
          recorded_at: `${d.day}T08:00:00Z`,
          metadata: { provider: 'oura', contributors: d.contributors },
        });
      }
    }
  } catch (e) { errors.push(`sleep: ${e}`); }

  // ─── Daily Readiness ───
  try {
    const res = await fetch(`${env.OURA_API_BASE}/daily_readiness?start_date=${weekAgo}&end_date=${today}`, { headers });
    if (res.ok) {
      const data = await res.json() as { data: Array<{ day: string; score: number; contributors: Record<string, number> }> };
      for (const d of data.data ?? []) {
        vitals.push({
          member_id: memberId,
          owner_id: ownerId,
          vital_type: 'other',
          value_primary: d.score,
          unit: 'score',
          source: 'wearable',
          notes: `Oura Ring readiness score`,
          recorded_at: `${d.day}T08:00:00Z`,
          metadata: { provider: 'oura', data_type: 'readiness_score', contributors: d.contributors },
        });
      }
    }
  } catch (e) { errors.push(`readiness: ${e}`); }

  // ─── Daily Activity ───
  try {
    const res = await fetch(`${env.OURA_API_BASE}/daily_activity?start_date=${weekAgo}&end_date=${today}`, { headers });
    if (res.ok) {
      const data = await res.json() as { data: Array<{ day: string; score: number; steps: number; active_calories: number }> };
      for (const d of data.data ?? []) {
        vitals.push({
          member_id: memberId,
          owner_id: ownerId,
          vital_type: 'steps',
          value_primary: d.steps,
          unit: 'steps',
          source: 'wearable',
          notes: `Oura Ring daily steps`,
          recorded_at: `${d.day}T23:59:00Z`,
          metadata: { provider: 'oura', activity_score: d.score, active_calories: d.active_calories },
        });
      }
    }
  } catch (e) { errors.push(`activity: ${e}`); }

  // ─── Heart Rate (latest samples) ───
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = await fetch(`${env.OURA_API_BASE}/heartrate?start_datetime=${yesterday}T00:00:00Z&end_datetime=${today}T23:59:59Z`, { headers });
    if (res.ok) {
      const data = await res.json() as { data: Array<{ bpm: number; source: string; timestamp: string }> };
      // Get resting HR (lowest reading)
      const samples = data.data ?? [];
      if (samples.length > 0) {
        const restingSamples = samples.filter(s => s.source === 'rest' || s.source === 'sleep');
        const target = restingSamples.length > 0 ? restingSamples : samples;
        const lowest = target.reduce((min, s) => s.bpm < min.bpm ? s : min, target[0]);
        vitals.push({
          member_id: memberId,
          owner_id: ownerId,
          vital_type: 'heart_rate',
          value_primary: lowest.bpm,
          unit: 'bpm',
          source: 'wearable',
          notes: `Oura Ring resting heart rate`,
          recorded_at: lowest.timestamp,
          metadata: { provider: 'oura', sample_count: samples.length },
        });
      }
    }
  } catch (e) { errors.push(`heartrate: ${e}`); }

  // ─── Daily SpO2 ───
  try {
    const res = await fetch(`${env.OURA_API_BASE}/daily_spo2?start_date=${weekAgo}&end_date=${today}`, { headers });
    if (res.ok) {
      const data = await res.json() as { data: Array<{ day: string; spo2_percentage: { average: number } }> };
      for (const d of data.data ?? []) {
        if (d.spo2_percentage?.average) {
          vitals.push({
            member_id: memberId,
            owner_id: ownerId,
            vital_type: 'spo2',
            value_primary: d.spo2_percentage.average,
            unit: '%',
            source: 'wearable',
            notes: `Oura Ring SpO2`,
            recorded_at: `${d.day}T08:00:00Z`,
            metadata: { provider: 'oura' },
          });
        }
      }
    }
  } catch (e) { errors.push(`spo2: ${e}`); }

  // ─── HRV (from sleep sessions) ───
  try {
    const res = await fetch(`${env.OURA_API_BASE}/sleep?start_date=${weekAgo}&end_date=${today}`, { headers });
    if (res.ok) {
      const data = await res.json() as { data: Array<{ day: string; average_hrv: number; lowest_heart_rate: number }> };
      for (const d of data.data ?? []) {
        if (d.average_hrv) {
          vitals.push({
            member_id: memberId,
            owner_id: ownerId,
            vital_type: 'hrv',
            value_primary: d.average_hrv,
            unit: 'ms',
            source: 'wearable',
            notes: `Oura Ring HRV (sleep avg)`,
            recorded_at: `${d.day}T08:00:00Z`,
            metadata: { provider: 'oura', lowest_heart_rate: d.lowest_heart_rate },
          });
        }
      }
    }
  } catch (e) { errors.push(`hrv: ${e}`); }

  // ─── Upsert vitals to Supabase ───
  if (vitals.length > 0) {
    // Delete existing oura vitals for this member in the date range to avoid dupes
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/vitals?member_id=eq.${memberId}&source=eq.wearable&recorded_at=gte.${weekAgo}T00:00:00Z&notes=like.Oura*`,
      {
        method: 'DELETE',
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    // Insert fresh data
    const insertRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/vitals`,
      {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(vitals),
      }
    );

    if (!insertRes.ok) {
      const err = await insertRes.text();
      errors.push(`insert: ${err}`);
    }
  }

  return { synced: vitals.length, errors };
}
