"use client";

import { useState } from "react";
import { type ComboOption, Combobox } from "./combobox";

/**
 * A searchable dropdown for forms that are read when submitted (FormData or a GET filter form):
 * it keeps its own value and posts it under `name`. Use instead of a long <Select>.
 */
export function ComboSelect({
  defaultValue = "",
  ...props
}: {
  id: string;
  name: string;
  options: readonly ComboOption[];
  defaultValue?: string;
  placeholder?: string;
  invalid?: boolean;
  describedById?: string;
  emptyText?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return <Combobox {...props} value={value} onChange={setValue} />;
}
