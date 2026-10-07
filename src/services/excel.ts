import { CollectionEntry, Customer, Loan, LoanPayment, ThakbakiEntry } from '../types';
import { formatDateMarathi, getBishiNameMarathi, getOfficeNameMarathi } from '../utils/formatters';
import { calculateMemberLedger } from './ledger';

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
  const ledgerCalculation = calculateMemberLedger(
    customer,
    collections,
    loan,
    loanPayments,
    showAllWeeks
  );

  const {
    totalDeposit,
    totalCumulativeDeposit,
    totalBishiPenalty,
    totalExpected,
    totalLoanIssued,
    totalLoanPrincipalPaid,
    totalLoanInterestPaid,
    totalLoanPenalty,
    finalRemainingBalance,
  } = ledgerCalculation;

  const rate = customer.interestRate || (customer.modality === 'W' ? 2.5 : 10);
  const expectedInterest = Math.round((totalExpected * rate) / 100);
  const totalExpectedWithInt = totalExpected + expectedInterest;
  const actualEarnedInterest = Math.round((totalDeposit * rate) / 100);
  const totalPayout = totalDeposit + actualEarnedInterest;

  const tableRowsHtml = ledgerCalculation.rows.length === 0
    ? `<tr><td colspan="11" style="text-align: center; padding: 12px; color: #64748b; font-weight: bold; border: 1px solid #b8c2cc;">या खातेदाराची अद्याप कोणतीही पूर्ण जमा नोंद झालेली नाही.</td></tr>`
    : ledgerCalculation.rows
        .map((row) => {
          return `
            <tr>
              <td style="text-align: center; border: 1px solid #b8c2cc; padding: 6px;">${row.srNo}</td>
              <td style="text-align: center; border: 1px solid #b8c2cc; padding: 6px;">${formatDateMarathi(row.date)}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; font-weight: bold; color: #15803d;">${row.deposit > 0 ? row.deposit : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; font-weight: bold; color: #0b5c45;">${row.cumulativeDeposit > 0 ? row.cumulativeDeposit : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #be123c;">${row.bishiPenalty > 0 ? row.bishiPenalty : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px;">${row.expected > 0 ? row.expected : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #c2410c;">${row.loanIssued > 0 ? row.loanIssued : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #15803d;">${row.loanPrincipalPaid > 0 ? row.loanPrincipalPaid : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #15803d;">${row.loanInterestPaid > 0 ? row.loanInterestPaid : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; color: #be123c;">${row.loanPenalty > 0 ? row.loanPenalty : ''}</td>
              <td style="text-align: right; border: 1px solid #b8c2cc; padding: 6px; font-weight: bold; color: #be123c;">${row.balanceRemaining}</td>
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
        <tr>
          <td class="meta-header" style="background-color:#8B4513; color:#ffffff; font-weight:bold;">एकूण भिशी (व्याजासह)</td>
          <td colspan="4" class="meta-val" style="background-color:#fffde7; font-weight:bold; color:#0b5c45;">₹${totalExpectedWithInt} (ठेव: ₹${totalExpected} + व्याज: +₹${expectedInterest})</td>
          <td class="meta-header" style="background-color:#8B4513; color:#ffffff; font-weight:bold;">लाभांश / व्याजदर</td>
          <td colspan="5" class="meta-val" style="background-color:#fffde7; font-weight:bold; color:#1e3a8a;">${rate}% (${customer.modality === 'W' ? 'साप्ताहिक' : 'मासिक'})</td>
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
            <td style="text-align:right; border: 1px solid #5c3a21; padding: 6px;">${totalCumulativeDeposit > 0 ? totalCumulativeDeposit : ''}</td>
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
      <br/>
      <table>
        <tr>
          <td colspan="5" style="background-color:#fffde7; border: 1px solid #8B4513; font-weight: bold; padding: 10px;">
            <div>१) टाकणी: ___________________</div>
            <div style="color: #0b5c45;">२) डिव्हिडंड / व्याज (${rate}%): ₹${actualEarnedInterest}</div>
            <div>३) खाते नं.: <strong>${customer.accountNumber}</strong></div>
            <div style="color: #1e3a8a;">४) एकूण अंतिम परतावा: ₹${totalPayout}</div>
          </td>
          <td colspan="6" style="text-align: right; border: none; font-weight: bold; padding: 10px;">
            <p>सदर भिशीची एकूण रक्कम ₹${totalPayout} (व्याजासह) मिळाल्या बद्दल...</p>
            <br/><br/>
            <span>सेक्रेटरी / अध्यक्ष</span>
          </td>
        </tr>
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
    installmentAmount?: number;
    exp: number;
    expectedInterest?: number;
    totalExpWithInterest?: number;
    coll: number;
    rem: number;
    int?: number;
    pen?: number;
    totalPayable?: number;
    extraSubmitted?: number;
    totalWithExtra?: number;
    isPaid: boolean;
    unpaidLoan?: number;
    loanDeduction?: number;
  }[],
  lang: 'MR' | 'EN' = 'MR'
) => {
  const tableRowsHtml = rows
    .map(
      (r, idx) => {
        const isLoanOnly = r.customer.bishiType === 'LOAN_ONLY';
        const instAmt = isLoanOnly ? 0 : (r.installmentAmount ?? (r.customer.amount || 0));
        const rate = r.customer.interestRate || (r.customer.modality === 'W' ? 2.5 : 10);
        const expInt = r.expectedInterest ?? Math.round((r.exp * rate) / 100);
        const totalExpWithInt = r.totalExpWithInterest ?? (r.exp + expInt);
        const intAmt = r.int || 0;
        const payableAmt = r.totalPayable !== undefined ? r.totalPayable : (totalExpWithInt + (r.extraSubmitted || 0));
        const extraAmt = r.extraSubmitted || 0;
        const returnAmt = r.totalWithExtra !== undefined ? r.totalWithExtra : (r.coll + intAmt);
        const loanAmt = r.unpaidLoan || 0;

        return `
        <tr>
          <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${idx + 1}</td>
          <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r.customer.accountNumber}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r.customer.name}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${r.customer.mobile || '-'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${getBishiNameMarathi(r.customer.bishiType, lang)}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold;">${r.customer.modality === 'W' ? (lang === 'EN' ? 'Weekly' : 'साप्ताहिक') : (lang === 'EN' ? 'Monthly' : 'मासिक')}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #065f46;">${instAmt > 0 ? instAmt : '-'}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px;">${r.exp}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; color: #1e40af;">+${expInt}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #064e3b; background-color: #ecfdf5;">${totalExpWithInt}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #15803d;">${r.coll}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #be123c;">${r.rem}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; color: #1d4ed8;">${intAmt > 0 ? intAmt : '-'}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #92400e; background-color: #fffbeb;">${loanAmt > 0 ? loanAmt : '-'}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #1e3a8a;">${payableAmt > 0 ? payableAmt : '-'}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #581c87;">${extraAmt > 0 ? `+${extraAmt}` : '-'}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #166534; background-color: #f0fdf4;">${returnAmt > 0 ? (loanAmt > 0 ? `${returnAmt} (-कर्ज: ${loanAmt}${loanAmt >= returnAmt ? ` | बाकी: ${loanAmt - returnAmt}` : ` | हात: ${returnAmt - loanAmt}`})` : returnAmt) : '-'}</td>
          <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${r.isPaid ? (lang === 'EN' ? 'Paid' : 'पूर्ण जमा') : r.coll > 0 ? (lang === 'EN' ? 'Partial' : 'अंशतः जमा') : (lang === 'EN' ? 'Pending' : 'बाकी')}</td>
        </tr>
      `;
      }
    )
    .join('');

  const totalInstallment = rows.reduce((a, r) => a + (r.customer.bishiType === 'LOAN_ONLY' ? 0 : (r.installmentAmount ?? (r.customer.amount || 0))), 0);
  const totalExp = rows.reduce((a, r) => a + r.exp, 0);
  const totalExpInt = rows.reduce((a, r) => {
    const rate = r.customer.interestRate || (r.customer.modality === 'W' ? 2.5 : 10);
    return a + (r.expectedInterest ?? Math.round((r.exp * rate) / 100));
  }, 0);
  const totalExpWithInterest = totalExp + totalExpInt;
  const totalColl = rows.reduce((a, r) => a + r.coll, 0);
  const totalRem = rows.reduce((a, r) => a + r.rem, 0);
  const totalInt = rows.reduce((a, r) => a + (r.int || 0), 0);
  const totalUnpaidLoan = rows.reduce((a, r) => a + (r.unpaidLoan || 0), 0);
  const totalPayable = rows.reduce((a, r) => {
    const rate = r.customer.interestRate || (r.customer.modality === 'W' ? 2.5 : 10);
    const expWithInt = r.totalExpWithInterest ?? (r.exp + Math.round((r.exp * rate) / 100));
    return a + (r.totalPayable !== undefined ? r.totalPayable : (expWithInt + (r.extraSubmitted || 0)));
  }, 0);
  const totalExtra = rows.reduce((a, r) => a + (r.extraSubmitted || 0), 0);
  const totalReturn = rows.reduce((a, r) => a + (r.totalWithExtra !== undefined ? r.totalWithExtra : (r.coll + (r.int || 0))), 0);

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
      <h2>${lang === 'EN' ? 'Sushant Bishi' : 'सुशांत भिशी'} - ${title}</h2>
      <p>${lang === 'EN' ? 'Office' : 'कार्यालय'}: ${officeName} | ${lang === 'EN' ? 'Scheme' : 'भिशी'}: ${bishiName} | ${lang === 'EN' ? 'Date' : 'तारीख'}: ${new Date().toLocaleDateString(lang === 'EN' ? 'en-IN' : 'mr-IN')}</p>
      <table>
        <thead>
          <tr class="th-header" style="background-color:#0B5C45; color:#ffffff; font-weight:bold;">
            <th>${lang === 'EN' ? 'Sr. No.' : 'अ. क्र.'}</th>
            <th>${lang === 'EN' ? 'Acc No.' : 'खाते क्र.'}</th>
            <th>${lang === 'EN' ? 'Customer Name' : 'खातेदाराचे नाव'}</th>
            <th>${lang === 'EN' ? 'Mobile' : 'मोबाईल'}</th>
            <th>${lang === 'EN' ? 'Bishi Scheme' : 'भिशी प्रकार'}</th>
            <th>${lang === 'EN' ? 'Modality (Frequency)' : 'पद्धत (साप्ताहिक/मासिक)'}</th>
            <th>${lang === 'EN' ? 'Installment (₹)' : 'हप्ता रक्कम (₹)'}</th>
            <th>${lang === 'EN' ? 'Inst. Deposit (₹)' : 'हप्ते ठेव (₹)'}</th>
            <th>${lang === 'EN' ? 'Expected Int (₹)' : 'अपेक्षित व्याज (₹)'}</th>
            <th>${lang === 'EN' ? 'Total Bishi (with Int) (₹)' : 'एकूण भिशी (व्याजासह) (₹)'}</th>
            <th>${lang === 'EN' ? 'Collected (₹)' : 'जमा (₹)'}</th>
            <th>${lang === 'EN' ? 'Remaining (₹)' : 'बाकी (₹)'}</th>
            <th>${lang === 'EN' ? 'Earned Int (₹)' : 'जमा व्याज (₹)'}</th>
            <th>${lang === 'EN' ? 'Loan (₹)' : 'कर्ज (₹)'}</th>
            <th>${lang === 'EN' ? 'Total Payable (₹)' : 'एकूण देय (₹)'}</th>
            <th>${lang === 'EN' ? 'Extra Submitted (₹)' : 'जादा जमा (₹)'}</th>
            <th>${lang === 'EN' ? 'Total Return (₹)' : 'एकूण परतावा (₹)'}</th>
            <th>${lang === 'EN' ? 'Status' : 'स्थिती'}</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
        <tfoot>
          <tr class="tf-footer" style="background-color:#0F4A3C; color:#ffffff; font-weight:bold;">
            <td colspan="6" style="font-weight:bold; text-align:right;">${lang === 'EN' ? 'TOTAL' : 'एकूण (TOTAL)'}</td>
            <td style="text-align:right; font-weight:bold; color:#a7f3d0;">${totalInstallment > 0 ? totalInstallment : '-'}</td>
            <td style="text-align:right;">${totalExp}</td>
            <td style="text-align:right;">${totalExpInt}</td>
            <td style="text-align:right; font-weight:bold; color:#a7f3d0;">${totalExpWithInterest}</td>
            <td style="text-align:right;">${totalColl}</td>
            <td style="text-align:right;">${totalRem}</td>
            <td style="text-align:right;">${totalInt}</td>
            <td style="text-align:right; font-weight:bold; color:#fde68a;">${totalUnpaidLoan > 0 ? totalUnpaidLoan : '-'}</td>
            <td style="text-align:right;">${totalPayable}</td>
            <td style="text-align:right;">${totalExtra}</td>
            <td style="text-align:right; font-weight:bold; color:#a7f3d0;">${totalReturn}</td>
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

/**
 * Export Thakbaki (थकबाकी) Report to Excel.
 */
export const exportThakbakiReportToExcel = (
  entries: ThakbakiEntry[],
  lang: 'MR' | 'EN' = 'MR'
) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const title = lang === 'EN' ? 'Sushant Bishi - Thak Baki Report' : 'सुषांत भिशी - थकबाकी अहवाल';
  const dateLabel = lang === 'EN' ? 'Date' : 'दिनांक';
  const dateFormatted = formatDateMarathi(todayStr, lang);

  const totalInitial = entries.reduce((s, e) => s + (e.initialAmount || 0), 0);
  const totalPaid = entries.reduce((s, e) => s + (e.paidAmount || 0), 0);
  const totalRemaining = entries.reduce((s, e) => s + (e.remainingAmount || 0), 0);

  const tableRowsHtml = entries
    .map(
      (e, idx) => `
      <tr style="background-color:${idx % 2 === 0 ? '#ffffff' : '#fffbeb'};">
        <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
        <td style="font-weight:bold;">${e.accountNumber}</td>
        <td style="font-weight:bold;">${e.name}</td>
        <td>${e.mobile || '-'}</td>
        <td>${getOfficeNameMarathi(e.officeId, lang)}</td>
        <td style="text-align:right;">${e.initialAmount.toFixed(2)}</td>
        <td style="text-align:right; color:#065f46;">${e.paidAmount.toFixed(2)}</td>
        <td style="text-align:right; color:#991b1b; font-weight:bold;">${e.remainingAmount.toFixed(2)}</td>
        <td style="text-align:center;">${e.status === 'CLEARED' ? '✅ ' + (lang === 'EN' ? 'Cleared' : 'पूर्ण') : '⏳ ' + (lang === 'EN' ? 'Pending' : 'बाकी')}</td>
        <td style="text-align:center;">${e.lastPaymentDate ? formatDateMarathi(e.lastPaymentDate, lang) : '-'}</td>
      </tr>`
    )
    .join('');

  const h1 = lang === 'EN' ? 'Sr' : 'अ.क्र.';
  const h2 = lang === 'EN' ? 'Acc No.' : 'खाते क्र.';
  const h3 = lang === 'EN' ? 'Customer Name' : 'खातेदाराचे नाव';
  const h4 = lang === 'EN' ? 'Mobile' : 'मोबाईल';
  const h5 = lang === 'EN' ? 'Office' : 'कार्यालय';
  const h6 = lang === 'EN' ? 'Initial Amount (Rs)' : 'मूळ थकबाकी (रु.)';
  const h7 = lang === 'EN' ? 'Paid Amount (Rs)' : 'जमा रक्कम (रु.)';
  const h8 = lang === 'EN' ? 'Balance Due (Rs)' : 'शिल्लक बाकी (रु.)';
  const h9 = lang === 'EN' ? 'Status' : 'स्थिती';
  const h10 = lang === 'EN' ? 'Last Payment' : 'शेवटची जमा';

  const excelHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8">
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d1d5db; padding: 5px 8px; }
      th { background-color: #92400e; color: #ffffff; font-weight: bold; text-align: center; }
    </style>
    </head>
    <body>
      <h2 style="color:#92400e;">${title}</h2>
      <p style="font-size:10px;">${dateLabel}: ${dateFormatted} | ${lang === 'EN' ? 'Total Records' : 'एकूण नोंदी'}: ${entries.length}</p>
      <table>
        <thead>
          <tr>
            <th>${h1}</th><th>${h2}</th><th>${h3}</th><th>${h4}</th><th>${h5}</th>
            <th>${h6}</th><th>${h7}</th><th>${h8}</th><th>${h9}</th><th>${h10}</th>
          </tr>
        </thead>
        <tbody>${tableRowsHtml}</tbody>
        <tfoot>
          <tr style="background-color:#92400e; color:#ffffff; font-weight:bold;">
            <td colspan="5" style="text-align:center;">${lang === 'EN' ? 'TOTAL' : 'एकूण'} (${entries.length})</td>
            <td style="text-align:right;">${totalInitial.toFixed(2)}</td>
            <td style="text-align:right;">${totalPaid.toFixed(2)}</td>
            <td style="text-align:right;">${totalRemaining.toFixed(2)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </body>
    </html>`;

  const blob = new Blob(['\uFEFF' + excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = (lang === 'EN' ? 'ThakBaki_Report_' : 'थकबाकी_अहवाल_') + todayStr + '.xls';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
