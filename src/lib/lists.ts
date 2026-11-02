/**
 * Dropdown lists that Admins can edit, keyed by their name in seed/settings.json.
 * Payment Status, Charging Basis, Revenue Type and Currency are logic values (enums), not lists.
 */
export const EDITABLE_LISTS = {
  "Payment Channels": "Payment channels",
  "Collecting Accounts": "Collecting accounts",
  "Payer Categories": "Payer categories",
  "Licence Status": "Licence status",
  "Ogun State LGAs": "LGAs",
  Frequency: "Frequency",
  "Revenue Categories": "Revenue categories",
} as const;

export type ListName = (typeof EDITABLE_LISTS)[keyof typeof EDITABLE_LISTS];

export const LIST_NAMES: readonly string[] = Object.values(EDITABLE_LISTS);

export const LIST_HINTS: Record<ListName, string> = {
  "Payment channels": "How a payer paid. Used on receipts.",
  "Collecting accounts": "Where the money landed. Used on receipts and in bank recon.",
  "Payer categories": "The type of licensee or payer.",
  "Licence status": "Where a payer's licence stands.",
  LGAs: "Ogun State local government areas.",
  Frequency: "How often a fee is charged.",
  "Revenue categories": "Groups revenue heads in the fee schedule and reports.",
};
