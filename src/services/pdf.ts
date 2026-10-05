import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { CollectionEntry, Customer, Loan, LoanPayment, ThakbakiEntry } from '../types';
import {
  formatCurrency,
  formatDateMarathi,
  getBishiNameMarathi,
  getModalityShort,
  getOfficeNameMarathi,
} from '../utils/formatters';
import { calculateCustomerFinancials } from '../utils/calculations';
import { StorageService } from './db';
import { calculateMemberLedger } from './ledger';
import { Language } from '../utils/translations';

/**
 * Creates an off-screen page container with exact A4 dimensions.
 * Using individual page containers guarantees:
 * 1. Zero horizontal row slicing or cut-off text.
 * 2. Table headers repeat seamlessly on every page.
 * 3. Exact A4 aspect ratio with zero black lines or gaps.
 */
const createPdfPage = (
  widthPx: number,
  heightPx: number
): HTMLDivElement => {
  const page = document.createElement('div');
  page.style.position = 'fixed';
  page.style.top = '0';
  page.style.left = '0';
  page.style.zIndex = '-9999';
  page.style.pointerEvents = 'none';
  page.style.width = `${widthPx}px`;
  page.style.minHeight = `${heightPx}px`;
  page.style.maxHeight = `${heightPx}px`;
  page.style.backgroundColor = '#ffffff';
  page.style.fontFamily = "'Noto Sans Devanagari', 'Mukta', 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  page.style.color = '#1e293b';
  page.style.padding = '14px 18px';
  page.style.boxSizing = 'border-box';
  page.style.overflow = 'hidden';
  page.style.display = 'flex';
  page.style.flexDirection = 'column';
  page.style.justifyContent = 'space-between';
  return page;
};

/**
 * Renders an array of discrete A4 page elements into a multi-page PDF.
 * Eliminates blind canvas slicing and guarantees that table rows are never cut across page boundaries.
 */
const renderPagesToPdf = async (
  pages: HTMLElement[],
  orientation: 'portrait' | 'landscape',
  filename: string
) => {
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    const pageContainer = pages[i];
    document.body.appendChild(pageContainer);

    try {
      const canvas = await html2canvas(pageContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: pageContainer.scrollWidth,
        windowHeight: pageContainer.scrollHeight,
      });

      const imgData = canvas.toDataURL('image/png');
      if (i > 0) {
        pdf.addPage();
      }
      const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidthMm, Math.min(pageHeightMm, imgHeightMm));
    } catch (err) {
      console.error('Page render error on page', i + 1, err);
    } finally {
      if (pageContainer.parentNode) {
        document.body.removeChild(pageContainer);
      }
    }
  }

  pdf.save(filename);
};

/**
 * Intelligent row-chunking helper for multi-page tables.
 * Balances row distribution across pages so that the last page
 * never feels awkwardly cramped or isolated.
 */
function chunkRowsForPages<T>(
  items: T[],
  firstPageCapacity: number,
  middlePageCapacity: number,
  lastPageCapacity: number
): T[][] {
  if (items.length <= firstPageCapacity) {
    return [items];
  }

  const pages: T[][] = [];
  let remaining = [...items];

  // First page takes firstPageCapacity
  pages.push(remaining.slice(0, firstPageCapacity));
  remaining = remaining.slice(firstPageCapacity);

  // Subsequent pages
  while (remaining.length > 0) {
    if (remaining.length <= lastPageCapacity) {
      pages.push(remaining);
      break;
    }

    if (remaining.length <= middlePageCapacity + lastPageCapacity) {
      // Balance remaining items across 2 pages so neither is cramped or overloaded
      const half = Math.ceil(remaining.length / 2);
      const firstChunk = Math.min(half, middlePageCapacity);
      pages.push(remaining.slice(0, firstChunk));
      remaining = remaining.slice(firstChunk);
    } else {
      pages.push(remaining.slice(0, middlePageCapacity));
      remaining = remaining.slice(middlePageCapacity);
    }
  }

  return pages;
}

/**
 * Generate Thakbaki (थकबाकी) Report PDF.
 * True multi-page pagination:
 * - Table header is repeated on EVERY page.
 * - Table rows are NEVER cut in half across page breaks.
 * - Matching website amber theme with 4 metric overview cards.
 */
