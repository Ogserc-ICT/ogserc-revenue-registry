import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { PRINT } from "@/lib/print-palette";
import { RECEIPT_VALIDITY_NOTE } from "@/lib/print-text";
import type { ReceiptPrintData } from "@/lib/receipt-print";
import { pdfLogo } from "./pdf-common";

/*
 * Server-side PDF of an official receipt (BUILD_SPEC 4.10), A4 portrait, black on white, no
 * gradients (DESIGN.md 6). Diagonal watermark: PROVISIONAL in light grey until confirmed,
 * REVERSED in light red once reversed. Amounts are labelled NGN (Helvetica has no ₦ glyph).
 */
const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, fontSize: 10, fontFamily: "Helvetica", color: PRINT.ink, lineHeight: 1.4 },
  watermarkBox: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  // Sized so the longer word, PROVISIONAL, stays inside the A4 page when rotated.
  watermark: { fontSize: 66, fontFamily: "Helvetica-Bold", letterSpacing: 6, transform: "rotate(-35deg)" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1.5, borderBottomColor: PRINT.ink, paddingBottom: 10 },
  logo: { width: 100, height: 54 },
  org: { fontSize: 13, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  small: { fontSize: 9 },
  title: { marginTop: 16, fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "center", letterSpacing: 1 },
  banner: { marginTop: 3, fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center" },
  block: { marginTop: 12 },
  row: { flexDirection: "row", marginTop: 3 },
  label: { width: 112, fontFamily: "Helvetica-Bold" },
  value: { flex: 1, paddingRight: 8 },
  label2: { width: 100, fontFamily: "Helvetica-Bold" },
  amountBox: { marginTop: 14, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: PRINT.ink, paddingVertical: 8 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  amount: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique" },
  bold: { fontFamily: "Helvetica-Bold" },
  signatures: { marginTop: 44, flexDirection: "row", gap: 40 },
  signature: { flex: 1 },
  foot: { position: "absolute", left: 44, right: 44, bottom: 24, fontSize: 8, color: PRINT.muted, borderTopWidth: 0.5, borderColor: PRINT.rule, paddingTop: 4 },
});

function Pair({ a, b }: { a: [string, string]; b?: [string, string] }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{a[0]}</Text>
      <Text style={s.value}>{a[1]}</Text>
      {b ? (
        <>
          <Text style={s.label2}>{b[0]}</Text>
          <Text style={s.value}>{b[1]}</Text>
        </>
      ) : null}
    </View>
  );
}

export function ReceiptPdf({ data }: { data: ReceiptPrintData }) {
  const { r } = data;
  const reversed = r.status === "Reversed";
  return (
    <Document title={`Receipt ${r.receiptNo}`} author={data.org.name}>
      <Page size="A4" style={s.page}>
        {data.watermark ? (
          <View style={s.watermarkBox} fixed>
            <Text style={[s.watermark, { color: reversed ? PRINT.watermarkRed : PRINT.watermarkGrey }]}>{data.watermark}</Text>
          </View>
        ) : null}

        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          <Image style={s.logo} src={pdfLogo()} />
          <View style={{ flex: 1 }}>
            <Text style={s.org}>{data.org.name}</Text>
            {data.org.address ? <Text style={s.small}>{data.org.address}</Text> : null}
          </View>
        </View>

        <Text style={s.title}>OFFICIAL REVENUE RECEIPT</Text>
        {data.banner ? <Text style={[s.banner, { color: reversed ? PRINT.alert : PRINT.muted }]}>{data.banner}</Text> : null}

        <View style={s.block}>
          <Pair a={["Receipt No:", r.receiptNo]} b={["Date:", formatDate(r.receiptDate)]} />
        </View>

        <View style={s.block}>
          <View style={s.row}>
            <Text style={s.label}>Received from:</Text>
            <Text style={[s.value, s.bold]}>{r.payerName}</Text>
          </View>
          <Pair a={["Payer ID:", r.payerId]} b={["Payer category:", r.payerCategory ?? ""]} />
          {data.licenceNo ? <Pair a={["Licence / permit No:", data.licenceNo]} /> : null}
          <Pair a={["Being payment for:", r.revenueHead]} />
          <Pair a={["Revenue code:", r.revenueCode]} b={["Revenue category:", r.revenueCategory]} />
          <Pair a={["Period covered:", r.period ?? ""]} b={["Demand notice ref:", r.dnNo ?? ""]} />
        </View>

        <View style={s.amountBox}>
          <View style={s.amountRow}>
            <Text style={s.bold}>AMOUNT PAID (NGN):</Text>
            <Text style={[s.amount, reversed ? { textDecoration: "line-through" } : {}]}>{formatAmount(r.amountPaid)}</Text>
          </View>
          <View style={[s.row, { marginTop: 4 }]}>
            <Text style={s.label}>Amount in words:</Text>
            <Text style={[s.value, s.italic]}>{data.amountWords}</Text>
          </View>
        </View>

        <View style={s.block}>
          <Pair a={["Payment channel:", r.channel]} b={["Bank / account:", r.collectingAccount]} />
          <Pair a={["Payment ref / RRR:", r.paymentRef]} b={["Value date:", formatDate(r.valueDate)]} />
          <Pair a={["Status:", r.status]} b={["Confirmed by:", r.confirmedBy ?? ""]} />
          <Pair a={["Recorded by:", r.recordedBy]} b={["Confirmation date:", r.confirmedAt ? formatDateTime(r.confirmedAt) : ""]} />
        </View>

        <View style={s.signatures}>
          <View style={s.signature}>
            <Text>______________________________</Text>
            <Text>For: Finance &amp; Accounts, OGSERC</Text>
          </View>
          <View style={s.signature}>
            <Text>______________________________</Text>
            <Text>Payer / Representative</Text>
          </View>
        </View>

        <Text style={s.foot} fixed>
          {RECEIPT_VALIDITY_NOTE}
        </Text>
      </Page>
    </Document>
  );
}
