import { CollectionEntry, Customer, Loan, LoanPayment } from '../types';
import { formatDateMarathi, getBishiNameMarathi } from '../utils/formatters';

/**
 * Export Member Ledger Card to Excel matching the exact physical register and mockup layout.
 */
export const exportMemberLedgerToExcel = (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  loanPayments: LoanPayment[] = [],
  showAllWeeks: boolean = false
) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const custLoanPayments = loanPayments.filter((lp) => lp.customerId === customer.id);

  const allCustomerCollections = collections
    .filter((c) => c.customerId === customer.id)
    .sort((a, b) => a.periodIndex - b.periodIndex);

  // If customer has loan payments on dates without bishi collections, synthesize rows so they are never missed
  const collectionDueDates = new Set(allCustomerCollections.map((c) => c.dueDate));
  const missingLoanPaymentDates = Array.from(
    new Set(
      custLoanPayments
        .filter((lp) => !collectionDueDates.has(lp.paymentDate))
        .map((lp) => lp.paymentDate)
    )
  ).sort();

  const synthesizedLoanRows: CollectionEntry[] = missingLoanPaymentDates.map((pDate, idx) => ({
    id: `synth-loan-${idx}-${pDate}`,
    customerId: customer.id,
    customerName: customer.name,
    accountNumber: customer.accountNumber,
    officeId: customer.officeId,
    bishiType: customer.bishiType || 'DIWALI',
    periodIndex: 900 + idx,
    periodLabel: 'कर्ज परतफेड',
    dueDate: pDate,
    expectedAmount: 0,
    collectedAmount: 0,
    remainingAmount: 0,
    interestAmount: 0,
    historicalInterestRate: 0,
    penaltyAmount: 0,
    historicalPenaltyRate: 0,
    totalPaid: 0,
    status: 'PAID',
    paymentDate: pDate,
    updatedAt: pDate,
  }));

  const mergedCustomerCollections = [...allCustomerCollections, ...synthesizedLoanRows].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate)
  );

  const customerCollections = showAllWeeks
    ? mergedCustomerCollections
    : mergedCustomerCollections.filter((c) => {
        const hasDeposit = (c.collectedAmount || 0) > 0;
        const isPaid = c.status === 'PAID';
        const hasLoanPayment = custLoanPayments.some((lp) => lp.paymentDate === c.dueDate);
        return hasDeposit || isPaid || hasLoanPayment;
      });

  let totalCumulative = 0;
  let totalDeposit = 0;
  let totalBishiPenalty = 0;
  let totalExpected = 0;
  let totalLoanIssued = customer.hasLoan && loan ? (loan.principalAmount || 0) : 0;
  let totalLoanPrincipalPaid = 0;
  let totalLoanInterestPaid = 0;
  let totalLoanPenalty = 0;
  let runningLoanPrincipalBalance = customer.hasLoan && loan ? (loan.principalAmount || 0) : 0;
  const finalRemainingBalance =
    (customer.hasLoan && loan ? loan.remainingAmount : 0) +
    (customerCollections.length > 0 ? (customerCollections[customerCollections.length - 1].remainingAmount || 0) : 0);

  const tableRowsHtml = customerCollections.length === 0
    ? `<tr><td colspan="11" style="text-align: center; padding: 12px; color: #64748b; font-weight: bold; border: 1px solid #b8c2cc;">या खातेदाराची अद्याप कोणतीही पूर्ण जमा नोंद झालेली नाही.</td></tr>`
    : customerCollections
        .map((item, idx) => {
          const deposit = item.collectedAmount || 0;
          totalDeposit += deposit;
          totalCumulative += deposit;
          const penalty = item.penaltyAmount || 0;
          totalBishiPenalty += penalty;
          const expected = item.expectedAmount || 0;
          totalExpected += expected;

          // Filter ALL loan payments matching this customer and date
          const periodPayments = custLoanPayments.filter(
            (lp) => lp.paymentDate === item.dueDate
          );

          const loanPrincipalPaid = periodPayments.reduce((sum, lp) => sum + (lp.paidAmount || 0), 0);
          totalLoanPrincipalPaid += loanPrincipalPaid;

          const loanInterestPaid = periodPayments.reduce((sum, lp) => sum + (lp.interestPaid || 0), 0);
          totalLoanInterestPaid += loanInterestPaid;

          const loanPenalty = periodPayments.reduce((sum, lp) => sum + (lp.penaltyPaid || 0), 0);
          totalLoanPenalty += loanPenalty;

          const loanDiscount = periodPayments.reduce((sum, lp) => sum + (lp.discountAmount || 0), 0);

          if (customer.hasLoan) {
            runningLoanPrincipalBalance = Math.max(0, runningLoanPrincipalBalance - loanPrincipalPaid - loanDiscount);
          }

          const loanIssued = idx === 0 && customer.hasLoan && loan ? loan.principalAmount : 0;

          const balanceRemaining = (customer.hasLoan ? runningLoanPrincipalBalance : 0) + (item.remainingAmount || 0);

          return `
            <tr>
              <td style="text-align: center; border: 1px solid #b8c2cc; padding: 6px;">${idx + 1}</td>
              <td style="text-align: center; border: 1px solid #b8c2cc; padding: 6px;">${formatDateMarathi(item.dueDate)}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; font-weight: bold; color: #15803d;">${deposit > 0 ? deposit : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; font-weight: bold; color: #0b5c45;">${totalCumulative > 0 ? totalCumulative : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #be123c;">${penalty > 0 ? penalty : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px;">${expected > 0 ? expected : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #c2410c;">${loanIssued > 0 ? loanIssued : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #15803d;">${loanPrincipalPaid > 0 ? loanPrincipalPaid : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #15803d;">${loanInterestPaid > 0 ? loanInterestPaid : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #be123c;">${loanPenalty > 0 ? loanPenalty : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; font-weight: bold; color: #be123c;">${balanceRemaining}</td>
            </tr>
          `;
        })
        .join('');

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>खातेदार खाते उतारा</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #000000; padding: 8px; text-align: left; }
        .header-title { font-size: 18px; font-weight: bold; color: #5c3a21; text-align: center; }
        .meta-header { background-color: #8B4513; color: #ffffff; font-weight: bold; }
        .meta-val { background-color: #fffde7; font-weight: bold; font-size: 13px; }
        .th-main { background-color: #f5e6d3; color: #333333; font-weight: bold; text-align: center; }
        .th-sub { background-color: #faebd7; color: #333333; font-weight: bold; text-align: center; }
      </style>
    </head>
    <body>
      <table>
        <tr>
          <td colspan="11" class="header-title" style="border:none; text-align:center; font-size:18px; font-weight:bold; color:#5c3a21;">
            खातेदार खाते उतारा (Member Ledger Card)
          </td>
        </tr>
        <tr><td colspan="11" style="border:none;"></td></tr>

        <tr>
          <td class="meta-header" style="background-color:#8B4513; color:#ffffff; font-weight:bold;">खाते नंबर</td>
          <td colspan="4" class="meta-val" style="background-color:#fffde7; font-weight:bold; font-size:14px;">${customer.accountNumber}</td>
          <td class="meta-header" style="background-color:#8B4513; color:#ffffff; font-weight:bold;">खातेदाराचे नाव</td>
          <td colspan="5" class="meta-val" style="background-color:#fffde7; font-weight:bold; font-size:14px;">${customer.name}</td>
        </tr>
        <tr>
          <td class="meta-header" style="background-color:#8B4513; color:#ffffff; font-weight:bold;">हप्ता रुपये</td>
          <td colspan="4" class="meta-val" style="background-color:#fffde7; font-weight:bold;">₹${customer.amount} (${customer.modality === 'W' ? 'साप्ताहिक' : 'मासिक'})</td>
          <td class="meta-header" style="background-color:#8B4513; color:#ffffff; font-weight:bold;">पत्ता / मोबाईल</td>
          <td colspan="5" class="meta-val" style="background-color:#fffde7; font-weight:bold;">${customer.address || ''} (${customer.mobile})</td>
        </tr>
        <tr><td colspan="11" style="border:none;"></td></tr>

        <!-- Table Header matching media_1789462342483.png -->
        <thead>
          <tr>
            <th rowspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">अ. क्र.</th>
            <th rowspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">तारीख</th>
            <th rowspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">खात्यात जमा रुपये</th>
            <th rowspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">एकूण जमा रुपये</th>
            <th rowspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">दंड</th>
            <th rowspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">देणे</th>
            <th rowspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">दिलेले कर्ज</th>
            <th colspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">कर्ज परत फेड</th>
            <th rowspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">दंड</th>
            <th rowspan="2" class="th-main" style="background-color:#f5e6d3; font-weight:bold; text-align:center;">देणे बाकी</th>
          </tr>
          <tr>
            <th class="th-sub" style="background-color:#faebd7; font-weight:bold; text-align:center;">कर्ज</th>
            <th class="th-sub" style="background-color:#faebd7; font-weight:bold; text-align:center;">व्याज</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
        <tfoot>
          <tr style="background-color:#8B4513; color:#ffffff; font-weight:bold;">
            <td style="text-align:center; border: 1px solid #5c3a21; padding: 6px;">-</td>
            <td style="text-align:center; border: 1px solid #5c3a21; padding: 6px;">एकूण</td>
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${totalDeposit > 0 ? totalDeposit : ''}</td>
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${totalCumulative > 0 ? totalCumulative : ''}</td>
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${totalBishiPenalty > 0 ? totalBishiPenalty : ''}</td>
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${totalExpected > 0 ? totalExpected : ''}</td>
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${totalLoanIssued > 0 ? totalLoanIssued : ''}</td>
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${totalLoanPrincipalPaid > 0 ? totalLoanPrincipalPaid : ''}</td>
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${totalLoanInterestPaid > 0 ? totalLoanInterestPaid : ''}</td>
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${totalLoanPenalty > 0 ? totalLoanPenalty : ''}</td>
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${finalRemainingBalance}</td>
          </tr>
        </tfoot>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(['\uFEFF' + excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `खातेदार_उतारा_${customer.accountNumber}_${customer.name.replace(/\s+/g, '_')}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export General Report to Excel.
 */
export const exportGeneralReportToExcel = (
  title: string,
  officeName: string,
  bishiName: string,
  rows: {
    customer: Customer;
    exp: number;
    coll: number;
    rem: number;
    isPaid: boolean;
  }[]
) => {
  const tableRowsHtml = rows
    .map(
      (r, idx) => `
      <tr>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${idx + 1}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r.customer.accountNumber}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r.customer.name}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px;">${r.customer.mobile}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px;">${getBishiNameMarathi(r.customer.bishiType)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px;">${r.customer.modality === 'W' ? 'साप्ताहिक' : 'मासिक'}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px;">${r.exp}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #15803d;">${r.coll}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #be123c;">${r.rem}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${r.isPaid ? 'पूर्ण जमा' : r.coll > 0 ? 'अंशतः जमा' : 'बाकी'}</td>
      </tr>
    `
    )
    .join('');

  const totalExp = rows.reduce((a, r) => a + r.exp, 0);
  const totalColl = rows.reduce((a, r) => a + r.coll, 0);
  const totalRem = rows.reduce((a, r) => a + r.rem, 0);

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #000000; padding: 8px; text-align: left; }
        .th-header { background-color: #0B5C45; color: #ffffff; font-weight: bold; }
        .tf-footer { background-color: #0F4A3C; color: #ffffff; font-weight: bold; }
      </style>
    </head>
    <body>
      <h2>सुशांत भिशी - ${title}</h2>
      <p>कार्यालय: ${officeName} | भिशी: ${bishiName} | तारीख: ${new Date().toLocaleDateString('mr-IN')}</p>
      <table>
        <thead>
          <tr class="th-header" style="background-color:#0B5C45; color:#ffffff; font-weight:bold;">
            <th>अ. क्र.</th>
            <th>खाते क्र.</th>
            <th>खातेदाराचे नाव</th>
            <th>मोबाईल</th>
            <th>भिशी प्रकार</th>
            <th>पद्धत</th>
            <th>अपेक्षित (₹)</th>
            <th>जमा (₹)</th>
            <th>बाकी (₹)</th>
            <th>स्थिती</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
        <tfoot>
          <tr class="tf-footer" style="background-color:#0F4A3C; color:#ffffff; font-weight:bold;">
            <td colspan="6" style="font-weight:bold; text-align:right;">एकूण (TOTAL)</td>
            <td style="text-align:right;">${totalExp}</td>
            <td style="text-align:right;">${totalColl}</td>
            <td style="text-align:right;">${totalRem}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(['\uFEFF' + excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${title.replace(/\s+/g, '_')}_अहवाल.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