export const generateThakbakiReportPDF = async (
  entries: ThakbakiEntry[],
  lang: Language = 'MR'
): Promise<void> => {
  const todayStr = new Date().toISOString().split('T')[0];
  const title = lang === 'EN' ? 'Sushant Bishi - Thak Baki Report' : 'सुषांत भिशी - थकबाकी अहवाल';
  const dateFormatted = formatDateMarathi(todayStr, lang);

  const totalInitial = entries.reduce((s, e) => s + (e.initialAmount || 0), 0);
  const totalPaid = entries.reduce((s, e) => s + (e.paidAmount || 0), 0);
  const totalRemaining = entries.reduce((s, e) => s + (e.remainingAmount || 0), 0);
  const clearedCount = entries.filter((e) => e.status === 'CLEARED').length;
  const pendingCount = entries.length - clearedCount;

  // Pagination parameters for A4 Landscape
  const isSinglePage = entries.length <= 11;
  const chunkedEntries = isSinglePage
    ? [entries]
    : chunkRowsForPages(entries, 12, 16, 13);
  const totalPages = chunkedEntries.length;

  const pageElements: HTMLElement[] = [];
  let currentSrNo = 1;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageRows = chunkedEntries[pageIdx];
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === totalPages - 1;

    // A4 Landscape dimensions: 1122px x 794px
    const pageContainer = createPdfPage(1122, 794);

    const rowsHtml = pageRows
      .map((e) => {
        const sr = currentSrNo++;
        return `
          <tr style="background-color: ${sr % 2 === 0 ? '#ffffff' : '#fffbeb'};">
            <td style="text-align: center; font-weight: bold; padding: 5px 6px; border: 1px solid #e5e7eb; color: #4b5563;">${sr}</td>
            <td style="font-weight: 900; padding: 5px 8px; border: 1px solid #e5e7eb; color: #374151;">${e.accountNumber}</td>
            <td style="font-weight: 800; padding: 5px 8px; border: 1px solid #e5e7eb; color: #111827;">${e.name}</td>
            <td style="padding: 5px 8px; border: 1px solid #e5e7eb; color: #4b5563;">${e.mobile || '-'}</td>
            <td style="padding: 5px 8px; border: 1px solid #e5e7eb; color: #4b5563;">${getOfficeNameMarathi(e.officeId, lang)}</td>
            <td style="text-align: right; padding: 5px 8px; border: 1px solid #e5e7eb; font-weight: 700; color: #374151;">${formatCurrency(e.initialAmount, lang)}</td>
            <td style="text-align: right; padding: 5px 8px; border: 1px solid #e5e7eb; color: #065f46; font-weight: 800;">${formatCurrency(e.paidAmount, lang)}</td>
            <td style="text-align: right; padding: 5px 8px; border: 1px solid #e5e7eb; color: #991b1b; font-weight: 900;">${formatCurrency(e.remainingAmount, lang)}</td>
            <td style="text-align: center; padding: 5px 8px; border: 1px solid #e5e7eb;">
              <span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-weight: 900; font-size: 9px;
                background-color: ${e.status === 'CLEARED' ? '#d1fae5' : '#fef3c7'};
                color: ${e.status === 'CLEARED' ? '#065f46' : '#92400e'}; border: 1px solid ${e.status === 'CLEARED' ? '#a7f3d0' : '#fde68a'};">
                ${e.status === 'CLEARED' ? (lang === 'EN' ? '✅ Cleared' : '✅ पूर्ण') : (lang === 'EN' ? '⏳ Pending' : '⏳ बाकी')}
              </span>
            </td>
            <td style="text-align: center; padding: 5px 8px; border: 1px solid #e5e7eb; color: #64748b; font-size: 9px;">${e.lastPaymentDate ? formatDateMarathi(e.lastPaymentDate, lang) : '-'}</td>
          </tr>
        `;
      })
      .join('');

    // Table Header repeated on every single page
    const tableHeaderHtml = `
      <thead style="background-color: #78350f; color: #ffffff;">
        <tr style="background-color: #78350f; color: #ffffff;">
          <th style="padding: 6px 5px; text-align: center; border: 1px solid #92400e; width: 35px;">${lang === 'EN' ? 'Sr.' : 'अ.क्र.'}</th>
          <th style="padding: 6px 8px; text-align: left; border: 1px solid #92400e; width: 65px;">${lang === 'EN' ? 'Acc No.' : 'खाते क्र.'}</th>
          <th style="padding: 6px 8px; text-align: left; border: 1px solid #92400e; width: 140px;">${lang === 'EN' ? 'Customer Name' : 'खातेदाराचे नाव'}</th>
          <th style="padding: 6px 8px; text-align: left; border: 1px solid #92400e; width: 85px;">${lang === 'EN' ? 'Mobile' : 'मोबाईल'}</th>
          <th style="padding: 6px 8px; text-align: left; border: 1px solid #92400e; width: 90px;">${lang === 'EN' ? 'Office' : 'कार्यालय'}</th>
          <th style="padding: 6px 8px; text-align: right; border: 1px solid #92400e; width: 95px;">${lang === 'EN' ? 'Initial (₹)' : 'मूळ थकबाकी (₹)'}</th>
          <th style="padding: 6px 8px; text-align: right; border: 1px solid #92400e; width: 95px;">${lang === 'EN' ? 'Paid (₹)' : 'जमा रक्कम (₹)'}</th>
          <th style="padding: 6px 8px; text-align: right; border: 1px solid #92400e; width: 95px;">${lang === 'EN' ? 'Balance (₹)' : 'शिल्लक बाकी (₹)'}</th>
          <th style="padding: 6px 8px; text-align: center; border: 1px solid #92400e; width: 75px;">${lang === 'EN' ? 'Status' : 'स्थिती'}</th>
          <th style="padding: 6px 8px; text-align: center; border: 1px solid #92400e; width: 80px;">${lang === 'EN' ? 'Last Payment' : 'शेवटची जमा'}</th>
        </tr>
      </thead>
    `;

    // Top Header: Full banner on page 1, compact header on subsequent pages
    const headerHtml = isFirstPage
      ? `
        <div style="border-bottom: 2px solid #78350f; padding-bottom: 8px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h2 style="margin: 0; font-size: 14px; font-weight: 900; color: #78350f;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h2>
            <h1 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 900; color: #451a03;">${title}</h1>
          </div>
          <div style="text-align: right; font-size: 11px; font-weight: 800; color: #78350f; line-height: 1.4;">
            <div>${lang === 'EN' ? 'Date: ' : 'दिनांक: '}<strong>${dateFormatted}</strong> &nbsp;|&nbsp; ${lang === 'EN' ? 'Total Records: ' : 'एकूण नोंदी: '}<strong>${entries.length}</strong></div>
            <div style="color: #92400e;">${lang === 'EN' ? 'Page ' : 'पान '}<strong>1 / ${totalPages}</strong></div>
          </div>
        </div>

        <!-- 4 Overview Metric Cards on Page 1 -->
        <table style="width: 100%; border-collapse: separate; border-spacing: 6px; margin-bottom: 10px;">
          <tr>
            <td style="width: 25%; background: #fffbeb; border: 1px solid #fde68a; padding: 7px 10px; border-radius: 8px; text-align: left;">
              <span style="font-size: 9px; font-weight: 800; color: #92400e; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Initial Dues' : 'एकूण मूळ थकबाकी'}</span>
              <span style="font-size: 16px; font-weight: 900; color: #78350f; margin-top: 1px; display: block;">${formatCurrency(totalInitial, lang)}</span>
            </td>
            <td style="width: 25%; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 7px 10px; border-radius: 8px; text-align: left;">
              <span style="font-size: 9px; font-weight: 800; color: #166534; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Paid' : 'एकूण जमा'}</span>
              <span style="font-size: 16px; font-weight: 900; color: #15803d; margin-top: 1px; display: block;">${formatCurrency(totalPaid, lang)}</span>
            </td>
            <td style="width: 25%; background: #fff1f2; border: 1px solid #fecdd3; padding: 7px 10px; border-radius: 8px; text-align: left;">
              <span style="font-size: 9px; font-weight: 800; color: #9f1239; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Balance Due' : 'शिल्लक बाकी'}</span>
              <span style="font-size: 16px; font-weight: 900; color: #be123c; margin-top: 1px; display: block;">${formatCurrency(totalRemaining, lang)}</span>
            </td>
            <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 7px 10px; border-radius: 8px; text-align: left;">
              <span style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Account Status' : 'खातेदार स्थिती'}</span>
              <span style="font-size: 16px; font-weight: 900; color: #0f172a; margin-top: 1px; display: block;">
                <span style="color: #92400e;">${pendingCount}</span> <span style="color: #94a3b8; font-size: 13px;">/</span> <span style="color: #15803d;">${clearedCount}</span>
              </span>
            </td>
          </tr>
        </table>
      `
      : `
        <div style="border-bottom: 2px solid #78350f; padding-bottom: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <span style="font-size: 14px; font-weight: 900; color: #78350f;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</span>
            <span style="font-size: 14px; font-weight: 800; color: #451a03; margin-left: 8px;">- ${title} (${lang === 'EN' ? 'Page' : 'पान'} ${pageIdx + 1} / ${totalPages})</span>
          </div>
          <div style="font-size: 10.5px; font-weight: 800; color: #78350f;">
            ${dateFormatted} &nbsp;|&nbsp; ${lang === 'EN' ? 'Records: ' : 'एकूण नोंदी: '}<strong>${entries.length}</strong>
          </div>
        </div>
      `;

    // Bottom block: Totals & Signatures only on the last page
    const footerBlockHtml = isLastPage
      ? `
        <div style="margin-top: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; font-weight: 700; color: #64748b;">
            <div>
              <div>${lang === 'EN' ? 'Generated: ' : 'निर्मिती दिनांक: '} ${dateFormatted} &nbsp;|&nbsp; ${lang === 'EN' ? 'Computer Generated — Sushant Bishi Management System' : 'संगणकीकृत प्रत — सुषांत भिशी व्यवस्थापन प्रणाली'}</div>
            </div>
            <div style="text-align: center;">
              <div style="height: 25px;"></div>
              <div style="border-top: 2px solid #78350f; padding-top: 4px; min-width: 150px; color: #78350f; font-weight: 900;">${lang === 'EN' ? 'Authorized Signature' : 'अधिकृत स्वाक्षरी'}</div>
            </div>
          </div>
        </div>
      `
      : `
        <div style="display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 700; color: #94a3b8; border-top: 1px dashed #e5e7eb; padding-top: 6px;">
          <span>${lang === 'EN' ? 'Sushant Bishi Thak Baki Report' : 'सुषांत भिशी थकबाकी अहवाल'}</span>
          <span>${lang === 'EN' ? 'Page ' : 'पान '}${pageIdx + 1} / ${totalPages}</span>
        </div>
      `;

    // Totals row only on the last page inside tfoot
    const tableFooterHtml = isLastPage
      ? `
        <tfoot>
          <tr style="background-color: #78350f; color: #ffffff; font-weight: 900; font-size: 10px;">
            <td colspan="5" style="padding: 7px; text-align: center; border: 1px solid #92400e;">
              ${lang === 'EN' ? 'TOTAL' : 'एकूण'} (${entries.length} ${lang === 'EN' ? 'Records' : 'नोंदी'})
            </td>
            <td style="padding: 7px 8px; text-align: right; border: 1px solid #92400e;">${formatCurrency(totalInitial, lang)}</td>
            <td style="padding: 7px 8px; text-align: right; border: 1px solid #92400e; color: #fde68a;">${formatCurrency(totalPaid, lang)}</td>
            <td style="padding: 7px 8px; text-align: right; border: 1px solid #92400e; color: #fecdd3;">${formatCurrency(totalRemaining, lang)}</td>
            <td colspan="2" style="border: 1px solid #92400e; text-align: center;">-</td>
          </tr>
        </tfoot>
      `
      : '';

    pageContainer.innerHTML = `
      <div>
        ${headerHtml}
        <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; font-weight: 700; border: 1px solid #cbd5e1;">
          ${tableHeaderHtml}
          <tbody>${rowsHtml}</tbody>
          ${tableFooterHtml}
        </table>
      </div>
      ${footerBlockHtml}
    `;

    pageElements.push(pageContainer);
  }

  const filename = (lang === 'EN' ? 'ThakBaki_Report_' : 'थकबाकी_अहवाल_') + todayStr + '.pdf';
  await renderPagesToPdf(pageElements, 'landscape', filename);
};

/**
 * Generate Report PDF (Summary Report / सामान्य अहवाल)
 * True multi-page pagination:
 * - 13-Column table header is repeated on EVERY page.
 * - Rows are never sliced across page breaks.
 * - Emerald theme matching website UI.
 */
