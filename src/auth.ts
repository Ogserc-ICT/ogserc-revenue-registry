import "server-only";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { db } from "./db";
import { signInAttempts, users } from "./db/schema";
import { AUDIT_ACTIONS, writeAudit } from "./lib/audit";
import { signInSchema } from "./lib/validation";

// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("ogsrr-timing-equaliser", 12);

function clientIp(request: Request | undefined): string | null {
  const fwd = request?.headers.get("x-forwarded-for");
  return fwd ? (fwd.split(",")[0]?.trim() ?? null) : null;
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = clientIp(request);

        const [user] = await db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${email}`)
          .limit(1);
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

        if (!user || !ok || !user.active) {
          await db.insert(signInAttempts).values({ email, ip, succeeded: false });
          return null;
        }

        await db.transaction(async (tx) => {
          await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
          await tx.insert(signInAttempts).values({ email, ip, succeeded: true });
          await writeAudit(tx, {
            actor: { id: user.id, name: user.name },
            action: AUDIT_ACTIONS.signIn,
            reference: user.email,
            details: ip ? { ip } : undefined,
          });
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: user.roles,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id;
        token.roles = user.roles;
        token.mustChangePassword = user.mustChangePassword;
      }
      // After a password change, reload the flags so the proxy stops redirecting.
      if (trigger === "update" && token.sub) {
        const [fresh] = await db.select().from(users).where(eq(users.id, token.sub)).limit(1);
        if (fresh) {
          token.roles = fresh.roles;
          token.mustChangePassword = fresh.mustChangePassword;
          token.name = fresh.name;
        }
      }
      return token;
    },
  },
});
