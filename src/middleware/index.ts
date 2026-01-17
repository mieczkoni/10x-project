import { defineMiddleware } from 'astro:middleware';

import { createSupabaseClientWithKey, supabaseClient } from '../db/supabase.client.ts';
import type { User } from '@supabase/supabase-js';

const devUserId = import.meta.env.DEV ? import.meta.env.DEV_SUPABASE_USER_ID : undefined;
const devServiceRoleKey = import.meta.env.DEV
  ? import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  : undefined;

function applyDevUserToClient(userId: string | undefined) {
  if (!userId) {
    return (client: typeof supabaseClient) => client;
  }

  return (client: typeof supabaseClient) => {
    const devClient = Object.create(client) as typeof supabaseClient;
    devClient.auth = Object.create(client.auth);
    const devUser: User = {
      id: userId,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };

    devClient.auth.getUser = async () => ({
      data: {
        user: devUser,
      },
      error: null,
    });
    return devClient;
  };
}

export const onRequest = defineMiddleware((context, next) => {
  let client = supabaseClient;

  if (devServiceRoleKey) {
    client = createSupabaseClientWithKey(devServiceRoleKey);
  }

  const withDevUser = applyDevUserToClient(devUserId);
  context.locals.supabase = withDevUser(client);

  return next();
});

