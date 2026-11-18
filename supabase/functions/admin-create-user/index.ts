// =============================================================================
// IndentFlow  |  Phase 2: Edge Function  "admin-create-user"
// =============================================================================
// Creates a new user in one step: the login (Supabase Auth), the profile with
// its role, and the site assignments. This has to run on the server because it
// needs the project's secret key, which must never be in the browser.
//
// Who may call it: a signed-in, active user whose role is "admin".
//
// Request (POST, JSON):
//   { "email": "...", "full_name": "...", "role": "site_engineer",
//     "phone": "...", "site_ids": ["uuid", ...], "password": "optional" }
//   - With "password": the login is created immediately with that password.
//   - Without it: Supabase emails the person an invitation to set their own.
//
// Response: 200 { "user_id": "...", "mode": "password" | "invite" }
//           4xx { "error": "plain-language reason" }
// =============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ROLES = [
  'admin', 'site_engineer', 'storekeeper', 'project_manager',
  'procurement_manager', 'procurement_clerk', 'md',
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// The secret (service) key is provided to Edge Functions by Supabase itself.
function getSecretKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw)
      return keys.default ?? (Object.values(keys)[0] as string) ?? null
    } catch (_e) {
      return null
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' })

  const url = Deno.env.get('SUPABASE_URL')
  const secretKey = getSecretKey()
  if (!url || !secretKey) return reply(500, { error: 'Server is missing its Supabase configuration' })

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ---- 1. Who is calling? Must be an active admin. --------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return reply(401, { error: 'You must be signed in' })

  const { data: callerData, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !callerData?.user) return reply(401, { error: 'Your session is not valid. Sign in again.' })
  const callerId = callerData.user.id

  const { data: callerProfile, error: profileError } = await admin
    .schema('core').from('profiles').select('role, is_active').eq('id', callerId).maybeSingle()
  if (profileError) return reply(500, { error: 'Could not check your role: ' + profileError.message })
  if (!callerProfile || callerProfile.is_active === false || callerProfile.role !== 'admin') {
    return reply(403, { error: 'Only an admin can create users' })
  }

  // ---- 2. Validate the request ----------------------------------------------
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (_e) {
    return reply(400, { error: 'Request body must be JSON' })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const fullName = String(body.full_name ?? '').trim()
  const role = String(body.role ?? '').trim()
  const phone = String(body.phone ?? '').trim()
  const password = body.password ? String(body.password) : ''
  const siteIds = Array.isArray(body.site_ids) ? body.site_ids.map((s) => String(s)) : []

  if (!fullName) return reply(400, { error: 'Name is required' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'A valid email is required' })
  if (!ALLOWED_ROLES.includes(role)) return reply(400, { error: 'Unknown role: ' + role })
  if (password && password.length < 8) return reply(400, { error: 'Password must be at least 8 characters' })

  const { data: existingProfile } = await admin
    .schema('core').from('profiles').select('id').eq('email', email).maybeSingle()
  if (existingProfile) return reply(409, { error: 'A user with this email already exists' })

  // ---- 3. Create the login ---------------------------------------------------
  const mode = password ? 'password' : 'invite'
  let newUserId: string | null = null

  if (password) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error || !data?.user) {
      return reply(400, { error: 'Could not create the login: ' + (error?.message ?? 'unknown error') })
    }
    newUserId = data.user.id
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    })
    if (error || !data?.user) {
      return reply(400, { error: 'Could not send the invitation: ' + (error?.message ?? 'unknown error') })
    }
    newUserId = data.user.id
  }

  // ---- 4. Profile and site assignments. Undo the login if these fail. --------
  const undo = async (reason: string) => {
    await admin.schema('core').from('site_assignments').delete().eq('user_id', newUserId!)
    await admin.schema('core').from('profiles').delete().eq('id', newUserId!)
    await admin.auth.admin.deleteUser(newUserId!)
    return reply(500, { error: reason })
  }

  const { error: insertProfileError } = await admin.schema('core').from('profiles').upsert(
    { id: newUserId, full_name: fullName, email, role, phone, is_active: true },
    { onConflict: 'id' },
  )
  if (insertProfileError) return await undo('Could not save the profile: ' + insertProfileError.message)

  if (siteIds.length > 0) {
    const rows = siteIds.map((siteId) => ({ user_id: newUserId, site_id: siteId }))
    const { error: assignError } = await admin.schema('core').from('site_assignments').insert(rows)
    if (assignError) return await undo('Could not save the site assignments: ' + assignError.message)
  }

  // ---- 5. Event log (best effort) -------------------------------------------
  await admin.schema('indent_flow').from('events').insert({
    event_type: 'user.created',
    entity_type: 'user',
    entity_id: newUserId,
    actor_id: callerId,
    payload: { email, role, mode, site_ids: siteIds },
  })

  return reply(200, { user_id: newUserId, mode })
})
