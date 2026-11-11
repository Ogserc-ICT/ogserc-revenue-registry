import { Text, View } from "@react-pdf/renderer";

/** PDF version of the signature block: space to sign, name, designation, "For:" the organisation. */
export function PdfSignature({ signatory, orgName }: { signatory: { name: string; designation: string }; orgName: string }) {
  return (
    <View>
      <Text>______________________________</Text>
      {signatory.name ? <Text style={{ fontFamily: "Helvetica-Bold", marginTop: 2 }}>{signatory.name}</Text> : null}
      {signatory.designation ? <Text>{signatory.designation}</Text> : null}
      <Text>For: {orgName}</Text>
    </View>
  );
}
