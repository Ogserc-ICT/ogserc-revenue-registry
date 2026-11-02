import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Optimistic auth gate (see authConfig.callbacks.authorized). Real checks happen on the server
// in every page and server action.
export const { auth: proxy } = NextAuth(authConfig);

export const config = {
  // Everything except Auth.js endpoints, Next internals and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|brand/|favicon.ico|.*\\.(?:png|svg|ico|jpg|webp)$).*)"],
};
