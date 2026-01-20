import type { AstroCookies } from "astro"
import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr"

import type { Database } from "./database.types"
import type { SupabaseClient } from "./supabase.client"

export const cookieOptions: CookieOptionsWithName = {
  path: "/",
  secure: import.meta.env.PROD,
  httpOnly: true,
  sameSite: "lax",
}

function parseCookieHeader(cookieHeader: string): { name: string; value: string }[] {
  if (!cookieHeader) {
    return []
  }
  return cookieHeader.split(";").map((cookie) => {
    const [name, ...rest] = cookie.trim().split("=")
    return { name, value: rest.join("=") }
  })
}

export function createSupabaseServerInstance(
  context: {
    headers: Headers
    cookies: AstroCookies
  },
  apiKeyOverride?: string
): SupabaseClient {
  const supabaseUrl = import.meta.env.SUPABASE_URL
  const supabaseKey = apiKeyOverride ?? import.meta.env.SUPABASE_KEY

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return parseCookieHeader(context.headers.get("cookie") ?? "")
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          context.cookies.set(name, value, options)
        })
      },
    },
  })
}
