import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/db/schema";

/**
 * Edge-safe Auth.js config shared by the proxy and the full server config (src/auth.ts).
 * No database or bcrypt imports here.
 */

const secure = (process.env.AUTH_URL ?? "").startsWith("https://");
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", secure };

/** 30 minutes idle: the JWT is re-issued on activity, and expires 30 min after the last request. */
export const SESSION_IDLE_SECONDS = 30 * 60;

export const PUBLIC_PATHS = ["/sign-in"];

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/sign-in" },
  session: { strategy: "jwt", maxAge: SESSION_IDLE_SECONDS },
  // This app's own cookie names (BUILD_SPEC 12), so it never clashes with the other OGSERC apps.
  cookies: {
    sessionToken: { name: `${secure ? "__Secure-" : ""}ogsrr.session-token`, options: cookieOptions },
    callbackUrl: { name: `${secure ? "__Secure-" : ""}ogsrr.callback-url`, options: cookieOptions },
    csrfToken: { name: `${secure ? "__Host-" : ""}ogsrr.csrf-token`, options: cookieOptions },
    pkceCodeVerifier: { name: `${secure ? "__Secure-" : ""}ogsrr.pkce.code_verifier`, options: cookieOptions },
    state: { name: `${secure ? "__Secure-" : ""}ogsrr.state`, options: cookieOptions },
    nonce: { name: `${secure ? "__Secure-" : ""}ogsrr.nonce`, options: cookieOptions },
  },
  providers: [],
  callbacks: {
    /** Optimistic gate in the proxy. Pages and server actions re-check against the database. */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const signedIn = Boolean(auth?.user?.id);
      if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
      if (!signedIn) return false; // Auth.js redirects to /sign-in with a callbackUrl
      if (auth?.user?.mustChangePassword && pathname !== "/change-password") {
        return Response.redirect(new URL("/change-password", request.nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.roles = user.roles;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.roles = (token.roles as Role[] | undefined) ?? [];
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      return session;
    },
  },
} satisfies NextAuthConfig;
