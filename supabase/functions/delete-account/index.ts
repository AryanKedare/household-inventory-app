import { handleCors, jsonResponse } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

const RECENT_AUTH_MS = 15 * 60 * 1000;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { user } = await requireUser(req);
    const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
    if (!lastSignIn || Date.now() - lastSignIn > RECENT_AUTH_MS) {
      throw new Error('Please sign out and sign in again before deleting your account.');
    }

    const admin = createAdminClient();
    const { data: owned, error: ownedError } = await admin
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .limit(1);
    if (ownedError) throw ownedError;
    if ((owned ?? []).length > 0) {
      throw new Error('Transfer ownership or delete every household you own before deleting your account.');
    }

    const { error: membershipError } = await admin
      .from('household_members')
      .delete()
      .eq('user_id', user.id);
    if (membershipError) throw membershipError;

    const { error: profileError } = await admin
      .from('profiles')
      .update({ default_household_id: null, email: null, display_name: 'Deleted user' })
      .eq('id', user.id);
    if (profileError) throw profileError;

    const { error: deviceError } = await admin.from('devices').delete().eq('user_id', user.id);
    if (deviceError) throw deviceError;
    const { error: quotaError } = await admin.from('ai_usage').delete().eq('user_id', user.id);
    if (quotaError) throw quotaError;

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, true);
    if (deleteError) throw deleteError;

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('delete-account failed', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to delete account.' }, 400);
  }
});
