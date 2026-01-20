import type { APIRoute } from "astro"

import { ApiErrors, jsonOk } from "../../../lib/http/api-response"
import { createSupabaseServerInstance } from "../../../db/supabase.server"

export const prerender = false

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerInstance({
    cookies,
    headers: request.headers,
  })

  const { error } = await supabase.auth.signOut()

  if (error) {
    return ApiErrors.serverError("Failed to log out")
  }

  return jsonOk({ ok: true })
}
