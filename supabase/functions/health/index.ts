import { handleCors, jsonResponse } from '../_shared/http.ts';

Deno.serve((req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  }

  return jsonResponse({
    ok: true,
    service: 'homestock-supabase',
  });
});
