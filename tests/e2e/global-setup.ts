import { createServerClient } from "@supabase/ssr"
import type { FullConfig } from "@playwright/test"
import dotenv from "dotenv"
import path from "node:path"

import type { Database } from "../../src/db/database.types.ts"

dotenv.config({ path: path.resolve(process.cwd(), ".env.test") })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY
const DEV_SUPABASE_USER_ID = process.env.DEV_SUPABASE_USER_ID

function log(message: string) {
  process.stdout.write(`${message}\n`)
}

function getRequiredEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]
    if (value) {
      return value
    }
  }
  throw new Error(`Missing env value. Set one of: ${keys.join(", ")}`)
}

function getDevUserId(): string {
  if (!DEV_SUPABASE_USER_ID) {
    throw new Error(
      "Missing DEV_SUPABASE_USER_ID for Playwright teardown cleanup.",
    )
  }
  return DEV_SUPABASE_USER_ID
}

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_KEY for Playwright teardown.",
    )
  }

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {
        return undefined
      },
    },
  })
}

export default async function globalSetup(_config: FullConfig) {
  log("[playwright] Global setup start")
  return async () => {
    log("[playwright] Global teardown start")
    const supabase = createSupabaseClient()
    const devUserId = getDevUserId()
    const userEmail = getRequiredEnv("E2E_USERNAME")
    const userPassword = getRequiredEnv("E2E_PASSWORD")

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: userEmail,
        password: userPassword,
      })

    if (signInError) {
      throw new Error(`Failed to sign in for cleanup: ${signInError.message}`)
    }

    if (signInData.session) {
      await supabase.auth.setSession(signInData.session)
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) {
      throw new Error(
        `Failed to fetch user after sign-in: ${userError.message}`,
      )
    }
    if (userData.user?.id !== devUserId) {
      log(
        `[playwright] Warning: signed-in user ${userData.user?.id} does not match DEV_SUPABASE_USER_ID ${devUserId}`,
      )
    }

    const { data, error } = await supabase
      .from("decks")
      .delete()
      .eq("user_id", devUserId)
      .select("id")

    if (error) {
      throw new Error(`Failed to clean decks table: ${error.message}`)
    }

    log(
      `[playwright] Cleaned ${data?.length ?? 0} decks for user ${devUserId}`,
    )
    log("[playwright] Global teardown done")
  }
}
