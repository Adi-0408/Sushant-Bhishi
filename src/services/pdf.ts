import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { CollectionEntry, Customer, Loan, LoanPayment } from '../types';
import {
  formatCurrency,
  formatDateMarathi,
  getBishiNameMarathi,
  getModalityShort,
  getOfficeNameMarathi,
} from '../utils/formatters';
import { calculateCustomerFinancials } from '../utils/calculations';

/**
 * Generate PDF for a Single Customer in Clean Marathi
 * Show only customer details, transaction history, totals, and loan (if applicable).
 */
export const generateCustomerPDF = async (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null
) => {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.fontFamily = "'Noto Sans Devanagari', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  container.style.padding = '24px';
  container.style.color = '#1e293b';

  const financials = calculateCustomerFinancials(customer, collections, loan);
  const customerCollections = collections.filter((c) => c.customerId === customer.id);
  const todayStr = formatDateMarathi(new Date().toISOString().split('T')[0]);

  container.innerHTML = `
    <div style="border: 2px solid #0B5C45; padding: 24px; border-radius: 16px; background: #ffffff;">
      <!-- Statement Title Header -->
      <div style="text-align: center; border-bottom: 2px solid #0B5C45; padding-bottom: 12px; margin-bottom: 16px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 900; color: #0B5C45;">खातेदार व्यवहार अहवाल (Account Statement)</h1>
        <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 700; color: #64748b;">दिनांक: ${todayStr}</p>
      </div>

      <!-- Customer Details Master Card -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 13px; font-weight: 700;">
          <div><span style="color: #64748b;">खाते क्र.:</span> <strong style="color: #0f172a; font-size: 15px;">${customer.accountNumber}</strong></div>
          <div><span style="color: #64748b;">नाव:</span> <strong style="color: #0f172a; font-size: 15px;">${customer.name}</strong></div>
          <div><span style="color: #64748b;">मोबाईल:</span> <strong style="color: #0f172a;">${customer.mobile}</strong></div>
          <div><span style="color: #64748b;">भिशी प्रकार:</span> <strong style="color: #0B5C45;">${getBishiNameMarathi(customer.bishiType)}</strong></div>
          <div><span style="color: #64748b;">हप्ता:</span> <strong>${getModalityShort(customer.modality)} (${formatCurrency(customer.amount)})</strong></div>
          <div><span style="color: #64748b;">कार्यालय:</span> <strong>${getOfficeNameMarathi(customer.officeId)}</strong></div>
        </div>
      </div>

      <!-- Financial Summary Cards -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px;">
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 10px; text-align: center;">
          <span style="font-size: 11px; font-weight: 700; color: #166534; display: block;">अपेक्षित भिशी</span>
          <span style="font-size: 15px; font-weight: 900; color: #15803d;">${formatCurrency(financials.totalExpectedBishi)}</span>
        </div>
        <div style="background: #f0fdf4; border: 1px solid #86efac; padding: 10px; border-radius: 10px; text-align: center;">
          <span style="font-size: 11px; font-weight: 700; color: #166534; display: block;">प्रत्यक्ष जमा</span>
          <span style="font-size: 15px; font-weight: 900; color: #0b5c45;">${formatCurrency(financials.totalCollectedBishi)}</span>
        </div>
        <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 10px; border-radius: 10px; text-align: center;">
          <span style="font-size: 11px; font-weight: 700; color: #9f1239; display: block;">उरलेली बाकी</span>
          <span style="font-size: 15px; font-weight: 900; color: #be123c;">${formatCurrency(financials.totalRemainingBishi)}</span>
        </div>
      </div>

      <!-- Transaction History Table -->
      <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0;">व्यवहार इतिहास नोंदी</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-weight: 600; margin-bottom: 16px;">
        <thead>
          <tr style="background: #0B5C45; color: #ffffff; text-align: left;">
            <th style="padding: 8px 10px;">देय तारीख</th>
            <th style="padding: 8px 10px; text-align: right;">अपेक्षित (₹)</th>
            <th style="padding: 8px 10px; text-align: right;">जमा (₹)</th>
            <th style="padding: 8px 10px; text-align: right;">बाकी (₹)</th>
            <th style="padding: 8px 10px; text-align: right;">व्याज (₹)</th>
            <th style="padding: 8px 10px; text-align: right;">दंड (₹)</th>
            <th style="padding: 8px 10px; text-align: center;">स्थिती</th>
          </tr>
        </thead>
        <tbody>
          ${customerCollections
            .map(
              (item, idx) => `
            <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 10px; font-weight: 700;">${formatDateMarathi(item.dueDate)}</td>
              <td style="padding: 8px 10px; text-align: right; font-weight: 700;">${formatCurrency(item.expectedAmount)}</td>
              <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: #15803d;">${formatCurrency(item.collectedAmount)}</td>
              <td style="padding: 8px 10px; text-align: right; font-weight: 900; color: #be123c;">${formatCurrency(item.remainingAmount)}</td>
              <td style="padding: 8px 10px; text-align: right;">${formatCurrency(item.interestAmount)}</td>
              <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #be123c;">${formatCurrency(item.penaltyAmount)}</td>
              <td style="padding: 8px 10px; text-align: center;">
                <span style="padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; background: ${
                  item.status === 'PAID' ? '#dcfce7' : item.status === 'PARTIAL' ? '#fef9c3' : '#ffe4e6'
                }; color: ${item.status === 'PAID' ? '#15803d' : item.status === 'PARTIAL' ? '#a16207' : '#be123c'};">
                  ${item.status === 'PAID' ? 'पूर्ण जमा' : item.status === 'PARTIAL' ? 'अंशतः' : 'बाकी'}
                </span>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      ${
        customer.hasLoan && loan
          ? `
        <h3 style="font-size: 14px; font-weight: 800; color: #7c2d12; margin: 12px 0 8px 0;">कर्ज माहिती</h3>
        <div style="background: #fff7ed; border: 1px solid #ffedd5; border-radius: 10px; padding: 12px;">
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 12px; font-weight: 700;">
            <div>कर्ज रक्कम: <strong style="color: #9a3412;">${formatCurrency(loan.principalAmount)}</strong></div>
            <div>देय व्याज: <strong style="color: #9a3412;">${formatCurrency(loan.totalInterest)} (${loan.interestRate}%)</strong></div>
            <div>एकूण देय: <strong style="color: #9a3412;">${formatCurrency(loan.totalPayable)}</strong></div>
            <div>जमा रक्कम: <strong style="color: #15803d;">${formatCurrency(loan.paidAmount)}</strong></div>
            <div>कर्ज बाकी: <strong style="color: #be123c;">${formatCurrency(loan.remainingAmount)}</strong></div>
            <div>तारीख: <strong>${formatDateMarathi(loan.issueDate)}</strong></div>
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
    pdf.save(`Account_${customer.accountNumber}_मराठी_अहवाल.pdf`);
  } catch (error) {
    console.error('PDF Generation error:', error);
  } finally {
    document.body.removeChild(container);
  }
};

/**
 * Generate Report PDF (Daily / Weekly / Monthly) in Clean Marathi
 */
export const generateReportPDF = async (
  title: string,
  officeName: string,
  bishiName: string,
  customers: Customer[],
  collections: CollectionEntry[]
) => {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '1100px';
  container.style.backgroundColor = '#ffffff';
  container.style.fontFamily = "'Noto Sans Devanagari', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  container.style.padding = '30px';
  container.style.color = '#1e293b';

  let totalExp = 0;
  let totalColl = 0;
  let totalRem = 0;
  let totalInt = 0;
  let totalPen = 0;

  const rows = customers.map((cust) => {
    const custColls = collections.filter((c) => c.customerId === cust.id);
    let exp = 0;
    let coll = 0;
    let rem = 0;
    let int = 0;
    let pen = 0;

    custColls.forEach((c) => {
      exp += c.expectedAmount || 0;
      coll += c.collectedAmount || 0;
      rem += c.remainingAmount || 0;
      int += c.interestAmount || 0;
      pen += c.penaltyAmount || 0;
    });

    totalExp += exp;
    totalColl += coll;
    totalRem += rem;
    totalInt += int;
    totalPen += pen;

    const statusText = rem === 0 && exp > 0 ? 'पूर्ण जमा' : coll > 0 ? 'अंशतः जमा' : 'बाकी';
    const statusBg = rem === 0 && exp > 0 ? '#dcfce7' : coll > 0 ? '#fef9c3' : '#ffe4e6';
    const statusColor = rem === 0 && exp > 0 ? '#15803d' : coll > 0 ? '#a16207' : '#be123c';

    return {
      cust,
      exp,
      coll,
      rem,
      int,
      pen,
      statusText,
      statusBg,
      statusColor,
    };
  });

  const todayStr = formatDateMarathi(new Date().toISOString().split('T')[0]);

  container.innerHTML = `
    <div style="border: 2px solid #0B5C45; padding: 24px; border-radius: 12px; background: #ffffff;">
      <!-- Title Header Bar -->
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0B5C45; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <h2 style="margin: 0; font-size: 20px; font-weight: 900; color: #0B5C45;">${title}</h2>
        </div>
        <div style="text-align: right; font-size: 11px; font-weight: 700; color: #334155;">
          <span>कार्यालय: <strong style="color: #0F7A5C;">${officeName}</strong></span> | 
          <span>भिशी: <strong style="color: #0F7A5C;">${bishiName}</strong></span> | 
          <span>दिनांक: <strong>${todayStr}</strong></span>
        </div>
      </div>

      <!-- Clean Data Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-weight: 600; border: 1px solid #94a3b8;">
        <thead>
          <tr style="background: #0B5C45; color: #ffffff; text-align: left; font-size: 11px;">
            <th style="padding: 8px 6px; border: 1px solid #0f4a3c; text-align: center; width: 40px;">अ.क्र.</th>
            <th style="padding: 8px 8px; border: 1px solid #0f4a3c; width: 80px;">खाते क्र.</th>
            <th style="padding: 8px 8px; border: 1px solid #0f4a3c;">खातेदाराचे नाव</th>
            <th style="padding: 8px 8px; border: 1px solid #0f4a3c; width: 100px;">मोबाईल</th>
            <th style="padding: 8px 8px; border: 1px solid #0f4a3c; width: 75px;">प्रकार</th>
            <th style="padding: 8px 8px; border: 1px solid #0f4a3c; text-align: right; width: 95px;">अपेक्षित (₹)</th>
            <th style="padding: 8px 8px; border: 1px solid #0f4a3c; text-align: right; width: 95px;">जमा (₹)</th>
            <th style="padding: 8px 8px; border: 1px solid #0f4a3c; text-align: right; width: 95px;">बाकी (₹)</th>
            <th style="padding: 8px 8px; border: 1px solid #0f4a3c; text-align: center; width: 85px;">स्थिती</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, idx) => `
            <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
              <td style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700;">${idx + 1}</td>
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; font-weight: 800; color: #0f172a;">${r.cust.accountNumber}</td>
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; font-weight: 800; color: #1e293b;">${r.cust.name}</td>
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; color: #475569;">${r.cust.mobile}</td>
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; color: #475569;">${r.cust.modality === 'W' ? 'साप्ताहिक' : 'मासिक'}</td>
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 700; color: #334155;">${formatCurrency(r.exp)}</td>
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 800; color: #15803d;">${formatCurrency(r.coll)}</td>
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 900; color: #be123c;">${formatCurrency(r.rem)}</td>
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: center;">
                <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 800; background: ${r.statusBg}; color: ${r.statusColor};">
                  ${r.statusText}
                </span>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
        <tfoot>
          <tr style="background: #0F4A3C; color: #ffffff; font-weight: 900; font-size: 11px;">
            <td style="padding: 9px 6px; border: 1px solid #0f4a3c; text-align: center;">-</td>
            <td style="padding: 9px 8px; border: 1px solid #0f4a3c;">एकूण (TOTAL)</td>
            <td style="padding: 9px 8px; border: 1px solid #0f4a3c;">खातेदार: ${customers.length}</td>
            <td style="padding: 9px 8px; border: 1px solid #0f4a3c;">-</td>
            <td style="padding: 9px 8px; border: 1px solid #0f4a3c;">-</td>
            <td style="padding: 9px 8px; border: 1px solid #0f4a3c; text-align: right;">${formatCurrency(totalExp)}</td>
            <td style="padding: 9px 8px; border: 1px solid #0f4a3c; text-align: right;">${formatCurrency(totalColl)}</td>
            <td style="padding: 9px 8px; border: 1px solid #0f4a3c; text-align: right;">${formatCurrency(totalRem)}</td>
            <td style="padding: 9px 8px; border: 1px solid #0f4a3c; text-align: center;">-</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
    pdf.save(`${title.replace(/\s+/g, '_')}_मराठी_अहवाल.pdf`);
  } catch (error) {
    console.error('PDF Generation error:', error);
  } finally {
    document.body.removeChild(container);
  }
};

/**
 * Generate PDF for Member Ledger Card (खातेदार खाते उतारा) matching exact register book layout.
 */
export const generateMemberLedgerPDF = async (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  loanPayments: LoanPayment[] = [],
  showAllWeeks: boolean = false
) => {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '1050px';
  container.style.backgroundColor = '#ffffff';
  container.style.fontFamily = "'Noto Sans Devanagari', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  container.style.padding = '24px';
  container.style.color = '#1e293b';

  const todayStr = new Date().toISOString().split('T')[0];
  const allCustomerCollections = collections
    .filter((c) => c.customerId === customer.id)
    .sort((a, b) => a.periodIndex - b.periodIndex);

  const customerCollections = showAllWeeks
    ? allCustomerCollections
    : allCustomerCollections.filter((c) => {
        const hasDeposit = (c.collectedAmount || 0) > 0;
        const isPaid = c.status === 'PAID';
        const hasLoanPayment = loanPayments.some(
          (lp) => lp.customerId === customer.id && lp.paymentDate === c.dueDate
        );
        return hasDeposit || isPaid || hasLoanPayment;
      });

  let totalCumulative = 0;

  const tableRowsHtml = customerCollections.length === 0
    ? `<tr><td colspan="11" style="padding: 16px; text-align: center; color: #64748b; font-weight: 700; border: 1px solid #b8a99a;">या खातेदाराची अद्याप कोणतीही पूर्ण जमा नोंद झालेली नाही.</td></tr>`
    : customerCollections
        .map((item, idx) => {
          const deposit = item.collectedAmount || 0;
          totalCumulative += deposit;
          const penalty = item.penaltyAmount || 0;
          const expected = item.expectedAmount || 0;

          const periodPayment = loanPayments.find(
            (lp) => lp.customerId === customer.id && lp.paymentDate === item.dueDate
          );

          const loanPrincipalPaid = periodPayment ? periodPayment.paidAmount : 0;
          const loanInterestPaid = periodPayment ? periodPayment.interestPaid : 0;
          const loanPenalty = periodPayment ? periodPayment.penaltyPaid : 0;
          const loanIssued = idx === 0 && customer.hasLoan && loan ? loan.principalAmount : 0;

          const balanceRemaining = item.remainingAmount || 0;

          return `
            <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#fcf8f2'}; border-bottom: 1px solid #d1c7bd;">
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: center; font-weight: 700;">${idx + 1}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: center; font-weight: 700;">${formatDateMarathi(item.dueDate)}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 800; color: #15803d;">${deposit > 0 ? deposit : ''}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 900; color: #0b5c45;">${totalCumulative > 0 ? totalCumulative : ''}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #be123c;">${penalty > 0 ? penalty : ''}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 700;">${expected}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #c2410c; font-weight: 700;">${loanIssued > 0 ? loanIssued : ''}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #15803d;">${loanPrincipalPaid > 0 ? loanPrincipalPaid : ''}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #15803d;">${loanInterestPaid > 0 ? loanInterestPaid : ''}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #be123c;">${loanPenalty > 0 ? loanPenalty : ''}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 900; color: #be123c;">${balanceRemaining}</td>
            </tr>
          `;
        })
        .join('');

  container.innerHTML = `
    <div style="border: 3px double #8B4513; padding: 20px; background: #fffdfa; border-radius: 8px;">
      <!-- Title Header -->
      <div style="text-align: center; border-bottom: 2px solid #8B4513; padding-bottom: 8px; margin-bottom: 12px;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #5c3a21;">खातेदार खाते उतारा (Member Ledger Card)</h1>
      </div>

      <!-- Customer Meta Grid -->
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; font-weight: 800; margin-bottom: 14px;">
        <tr>
          <td style="width: 15%; background: #8B4513; color: white; padding: 6px 10px; border: 1px solid #8B4513;">खाते नंबर:</td>
          <td style="width: 35%; background: #fffde7; padding: 6px 10px; border: 1px solid #b8a99a; font-size: 15px;">${customer.accountNumber}</td>
          <td style="width: 18%; background: #8B4513; color: white; padding: 6px 10px; border: 1px solid #8B4513;">खातेदाराचे नाव:</td>
          <td style="width: 32%; background: #fffde7; padding: 6px 10px; border: 1px solid #b8a99a; font-size: 15px;">${customer.name}</td>
        </tr>
        <tr>
          <td style="background: #8B4513; color: white; padding: 6px 10px; border: 1px solid #8B4513;">हप्ता रुपये:</td>
          <td style="background: #fffde7; padding: 6px 10px; border: 1px solid #b8a99a;">₹${customer.amount} (${customer.modality === 'W' ? 'साप्ताहिक' : 'मासिक'})</td>
          <td style="background: #8B4513; color: white; padding: 6px 10px; border: 1px solid #8B4513;">पत्ता / मोबाईल:</td>
          <td style="background: #fffde7; padding: 6px 10px; border: 1px solid #b8a99a;">${customer.address || ''} (${customer.mobile})</td>
        </tr>
      </table>

      <!-- Ledger Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-weight: 700; border: 1px solid #8B4513;">
        <thead>
          <tr style="background: #f5e6d3; color: #333333; font-weight: 900; text-align: center;">
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px;">अ. क्र.</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px;">तारीख</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px;">खात्यात जमा रुपये</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px;">एकूण जमा रुपये</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px;">दंड</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px;">देणे</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px;">दिलेले कर्ज</th>
            <th colspan="2" style="border: 1px solid #8B4513; padding: 6px;">कर्ज परत फेड</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px;">दंड</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px;">देणे बाकी</th>
          </tr>
          <tr style="background: #faebd7; color: #333333; font-weight: 900; text-align: center;">
            <th style="border: 1px solid #8B4513; padding: 5px;">कर्ज</th>
            <th style="border: 1px solid #8B4513; padding: 5px;">व्याज</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <!-- Footer Notes and Signature Block -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; font-size: 11px; font-weight: 700;">
        <div style="border: 1px solid #8B4513; padding: 8px 12px; border-radius: 6px; background: #fffde7; min-width: 220px;">
          <div>१) टाकणी: ______________</div>
          <div>२) डिव्हिडंड: ______________</div>
          <div>३) खाते नं.: ${customer.accountNumber}</div>
          <div>४) शेरा: ______________</div>
        </div>

        <div style="text-align: right; padding-right: 20px;">
          <p style="margin: 0 0 35px 0;">सदर भिशीची रक्कम मिळाला बद्दल...</p>
          <div style="font-weight: 900; font-size: 13px; border-top: 1px solid #333; padding-top: 4px; display: inline-block; min-width: 150px; text-align: center;">
            सेक्रेटरी / अध्यक्ष
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
    pdf.save(`खातेदार_उतारा_${customer.accountNumber}_${customer.name.replace(/\s+/g, '_')}.pdf`);
  } catch (error) {
    console.error('Member Ledger PDF error:', error);
  } finally {
    document.body.removeChild(container);
  }
};
