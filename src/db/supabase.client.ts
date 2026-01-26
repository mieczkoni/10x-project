import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient as SupabaseClientBase } from "@supabase/supabase-js";

import type { Database } from "../db/database.types.ts";

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_KEY;

export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

export function createSupabaseClientWithKey(key: string): SupabaseClient {
  return createClient<Database>(supabaseUrl, key);
}

/**
 * Type-safe Supabase client with Database types.
 * Use this type instead of importing from @supabase/supabase-js directly.
 */
export type SupabaseClient = SupabaseClientBase<Database>;
