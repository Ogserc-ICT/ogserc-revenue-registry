"use client";

import { type FormEvent, startTransition, useActionState } from "react";

/**
 * Like useActionState, but submits via onSubmit so React doesn't reset the form afterwards.
 * (A `<form action={fn}>` is reset after every submit, which would wipe what the user typed
 * when the server reports an error.)
 */
export function useFormAction<S>(action: (prev: S | null, formData: FormData) => Promise<S>) {
  const [state, dispatch, pending] = useActionState(action, null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Include the pressed submit button's name/value (e.g. "Add anyway" sends acknowledge=1).
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(e.currentTarget, submitter instanceof HTMLButtonElement ? submitter : null);
    startTransition(() => dispatch(data));
  };
  return [state, onSubmit, pending] as const;
}