export const generateReportPDF = async (
  title: string,
  officeName: string,
  bishiName: string,
  customers: Customer[],
  collections: CollectionEntry[],
  customNote?: string,
  lang: Language = 'MR'
) => {
  let totalExp = 0;
  let totalExpectedInterestSum = 0;
  let totalExpWithInterestSum = 0;
  let totalColl = 0;
  let totalRem = 0;
  let totalInt = 0;
  let totalPen = 0;
  let totalPayableSum = 0;
  let totalExtraSum = 0;
  let totalReturnSum = 0;
  let totalUnpaidLoanSum = 0;

  const allLoans = StorageService.getLoans();
  const allLoanPayments = StorageService.getLoanPayments();
  const isLoanContext = bishiName.includes('कर्ज') || bishiName.toLowerCase().includes('loan') || title.includes('कर्ज') || title.toLowerCase().includes('loan');

  const rows = customers.map((cust) => {
    const custLoans = allLoans.filter((l) => l.customerId === cust.id || (cust.accountNumber && l.accountNumber === cust.accountNumber));
    let unpaidLoan = 0;
    custLoans.forEach((l) => {
      if (l.status === 'COMPLETED' || l.status === 'CLOSED') return;
      unpaidLoan += Math.max(0, l.remainingAmount ?? (l.principalAmount - (l.paidAmount || 0)));
    });

    const custLoan = (isLoanContext || cust.hasLoan || cust.bishiType === 'LOAN_ONLY')
      ? custLoans[0] || null
      : null;
    const isLoanAccount = cust.bishiType === 'LOAN_ONLY';

    let exp = 0;
    let coll = 0;
    let pen = 0;
    let int = 0;
    let rem = 0;
    let expectedInterest = 0;
    let totalExpWithInterest = 0;
    let extraSubmitted = 0;
    let totalWithExtra = 0;
    let totalPayable = 0;
    let loanDeduction = 0;

    if (isLoanAccount) {
      const custLps = allLoanPayments.filter((lp) => lp.customerId === cust.id || (cust.accountNumber && lp.accountNumber === cust.accountNumber));
      let lPaid = 0;
      let lInt = 0;
      let lPen = 0;
      custLps.forEach((lp) => {
        lPaid += lp.paidAmount || 0;
        lInt += lp.interestPaid || 0;
        lPen += lp.penaltyPaid || 0;
      });
      if (custLoan) {
        if (lPaid === 0 && (custLoan.paidAmount || 0) > 0) lPaid = custLoan.paidAmount;
        if (lInt === 0 && (custLoan.totalInterestPaid || 0) > 0) lInt = custLoan.totalInterestPaid || 0;
        if (lPen === 0 && (custLoan.penaltyAmount || 0) > 0) lPen = custLoan.penaltyAmount;
      }

      exp = custLoan ? custLoan.principalAmount : (cust.bishiType === 'LOAN_ONLY' ? (cust.amount || 0) : 0);
      expectedInterest = 0;
      totalExpWithInterest = exp;
      coll = lPaid;
      rem = custLoan ? custLoan.remainingAmount : 0;
      int = lInt;
      pen = lPen;
      extraSubmitted = Math.max(0, coll - exp);
      totalWithExtra = 0;
      totalPayable = 0;
    } else {
      const custColls = collections.filter((c) => c.customerId === cust.id);
      let recordedColl = 0;
      let recordedExtra = 0;
      custColls.forEach((c) => {
        exp += c.expectedAmount || 0;
        recordedColl += c.collectedAmount || 0;
        recordedExtra += c.extraAmount || 0;
        pen += c.penaltyAmount || 0;
      });

      const overpaymentSurplus = exp > 0 ? Math.max(0, recordedColl - exp) : 0;
      const regularBishiColl = exp > 0 ? Math.min(recordedColl, exp) : recordedColl;
      extraSubmitted = recordedExtra + overpaymentSurplus;
      coll = regularBishiColl + extraSubmitted;
      rem = Math.max(0, exp - regularBishiColl);

      const rate = cust.interestRate || (cust.modality === 'W' ? 2.5 : 10);
      expectedInterest = Math.round((exp * rate) / 100);
      totalExpWithInterest = exp + expectedInterest;
      int = Math.round((regularBishiColl * rate) / 100);

      const bishiGrossReturn = coll > 0 ? (regularBishiColl + int + extraSubmitted) : totalExpWithInterest;
      loanDeduction = Math.min(bishiGrossReturn, unpaidLoan);
      totalWithExtra = bishiGrossReturn;
      totalPayable = totalExpWithInterest + extraSubmitted;
    }

    totalExp += exp;
    totalExpectedInterestSum += expectedInterest;
    totalExpWithInterestSum += totalExpWithInterest;
    totalColl += coll;
    totalRem += rem;
    totalInt += int;
    totalPen += pen;
    totalUnpaidLoanSum += unpaidLoan;
    totalPayableSum += totalPayable;
    totalExtraSum += extraSubmitted;
    totalReturnSum += totalWithExtra;

    const statusText =
      rem === 0 && exp > 0
        ? lang === 'EN' ? 'Paid' : 'पूर्ण जमा'
        : coll > 0
        ? lang === 'EN' ? 'Partial' : 'अंशतः जमा'
        : lang === 'EN' ? 'Pending' : 'बाकी';
    const statusBg = rem === 0 && exp > 0 ? '#dcfce7' : coll > 0 ? '#fef9c3' : '#fee2e2';
    const statusColor = rem === 0 && exp > 0 ? '#15803d' : coll > 0 ? '#a16207' : '#be123c';

    return {
      cust,
      exp,
      expectedInterest,
      totalExpWithInterest,
      coll,
      rem,
      int,
      pen,
      unpaidLoan,
      loanDeduction,
      extraSubmitted,
      totalWithExtra,
      totalPayable,
      statusText,
      statusBg,
      statusColor,
    };
  });

  const todayStr = formatDateMarathi(new Date().toISOString().split('T')[0], lang);

  const isSinglePage = rows.length <= 11;
  const chunkedRows = isSinglePage
    ? [rows]
    : chunkRowsForPages(rows, 12, 16, 13);
  const totalPages = chunkedRows.length;

  const pageElements: HTMLElement[] = [];
  let currentSrNo = 1;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageRows = chunkedRows[pageIdx];
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === totalPages - 1;

    // A4 Landscape dimensions: 1122px x 794px
    const pageContainer = createPdfPage(1122, 794);

    const rowsHtml = pageRows
      .map((r) => {
        const sr = currentSrNo++;
        return `
          <tr style="background: ${sr % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="padding: 3.5px 3px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #475569; font-size: 8px;">${sr}</td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 900; color: #0f172a; font-size: 8.5px;">${r.cust.accountNumber}</td>
            <td style="padding: 3.5px 5px; border: 1px solid #e2e8f0; font-weight: 800; color: #1e293b; font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px;">${r.cust.name}</td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 7.5px;">${r.cust.mobile}</td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: center; color: #475569; font-size: 7.5px;">${getBishiNameMarathi(r.cust.bishiType, lang)}</td>
            <td style="padding: 3.5px 3px; border: 1px solid #e2e8f0; text-align: center; font-weight: 800; font-size: 7.5px; color: ${r.cust.modality === 'W' ? '#1d4ed8' : '#047857'};">${r.cust.modality === 'W' ? (lang === 'EN' ? 'Weekly' : 'साप्ताहिक') : (lang === 'EN' ? 'Monthly' : 'मासिक')}</td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; font-size: 8px;">
              <div style="font-weight: 900; color: #064e3b;">${formatCurrency(r.totalExpWithInterest, lang)}</div>
              <div style="font-size: 6.5px; color: #64748b;">(${formatCurrency(r.exp, lang)} + ${formatCurrency(r.expectedInterest, lang)})</div>
            </td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #15803d; font-size: 8px;">${formatCurrency(r.coll, lang)}</td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 900; color: #be123c; font-size: 8px;">${formatCurrency(r.rem, lang)}</td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #475569; font-size: 7.5px;">
              ${r.int > 0 ? `<span style="color: #1d4ed8;">व्याज: ${formatCurrency(r.int, lang)}</span><br>` : ''}
              ${r.pen > 0 ? `<span style="color: #b45309;">दंड: ${formatCurrency(r.pen, lang)}</span>` : ''}
              ${r.int === 0 && r.pen === 0 ? '-' : ''}
            </td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #92400e; background: #fffbeb; font-size: 8px;">
              ${r.unpaidLoan > 0 ? formatCurrency(r.unpaidLoan, lang) : '-'}
            </td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #1e3a8a; background: #f0f7ff; font-size: 8px;">${r.totalPayable > 0 ? formatCurrency(r.totalPayable, lang) : '-'}</td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #6b21a8; background: #faf5ff; font-size: 8px;">${r.extraSubmitted > 0 ? `+${formatCurrency(r.extraSubmitted, lang)}` : '-'}</td>
            <td style="padding: 3.5px 4px; border: 1px solid #e2e8f0; text-align: right; font-weight: 900; color: #166534; background: #f0fdf4; font-size: 8px;">
              ${r.totalWithExtra > 0 ? formatCurrency(r.totalWithExtra, lang) : '-'}
              ${r.unpaidLoan > 0 && r.totalWithExtra > 0 ? (
                r.unpaidLoan >= r.totalWithExtra
                  ? `<br><span style="font-size: 6.5px; color: #be123c;">-कर्ज: ${formatCurrency(r.unpaidLoan, lang)}</span>`
                  : `<br><span style="font-size: 6.5px; color: #be123c;">-कर्ज: ${formatCurrency(r.unpaidLoan, lang)}</span>`
              ) : ''}
            </td>
            <td style="padding: 3.5px 3px; border: 1px solid #e2e8f0; text-align: center;">
              <span style="display: inline-block; padding: 1px 3px; border-radius: 3px; font-size: 7px; font-weight: 800; background: ${r.statusBg}; color: ${r.statusColor};">
                ${r.statusText}
              </span>
            </td>
          </tr>
        `;
      })
      .join('');

    const tableHeaderHtml = `
      <thead style="background: #064e3b; color: #ffffff; font-weight: 900;">
        <tr style="background: #064e3b; color: #ffffff; font-weight: 900;">
          <th style="padding: 4.5px 3px; border: 1px solid #065f46; text-align: center; width: 25px; font-size: 8px;">#</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: center; width: 55px; font-size: 8px;">${lang === 'EN' ? 'Acc No.' : 'खाते क्र.'}</th>
          <th style="padding: 4.5px 5px; border: 1px solid #065f46; text-align: left; width: 110px; font-size: 8px;">${lang === 'EN' ? 'Customer Name' : 'खातेदाराचे नाव'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: center; width: 75px; font-size: 8px;">${lang === 'EN' ? 'Mobile' : 'मोबाईल'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: center; width: 60px; font-size: 8px;">${lang === 'EN' ? 'Scheme' : 'योजना'}</th>
          <th style="padding: 4.5px 3px; border: 1px solid #065f46; text-align: center; width: 50px; font-size: 8px;">${lang === 'EN' ? 'Frequency' : 'पद्धत'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; width: 90px; font-size: 8px;">${lang === 'EN' ? 'Total (with Int) (₹)' : 'एकूण भिशी (व्याजासह) (₹)'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; width: 70px; font-size: 8px;">${lang === 'EN' ? 'Collected (₹)' : 'जमा (₹)'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; width: 70px; font-size: 8px;">${lang === 'EN' ? 'Remaining (₹)' : 'बाकी (₹)'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; width: 70px; font-size: 8px;">${lang === 'EN' ? 'Int/Pen (₹)' : 'व्याज/दंड (₹)'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; width: 70px; background: #043628; font-size: 8px;">${lang === 'EN' ? 'Loan (₹)' : 'कर्ज (₹)'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; width: 70px; background: #043628; font-size: 8px;">${lang === 'EN' ? 'Total Payable (₹)' : 'एकूण देय (₹)'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; width: 65px; background: #043628; font-size: 8px;">${lang === 'EN' ? 'Extra (₹)' : 'जादा जमा (₹)'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; width: 75px; background: #043628; font-size: 8px;">${lang === 'EN' ? 'Total Return (₹)' : 'एकूण परतावा (₹)'}</th>
          <th style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: center; width: 60px; font-size: 8px;">${lang === 'EN' ? 'Status' : 'स्थिती'}</th>
        </tr>
      </thead>
    `;

    const headerHtml = isFirstPage
      ? `
        <div style="border-bottom: 2px solid #064e3b; padding-bottom: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h2 style="margin: 0; font-size: 13px; font-weight: 900; color: #064e3b;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h2>
            <h1 style="margin: 2px 0 0 0; font-size: 17px; font-weight: 900; color: #0f172a;">${title}</h1>
          </div>
          <div style="text-align: right; font-size: 10.5px; font-weight: 800; color: #334155; line-height: 1.35;">
            <div>${lang === 'EN' ? 'Office: ' : 'कार्यालय: '}<strong>${officeName}</strong> &nbsp;|&nbsp; ${lang === 'EN' ? 'Scheme: ' : 'भिशी योजना: '}<strong>${bishiName}</strong></div>
            <div>${lang === 'EN' ? 'Date: ' : 'दिनांक: '}<strong>${todayStr}</strong> &nbsp;|&nbsp; ${lang === 'EN' ? 'Page ' : 'पान '}<strong>1 / ${totalPages}</strong></div>
          </div>
        </div>

        <!-- 4 Overview Metric Cards on Page 1 -->
        <table style="width: 100%; border-collapse: separate; border-spacing: 5px; margin-bottom: 8px;">
          <tr>
            <td style="width: 25%; background: #ffffff; border: 1px solid #e2e8f0; padding: 5px 8px; border-radius: 6px; text-align: left;">
              <span style="font-size: 8px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Accounts' : 'एकूण खातेदार'}</span>
              <span style="font-size: 15px; font-weight: 900; color: #0f172a; margin-top: 1px; display: block;">${customers.length}</span>
            </td>
            <td style="width: 25%; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 5px 8px; border-radius: 6px; text-align: left;">
              <span style="font-size: 8px; font-weight: 800; color: #166534; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Bishi (with Int.)' : 'एकूण भिशी (व्याजासह)'}</span>
              <span style="font-size: 15px; font-weight: 900; color: #064e3b; margin-top: 1px; display: block;">${formatCurrency(totalExpWithInterestSum, lang)}</span>
              <span style="font-size: 7px; font-weight: 700; color: #047857; margin-top: 1px; display: block;">(${lang === 'EN' ? 'Base: ' : 'हप्ते: '}${formatCurrency(totalExp, lang)} + ${lang === 'EN' ? 'Int: +' : 'व्याज: +'}${formatCurrency(totalExpectedInterestSum, lang)})</span>
            </td>
            <td style="width: 25%; background: #ffffff; border: 1px solid #e2e8f0; padding: 5px 8px; border-radius: 6px; text-align: left;">
              <span style="font-size: 8px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Actual Collected' : 'प्रत्यक्ष जमा'}</span>
              <span style="font-size: 15px; font-weight: 900; color: #15803d; margin-top: 1px; display: block;">${formatCurrency(totalColl, lang)}</span>
              <span style="font-size: 7px; font-weight: 700; color: #be123c; margin-top: 1px; display: block;">${lang === 'EN' ? 'Remaining Due: ' : 'शिल्लक बाकी: '}${formatCurrency(totalRem, lang)}</span>
            </td>
            <td style="width: 25%; background: #eff6ff; border: 1px solid #bfdbfe; padding: 5px 8px; border-radius: 6px; text-align: left;">
              <span style="font-size: 8px; font-weight: 800; color: #1e40af; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Return / Payable' : 'एकूण परतावा / देय'}</span>
              <span style="font-size: 15px; font-weight: 900; color: #1e3a8a; margin-top: 1px; display: block;">${formatCurrency(totalReturnSum, lang)}</span>
              <span style="font-size: 7px; font-weight: 700; color: #2563eb; margin-top: 1px; display: block;">${lang === 'EN' ? 'Earned Interest: +' : 'जमा व्याज: +'}${formatCurrency(totalInt, lang)}</span>
            </td>
          </tr>
        </table>
      `
      : `
        <div style="border-bottom: 2px solid #064e3b; padding-bottom: 5px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <span style="font-size: 13px; font-weight: 900; color: #064e3b;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</span>
            <span style="font-size: 13px; font-weight: 800; color: #0f172a; margin-left: 8px;">- ${title} (${lang === 'EN' ? 'Page' : 'पान'} ${pageIdx + 1} / ${totalPages})</span>
          </div>
          <div style="font-size: 10px; font-weight: 800; color: #334155;">
            ${officeName} &nbsp;|&nbsp; ${bishiName} &nbsp;|&nbsp; ${todayStr}
          </div>
        </div>
      `;

    const tableFooterHtml = isLastPage
      ? `
        <tfoot>
          <tr style="background: #064e3b; color: #ffffff; font-weight: 900; font-size: 8px;">
            <td style="padding: 4.5px 3px; border: 1px solid #065f46; text-align: center;">-</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: center;">${lang === 'EN' ? 'TOTAL' : 'एकूण'}</td>
            <td style="padding: 4.5px 5px; border: 1px solid #065f46;">${customers.length} ${lang === 'EN' ? 'Accounts' : 'खातेदार'}</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46;">-</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46;">-</td>
            <td style="padding: 4.5px 3px; border: 1px solid #065f46; text-align: center;">-</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right;">
              <div>${formatCurrency(totalExpWithInterestSum, lang)}</div>
              <div style="font-size: 6.5px; color: #a7f3d0;">(${formatCurrency(totalExp, lang)} + ${formatCurrency(totalExpectedInterestSum, lang)})</div>
            </td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right;">${formatCurrency(totalColl, lang)}</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; color: #fecdd3;">${formatCurrency(totalRem, lang)}</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; color: #fed7aa;">${formatCurrency(totalInt + totalPen, lang)}</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; color: #fef08a;">${totalUnpaidLoanSum > 0 ? formatCurrency(totalUnpaidLoanSum, lang) : '-'}</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; color: #dbeafe;">${formatCurrency(totalPayableSum, lang)}</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; color: #f3e8ff;">${formatCurrency(totalExtraSum, lang)}</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: right; color: #bbf7d0;">${formatCurrency(totalReturnSum, lang)}</td>
            <td style="padding: 4.5px 4px; border: 1px solid #065f46; text-align: center;">-</td>
          </tr>
        </tfoot>
      `
      : '';

    const footerBlockHtml = isLastPage
      ? `
        <div style="margin-top: 8px;">
          ${
            customNote
              ? `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 5px 10px; border-radius: 6px; font-size: 10px; font-weight: 800; color: #064e3b; margin-bottom: 8px;">
                  <strong>${lang === 'EN' ? 'Note: ' : 'अहवाल शेरा / टीप: '}</strong> ${customNote}
                </div>`
              : ''
          }
          <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; font-weight: 700; color: #475569;">
            <div>
              <div>${lang === 'EN' ? 'Generated: ' : 'अहवाल निर्मिती: '} ${todayStr} &nbsp;|&nbsp; ${lang === 'EN' ? 'Computer Generated Copy: Sushant Bishi Management' : 'संगणकीकृत प्रत: सुषांत भिशी व्यवस्थापन'}</div>
            </div>
            <div style="text-align: center;">
              <div style="height: 25px;"></div>
              <div style="border-top: 2px solid #064e3b; padding-top: 4px; min-width: 150px; color: #064e3b; font-weight: 900;">${lang === 'EN' ? 'Authorized Signature' : 'अधिकृत स्वाक्षरी'}</div>
            </div>
          </div>
        </div>
      `
      : `
        <div style="display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 700; color: #94a3b8; border-top: 1px dashed #e5e7eb; padding-top: 6px;">
          <span>${title}</span>
          <span>${lang === 'EN' ? 'Page ' : 'पान '}${pageIdx + 1} / ${totalPages}</span>
        </div>
      `;

    pageContainer.innerHTML = `
      <div>
        ${headerHtml}
        <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; font-weight: 700; border: 1px solid #cbd5e1;">
          ${tableHeaderHtml}
          <tbody>${rowsHtml}</tbody>
          ${tableFooterHtml}
        </table>
      </div>
      ${footerBlockHtml}
    `;

    pageElements.push(pageContainer);
  }

  await renderPagesToPdf(pageElements, 'landscape', `${title.replace(/\s+/g, '_')}_अहवाल.pdf`);
};

