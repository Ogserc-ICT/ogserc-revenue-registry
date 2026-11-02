import { ZodError } from "zod";
import { ActionAuthError } from "./session";
import { fieldErrors } from "./validation";

/** Shape every server action returns to its form. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const initialActionResult = null as ActionResult<never> | null;

/** Turns known failures into a user-facing result; anything else is logged and kept generic. */
export function toActionError(err: unknown): ActionResult<never> {
  if (err instanceof ActionAuthError) return { ok: false, error: err.message };
  if (err instanceof ZodError) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(err) };
  }
  if (err instanceof UserFacingError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  console.error(err);
  return { ok: false, error: "Something went wrong and nothing was saved. Try again." };
}

/** An expected, explainable failure (e.g. "That email is already in use"). */
export class UserFacingError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}
