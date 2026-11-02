import type { DefaultSession } from "next-auth";
import type { Role } from "@/db/schema";

declare module "next-auth" {
  interface User {
    roles: Role[];
    mustChangePassword: boolean;
  }
  interface Session {
    user: {
      id: string;
      roles: Role[];
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    roles?: Role[];
    mustChangePassword?: boolean;
  }
}
