export function requireInternalSecret(req: Request): void {
  const expected = Deno.env.get('HOMESTOCK_INTERNAL_SECRET');
  if (!expected) {
    throw new Error('HomeStock internal secret is not configured.');
  }

  const actual = req.headers.get('x-homestock-internal-secret');
  if (!actual || actual !== expected) {
    throw new Error('Unauthorized internal request.');
  }
}
