import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

export type PhonesiaUserRole = "admin" | "user";

export type PhonesiaUserProfile = {
  id: number;
  auth_user_id: string;
  email: string;
  nome: string | null;
  role: PhonesiaUserRole;
  negozio_id: number | null;
  active: boolean;
};

export async function createPhonesiaServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // In alcuni contesti server component i cookie non sono modificabili.
        }
      },
    },
  });
}

export async function getPhonesiaAuth() {
  const supabase = await createPhonesiaServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      supabase,
      user: null,
      profile: null as PhonesiaUserProfile | null,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("phonesia_user_profiles")
    .select("id, auth_user_id, email, nome, role, negozio_id, active")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Errore lettura profilo utente: ${profileError.message}`);
  }

  return {
    supabase,
    user,
    profile: (profile as PhonesiaUserProfile | null) ?? null,
  };
}

export async function requirePhonesiaAuth() {
  const auth = await getPhonesiaAuth();

  if (!auth.user || !auth.profile) {
    redirect("/phonesia/login");
  }

  return {
    supabase: auth.supabase,
    user: auth.user,
    profile: auth.profile,
  };
}

export async function requirePhonesiaAdmin() {
  const auth = await requirePhonesiaAuth();

  if (auth.profile.role !== "admin") {
    redirect("/phonesia/dashboard/clienti");
  }

  return auth;
}

export function isPhonesiaAdmin(profile: PhonesiaUserProfile | null | undefined) {
  return profile?.role === "admin";
}

export function canAccessNegozio(
  profile: PhonesiaUserProfile | null | undefined,
  negozioId: number | null | undefined,
) {
  if (!profile || !profile.active) return false;
  if (profile.role === "admin") return true;
  if (!negozioId) return false;

  return profile.negozio_id === negozioId;
}
