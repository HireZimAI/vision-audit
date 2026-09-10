/**
 * POST /api/audit
 *
 * Runs on Cloudflare Pages Functions. The browser posts here, on the same
 * origin as the page, so there is no CORS preflight and the n8n webhook URL
 * never appears in client source.
 *
 * Environment variables (Pages > Settings > Variables and Secrets):
 *   N8N_WEBHOOK_URL   required   the n8n production webhook URL
 *   AUDIT_SHARED_SECRET  optional  sent as X-Audit-Secret; enable Header Auth
 *                                  on the n8n webhook node to require it
 */

const MAX_BODY = 32 * 1024; // a full submission is ~6 KB
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.N8N_WEBHOOK_URL) {
    return json(500, { ok: false, error: 'not_configured' });
  }

  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY) {
    return json(413, { ok: false, error: 'too_large' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'bad_json' });
  }

  if (!body || typeof body !== 'object') {
    return json(400, { ok: false, error: 'bad_json' });
  }
  if (!EMAIL.test(String(body.email || ''))) {
    return json(400, { ok: false, error: 'bad_email' });
  }
  if (body.consent !== true) {
    return json(400, { ok: false, error: 'no_consent' });
  }
  if (typeof body.overall !== 'number') {
    return json(400, { ok: false, error: 'no_score' });
  }

  // Server-side facts the client should not be trusted to supply.
  const enriched = {
    ...body,
    ip_country: request.headers.get('cf-ipcountry') || '',
    user_agent: request.headers.get('user-agent') || '',
    referer: request.headers.get('referer') || '',
    received_at: new Date().toISOString(),
  };

  const headers = { 'content-type': 'application/json' };
  if (env.AUDIT_SHARED_SECRET) {
    headers['X-Audit-Secret'] = env.AUDIT_SHARED_SECRET;
  }

  try {
    const upstream = await fetch(env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(enriched),
    });
    if (!upstream.ok) {
      return json(502, { ok: false, error: 'upstream_' + upstream.status });
    }
    return json(200, { ok: true });
  } catch {
    return json(502, { ok: false, error: 'upstream_unreachable' });
  }
}

/**
 * A GET on this path is a deployment probe. It never returns the secret,
 * only whether the environment variable is present, which is the single
 * most common reason submissions go nowhere.
 *
 *   {"error":"method_not_allowed","configured":true}   function live, env set
 *   {"error":"method_not_allowed","configured":false}  function live, env MISSING
 *   an HTML page or a 404                              function not deployed
 */
export async function onRequestGet(context) {
  return json(405, {
    ok: false,
    error: 'method_not_allowed',
    configured: Boolean(context.env.N8N_WEBHOOK_URL),
    secret_set: Boolean(context.env.AUDIT_SHARED_SECRET),
  });
}
