/**
 * Signature block on printed demand notices and receipts (owner's decision, Nov 2026): space to
 * sign, then the signatory's name, designation and "For:" the organisation. Name and designation
 * come from Receiver details; a blank one is left out.
 */
export function SignatureBlock({
  signatory,
  orgName,
  className,
}: {
  signatory: { name: string; designation: string };
  orgName: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p aria-hidden>______________________________</p>
      {signatory.name && <p className="mt-1 font-semibold">{signatory.name}</p>}
      {signatory.designation && <p>{signatory.designation}</p>}
      <p>For: {orgName}</p>
    </div>
  );
}
