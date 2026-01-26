import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerInstance } from "../db/supabase.server";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServerInstance({
    cookies: context.cookies,
    headers: context.request.headers,
  });

  context.locals.supabase = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.user = user
    ? {
        id: user.id,
        email: user.email ?? null,
      }
    : null;

  return next();
});
