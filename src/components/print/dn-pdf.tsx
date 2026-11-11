import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDate } from "@/lib/dates";
import type { DnPrintData } from "@/lib/dn-print";
import { formatAmount } from "@/lib/money";
import { PRINT } from "@/lib/print-palette";
import { pdfLogo } from "./pdf-common";
import { PdfSignature } from "./pdf-signature";

/*
 * Server-side PDF of a demand notice (BUILD_SPEC 1 and 4.10), A4 portrait, black on white with
 * the logo and no gradients (DESIGN.md 6). The built-in Helvetica has no naira sign, so amounts
 * are labelled NGN here; the printable HTML page uses ₦.
 */
const { ink: INK, rule: RULE, muted: MUTED, alert: ALERT } = PRINT;

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, fontSize: 10, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 10 },
  // ogserc-logo.png is 1920 x 1038.
  logo: { width: 100, height: 54 },
  org: { fontSize: 13, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  small: { fontSize: 9 },
  title: { marginTop: 16, fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "center", letterSpacing: 1 },
  banner: { marginTop: 3, fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center", color: ALERT },
  row: { flexDirection: "row", marginTop: 3 },
  label: { width: 110, fontFamily: "Helvetica-Bold" },
  re: { marginTop: 14, fontFamily: "Helvetica-Bold" },
  table: { marginTop: 8 },
  th: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: INK, paddingVertical: 4, fontFamily: "Helvetica-Bold" },
  td: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderColor: RULE },
  subtotal: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1, borderColor: INK },
  note: { marginTop: 4, fontSize: 9 },
  cBank: { width: 150, paddingRight: 8 },
  cAcct: { width: 120 },
  total: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1.5, borderColor: INK, fontFamily: "Helvetica-Bold" },
  cCode: { width: 84, paddingRight: 8 },
  cDesc: { flex: 1, paddingRight: 8 },
  cPeriod: { width: 90, paddingRight: 8 },
  cAmt: { width: 100, textAlign: "right" },
  section: { marginTop: 12 },
  bold: { fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique" },
  signature: { marginTop: 36 },
  foot: { position: "absolute", left: 44, right: 44, bottom: 24, fontSize: 8, color: MUTED, borderTopWidth: 0.5, borderColor: RULE, paddingTop: 4 },
});

export function DnPdf({ data }: { data: DnPrintData }) {
  const { dn } = data;
  return (
    <Document title={`Demand notice ${dn.dnNo}`} author={data.org.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          <Image style={s.logo} src={pdfLogo()} />
          <View style={{ flex: 1 }}>
            <Text style={s.org}>{data.org.name}</Text>
            {data.org.address ? <Text style={s.small}>{data.org.address}</Text> : null}
            {data.org.contact ? <Text style={s.small}>{data.org.contact}</Text> : null}
          </View>
        </View>

        <Text style={s.title}>DEMAND NOTICE</Text>
        {data.banner ? <Text style={s.banner}>{data.banner}</Text> : null}

        <View style={[s.row, { marginTop: 14 }]}>
          <Text style={s.label}>Demand notice No:</Text>
          <Text style={{ flex: 1 }}>{dn.dnNo}</Text>
          <Text style={[s.bold, { marginRight: 8 }]}>Date issued:</Text>
          <Text>{formatDate(dn.issueDate)}</Text>
        </View>

        <View style={[s.row, { marginTop: 10 }]}>
          <Text style={s.label}>To:</Text>
          <Text style={[s.bold, { flex: 1 }]}>{dn.payerName}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Address:</Text>
          <Text style={{ flex: 1 }}>{data.payer.address ?? ""}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Payer ID:</Text>
          <Text style={{ flex: 1 }}>{dn.payerId}</Text>
          {data.payer.licenceNo ? (
            <>
              <Text style={[s.bold, { marginRight: 8 }]}>Licence / permit No:</Text>
              <Text>{data.payer.licenceNo}</Text>
            </>
          ) : null}
        </View>

        <Text style={s.re}>RE: DEMAND FOR PAYMENT - {dn.revenueHead.toUpperCase()}</Text>
        <View style={[s.row, { marginTop: 4 }]}>
          <Text style={s.label}>Purpose of payment:</Text>
          <Text style={{ flex: 1 }}>{data.purpose}</Text>
        </View>

        <View style={s.table}>
          <View style={s.th}>
            <Text style={s.cCode}>Revenue code</Text>
            <Text style={s.cDesc}>Description</Text>
            <Text style={s.cPeriod}>Period</Text>
            <Text style={s.cAmt}>Amount (NGN)</Text>
          </View>
          <View style={s.td}>
            <Text style={s.cCode}>{dn.revenueCode}</Text>
            <Text style={s.cDesc}>{dn.revenueHead}</Text>
            <Text style={s.cPeriod}>{dn.period ?? ""}</Text>
            <Text style={s.cAmt}>{formatAmount(dn.amountBilled)}</Text>
          </View>
          <View style={s.subtotal}>
            <Text style={{ flex: 1 }}>Amount billed</Text>
            <Text style={s.cAmt}>{formatAmount(dn.amountBilled)}</Text>
          </View>
          <View style={s.total}>
            <Text style={{ flex: 1 }}>AMOUNT OUTSTANDING</Text>
            <Text style={s.cAmt}>{formatAmount(dn.outstanding)}</Text>
          </View>
        </View>
        {data.amountNote ? <Text style={[s.italic, s.note]}>{data.amountNote}</Text> : null}

        <View style={[s.row, { marginTop: 10 }]}>
          <Text style={s.label}>Amount in words:</Text>
          <Text style={[s.italic, { flex: 1 }]}>{data.outstandingWords}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Due date:</Text>
          <Text style={{ flex: 1 }}>{dn.dueDate ? formatDate(dn.dueDate) : ""}</Text>
          <Text style={[s.bold, { marginRight: 8 }]}>Days overdue:</Text>
          <Text>{String(dn.daysOverdue)}</Text>
        </View>

        {data.paymentInstructions ? (
          <View style={s.section}>
            <Text style={s.bold}>Payment instructions:</Text>
            <Text>{data.paymentInstructions}</Text>
          </View>
        ) : null}
        {data.accounts.length > 0 ? (
          <View style={{ marginTop: 6 }}>
            <View style={s.th}>
              <Text style={s.cBank}>Bank</Text>
              <Text style={s.cDesc}>Account name</Text>
              <Text style={s.cAcct}>Account number</Text>
            </View>
            {data.accounts.map((a) => (
              <View key={`${a.bank}-${a.accountNumber}`} style={s.td}>
                <Text style={s.cBank}>{a.bank}</Text>
                <Text style={s.cDesc}>{a.accountName}</Text>
                <Text style={s.cAcct}>{a.accountNumber}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {data.latePaymentNote ? (
          <View style={s.section}>
            <Text>{data.latePaymentNote}</Text>
          </View>
        ) : null}

        <View style={s.signature}>
          <PdfSignature signatory={data.signatory} orgName={data.org.name} />
        </View>

        <Text style={s.foot} fixed>
          Figures as at {formatDate(data.asAt)}.
        </Text>
      </Page>
    </Document>
  );
}