/**
 * Generate PDF for Member Ledger Card (खातेदार खाते उतारा)
 * True multi-page pagination:
 * - 11-Column table header is repeated on EVERY page.
 * - Single-tier header prevents html2canvas blank cell defects.
 * - Rows are never sliced across page breaks.
 * - Authentic brown passbook styling matching website UI.
 */
export const generateMemberLedgerPDF = async (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  loanPayments: LoanPayment[] = [],
  showAllWeeks: boolean = false,
  lang: Language = 'MR'
) => {
  const ledgerCalculation = calculateMemberLedger(
    customer,
    collections,
    loan,
    loanPayments,
    showAllWeeks
  );

  const rate = customer.interestRate || (customer.modality === 'W' ? 2.5 : 10);
  const expectedBase = ledgerCalculation.totalExpected;
  const expectedInterest = Math.round((expectedBase * rate) / 100);
  const totalExpectedWithInt = expectedBase + expectedInterest;
  const actualEarnedInterest = Math.round((ledgerCalculation.totalDeposit * rate) / 100);
  const totalPayout = ledgerCalculation.totalDeposit + actualEarnedInterest;

  const rows = ledgerCalculation.rows;
  const isSinglePage = rows.length <= 11;
  const chunkedRows = isSinglePage
    ? [rows]
    : chunkRowsForPages(rows, 12, 16, 13);
  const totalPages = chunkedRows.length;

  const pageElements: HTMLElement[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageRows = chunkedRows[pageIdx];
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === totalPages - 1;

    // A4 Landscape dimensions: 1122px x 794px
    const pageContainer = createPdfPage(1122, 794);

    const rowsHtml =
      pageRows.length === 0
        ? `<tr><td colspan="11" style="padding: 18px; text-align: center; color: #64748b; font-weight: 700; border: 1px solid #b8a99a;">${
            lang === 'EN'
              ? 'No completed payments recorded yet for this customer.'
              : 'या खातेदाराची अद्याप कोणतीही पूर्ण जमा नोंद झालेली नाही.'
          }</td></tr>`
        : pageRows
            .map((row, idx) => {
              return `
              <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#fcf8f2'};">
                <td style="padding: 5px 4px; border: 1px solid #b8a99a; text-align: center; font-weight: 800; color: #334155;">${row.srNo}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: center; font-weight: 700; color: #1e293b;">${formatDateMarathi(row.date, lang)}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 800; color: #15803d;">${row.deposit > 0 ? formatCurrency(row.deposit, lang) : '-'}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 900; color: #0b5c45;">${row.cumulativeDeposit > 0 ? formatCurrency(row.cumulativeDeposit, lang) : '-'}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #be123c; font-weight: 700;">${row.bishiPenalty > 0 ? formatCurrency(row.bishiPenalty, lang) : '-'}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 700; color: #1e293b;">${row.expected > 0 ? formatCurrency(row.expected, lang) : '-'}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #c2410c; font-weight: 700;">${row.loanIssued > 0 ? formatCurrency(row.loanIssued, lang) : '-'}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #15803d; font-weight: 800;">${row.loanPrincipalPaid > 0 ? formatCurrency(row.loanPrincipalPaid, lang) : '-'}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #15803d; font-weight: 800;">${row.loanInterestPaid > 0 ? formatCurrency(row.loanInterestPaid, lang) : '-'}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #be123c; font-weight: 700;">${row.loanPenalty > 0 ? formatCurrency(row.loanPenalty, lang) : '-'}</td>
                <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 900; color: #be123c;">${row.balanceRemaining > 0 ? formatCurrency(row.balanceRemaining, lang) : '₹0'}</td>
              </tr>
            `;
            })
            .join('');

    const tableHeaderHtml = `
      <thead style="background: #f5e6d3;">
        <tr style="background: #f5e6d3; color: #1e293b; font-weight: 900; text-align: center;">
          <th style="border: 1px solid #8B4513; padding: 7px 4px; width: 38px;">${lang === 'EN' ? 'Sr.' : 'अ. क्र.'}</th>
          <th style="border: 1px solid #8B4513; padding: 7px 6px; width: 80px;">${lang === 'EN' ? 'Date' : 'तारीख'}</th>
          <th style="border: 1px solid #8B4513; padding: 7px 6px; width: 95px; color: #065f46;">${lang === 'EN' ? 'Deposit (₹)' : 'खात्यात जमा रुपये'}</th>
          <th style="border: 1px solid #8B4513; padding: 7px 6px; width: 95px; color: #022c22;">${lang === 'EN' ? 'Total Deposit (₹)' : 'एकूण जमा रुपये'}</th>
          <th style="border: 1px solid #8B4513; padding: 7px 6px; width: 60px; color: #9f1239;">${lang === 'EN' ? 'Penalty' : 'दंड'}</th>
          <th style="border: 1px solid #8B4513; padding: 7px 6px; width: 70px;">${lang === 'EN' ? 'Expected' : 'देणे'}</th>
          <th style="border: 1px solid #8B4513; padding: 7px 6px; width: 90px; color: #78350f;">${lang === 'EN' ? 'Loan Given' : 'दिलेले कर्ज'}</th>
          <th style="border: 1px solid #8B4513; padding: 5px 4px; width: 85px;">
            <div style="font-size: 8.5px; font-weight: 800; color: #78350f; line-height: 1.1;">${lang === 'EN' ? 'Loan Repayment' : 'कर्ज परतफेड'}</div>
            <div style="font-size: 11px; font-weight: 900; color: #166534; line-height: 1.2;">${lang === 'EN' ? 'Principal (₹)' : 'मुद्दल (₹)'}</div>
          </th>
          <th style="border: 1px solid #8B4513; padding: 5px 4px; width: 85px;">
            <div style="font-size: 8.5px; font-weight: 800; color: #78350f; line-height: 1.1;">${lang === 'EN' ? 'Loan Repayment' : 'कर्ज परतफेड'}</div>
            <div style="font-size: 11px; font-weight: 900; color: #166534; line-height: 1.2;">${lang === 'EN' ? 'Interest (₹)' : 'व्याज (₹)'}</div>
          </th>
          <th style="border: 1px solid #8B4513; padding: 7px 6px; width: 60px; color: #9f1239;">${lang === 'EN' ? 'Penalty' : 'दंड'}</th>
          <th style="border: 1px solid #8B4513; padding: 7px 6px; width: 90px; color: #4c0519;">${lang === 'EN' ? 'Balance Due' : 'देणे बाकी'}</th>
        </tr>
      </thead>
    `;

    const headerHtml = isFirstPage
      ? `
        <div style="border-bottom: 2px solid #8B4513; padding-bottom: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="margin: 0; font-size: 14px; font-weight: 900; color: #8B4513;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h2>
            <h1 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 900; color: #5c3a21;">${lang === 'EN' ? 'Member Ledger Card Register' : 'खातेदार खाते उतारा (Member Ledger Card Register)'}</h1>
          </div>
          <div style="text-align: right; font-size: 11px; font-weight: 800; color: #5c3a21; line-height: 1.4;">
            <div>${lang === 'EN' ? 'Office: ' : 'कार्यालय: '}<strong>${getOfficeNameMarathi(customer.officeId, lang)}</strong> &nbsp;|&nbsp; ${lang === 'EN' ? 'Date: ' : 'दिनांक: '}<strong>${formatDateMarathi(new Date().toISOString().split('T')[0], lang)}</strong></div>
            <div style="color: #8B4513;">${lang === 'EN' ? 'Page ' : 'पान '}<strong>1 / ${totalPages}</strong></div>
          </div>
        </div>

        <!-- Account Meta Grid Box on Page 1 -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-weight: 800; margin-bottom: 10px;">
          <tr>
            <td style="width: 14%; background: #8B4513; color: white; padding: 5px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Account No:' : 'खाते नंबर:'}</td>
            <td style="width: 36%; background: #fffde7; padding: 5px 8px; border: 1px solid #b8a99a; font-size: 13.5px; color: #0f172a;">${customer.accountNumber}</td>
            <td style="width: 16%; background: #8B4513; color: white; padding: 5px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Customer Name:' : 'खातेदाराचे नाव:'}</td>
            <td style="width: 34%; background: #fffde7; padding: 5px 8px; border: 1px solid #b8a99a; font-size: 13.5px; color: #0f172a;">${customer.name}</td>
          </tr>
          <tr>
            <td style="background: #8B4513; color: white; padding: 5px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Installment:' : 'हप्ता रुपये:'}</td>
            <td style="background: #fffde7; padding: 5px 8px; border: 1px solid #b8a99a; color: #166534; font-size: 12.5px;">₹${customer.amount} (${customer.modality === 'W' ? (lang === 'EN' ? 'Weekly' : 'साप्ताहिक') : (lang === 'EN' ? 'Monthly' : 'मासिक')})</td>
            <td style="background: #8B4513; color: white; padding: 5px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Address / Mobile:' : 'पत्ता / मोबाईल:'}</td>
            <td style="background: #fffde7; padding: 5px 8px; border: 1px solid #b8a99a; font-size: 11.5px;">${customer.address || '-'} (${customer.mobile})</td>
          </tr>
          <tr>
            <td style="background: #8B4513; color: white; padding: 5px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Total Bishi (with Int):' : 'एकूण भिशी (व्याजासह):'}</td>
            <td style="background: #fffde7; padding: 5px 8px; border: 1px solid #b8a99a; font-weight: 900; color: #0b5c45; font-size: 12.5px;">
              ${formatCurrency(totalExpectedWithInt, lang)} <span style="font-size: 9.5px; color: #475569; font-weight: 700;">(${lang === 'EN' ? 'Base: ' : 'ठेव: '}${formatCurrency(expectedBase, lang)} + ${lang === 'EN' ? 'Int: +' : 'व्याज: +'}${formatCurrency(expectedInterest, lang)})</span>
            </td>
            <td style="background: #8B4513; color: white; padding: 5px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Dividend / Interest:' : 'लाभांश / व्याजदर:'}</td>
            <td style="background: #fffde7; padding: 5px 8px; border: 1px solid #b8a99a; font-weight: bold; color: #1e3a8a; font-size: 12.5px;">${rate}% (${customer.modality === 'W' ? (lang === 'EN' ? 'Weekly' : 'साप्ताहिक') : (lang === 'EN' ? 'Monthly' : 'मासिक')})</td>
          </tr>
        </table>
      `
      : `
        <div style="border-bottom: 2px solid #8B4513; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 14px; font-weight: 900; color: #8B4513;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</span>
            <span style="font-size: 13.5px; font-weight: 800; color: #5c3a21; margin-left: 8px;">- ${customer.accountNumber} : ${customer.name} (${lang === 'EN' ? 'Page' : 'पान'} ${pageIdx + 1} / ${totalPages})</span>
          </div>
          <div style="font-size: 10.5px; font-weight: 800; color: #5c3a21;">
            ${formatDateMarathi(new Date().toISOString().split('T')[0], lang)}
          </div>
        </div>
      `;

    const tableFooterHtml = isLastPage
      ? `
        <tfoot>
          <tr style="background: #8B4513; color: #ffffff; font-weight: 900; font-size: 10px;">
            <td style="padding: 5px 4px; border: 1px solid #5c3a21; text-align: center;">-</td>
            <td style="padding: 5px 8px; border: 1px solid #5c3a21; text-align: center;">${lang === 'EN' ? 'TOTAL' : 'एकूण'}</td>
            <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right; color: #bbf7d0;">${ledgerCalculation.totalDeposit > 0 ? formatCurrency(ledgerCalculation.totalDeposit, lang) : '-'}</td>
            <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right; color: #a7f3d0;">${ledgerCalculation.totalCumulativeDeposit > 0 ? formatCurrency(ledgerCalculation.totalCumulativeDeposit, lang) : '-'}</td>
            <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right; color: #fecdd3;">${ledgerCalculation.totalBishiPenalty > 0 ? formatCurrency(ledgerCalculation.totalBishiPenalty, lang) : '-'}</td>
            <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalExpected > 0 ? formatCurrency(ledgerCalculation.totalExpected, lang) : '-'}</td>
            <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right; color: #fed7aa;">${ledgerCalculation.totalLoanIssued > 0 ? formatCurrency(ledgerCalculation.totalLoanIssued, lang) : '-'}</td>
            <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right; color: #bbf7d0;">${ledgerCalculation.totalLoanPrincipalPaid > 0 ? formatCurrency(ledgerCalculation.totalLoanPrincipalPaid, lang) : '-'}</td>
            <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right; color: #bbf7d0;">${ledgerCalculation.totalLoanInterestPaid > 0 ? formatCurrency(ledgerCalculation.totalLoanInterestPaid, lang) : '-'}</td>
            <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right; color: #fecdd3;">${ledgerCalculation.totalLoanPenalty > 0 ? formatCurrency(ledgerCalculation.totalLoanPenalty, lang) : '-'}</td>
            <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right; color: #fecdd3;">${ledgerCalculation.finalRemainingBalance > 0 ? formatCurrency(ledgerCalculation.finalRemainingBalance, lang) : '₹0'}</td>
          </tr>
        </tfoot>
      `
      : '';

    const footerBlockHtml = isLastPage
      ? `
        <div style="margin-top: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 10.5px; font-weight: 700;">
            <div style="border: 1px solid #8B4513; padding: 6px 12px; border-radius: 6px; background: #fffde7; min-width: 250px; line-height: 1.5;">
              <div>१) टाकणी: ___________________</div>
              <div style="color: #0b5c45; font-weight: 800;">२) डिव्हिडंड / व्याज (${rate}%): ${formatCurrency(actualEarnedInterest, lang)}</div>
              <div>३) खाते नं.: <strong>${customer.accountNumber}</strong></div>
              <div style="color: #1e3a8a; font-weight: 800;">४) एकूण अंतिम परतावा: ${formatCurrency(totalPayout, lang)}</div>
            </div>

            <div style="text-align: right; padding-right: 16px;">
              <p style="margin: 0 0 25px 0; color: #0f172a; font-weight: 800; font-size: 10.5px;">
                ${
                  lang === 'EN'
                    ? `Acknowledged receipt of total Bishi amount ${formatCurrency(totalPayout, lang)} (with interest)...`
                    : `सदर भिशीची एकूण रक्कम ${formatCurrency(totalPayout, lang)} (व्याजासह) मिळाल्या बद्दल...`
                }
              </p>
              <div style="font-weight: 900; font-size: 12px; border-top: 2px solid #333; padding-top: 3px; display: inline-block; min-width: 150px; text-align: center; color: #0f172a;">
                ${lang === 'EN' ? 'Secretary / President' : 'सेक्रेटरी / अध्यक्ष'}
              </div>
            </div>
          </div>
        </div>
      `
      : `
        <div style="display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 700; color: #94a3b8; border-top: 1px dashed #b8a99a; padding-top: 6px;">
          <span>${customer.accountNumber} - ${customer.name}</span>
          <span>${lang === 'EN' ? 'Page ' : 'पान '}${pageIdx + 1} / ${totalPages}</span>
        </div>
      `;

    pageContainer.innerHTML = `
      <div style="border: 3px double #8B4513; padding: 14px; background: #fffdfa; border-radius: 8px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
        <div>
          ${headerHtml}
          <table style="width: 100%; border-collapse: collapse; font-size: 10px; font-weight: 700; border: 1px solid #8B4513;">
            ${tableHeaderHtml}
            <tbody>${rowsHtml}</tbody>
            ${tableFooterHtml}
          </table>
        </div>
        ${footerBlockHtml}
      </div>
    `;

    pageElements.push(pageContainer);
  }

  await renderPagesToPdf(
    pageElements,
    'landscape',
    `खातेदार_उतारा_${customer.accountNumber}_${customer.name.replace(/\s+/g, '_')}.pdf`
  );
};

