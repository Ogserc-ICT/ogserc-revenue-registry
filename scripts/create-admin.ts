/**
 * pnpm create-admin
 * Creates an Admin user interactively. Leave the password blank to get a one-time temporary
 * password, which must be changed at first sign-in.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { AUDIT_ACTIONS, SYSTEM_ACTOR, writeAudit } from "../src/lib/audit";
import { generateTempPassword, MIN_PASSWORD_LENGTH } from "../src/lib/password";
import { createUserSchema } from "../src/lib/validation";

config({ path: ".env.local" });

// One interface for every prompt, so piped input isn't lost between questions.
const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY ?? false });
let masking = false;
const rlOut = rl as unknown as { _writeToOutput: (s: string) => void };
const writeOriginal = rlOut._writeToOutput?.bind(rl);
rlOut._writeToOutput = (s: string) => {
  if (!masking || !writeOriginal) return writeOriginal?.(s) ?? stdout.write(s);
  // Echo the prompt and line breaks, mask everything typed.
  if (/[\r\n]/.test(s)) stdout.write("\n");
  else stdout.write("*".repeat(s.length));
};

// Lines are queued by the iterator, so input that arrives early (e.g. piped) is never dropped.
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string, { hidden = false } = {}): Promise<string> {
  stdout.write(question);
  masking = hidden;
  const next = await lines.next();
  masking = false;
  if (!stdin.isTTY) stdout.write("\n");
  return next.done ? "" : next.value;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  console.log("Create an Admin user for the Revenue Register.\n");
  const parsed = createUserSchema.safeParse({
    name: await ask("Full name: "),
    email: await ask("Email: "),
    roles: ["admin"],
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
  }

  let password = await ask(
    `Password (at least ${MIN_PASSWORD_LENGTH} characters; leave blank for a temporary one): `,
    { hidden: true },
  );
  const temporary = password === "";
  if (temporary) password = generateTempPassword();
  else if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  } else if ((await ask("Type the password again: ", { hidden: true })) !== password) {
    throw new Error("The two passwords don't match.");
  }

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  try {
    const { name, email } = parsed.data;
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${email}`);
    if (existing.length > 0) throw new Error(`A user with email ${email} already exists.`);

    const passwordHash = await bcrypt.hash(password, 12);
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ name, email, passwordHash, roles: ["admin"], mustChangePassword: temporary })
        .returning({ id: schema.users.id });
      await writeAudit(tx, {
        actor: SYSTEM_ACTOR,
        action: AUDIT_ACTIONS.userCreated,
        reference: email,
        details: { userId: user?.id, name, roles: ["admin"], via: "create-admin script" },
      });
    });

    console.log(`\nAdmin ${name} <${email}> created.`);
    if (temporary) {
      console.log(`Temporary password: ${password}`);
      console.log("It is shown once. You will be asked to change it when you first sign in.");
    }
  } finally {
    rl.close();
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
