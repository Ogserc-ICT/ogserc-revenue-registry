import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

// Optimistic auth gate (see authConfig.callbacks.authorized). Real checks happen on the server
// in every page and server action.
export default auth;

export const config = {
  // Everything except Auth.js endpoints, Next internals and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|brand/|favicon.ico|icon.png|.*\\.(?:png|svg|ico|jpg|webp)$).*)"],
};