/**
 * Generate PDF for a Single Customer (Account Statement / खातेदार व्यवहार अहवाल)
 * True multi-page pagination:
 * - Emerald theme matching website UI.
 * - Customer cards and financial overview on Page 1.
 * - Repeated headers on every page.
 * - Zero row slicing.
 */
export const generateCustomerPDF = async (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  loanPayments: LoanPayment[] = [],
  lang: Language = 'MR'
) => {
  const financials = calculateCustomerFinancials(customer, collections, loan);
  const customerCollections = collections
    .filter((c) => c.customerId === customer.id)
    .sort((a, b) => a.periodIndex - b.periodIndex);
  const todayStr = formatDateMarathi(new Date().toISOString().split('T')[0], lang);

  const effectiveLoanPayments = loanPayments.length > 0 ? loanPayments : StorageService.getLoanPayments();
  const customerLoanPayments = effectiveLoanPayments.filter(
    (lp: LoanPayment) =>
      lp.customerId === customer.id ||
      (loan && lp.loanId === loan.id) ||
      (customer.accountNumber && lp.accountNumber === customer.accountNumber)
  );
  const recordedLoanInterestPaid = customerLoanPayments.reduce(
    (sum: number, lp: LoanPayment) => sum + (Number(lp.interestPaid) || 0),
    0
  );
  const totalLoanInterestPaid =
    recordedLoanInterestPaid > 0 ? recordedLoanInterestPaid : (Number(loan?.totalInterestPaid) || 0);
  const totalLoanPrincipalPaid = customerLoanPayments.reduce(
    (sum: number, lp: LoanPayment) => sum + (Number(lp.paidAmount) || 0),
    0
  );
  const totalLoanDiscount = customerLoanPayments.reduce(
    (sum: number, lp: LoanPayment) => sum + (Number(lp.discountAmount) || 0),
    0
  );

  const totalExpected = customerCollections.reduce((sum, c) => sum + (c.expectedAmount || 0), 0);
  const totalCollected = customerCollections.reduce((sum, c) => sum + (c.collectedAmount || 0), 0);
  const totalExtra = customerCollections.reduce((sum, c) => sum + (c.extraAmount || 0), 0);
  const totalRemaining = customerCollections.reduce((sum, c) => sum + (c.remainingAmount || 0), 0);
  const totalInterest = financials.totalInterest;
  const totalPenalty = customerCollections.reduce((sum, c) => sum + (c.penaltyAmount || 0), 0);

  // In A4 portrait:
  // If <= 22 rows: 1 page fits comfortably
  // If > 22 rows: Page 1 has 24 rows, page 2 has remaining rows + totals + notes + signatures
  const isSinglePage = customerCollections.length <= 22;
  const chunkedCollections = isSinglePage
    ? [customerCollections]
    : chunkRowsForPages(customerCollections, 24, 30, 24);
  const totalPages = chunkedCollections.length;

  const pageElements: HTMLElement[] = [];
  let currentSrNo = 1;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageRows = chunkedCollections[pageIdx];
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === totalPages - 1;

    // A4 Portrait dimensions: 794px x 1123px
    const pageContainer = createPdfPage(794, 1123);

    const rowsHtml = pageRows
      .map((item) => {
        const sr = currentSrNo++;
        const rate = customer.interestRate || (customer.modality === 'W' ? 2.5 : 10);
        const bishiColl = Math.min(item.collectedAmount || 0, item.expectedAmount || 0);
        const rowInt = bishiColl > 0 ? Math.round((bishiColl * rate) / 100) : 0;
        const rem = Math.max(0, (item.expectedAmount || 0) - (item.collectedAmount || 0));

        const statusBg = item.status === 'PAID' ? '#dcfce7' : item.status === 'PARTIAL' ? '#fef9c3' : '#ffe4e6';
        const statusColor = item.status === 'PAID' ? '#15803d' : item.status === 'PARTIAL' ? '#a16207' : '#be123c';
        const statusLabel =
          item.status === 'PAID'
            ? lang === 'EN' ? 'Paid' : 'पूर्ण जमा'
            : item.status === 'PARTIAL'
            ? lang === 'EN' ? 'Partial' : 'अंशतः'
            : lang === 'EN' ? 'Pending' : 'बाकी';

        return `
          <tr style="background: ${sr % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #475569;">${sr}</td>
            <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #1e293b;">${formatDateMarathi(item.dueDate, lang)}</td>
            <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #334155;">${formatCurrency(item.expectedAmount, lang)}</td>
            <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #15803d;">
              <div>${formatCurrency(item.collectedAmount, lang)}</div>
              ${(item.extraAmount || 0) > 0 ? `<div style="font-size: 8px; color: #1d4ed8; font-weight: 800;">+जादा: ₹${item.extraAmount}</div>` : ''}
            </td>
            <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: 900; color: #be123c;">${formatCurrency(rem, lang)}</td>
            <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: right; color: #1e40af; font-weight: 700;">${formatCurrency(rowInt, lang)}</td>
            <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #b45309;">${item.penaltyAmount > 0 ? formatCurrency(item.penaltyAmount, lang) : '-'}</td>
            <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: center; color: #475569; font-weight: 600;">
              ${item.paymentMode === 'ONLINE' ? (lang === 'EN' ? 'Online' : 'ऑनलाइन') : item.paymentMode === 'BANK' ? (lang === 'EN' ? 'Bank' : 'बँक') : (lang === 'EN' ? 'Cash' : 'नगद')}
            </td>
            <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: center;">
              <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800; background: ${statusBg}; color: ${statusColor};">
                ${statusLabel}
              </span>
            </td>
          </tr>
        `;
      })
      .join('');

    const tableHeaderHtml = `
      <thead>
        <tr style="background: #064e3b; color: #ffffff; font-weight: 900;">
          <th style="padding: 6px 4px; border: 1px solid #065f46; text-align: center; width: 28px;">${lang === 'EN' ? '#' : 'क्र.'}</th>
          <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: center; width: 75px;">${lang === 'EN' ? 'Due Date' : 'देय तारीख'}</th>
          <th style="padding: 6px 6px; border: 1px solid #065f46; text-align: right; width: 75px;">${lang === 'EN' ? 'Expected (₹)' : 'अपेक्षित (₹)'}</th>
          <th style="padding: 6px 6px; border: 1px solid #065f46; text-align: right; width: 75px;">${lang === 'EN' ? 'Collected (₹)' : 'जमा (₹)'}</th>
          <th style="padding: 6px 6px; border: 1px solid #065f46; text-align: right; width: 75px;">${lang === 'EN' ? 'Remaining (₹)' : 'बाकी (₹)'}</th>
          <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; width: 65px;">${lang === 'EN' ? 'Interest (₹)' : 'व्याज (₹)'}</th>
          <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; width: 55px;">${lang === 'EN' ? 'Penalty (₹)' : 'दंड (₹)'}</th>
          <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: center; width: 60px;">${lang === 'EN' ? 'Mode' : 'पद्धत'}</th>
          <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: center; width: 75px;">${lang === 'EN' ? 'Status' : 'स्थिती'}</th>
        </tr>
      </thead>
    `;

    const headerHtml = isFirstPage
      ? `
        <div style="border-bottom: 2px solid #064e3b; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="margin: 0; font-size: 15px; font-weight: 900; color: #064e3b;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h2>
            <h1 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 900; color: #0f172a;">${lang === 'EN' ? 'Customer Account Statement' : 'खातेदार व्यवहार अहवाल (Customer Account Statement)'}</h1>
          </div>
          <div style="text-align: right; font-size: 11px; font-weight: 800; color: #334155; line-height: 1.4;">
            <div>${lang === 'EN' ? 'Office: ' : 'कार्यालय: '}<strong>${getOfficeNameMarathi(customer.officeId, lang)}</strong></div>
            <div>${lang === 'EN' ? 'Date: ' : 'दिनांक: '}<strong>${todayStr}</strong></div>
          </div>
        </div>

        <!-- Customer Card -->
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; padding: 10px; margin-bottom: 10px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 44px; vertical-align: middle;">
                <div style="width: 40px; height: 40px; border-radius: 8px; background: #0F7A5C; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 900;">
                  ${customer.name ? customer.name.charAt(0) : 'ख'}
                </div>
              </td>
              <td style="vertical-align: middle; padding-left: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 16px; font-weight: 900; color: #0f172a;">${customer.name}</span>
                  <span style="background: #dcfce7; color: #065f46; font-size: 11px; font-weight: 900; padding: 2px 8px; border-radius: 9999px; border: 1px solid #bbf7d0;">
                    ${customer.accountNumber}
                  </span>
                </div>
                <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 2px;">
                  ${lang === 'EN' ? 'Mobile: ' : 'मोबाईल: '}<strong>${customer.mobile}</strong> &nbsp;|&nbsp;
                  ${lang === 'EN' ? 'Address: ' : 'पत्ता: '}<strong>${customer.address || '-'}</strong>
                </div>
              </td>
              <td style="text-align: right; vertical-align: middle;">
                <div style="display: inline-block; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; text-align: right; font-size: 10px; font-weight: 800; line-height: 1.4;">
                  <div><strong style="color: #064e3b;">${getBishiNameMarathi(customer.bishiType, lang)}</strong></div>
                  <div><strong style="color: #0f172a;">${getModalityShort(customer.modality, lang)} (₹${customer.amount})</strong></div>
                </div>
              </td>
            </tr>
          </table>
        </div>

        <!-- 6 Financial Summary Cards -->
        <table style="width: 100%; border-collapse: separate; border-spacing: 5px; margin-bottom: 10px;">
          <tr>
            <td style="width: 16.66%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 4px; border-radius: 6px; text-align: center;">
              <div style="font-size: 8.5px; font-weight: 800; color: #64748b;">${lang === 'EN' ? 'Total Bishi Amount' : 'एकूण भिशी रक्कम'}</div>
              <div style="font-size: 12.5px; font-weight: 900; color: #0f172a; margin-top: 1px;">${formatCurrency(financials.totalExpectedBishi, lang)}</div>
            </td>
            <td style="width: 16.66%; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px 4px; border-radius: 6px; text-align: center;">
              <div style="font-size: 8.5px; font-weight: 800; color: #166534;">${lang === 'EN' ? 'Total Collected' : 'आतापर्यंत जमा'}</div>
              <div style="font-size: 12.5px; font-weight: 900; color: #15803d; margin-top: 1px;">${formatCurrency(financials.totalCollectedBishi + (financials.totalExtraAmount || 0), lang)}</div>
            </td>
            <td style="width: 16.66%; background: #fff1f2; border: 1px solid #fecdd3; padding: 6px 4px; border-radius: 6px; text-align: center;">
              <div style="font-size: 8.5px; font-weight: 800; color: #9f1239;">${lang === 'EN' ? 'Remaining Due' : 'उरलेली बाकी'}</div>
              <div style="font-size: 12.5px; font-weight: 900; color: #be123c; margin-top: 1px;">${formatCurrency(financials.totalRemainingBishi, lang)}</div>
            </td>
            <td style="width: 16.66%; background: #eff6ff; border: 1px solid #bfdbfe; padding: 6px 4px; border-radius: 6px; text-align: center;">
              <div style="font-size: 8.5px; font-weight: 800; color: #1e40af;">${lang === 'EN' ? 'Total Interest' : 'एकूण व्याज'}</div>
              <div style="font-size: 12.5px; font-weight: 900; color: #1d4ed8; margin-top: 1px;">${formatCurrency(financials.totalInterest, lang)}</div>
            </td>
            <td style="width: 16.66%; background: #fffbeb; border: 1px solid #fde68a; padding: 6px 4px; border-radius: 6px; text-align: center;">
              <div style="font-size: 8.5px; font-weight: 800; color: #92400e;">${lang === 'EN' ? 'Total Penalty' : 'एकूण दंड'}</div>
              <div style="font-size: 12.5px; font-weight: 900; color: #b45309; margin-top: 1px;">${formatCurrency(financials.totalPenalty, lang)}</div>
            </td>
            <td style="width: 16.66%; background: #064e3b; border: 1px solid #064e3b; padding: 6px 4px; border-radius: 6px; text-align: center;">
              <div style="font-size: 8.5px; font-weight: 800; color: #a7f3d0;">${lang === 'EN' ? 'Total Return / Payable' : 'एकूण देय / परतावा'}</div>
              <div style="font-size: 12.5px; font-weight: 900; color: #ffffff; margin-top: 1px;">${formatCurrency(financials.totalPayableBishi, lang)}</div>
            </td>
          </tr>
        </table>
      `
      : `
        <div style="border-bottom: 2px solid #064e3b; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 14px; font-weight: 900; color: #064e3b;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</span>
            <span style="font-size: 13px; font-weight: 800; color: #0f172a; margin-left: 8px;">- ${customer.accountNumber} : ${customer.name} (${lang === 'EN' ? 'Page' : 'पान'} ${pageIdx + 1} / ${totalPages})</span>
          </div>
          <div style="font-size: 10.5px; font-weight: 800; color: #334155;">
            ${todayStr}
          </div>
        </div>
      `;

    const tableFooterHtml = isLastPage
      ? `
        <tfoot>
          <tr style="background: #064e3b; color: #ffffff; font-weight: 900; font-size: 9.5px;">
            <td style="padding: 5px 4px; border: 1px solid #065f46; text-align: center;">-</td>
            <td style="padding: 5px 5px; border: 1px solid #065f46; text-align: center;">${lang === 'EN' ? 'TOTAL' : 'एकूण'}</td>
            <td style="padding: 5px 6px; border: 1px solid #065f46; text-align: right;">${formatCurrency(totalExpected, lang)}</td>
            <td style="padding: 5px 6px; border: 1px solid #065f46; text-align: right;">
              <div>${formatCurrency(totalCollected + totalExtra, lang)}</div>
              ${totalExtra > 0 ? `<div style="font-size: 8px; color: #a7f3d0;">+जादा: ₹${totalExtra}</div>` : ''}
            </td>
            <td style="padding: 5px 6px; border: 1px solid #065f46; text-align: right; color: #fecdd3;">${formatCurrency(totalRemaining, lang)}</td>
            <td style="padding: 5px 5px; border: 1px solid #065f46; text-align: right; color: #bfdbfe;">${formatCurrency(totalInterest, lang)}</td>
            <td style="padding: 5px 5px; border: 1px solid #065f46; text-align: right; color: #fed7aa;">${formatCurrency(totalPenalty, lang)}</td>
            <td style="padding: 5px 5px; border: 1px solid #065f46; text-align: center;">-</td>
            <td style="padding: 5px 5px; border: 1px solid #065f46; text-align: center;">-</td>
          </tr>
        </tfoot>
      `
      : '';

    // Loan summary & payments (if applicable, placed on page 1 or last page)
    const loanBlockHtml =
      isFirstPage && (customer.hasLoan || customer.bishiType === 'LOAN_ONLY' || loan) && loan
        ? `
        <div style="margin-bottom: 10px; border: 1px solid #e2e8f0; border-radius: 6px; background: #ffffff; padding: 8px;">
          <h3 style="font-size: 11px; font-weight: 900; color: #064e3b; margin: 0 0 5px 0;">${lang === 'EN' ? 'Loan Details' : 'कर्जाचा तपशील (Loan Summary)'}</h3>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; font-size: 9.5px; font-weight: 700;">
            <div style="background: #f8fafc; padding: 4px 6px; border: 1px solid #e2e8f0; border-radius: 4px;">कर्ज: <strong style="color: #0f172a;">${formatCurrency(loan.principalAmount, lang)}</strong></div>
            <div style="background: #f8fafc; padding: 4px 6px; border: 1px solid #e2e8f0; border-radius: 4px;">दर: <strong style="color: #064e3b;">${loan.interestRate}%</strong></div>
            <div style="background: #f0fdf4; padding: 4px 6px; border: 1px solid #bbf7d0; border-radius: 4px;">भरलेली मुद्दल: <strong style="color: #15803d;">${formatCurrency(totalLoanPrincipalPaid, lang)}</strong></div>
            <div style="background: #fff1f2; padding: 4px 6px; border: 1px solid #fecdd3; border-radius: 4px;">बाकी मुद्दल: <strong style="color: #be123c;">${formatCurrency(loan.remainingAmount || 0, lang)}</strong></div>
          </div>
        </div>
      `
        : '';

    const footerBlockHtml = isLastPage
      ? `
        <div style="margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 10.5px; font-weight: 700;">
            <div style="border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; background: #f8fafc; min-width: 220px; line-height: 1.5;">
              <div>१) टाकणी: ___________________</div>
              <div>२) डिव्हिडंड: ___________________</div>
              <div>३) खाते नं.: <strong>${customer.accountNumber}</strong></div>
              <div>४) शेरा: ___________________</div>
            </div>

            <div style="text-align: right; padding-right: 16px;">
              <p style="margin: 0 0 22px 0; color: #334155; font-size: 10px; font-weight: 800;">
                ${lang === 'EN' ? 'Received and verified statement copy...' : 'सदर भिशीची रक्कम मिळाल्या बद्दल...'}
              </p>
              <div style="font-weight: 900; font-size: 11.5px; border-top: 2px solid #064e3b; padding-top: 3px; display: inline-block; min-width: 140px; text-align: center; color: #064e3b;">
                ${lang === 'EN' ? 'Secretary / President' : 'सेक्रेटरी / अध्यक्ष'}
              </div>
            </div>
          </div>
        </div>
      `
      : `
        <div style="display: flex; justify-content: space-between; font-size: 9px; font-weight: 700; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 4px;">
          <span>${customer.accountNumber} - ${customer.name}</span>
          <span>${lang === 'EN' ? 'Page ' : 'पान '}${pageIdx + 1} / ${totalPages}</span>
        </div>
      `;

    pageContainer.innerHTML = `
      <div>
        ${headerHtml}
        ${loanBlockHtml}
        <table style="width: 100%; border-collapse: collapse; font-size: 9px; border: 1px solid #cbd5e1;">
          ${tableHeaderHtml}
          <tbody>${rowsHtml}</tbody>
          ${tableFooterHtml}
        </table>
      </div>
      ${footerBlockHtml}
    `;

    pageElements.push(pageContainer);
  }

  await renderPagesToPdf(
    pageElements,
    'portrait',
    `खाते_${customer.accountNumber}_${customer.name.replace(/\s+/g, '_')}_अहवाल.pdf`
  );
};
