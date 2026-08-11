import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabasePublicConfig } from "./config";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/join", // parent self-signup via a school's invite link
  "/invite", // staff invite acceptance (arrives via /auth/callback with a fresh session)
  "/auth", // Supabase email link callback — no session cookie exists yet on this request
  "/api/signup",
  "/api/join",
];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  let supabaseConfig: ReturnType<typeof getSupabasePublicConfig>;
  try {
    supabaseConfig = getSupabasePublicConfig();
  } catch {
    return response;
  }
  const { url, key } = supabaseConfig;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicPath(pathname);

  if (!data.user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (data.user && (pathname === "/login" || pathname.startsWith("/signup"))) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/app";
    appUrl.search = "";
    return NextResponse.redirect(appUrl);
  }

  return response;
}
