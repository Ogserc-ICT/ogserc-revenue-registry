"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { Db } from "@/db";
import { db } from "@/db";
import { type Role, users } from "@/db/schema";
import { type ActionResult, toActionError, UserFacingError } from "@/lib/action-result";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { generateTempPassword } from "@/lib/password";
import { ROLES } from "@/lib/roles";
import { actorOf, requireAction } from "@/lib/session";
import { createUserSchema, updateRolesSchema, userIdSchema } from "@/lib/validation";

const PATH = "/admin/users";

type TempPasswordResult = ActionResult<{ email: string; tempPassword: string }>;

const sortRoles = (roles: Role[]) => ROLES.filter((r) => roles.includes(r));

/**
 * Throws unless at least one *other* active Admin would remain. Locks the admin rows so two
 * concurrent changes can't both remove "the other" Admin.
 */
async function assertAnotherActiveAdmin(tx: Db, excludingUserId: string) {
  const others = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), ne(users.id, excludingUserId), sql`'admin' = any(${users.roles})`))
    .for("update");
  if (others.length === 0) {
    throw new UserFacingError("Keep at least one active Admin. Give another user the Admin role first.");
  }
}

export async function createUserAction(_prev: TempPasswordResult | null, formData: FormData): Promise<TempPasswordResult> {
  try {
    const admin = await requireAction("users.manage");
    const input = createUserSchema.parse({
      name: formData.get("name"),
      email: formData.get("email"),
      roles: formData.getAll("roles"),
    });
    const roles = sortRoles(input.roles);
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${input.email}`);
      if (existing[0]) {
        throw new UserFacingError("Check the highlighted field.", {
          email: "A user with this email already exists.",
        });
      }
      const [created] = await tx
        .insert(users)
        .values({ name: input.name, email: input.email, passwordHash, roles, mustChangePassword: true })
        .returning({ id: users.id });
      await writeAudit(tx, {
        actor: actorOf(admin),
        action: AUDIT_ACTIONS.userCreated,
        reference: input.email,
        details: { userId: created?.id, name: input.name, roles },
      });
    });

    revalidatePath(PATH);
    return { ok: true, message: `User ${input.name} created`, data: { email: input.email, tempPassword } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateRolesAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAction("users.manage");
    const input = updateRolesSchema.parse({ userId: formData.get("userId"), roles: formData.getAll("roles") });
    const roles = sortRoles(input.roles);
    if (input.userId === admin.id) {
      throw new UserFacingError("You can't change your own roles. Ask another Admin.");
    }

    const name = await db.transaction(async (tx) => {
      const [target] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update");
      if (!target) throw new UserFacingError("That user no longer exists. Refresh the page.");
      const before = sortRoles(target.roles);
      if (before.join() === roles.join()) return null;
      if (before.includes("admin") && !roles.includes("admin") && target.active) {
        await assertAnotherActiveAdmin(tx, target.id);
      }
      await tx.update(users).set({ roles }).where(eq(users.id, target.id));
      await writeAudit(tx, {
        actor: actorOf(admin),
        action: AUDIT_ACTIONS.userRolesChanged,
        reference: target.email,
        details: { userId: target.id, changes: { roles: { old: before, new: roles } } },
      });
      return target.name;
    });

    revalidatePath(PATH);
    return { ok: true, message: name ? `Roles updated for ${name}` : "No changes to save" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAction("users.manage");
    const { userId: id } = userIdSchema.parse({ userId });
    if (id === admin.id && !active) throw new UserFacingError("You can't deactivate your own account.");

    const name = await db.transaction(async (tx) => {
      const [target] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!target) throw new UserFacingError("That user no longer exists. Refresh the page.");
      if (target.active === active) return target.name;
      if (!active && target.roles.includes("admin")) await assertAnotherActiveAdmin(tx, target.id);
      await tx.update(users).set({ active }).where(eq(users.id, id));
      await writeAudit(tx, {
        actor: actorOf(admin),
        action: active ? AUDIT_ACTIONS.userReactivated : AUDIT_ACTIONS.userDeactivated,
        reference: target.email,
        details: { userId: id, changes: { active: { old: target.active, new: active } } },
      });
      return target.name;
    });

    revalidatePath(PATH);
    return { ok: true, message: `${name} ${active ? "reactivated" : "deactivated"}` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function resetPasswordAction(userId: string): Promise<TempPasswordResult> {
  try {
    const admin = await requireAction("users.manage");
    const { userId: id } = userIdSchema.parse({ userId });
    if (id === admin.id) throw new UserFacingError("Use Change password for your own account.");

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const target = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!row) throw new UserFacingError("That user no longer exists. Refresh the page.");
      if (!row.active) throw new UserFacingError("Reactivate this user before resetting their password.");
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: true, passwordChangedAt: new Date() })
        .where(eq(users.id, id));
      await writeAudit(tx, {
        actor: actorOf(admin),
        action: AUDIT_ACTIONS.userPasswordReset,
        reference: row.email,
        details: { userId: id },
      });
      return row;
    });

    revalidatePath(PATH);
    return { ok: true, message: `Temporary password issued to ${target.name}`, data: { email: target.email, tempPassword } };
  } catch (err) {
    return toActionError(err);
  }
}
