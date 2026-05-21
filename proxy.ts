import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

type Profile = {
  id: number;
  email: string;
  nome: string | null;
  role: "admin" | "user";
  negozio_id: number | null;
  active: boolean;
};

const PUBLIC_API_PATHS = new Set([
  "/api/phonesia/feedback",
  "/api/phonesia/whatsapp/inbound",
  "/api/phonesia/whatsapp/send-welcome",
]);

function isProtectedPagePath(pathname: string) {
  return (
    pathname === "/phonesia/dashboard" ||
    pathname.startsWith("/phonesia/dashboard/") ||
    pathname === "/phonesia/clienti" ||
    pathname.startsWith("/phonesia/clienti/") ||
    pathname === "/phonesia/test-upload"
  );
}

function isPhonesiaApiPath(pathname: string) {
  return pathname === "/api/phonesia" || pathname.startsWith("/api/phonesia/");
}

function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PATHS.has(pathname);
}

function isAgentSharedSecretValid(request: NextRequest) {
  const expectedSecret = process.env.PHONESIA_AGENT_SHARED_SECRET;
  const receivedSecret = request.headers.get("x-phonesia-secret");

  return Boolean(expectedSecret && receivedSecret && expectedSecret === receivedSecret);
}

function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();

  const loginUrl = new URL("/phonesia/login", request.url);
  loginUrl.searchParams.set("next", `${url.pathname}${url.search}`);

  return NextResponse.redirect(loginUrl);
}

function accessDeniedRedirect(request: NextRequest) {
  return NextResponse.redirect(new URL("/phonesia/access-denied", request.url));
}

function apiUnauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "unauthorized",
      message: "Accesso richiesto.",
    },
    { status: 401 },
  );
}

function apiForbidden() {
  return NextResponse.json(
    {
      ok: false,
      error: "forbidden",
      message: "Permesso negato.",
    },
    { status: 403 },
  );
}

async function getUserProfile(
  request: NextRequest,
  response: NextResponse,
): Promise<{
  userId: string | null;
  profile: Profile | null;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      userId: null,
      profile: null,
    };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: null,
      profile: null,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("phonesia_user_profiles")
    .select("id, email, nome, role, negozio_id, active")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      userId: user.id,
      profile: null,
    };
  }

  return {
    userId: user.id,
    profile: profile as Profile,
  };
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();

  if (pathname === "/phonesia/access-denied") {
    return response;
  }

  const apiPath = isPhonesiaApiPath(pathname);
  const protectedPagePath = isProtectedPagePath(pathname);

  if (!apiPath && !protectedPagePath && pathname !== "/phonesia/login") {
    return response;
  }

  if (apiPath && isPublicApiPath(pathname)) {
    return response;
  }

  if (pathname === "/api/phonesia/agent/message" && isAgentSharedSecretValid(request)) {
    return response;
  }

  const { userId, profile } = await getUserProfile(request, response);

  if (pathname === "/phonesia/login") {
    if (!userId || !profile) {
      return response;
    }

    if (profile.role !== "admin") {
      return accessDeniedRedirect(request);
    }

    return NextResponse.redirect(new URL("/phonesia/dashboard/clienti", request.url));
  }

  if (apiPath) {
    if (!userId || !profile) {
      return apiUnauthorized();
    }

    if (profile.role !== "admin") {
      return apiForbidden();
    }

    return response;
  }

  if (protectedPagePath) {
    if (!userId || !profile) {
      return loginRedirect(request);
    }

    if (profile.role !== "admin") {
      return accessDeniedRedirect(request);
    }

    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/phonesia/login",
    "/phonesia/access-denied",
    "/phonesia/dashboard",
    "/phonesia/dashboard/:path*",
    "/phonesia/clienti",
    "/phonesia/clienti/:path*",
    "/phonesia/test-upload",
    "/api/phonesia/:path*",
  ],
};
