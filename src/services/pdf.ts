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
import { calculateCustomerFinancials, calculateLoanDueInterest } from '../utils/calculations';
import { StorageService } from './db';
import { calculateMemberLedger } from './ledger';
import { Language } from '../utils/translations';

/**
 * Creates an off-screen container positioned safely behind viewport elements
 * so html2canvas accurately measures bounding boxes, baselines, and full layouts.
 */
const createPdfContainer = (widthPx: number): HTMLDivElement => {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '-9999';
  container.style.pointerEvents = 'none';
  container.style.width = `${widthPx}px`;
  container.style.backgroundColor = '#ffffff';
  container.style.fontFamily = "'Noto Sans Devanagari', 'Mukta', 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  container.style.color = '#1e293b';
  container.style.padding = '20px';
  container.style.boxSizing = 'border-box';
  return container;
};

/**
 * Renders an off-screen HTML element into a multi-page PDF using canvas slicing.
 * Preserves exact aspect ratio on standard A4 (210mm x 297mm) without vertical squishing or truncation.
 */
const renderHtmlToMultiPagePdf = async (
  container: HTMLElement,
  orientation: 'portrait' | 'landscape',
  filename: string
) => {
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: container.scrollWidth,
      windowHeight: container.scrollHeight,
    });

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();

    // Height of one A4 page in canvas pixels
    const canvasPageHeight = Math.floor((canvas.width * pageHeightMm) / pageWidthMm);

    // If entire content fits onto a single page
    if (canvas.height <= canvasPageHeight) {
      const imgData = canvas.toDataURL('image/png');
      const pdfHeightMm = (canvas.height * pageWidthMm) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidthMm, pdfHeightMm);
    } else {
      // Content spans multiple pages - slice canvas cleanly page by page
      let renderedHeight = 0;
      let pageIndex = 0;

      while (renderedHeight < canvas.height) {
        const sliceHeight = Math.min(canvasPageHeight, canvas.height - renderedHeight);

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeight;

        const ctx = sliceCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(
            canvas,
            0,
            renderedHeight,
            canvas.width,
            sliceHeight,
            0,
            0,
            canvas.width,
            sliceHeight
          );

          const sliceImgData = sliceCanvas.toDataURL('image/png');
          if (pageIndex > 0) {
            pdf.addPage();
          }
          const slicePdfHeightMm = (sliceHeight * pageWidthMm) / canvas.width;
          pdf.addImage(sliceImgData, 'PNG', 0, 0, pageWidthMm, slicePdfHeightMm);
        }

        renderedHeight += sliceHeight;
        pageIndex++;
      }
    }

    pdf.save(filename);
  } catch (error) {
    console.error('PDF Generation error:', error);
  } finally {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  }
};

/**
 * Generate PDF for a Single Customer (Account Statement / खातेदार व्यवहार अहवाल)
 * Matches the website CustomerDetail view exactly with emerald branding,
 * 6 financial cards, comprehensive bishi table, and clean loan summary.
 */
export const generateCustomerPDF = async (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  loanPayments: LoanPayment[] = [],
  lang: Language = 'MR'
) => {
  // A4 Portrait target width: 794px
  const container = createPdfContainer(794);

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

  // Table Totals
  const totalExpected = customerCollections.reduce((sum, c) => sum + (c.expectedAmount || 0), 0);
  const totalCollected = customerCollections.reduce((sum, c) => sum + (c.collectedAmount || 0), 0);
  const totalExtra = customerCollections.reduce((sum, c) => sum + (c.extraAmount || 0), 0);
  const totalRemaining = customerCollections.reduce((sum, c) => sum + (c.remainingAmount || 0), 0);
  const totalInterest = financials.totalInterest;
  const totalPenalty = customerCollections.reduce((sum, c) => sum + (c.penaltyAmount || 0), 0);

  container.innerHTML = `
    <div style="background: #ffffff; padding: 16px; border: 1px solid #cbd5e1; border-radius: 8px;">
      <!-- Title Header Bar (Emerald Brand Accent) -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #064e3b; padding-bottom: 8px; margin-bottom: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 15px; font-weight: 900; color: #064e3b;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h2>
          <h1 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 900; color: #0f172a;">${lang === 'EN' ? 'Customer Account Statement' : 'खातेदार व्यवहार अहवाल (Customer Account Statement)'}</h1>
        </div>
        <div style="text-align: right; font-size: 11px; font-weight: 800; color: #334155; line-height: 1.4;">
          <div>${lang === 'EN' ? 'Office: ' : 'कार्यालय: '}<strong>${getOfficeNameMarathi(customer.officeId, lang)}</strong></div>
          <div>${lang === 'EN' ? 'Date: ' : 'दिनांक: '}<strong>${todayStr}</strong></div>
        </div>
      </div>

      <!-- Customer Details Card (Matching Website CustomerDetail UI) -->
      <div style="border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff; padding: 12px; margin-bottom: 12px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 50px; vertical-align: middle;">
              <div style="width: 44px; height: 44px; border-radius: 10px; background: #0F7A5C; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900;">
                ${customer.name ? customer.name.charAt(0) : 'ख'}
              </div>
            </td>
            <td style="vertical-align: middle; padding-left: 10px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 17px; font-weight: 900; color: #0f172a;">${customer.name}</span>
                <span style="background: #dcfce7; color: #065f46; font-size: 11px; font-weight: 900; padding: 2px 8px; border-radius: 9999px; border: 1px solid #bbf7d0;">
                  ${customer.accountNumber}
                </span>
              </div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 3px;">
                ${lang === 'EN' ? 'Mobile: ' : 'मोबाईल: '}<strong>${customer.mobile}</strong> &nbsp;|&nbsp;
                ${lang === 'EN' ? 'Address: ' : 'पत्ता: '}<strong>${customer.address || '-'}</strong>
              </div>
            </td>
            <td style="text-align: right; vertical-align: middle;">
              <div style="display: inline-block; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; text-align: right; font-size: 10.5px; font-weight: 800; line-height: 1.4;">
                <div style="color: #64748b;">${lang === 'EN' ? 'Scheme: ' : 'भिशी योजना: '}<strong style="color: #064e3b;">${getBishiNameMarathi(customer.bishiType, lang)}</strong></div>
                <div style="color: #64748b;">${lang === 'EN' ? 'Modality: ' : 'पद्धत: '}<strong style="color: #0f172a;">${getModalityShort(customer.modality, lang)} (₹${customer.amount})</strong></div>
                <div style="color: #64748b;">${lang === 'EN' ? 'Status: ' : 'स्थिती: '}<strong style="color: ${financials.isBishiCompleted ? '#166534' : '#0F7A5C'};">${financials.isBishiCompleted ? (lang === 'EN' ? 'Completed' : 'पूर्ण') : (lang === 'EN' ? 'Active' : 'सुरू')}</strong></div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Financial Summary Cards (Exact 6 Cards Matching Website) -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 5px; margin-bottom: 12px;">
        <tr>
          <td style="width: 16.66%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 7px 5px; border-radius: 8px; text-align: center;">
            <div style="font-size: 9px; font-weight: 800; color: #64748b;">${lang === 'EN' ? 'Total Bishi Amount' : 'एकूण भिशी रक्कम'}</div>
            <div style="font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 2px;">${formatCurrency(financials.totalExpectedBishi, lang)}</div>
          </td>
          <td style="width: 16.66%; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 7px 5px; border-radius: 8px; text-align: center;">
            <div style="font-size: 9px; font-weight: 800; color: #166534;">${lang === 'EN' ? 'Total Collected' : 'आतापर्यंत जमा'}</div>
            <div style="font-size: 13px; font-weight: 900; color: #15803d; margin-top: 2px;">${formatCurrency(financials.totalCollectedBishi + (financials.totalExtraAmount || 0), lang)}</div>
            ${(financials.totalExtraAmount || 0) > 0 ? `<div style="font-size: 8px; color: #1d4ed8; font-weight: 800;">(+अतिरिक्त: ₹${financials.totalExtraAmount})</div>` : ''}
          </td>
          <td style="width: 16.66%; background: #fff1f2; border: 1px solid #fecdd3; padding: 7px 5px; border-radius: 8px; text-align: center;">
            <div style="font-size: 9px; font-weight: 800; color: #9f1239;">${lang === 'EN' ? 'Remaining Due' : 'उरलेली बाकी'}</div>
            <div style="font-size: 13px; font-weight: 900; color: #be123c; margin-top: 2px;">${formatCurrency(financials.totalRemainingBishi, lang)}</div>
          </td>
          <td style="width: 16.66%; background: #eff6ff; border: 1px solid #bfdbfe; padding: 7px 5px; border-radius: 8px; text-align: center;">
            <div style="font-size: 9px; font-weight: 800; color: #1e40af;">${lang === 'EN' ? 'Total Interest' : 'एकूण व्याज'}</div>
            <div style="font-size: 13px; font-weight: 900; color: #1d4ed8; margin-top: 2px;">${formatCurrency(financials.totalInterest, lang)}</div>
          </td>
          <td style="width: 16.66%; background: #fffbeb; border: 1px solid #fde68a; padding: 7px 5px; border-radius: 8px; text-align: center;">
            <div style="font-size: 9px; font-weight: 800; color: #92400e;">${lang === 'EN' ? 'Total Penalty' : 'एकूण दंड'}</div>
            <div style="font-size: 13px; font-weight: 900; color: #b45309; margin-top: 2px;">${formatCurrency(financials.totalPenalty, lang)}</div>
          </td>
          <td style="width: 16.66%; background: #064e3b; border: 1px solid #064e3b; padding: 7px 5px; border-radius: 8px; text-align: center;">
            <div style="font-size: 9px; font-weight: 800; color: #a7f3d0;">${lang === 'EN' ? 'Total Return / Payable' : 'एकूण देय / परतावा'}</div>
            <div style="font-size: 13px; font-weight: 900; color: #ffffff; margin-top: 2px;">${formatCurrency(financials.totalPayableBishi, lang)}</div>
          </td>
        </tr>
      </table>

      <!-- Weekly / Monthly Bishi Table -->
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <h3 style="font-size: 12px; font-weight: 900; color: #064e3b; margin: 0;">
            ${lang === 'EN' ? 'Bishi Collection History' : 'भिशी व्यवहार इतिहास'} (${customer.modality === 'W' ? (lang === 'EN' ? 'Weekly' : 'साप्ताहिक') : (lang === 'EN' ? 'Monthly' : 'मासिक')})
          </h3>
          <span style="font-size: 11px; font-weight: 800; color: #64748b;">
            ${lang === 'EN' ? 'Total Installments: ' : 'एकूण हप्ते: '}<strong>${customerCollections.length}</strong>
          </span>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; border: 1px solid #cbd5e1;">
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
          <tbody>
            ${
              customerCollections.length === 0
                ? `<tr><td colspan="9" style="padding: 16px; text-align: center; color: #64748b; font-weight: 800;">${lang === 'EN' ? 'No collections recorded yet.' : 'कोणतीही जमा नोंद आढळली नाही.'}</td></tr>`
                : customerCollections
                    .map((item, idx) => {
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
                        <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                          <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #475569;">${idx + 1}</td>
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
                    .join('')
            }
          </tbody>
          <tfoot>
            <tr style="background: #064e3b; color: #ffffff; font-weight: 900; font-size: 10px;">
              <td style="padding: 6px 4px; border: 1px solid #065f46; text-align: center;">-</td>
              <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: center;">${lang === 'EN' ? 'TOTAL' : 'एकूण'}</td>
              <td style="padding: 6px 6px; border: 1px solid #065f46; text-align: right;">${formatCurrency(totalExpected, lang)}</td>
              <td style="padding: 6px 6px; border: 1px solid #065f46; text-align: right;">
                <div>${formatCurrency(totalCollected + totalExtra, lang)}</div>
                ${totalExtra > 0 ? `<div style="font-size: 8px; color: #a7f3d0;">+जादा: ₹${totalExtra}</div>` : ''}
              </td>
              <td style="padding: 6px 6px; border: 1px solid #065f46; text-align: right; color: #fecdd3;">${formatCurrency(totalRemaining, lang)}</td>
              <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; color: #bfdbfe;">${formatCurrency(totalInterest, lang)}</td>
              <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; color: #fed7aa;">${formatCurrency(totalPenalty, lang)}</td>
              <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: center;">-</td>
              <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: center;">-</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Loan Section (If Applicable) -->
      ${
        (customer.hasLoan || customer.bishiType === 'LOAN_ONLY' || loan) && loan
          ? `
        <div style="margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; padding: 10px;">
          <h3 style="font-size: 12px; font-weight: 900; color: #064e3b; margin: 0 0 6px 0;">${lang === 'EN' ? 'Loan Details' : 'कर्जाचा तपशील (Loan Summary)'}</h3>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 10px; font-weight: 700; margin-bottom: 8px;">
            <div style="background: #f8fafc; padding: 5px 7px; border: 1px solid #e2e8f0; border-radius: 6px;"><span style="color: #64748b;">कर्ज रक्कम:</span> <strong style="color: #0f172a; font-size: 11px;">${formatCurrency(loan.principalAmount, lang)}</strong></div>
            <div style="background: #f8fafc; padding: 5px 7px; border: 1px solid #e2e8f0; border-radius: 6px;"><span style="color: #64748b;">व्याज दर:</span> <strong style="color: #064e3b;">${loan.interestRate}%</strong></div>
            <div style="background: #f8fafc; padding: 5px 7px; border: 1px solid #e2e8f0; border-radius: 6px;"><span style="color: #64748b;">एकूण देय:</span> <strong style="color: #0f172a;">${formatCurrency(loan.totalPayable, lang)}</strong></div>
            <div style="background: #f8fafc; padding: 5px 7px; border: 1px solid #e2e8f0; border-radius: 6px;"><span style="color: #64748b;">तारीख:</span> <strong>${formatDateMarathi(loan.issueDate, lang)}</strong></div>
            <div style="background: #f0fdf4; padding: 5px 7px; border: 1px solid #bbf7d0; border-radius: 6px;"><span style="color: #166534;">भरलेली मुद्दल:</span> <strong style="color: #15803d; font-size: 11px;">${formatCurrency(totalLoanPrincipalPaid, lang)}</strong></div>
            <div style="background: #fffbeb; padding: 5px 7px; border: 1px solid #fde68a; border-radius: 6px;"><span style="color: #92400e;">भरलेले व्याज:</span> <strong style="color: #b45309; font-size: 11px;">${formatCurrency(totalLoanInterestPaid, lang)}</strong></div>
            <div style="background: #fff1f2; padding: 5px 7px; border: 1px solid #fecdd3; border-radius: 6px;"><span style="color: #9f1239;">कर्ज बाकी मुद्दल:</span> <strong style="color: ${(loan.remainingAmount || 0) > 0 ? '#be123c' : '#15803d'}; font-size: 11px;">${formatCurrency((loan.remainingAmount || 0) <= 0 ? 0 : loan.remainingAmount, lang)}</strong></div>
            <div style="background: #f8fafc; padding: 5px 7px; border: 1px solid #e2e8f0; border-radius: 6px;"><span style="color: #64748b;">कर्ज स्थिती:</span> <strong style="color: ${loan.status === 'ACTIVE' && loan.remainingAmount > 0 ? '#c2410c' : '#15803d'};">${loan.status === 'ACTIVE' && loan.remainingAmount > 0 ? (lang === 'EN' ? 'Active' : 'सुरू') : (lang === 'EN' ? 'Completed' : 'पूर्ण')}</strong></div>
          </div>

          ${
            customerLoanPayments.length > 0
              ? `
            <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 6px;">
              <h4 style="font-size: 11px; font-weight: 800; color: #064e3b; margin: 4px 0 4px 0;">${lang === 'EN' ? 'Loan Payment History' : 'कर्ज भरणा इतिहास'}</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 9px; font-weight: 600; border: 1px solid #cbd5e1;">
                <thead>
                  <tr style="background: #047857; color: #ffffff; font-weight: 900;">
                    <th style="padding: 4px; text-align: center; width: 30px; border: 1px solid #065f46;">${lang === 'EN' ? '#' : 'क्र.'}</th>
                    <th style="padding: 4px 6px; text-align: center; width: 80px; border: 1px solid #065f46;">${lang === 'EN' ? 'Date' : 'दिनांक'}</th>
                    <th style="padding: 4px 6px; text-align: right; width: 85px; border: 1px solid #065f46;">${lang === 'EN' ? 'Principal (₹)' : 'भरलेली मुद्दल (₹)'}</th>
                    <th style="padding: 4px 6px; text-align: right; width: 85px; border: 1px solid #065f46;">${lang === 'EN' ? 'Interest (₹)' : 'भरलेले व्याज (₹)'}</th>
                    <th style="padding: 4px 6px; text-align: right; width: 70px; border: 1px solid #065f46;">${lang === 'EN' ? 'Discount (₹)' : 'सूट (₹)'}</th>
                    <th style="padding: 4px 6px; text-align: right; width: 85px; border: 1px solid #065f46;">${lang === 'EN' ? 'Remaining (₹)' : 'बाकी मुद्दल (₹)'}</th>
                    <th style="padding: 4px 4px; text-align: center; width: 65px; border: 1px solid #065f46;">${lang === 'EN' ? 'Mode' : 'पद्धत'}</th>
                    <th style="padding: 4px 6px; text-align: left; border: 1px solid #065f46;">${lang === 'EN' ? 'Note' : 'टीप'}</th>
                  </tr>
                </thead>
                <tbody>
                  ${customerLoanPayments
                    .map(
                      (lp, idx) => `
                    <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                      <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
                      <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700;">${formatDateMarathi(lp.paymentDate, lang)}</td>
                      <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #15803d;">${formatCurrency(lp.paidAmount, lang)}</td>
                      <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #b45309;">${formatCurrency(lp.interestPaid, lang)}</td>
                      <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: right; color: #64748b;">${lp.discountAmount ? formatCurrency(lp.discountAmount, lang) : '-'}</td>
                      <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #be123c;">${formatCurrency(lp.remainingLoan, lang)}</td>
                      <td style="padding: 4px 4px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${lp.paymentMode === 'ONLINE' ? 'ऑनलाइन' : 'नगद'}</td>
                      <td style="padding: 4px 6px; border: 1px solid #e2e8f0; color: #64748b;">${lp.note || '-'}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
                <tfoot>
                  <tr style="background: #064e3b; color: #ffffff; font-weight: 900; font-size: 9px;">
                    <td style="padding: 4px; text-align: center; border: 1px solid #065f46;">-</td>
                    <td style="padding: 4px 6px; text-align: center; border: 1px solid #065f46;">${lang === 'EN' ? 'TOTAL' : 'एकूण'}</td>
                    <td style="padding: 4px 6px; text-align: right; border: 1px solid #065f46;">${formatCurrency(totalLoanPrincipalPaid, lang)}</td>
                    <td style="padding: 4px 6px; text-align: right; border: 1px solid #065f46;">${formatCurrency(totalLoanInterestPaid, lang)}</td>
                    <td style="padding: 4px 6px; text-align: right; border: 1px solid #065f46;">${formatCurrency(totalLoanDiscount, lang)}</td>
                    <td style="padding: 4px 6px; text-align: right; border: 1px solid #065f46;">${formatCurrency(loan.remainingAmount, lang)}</td>
                    <td style="padding: 4px 4px; text-align: center; border: 1px solid #065f46;">-</td>
                    <td style="padding: 4px 6px; border: 1px solid #065f46;">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `
              : ''
          }
        </div>
      `
          : ''
      }

      <!-- Footer Notes & Signature Block -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14px; font-size: 11px; font-weight: 700;">
        <div style="border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 8px; background: #f8fafc; min-width: 220px; line-height: 1.5;">
          <div>१) टाकणी: ___________________</div>
          <div>२) डिव्हिडंड: ___________________</div>
          <div>३) खाते नं.: <strong>${customer.accountNumber}</strong></div>
          <div>४) शेरा: ___________________</div>
        </div>

        <div style="text-align: right; padding-right: 16px;">
          <p style="margin: 0 0 25px 0; color: #334155; font-size: 10.5px; font-weight: 800;">
            ${lang === 'EN' ? 'Received and verified statement copy...' : 'सदर भिशीची रक्कम मिळाल्या बद्दल...'}
          </p>
          <div style="font-weight: 900; font-size: 12px; border-top: 2px solid #064e3b; padding-top: 4px; display: inline-block; min-width: 150px; text-align: center; color: #064e3b;">
            ${lang === 'EN' ? 'Secretary / President' : 'सेक्रेटरी / अध्यक्ष'}
          </div>
        </div>
      </div>
    </div>
  `;

  await renderHtmlToMultiPagePdf(
    container,
    'portrait',
    `खाते_${customer.accountNumber}_${customer.name.replace(/\s+/g, '_')}_अहवाल.pdf`
  );
};

/**
 * Generate Report PDF (Daily / Weekly / Monthly / Custom Summary)
 * Matches website Summary Report view exactly with emerald styling,
 * 4 overview metric cards, and 13 aligned table columns.
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
  // A4 Landscape target width: 1122px
  const container = createPdfContainer(1122);

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

  const rows = customers.map((cust) => {
    const custColls = collections.filter((c) => c.customerId === cust.id);
    let exp = 0;
    let coll = 0;
    let pen = 0;

    custColls.forEach((c) => {
      exp += c.expectedAmount || 0;
      coll += c.collectedAmount || 0;
      pen += c.penaltyAmount || 0;
    });

    const rem = Math.max(0, exp - coll);
    const rate = cust.interestRate || (cust.modality === 'W' ? 2.5 : 10);
    const expectedInterest = Math.round((exp * rate) / 100);
    const totalExpWithInterest = exp + expectedInterest;
    const bishiAmountForInt = exp > 0 ? Math.min(coll, exp) : coll;
    const int = Math.round((bishiAmountForInt * rate) / 100);

    const extraSubmitted = Math.max(0, coll - exp);
    const totalWithExtra = coll > 0 ? coll + int : 0;
    const totalPayable = totalExpWithInterest + extraSubmitted;

    totalExp += exp;
    totalExpectedInterestSum += expectedInterest;
    totalExpWithInterestSum += totalExpWithInterest;
    totalColl += coll;
    totalRem += rem;
    totalInt += int;
    totalPen += pen;
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
      extraSubmitted,
      totalWithExtra,
      totalPayable,
      statusText,
      statusBg,
      statusColor,
    };
  });

  const todayStr = formatDateMarathi(new Date().toISOString().split('T')[0], lang);

  container.innerHTML = `
    <div style="background: #ffffff; padding: 18px; border: 1px solid #cbd5e1; border-radius: 8px;">
      <!-- Title Header Bar (Emerald Brand Theme) -->
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #064e3b; padding-bottom: 8px; margin-bottom: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 14px; font-weight: 900; color: #064e3b;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h2>
          <h1 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 900; color: #0f172a;">${title}</h1>
        </div>
        <div style="text-align: right; font-size: 11px; font-weight: 800; color: #334155; line-height: 1.4;">
          <div>${lang === 'EN' ? 'Office: ' : 'कार्यालय: '}<strong>${officeName}</strong> &nbsp;|&nbsp; ${lang === 'EN' ? 'Scheme: ' : 'भिशी योजना: '}<strong>${bishiName}</strong></div>
          <div>${lang === 'EN' ? 'Date: ' : 'दिनांक: '}<strong>${todayStr}</strong> &nbsp;|&nbsp; ${lang === 'EN' ? 'Total Accounts: ' : 'एकूण खातेदार: '}<strong>${customers.length}</strong></div>
        </div>
      </div>

      <!-- 4 Overview Metric Cards Matching Website -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 6px; margin-bottom: 12px;">
        <tr>
          <td style="width: 25%; background: #ffffff; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 8px; text-align: left;">
            <span style="font-size: 9.5px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Accounts' : 'एकूण खातेदार'}</span>
            <span style="font-size: 17px; font-weight: 900; color: #0f172a; margin-top: 2px; display: block;">${customers.length}</span>
          </td>
          <td style="width: 25%; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px 10px; border-radius: 8px; text-align: left;">
            <span style="font-size: 9.5px; font-weight: 800; color: #166534; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Bishi (with Int.)' : 'एकूण भिशी (व्याजासह)'}</span>
            <span style="font-size: 17px; font-weight: 900; color: #064e3b; margin-top: 2px; display: block;">${formatCurrency(totalExpWithInterestSum, lang)}</span>
            <span style="font-size: 8.5px; font-weight: 700; color: #047857; margin-top: 2px; display: block;">(${lang === 'EN' ? 'Base: ' : 'हप्ते: '}${formatCurrency(totalExp, lang)} + ${lang === 'EN' ? 'Int: +' : 'व्याज: +'}${formatCurrency(totalExpectedInterestSum, lang)})</span>
          </td>
          <td style="width: 25%; background: #ffffff; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 8px; text-align: left;">
            <span style="font-size: 9.5px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Actual Collected' : 'प्रत्यक्ष जमा'}</span>
            <span style="font-size: 17px; font-weight: 900; color: #15803d; margin-top: 2px; display: block;">${formatCurrency(totalColl, lang)}</span>
            <span style="font-size: 8.5px; font-weight: 700; color: #be123c; margin-top: 2px; display: block;">${lang === 'EN' ? 'Remaining Due: ' : 'शिल्लक बाकी: '}${formatCurrency(totalRem, lang)}</span>
          </td>
          <td style="width: 25%; background: #eff6ff; border: 1px solid #bfdbfe; padding: 8px 10px; border-radius: 8px; text-align: left;">
            <span style="font-size: 9.5px; font-weight: 800; color: #1e40af; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Return / Payable' : 'एकूण परतावा / देय'}</span>
            <span style="font-size: 17px; font-weight: 900; color: #1e3a8a; margin-top: 2px; display: block;">${formatCurrency(totalReturnSum, lang)}</span>
            <span style="font-size: 8.5px; font-weight: 700; color: #2563eb; margin-top: 2px; display: block;">${lang === 'EN' ? 'Earned Interest: +' : 'जमा व्याज: +'}${formatCurrency(totalInt, lang)}</span>
          </td>
        </tr>
      </table>

      <!-- Summary Report Data Table (13 Columns matching website exactly) -->
      <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; font-weight: 700; border: 1px solid #cbd5e1;">
        <thead>
          <tr style="background: #064e3b; color: #ffffff; font-weight: 900;">
            <th style="padding: 6px 3px; border: 1px solid #065f46; text-align: center; width: 25px;">#</th>
            <th style="padding: 6px 4px; border: 1px solid #065f46; text-align: center; width: 55px;">${lang === 'EN' ? 'Acc No.' : 'खाते क्र.'}</th>
            <th style="padding: 6px 6px; border: 1px solid #065f46; text-align: left; width: 120px;">${lang === 'EN' ? 'Customer Name' : 'खातेदाराचे नाव'}</th>
            <th style="padding: 6px 4px; border: 1px solid #065f46; text-align: center; width: 75px;">${lang === 'EN' ? 'Mobile' : 'मोबाईल'}</th>
            <th style="padding: 6px 4px; border: 1px solid #065f46; text-align: center; width: 70px;">${lang === 'EN' ? 'Scheme' : 'योजना'}</th>
            <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; width: 95px;">${lang === 'EN' ? 'Total (with Int) (₹)' : 'एकूण भिशी (व्याजासह) (₹)'}</th>
            <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; width: 75px;">${lang === 'EN' ? 'Collected (₹)' : 'जमा (₹)'}</th>
            <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; width: 75px;">${lang === 'EN' ? 'Remaining (₹)' : 'बाकी (₹)'}</th>
            <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; width: 75px;">${lang === 'EN' ? 'Int/Pen (₹)' : 'व्याज/दंड (₹)'}</th>
            <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; width: 75px; background: #043628;">${lang === 'EN' ? 'Total Payable (₹)' : 'एकूण देय (₹)'}</th>
            <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; width: 70px; background: #043628;">${lang === 'EN' ? 'Extra (₹)' : 'जादा जमा (₹)'}</th>
            <th style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; width: 80px; background: #043628;">${lang === 'EN' ? 'Total Return (₹)' : 'एकूण परतावा (₹)'}</th>
            <th style="padding: 6px 4px; border: 1px solid #065f46; text-align: center; width: 65px;">${lang === 'EN' ? 'Status' : 'स्थिती'}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, idx) => `
            <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
              <td style="padding: 5px 3px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #475569;">${idx + 1}</td>
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 900; color: #0f172a;">${r.cust.accountNumber}</td>
              <td style="padding: 5px 6px; border: 1px solid #e2e8f0; font-weight: 800; color: #1e293b;">${r.cust.name}</td>
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">${r.cust.mobile}</td>
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${getBishiNameMarathi(r.cust.bishiType, lang)}</td>
              <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700;">
                <div style="font-weight: 900; color: #064e3b;">${formatCurrency(r.totalExpWithInterest, lang)}</div>
                <div style="font-size: 7.5px; color: #64748b;">(${formatCurrency(r.exp, lang)} + ${formatCurrency(r.expectedInterest, lang)})</div>
              </td>
              <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #15803d;">${formatCurrency(r.coll, lang)}</td>
              <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: right; font-weight: 900; color: #be123c;">${formatCurrency(r.rem, lang)}</td>
              <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #475569;">
                ${r.int > 0 ? `<span style="color: #1d4ed8;">व्याज: ${formatCurrency(r.int, lang)}</span><br>` : ''}
                ${r.pen > 0 ? `<span style="color: #b45309;">दंड: ${formatCurrency(r.pen, lang)}</span>` : ''}
                ${r.int === 0 && r.pen === 0 ? '-' : ''}
              </td>
              <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #1e3a8a; background: #f0f7ff;">${r.totalPayable > 0 ? formatCurrency(r.totalPayable, lang) : '-'}</td>
              <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #6b21a8; background: #faf5ff;">${r.extraSubmitted > 0 ? `+${formatCurrency(r.extraSubmitted, lang)}` : '-'}</td>
              <td style="padding: 5px 5px; border: 1px solid #e2e8f0; text-align: right; font-weight: 900; color: #166534; background: #f0fdf4;">${r.totalWithExtra > 0 ? formatCurrency(r.totalWithExtra, lang) : '-'}</td>
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center;">
                <span style="display: inline-block; padding: 2px 5px; border-radius: 4px; font-size: 8.5px; font-weight: 800; background: ${r.statusBg}; color: ${r.statusColor};">
                  ${r.statusText}
                </span>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
        <tfoot>
          <tr style="background: #064e3b; color: #ffffff; font-weight: 900; font-size: 9.5px;">
            <td style="padding: 6px 3px; border: 1px solid #065f46; text-align: center;">-</td>
            <td style="padding: 6px 4px; border: 1px solid #065f46; text-align: center;">${lang === 'EN' ? 'TOTAL' : 'एकूण'}</td>
            <td style="padding: 6px 6px; border: 1px solid #065f46;">${customers.length} ${lang === 'EN' ? 'Accounts' : 'खातेदार'}</td>
            <td style="padding: 6px 4px; border: 1px solid #065f46;">-</td>
            <td style="padding: 6px 4px; border: 1px solid #065f46;">-</td>
            <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: right;">
              <div>${formatCurrency(totalExpWithInterestSum, lang)}</div>
              <div style="font-size: 7.5px; color: #a7f3d0;">(${formatCurrency(totalExp, lang)} + ${formatCurrency(totalExpectedInterestSum, lang)})</div>
            </td>
            <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: right;">${formatCurrency(totalColl, lang)}</td>
            <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; color: #fecdd3;">${formatCurrency(totalRem, lang)}</td>
            <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; color: #fed7aa;">${formatCurrency(totalInt + totalPen, lang)}</td>
            <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; color: #dbeafe;">${formatCurrency(totalPayableSum, lang)}</td>
            <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; color: #f3e8ff;">${formatCurrency(totalExtraSum, lang)}</td>
            <td style="padding: 6px 5px; border: 1px solid #065f46; text-align: right; color: #bbf7d0;">${formatCurrency(totalReturnSum, lang)}</td>
            <td style="padding: 6px 4px; border: 1px solid #065f46; text-align: center;">-</td>
          </tr>
        </tfoot>
      </table>

      ${
        customNote
          ? `
        <div style="margin-top: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 800; color: #064e3b;">
          <strong>${lang === 'EN' ? 'Note: ' : 'अहवाल शेरा / टीप: '}</strong> ${customNote}
        </div>
      `
          : ''
      }

      <!-- Footer Info and Signature -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; font-size: 10.5px; font-weight: 700; color: #475569;">
        <div>
          <div>${lang === 'EN' ? 'Generated: ' : 'अहवाल निर्मिती: '} ${todayStr} &nbsp;|&nbsp; ${lang === 'EN' ? 'Computer Generated Copy: Sushant Bishi Management' : 'संगणकीकृत प्रत: सुषांत भिशी व्यवस्थापन'}</div>
        </div>
        <div style="text-align: center;">
          <div style="height: 25px;"></div>
          <div style="border-top: 2px solid #064e3b; padding-top: 4px; min-width: 150px; color: #064e3b; font-weight: 900;">${lang === 'EN' ? 'Authorized Signature' : 'अधिकृत स्वाक्षरी'}</div>
        </div>
      </div>
    </div>
  `;

  await renderHtmlToMultiPagePdf(container, 'landscape', `${title.replace(/\s+/g, '_')}_अहवाल.pdf`);
};

/**
 * Generate PDF for Member Ledger Card (खातेदार खाते उतारा)
 * Exactly matches the authentic physical register passbook in Landscape A4 format.
 * Features 11 aligned columns, single-tier header structure (so html2canvas doesn't blank any headers),
 * full zebra rows, complete totals, and notes box.
 */
export const generateMemberLedgerPDF = async (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  loanPayments: LoanPayment[] = [],
  showAllWeeks: boolean = false,
  lang: Language = 'MR'
) => {
  // A4 Landscape target width: 1122px
  const container = createPdfContainer(1122);

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

  const tableRowsHtml =
    ledgerCalculation.rows.length === 0
      ? `<tr><td colspan="11" style="padding: 18px; text-align: center; color: #64748b; font-weight: 700; border: 1px solid #b8a99a;">${
          lang === 'EN'
            ? 'No completed payments recorded yet for this customer.'
            : 'या खातेदाराची अद्याप कोणतीही पूर्ण जमा नोंद झालेली नाही.'
        }</td></tr>`
      : ledgerCalculation.rows
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

  container.innerHTML = `
    <div style="border: 3px double #8B4513; padding: 20px; background: #fffdfa; border-radius: 8px;">
      <!-- Title Header Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8B4513; padding-bottom: 8px; margin-bottom: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 14px; font-weight: 900; color: #8B4513;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h2>
          <h1 style="margin: 2px 0 0 0; font-size: 19px; font-weight: 900; color: #5c3a21;">${lang === 'EN' ? 'Member Ledger Card Register' : 'खातेदार खाते उतारा (Member Ledger Card Register)'}</h1>
        </div>
        <div style="text-align: right; font-size: 11px; font-weight: 800; color: #5c3a21; line-height: 1.4;">
          <div>${lang === 'EN' ? 'Office: ' : 'कार्यालय: '}<strong>${getOfficeNameMarathi(customer.officeId, lang)}</strong></div>
          <div>${lang === 'EN' ? 'Date: ' : 'दिनांक: '}<strong>${formatDateMarathi(new Date().toISOString().split('T')[0], lang)}</strong></div>
        </div>
      </div>

      <!-- Customer Meta Grid Box (Brown Register Look) -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; font-weight: 800; margin-bottom: 12px;">
        <tr>
          <td style="width: 14%; background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Account No:' : 'खाते नंबर:'}</td>
          <td style="width: 36%; background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-size: 14px; color: #0f172a;">${customer.accountNumber}</td>
          <td style="width: 16%; background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Customer Name:' : 'खातेदाराचे नाव:'}</td>
          <td style="width: 34%; background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-size: 14px; color: #0f172a;">${customer.name}</td>
        </tr>
        <tr>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Installment:' : 'हप्ता रुपये:'}</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; color: #166534; font-size: 13px;">₹${customer.amount} (${customer.modality === 'W' ? (lang === 'EN' ? 'Weekly' : 'साप्ताहिक') : (lang === 'EN' ? 'Monthly' : 'मासिक')})</td>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Address / Mobile:' : 'पत्ता / मोबाईल:'}</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-size: 12px;">${customer.address || '-'} (${customer.mobile})</td>
        </tr>
        <tr>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Total Bishi (with Int):' : 'एकूण भिशी (व्याजासह):'}</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-weight: 900; color: #0b5c45; font-size: 13px;">
            ${formatCurrency(totalExpectedWithInt, lang)} <span style="font-size: 10px; color: #475569; font-weight: 700;">(${lang === 'EN' ? 'Base: ' : 'ठेव: '}${formatCurrency(expectedBase, lang)} + ${lang === 'EN' ? 'Int: +' : 'व्याज: +'}${formatCurrency(expectedInterest, lang)})</span>
          </td>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">${lang === 'EN' ? 'Dividend / Interest:' : 'लाभांश / व्याजदर:'}</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-weight: bold; color: #1e3a8a; font-size: 13px;">${rate}% (${customer.modality === 'W' ? (lang === 'EN' ? 'Weekly' : 'साप्ताहिक') : (lang === 'EN' ? 'Monthly' : 'मासिक')})</td>
        </tr>
      </table>

      <!-- Ledger Register 11-Column Table (Single-Tier Header for 100% html2canvas reliability) -->
      <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; font-weight: 700; border: 1px solid #8B4513;">
        <thead>
          <tr style="background: #f5e6d3; color: #1e293b; font-weight: 900; text-align: center;">
            <th style="border: 1px solid #8B4513; padding: 8px 4px; width: 38px;">${lang === 'EN' ? 'Sr.' : 'अ. क्र.'}</th>
            <th style="border: 1px solid #8B4513; padding: 8px 6px; width: 80px;">${lang === 'EN' ? 'Date' : 'तारीख'}</th>
            <th style="border: 1px solid #8B4513; padding: 8px 6px; width: 95px; color: #065f46;">${lang === 'EN' ? 'Deposit (₹)' : 'खात्यात जमा रुपये'}</th>
            <th style="border: 1px solid #8B4513; padding: 8px 6px; width: 95px; color: #022c22;">${lang === 'EN' ? 'Total Deposit (₹)' : 'एकूण जमा रुपये'}</th>
            <th style="border: 1px solid #8B4513; padding: 8px 6px; width: 60px; color: #9f1239;">${lang === 'EN' ? 'Penalty' : 'दंड'}</th>
            <th style="border: 1px solid #8B4513; padding: 8px 6px; width: 70px;">${lang === 'EN' ? 'Expected' : 'देणे'}</th>
            <th style="border: 1px solid #8B4513; padding: 8px 6px; width: 90px; color: #78350f;">${lang === 'EN' ? 'Loan Given' : 'दिलेले कर्ज'}</th>
            <th style="border: 1px solid #8B4513; padding: 5px 4px; width: 85px;">
              <div style="font-size: 8.5px; font-weight: 800; color: #78350f; line-height: 1.1;">${lang === 'EN' ? 'Loan Repayment' : 'कर्ज परतफेड'}</div>
              <div style="font-size: 11px; font-weight: 900; color: #166534; line-height: 1.2;">${lang === 'EN' ? 'Principal (₹)' : 'मुद्दल (₹)'}</div>
            </th>
            <th style="border: 1px solid #8B4513; padding: 5px 4px; width: 85px;">
              <div style="font-size: 8.5px; font-weight: 800; color: #78350f; line-height: 1.1;">${lang === 'EN' ? 'Loan Repayment' : 'कर्ज परतफेड'}</div>
              <div style="font-size: 11px; font-weight: 900; color: #166534; line-height: 1.2;">${lang === 'EN' ? 'Interest (₹)' : 'व्याज (₹)'}</div>
            </th>
            <th style="border: 1px solid #8B4513; padding: 8px 6px; width: 60px; color: #9f1239;">${lang === 'EN' ? 'Penalty' : 'दंड'}</th>
            <th style="border: 1px solid #8B4513; padding: 8px 6px; width: 90px; color: #4c0519;">${lang === 'EN' ? 'Balance Due' : 'देणे बाकी'}</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #8B4513; color: #ffffff; font-weight: 900; font-size: 10.5px;">
            <td style="padding: 6px 4px; border: 1px solid #5c3a21; text-align: center;">-</td>
            <td style="padding: 6px 8px; border: 1px solid #5c3a21; text-align: center;">${lang === 'EN' ? 'TOTAL' : 'एकूण'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right; color: #bbf7d0;">${ledgerCalculation.totalDeposit > 0 ? formatCurrency(ledgerCalculation.totalDeposit, lang) : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right; color: #a7f3d0;">${ledgerCalculation.totalCumulativeDeposit > 0 ? formatCurrency(ledgerCalculation.totalCumulativeDeposit, lang) : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right; color: #fecdd3;">${ledgerCalculation.totalBishiPenalty > 0 ? formatCurrency(ledgerCalculation.totalBishiPenalty, lang) : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalExpected > 0 ? formatCurrency(ledgerCalculation.totalExpected, lang) : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right; color: #fed7aa;">${ledgerCalculation.totalLoanIssued > 0 ? formatCurrency(ledgerCalculation.totalLoanIssued, lang) : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right; color: #bbf7d0;">${ledgerCalculation.totalLoanPrincipalPaid > 0 ? formatCurrency(ledgerCalculation.totalLoanPrincipalPaid, lang) : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right; color: #bbf7d0;">${ledgerCalculation.totalLoanInterestPaid > 0 ? formatCurrency(ledgerCalculation.totalLoanInterestPaid, lang) : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right; color: #fecdd3;">${ledgerCalculation.totalLoanPenalty > 0 ? formatCurrency(ledgerCalculation.totalLoanPenalty, lang) : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right; color: #fecdd3;">${ledgerCalculation.finalRemainingBalance > 0 ? formatCurrency(ledgerCalculation.finalRemainingBalance, lang) : '₹0'}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Footer Notes & Signature Block (matching website ReportManager view) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; font-size: 11px; font-weight: 700;">
        <div style="border: 1px solid #8B4513; padding: 8px 14px; border-radius: 6px; background: #fffde7; min-width: 260px; line-height: 1.6;">
          <div>१) टाकणी: ___________________</div>
          <div style="color: #0b5c45; font-weight: 800;">२) डिव्हिडंड / व्याज (${rate}%): ${formatCurrency(actualEarnedInterest, lang)}</div>
          <div>३) खाते नं.: <strong>${customer.accountNumber}</strong></div>
          <div style="color: #1e3a8a; font-weight: 800;">४) एकूण अंतिम परतावा: ${formatCurrency(totalPayout, lang)}</div>
        </div>

        <div style="text-align: right; padding-right: 20px;">
          <p style="margin: 0 0 35px 0; color: #0f172a; font-weight: 800; font-size: 11px;">
            ${
              lang === 'EN'
                ? `Acknowledged receipt of total Bishi amount ${formatCurrency(totalPayout, lang)} (with interest)...`
                : `सदर भिशीची एकूण रक्कम ${formatCurrency(totalPayout, lang)} (व्याजासह) मिळाल्या बद्दल...`
            }
          </p>
          <div style="font-weight: 900; font-size: 12.5px; border-top: 2px solid #333; padding-top: 4px; display: inline-block; min-width: 160px; text-align: center; color: #0f172a;">
            ${lang === 'EN' ? 'Secretary / President' : 'सेक्रेटरी / अध्यक्ष'}
          </div>
        </div>
      </div>
    </div>
  `;

  await renderHtmlToMultiPagePdf(
    container,
    'landscape',
    `खातेदार_उतारा_${customer.accountNumber}_${customer.name.replace(/\s+/g, '_')}.pdf`
  );
};

/**
 * Generate Thakbaki (थकबाकी) Report PDF.
 * Matches website Thakbaki view with warm amber header, 4 metric overview cards,
 * and clean status indicators.
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

  const tableRows = entries
    .map(
      (e, idx) => `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fffbeb'};">
        <td style="text-align: center; font-weight: bold; padding: 6px 8px; border: 1px solid #e5e7eb; color: #4b5563;">${idx + 1}</td>
        <td style="font-weight: 900; padding: 6px 8px; border: 1px solid #e5e7eb; color: #374151;">${e.accountNumber}</td>
        <td style="font-weight: 800; padding: 6px 8px; border: 1px solid #e5e7eb; color: #111827;">${e.name}</td>
        <td style="padding: 6px 8px; border: 1px solid #e5e7eb; color: #4b5563;">${e.mobile || '-'}</td>
        <td style="padding: 6px 8px; border: 1px solid #e5e7eb; color: #4b5563;">${getOfficeNameMarathi(e.officeId, lang)}</td>
        <td style="text-align: right; padding: 6px 8px; border: 1px solid #e5e7eb; font-weight: 700; color: #374151;">${formatCurrency(e.initialAmount, lang)}</td>
        <td style="text-align: right; padding: 6px 8px; border: 1px solid #e5e7eb; color: #065f46; font-weight: 800;">${formatCurrency(e.paidAmount, lang)}</td>
        <td style="text-align: right; padding: 6px 8px; border: 1px solid #e5e7eb; color: #991b1b; font-weight: 900;">${formatCurrency(e.remainingAmount, lang)}</td>
        <td style="text-align: center; padding: 6px 8px; border: 1px solid #e5e7eb;">
          <span style="padding: 2px 8px; border-radius: 9999px; font-weight: 900; font-size: 9.5px;
            background-color: ${e.status === 'CLEARED' ? '#d1fae5' : '#fef3c7'};
            color: ${e.status === 'CLEARED' ? '#065f46' : '#92400e'}; border: 1px solid ${e.status === 'CLEARED' ? '#a7f3d0' : '#fde68a'};">
            ${e.status === 'CLEARED' ? (lang === 'EN' ? '✅ Cleared' : '✅ पूर्ण') : (lang === 'EN' ? '⏳ Pending' : '⏳ बाकी')}
          </span>
        </td>
        <td style="text-align: center; padding: 6px 8px; border: 1px solid #e5e7eb; color: #64748b; font-size: 9.5px;">${e.lastPaymentDate ? formatDateMarathi(e.lastPaymentDate, lang) : '-'}</td>
      </tr>`
    )
    .join('');

  const container = createPdfContainer(1122);
  container.innerHTML = `
    <div style="background: #ffffff; padding: 18px; border: 1px solid #cbd5e1; border-radius: 8px;">
      <!-- Title Header Bar (Warm Amber Theme) -->
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #78350f; padding-bottom: 8px; margin-bottom: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 14px; font-weight: 900; color: #78350f;">${lang === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h2>
          <h1 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 900; color: #451a03;">${title}</h1>
        </div>
        <div style="text-align: right; font-size: 11px; font-weight: 800; color: #78350f; line-height: 1.4;">
          <div>${lang === 'EN' ? 'Date: ' : 'दिनांक: '}<strong>${dateFormatted}</strong></div>
          <div>${lang === 'EN' ? 'Total Records: ' : 'एकूण नोंदी: '}<strong>${entries.length}</strong></div>
        </div>
      </div>

      <!-- 4 Overview Metric Cards -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 6px; margin-bottom: 12px;">
        <tr>
          <td style="width: 25%; background: #fffbeb; border: 1px solid #fde68a; padding: 8px 10px; border-radius: 8px; text-align: left;">
            <span style="font-size: 9.5px; font-weight: 800; color: #92400e; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Initial Dues' : 'एकूण मूळ थकबाकी'}</span>
            <span style="font-size: 17px; font-weight: 900; color: #78350f; margin-top: 2px; display: block;">${formatCurrency(totalInitial, lang)}</span>
          </td>
          <td style="width: 25%; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px 10px; border-radius: 8px; text-align: left;">
            <span style="font-size: 9.5px; font-weight: 800; color: #166534; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Total Paid' : 'एकूण जमा'}</span>
            <span style="font-size: 17px; font-weight: 900; color: #15803d; margin-top: 2px; display: block;">${formatCurrency(totalPaid, lang)}</span>
          </td>
          <td style="width: 25%; background: #fff1f2; border: 1px solid #fecdd3; padding: 8px 10px; border-radius: 8px; text-align: left;">
            <span style="font-size: 9.5px; font-weight: 800; color: #9f1239; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Balance Due' : 'शिल्लक बाकी'}</span>
            <span style="font-size: 17px; font-weight: 900; color: #be123c; margin-top: 2px; display: block;">${formatCurrency(totalRemaining, lang)}</span>
          </td>
          <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 8px; text-align: left;">
            <span style="font-size: 9.5px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block;">${lang === 'EN' ? 'Account Status' : 'खातेदार स्थिती'}</span>
            <span style="font-size: 17px; font-weight: 900; color: #0f172a; margin-top: 2px; display: block;">
              <span style="color: #92400e;">${pendingCount}</span> <span style="color: #94a3b8; font-size: 14px;">/</span> <span style="color: #15803d;">${clearedCount}</span>
            </span>
          </td>
        </tr>
      </table>

      <!-- 10-Column Data Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; font-weight: 700; border: 1px solid #cbd5e1;">
        <thead>
          <tr style="background-color: #78350f; color: #ffffff;">
            <th style="padding: 7px 6px; text-align: center; border: 1px solid #92400e; width: 35px;">${lang === 'EN' ? 'Sr.' : 'अ.क्र.'}</th>
            <th style="padding: 7px 8px; text-align: left; border: 1px solid #92400e; width: 65px;">${lang === 'EN' ? 'Acc No.' : 'खाते क्र.'}</th>
            <th style="padding: 7px 8px; text-align: left; border: 1px solid #92400e; width: 140px;">${lang === 'EN' ? 'Customer Name' : 'खातेदाराचे नाव'}</th>
            <th style="padding: 7px 8px; text-align: left; border: 1px solid #92400e; width: 85px;">${lang === 'EN' ? 'Mobile' : 'मोबाईल'}</th>
            <th style="padding: 7px 8px; text-align: left; border: 1px solid #92400e; width: 90px;">${lang === 'EN' ? 'Office' : 'कार्यालय'}</th>
            <th style="padding: 7px 8px; text-align: right; border: 1px solid #92400e; width: 95px;">${lang === 'EN' ? 'Initial (₹)' : 'मूळ थकबाकी (₹)'}</th>
            <th style="padding: 7px 8px; text-align: right; border: 1px solid #92400e; width: 95px;">${lang === 'EN' ? 'Paid (₹)' : 'जमा रक्कम (₹)'}</th>
            <th style="padding: 7px 8px; text-align: right; border: 1px solid #92400e; width: 95px;">${lang === 'EN' ? 'Balance (₹)' : 'शिल्लक बाकी (₹)'}</th>
            <th style="padding: 7px 8px; text-align: center; border: 1px solid #92400e; width: 75px;">${lang === 'EN' ? 'Status' : 'स्थिती'}</th>
            <th style="padding: 7px 8px; text-align: center; border: 1px solid #92400e; width: 80px;">${lang === 'EN' ? 'Last Payment' : 'शेवटची जमा'}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr style="background-color: #78350f; color: #ffffff; font-weight: 900; font-size: 10px;">
            <td colspan="5" style="padding: 8px; text-align: center; border: 1px solid #92400e;">
              ${lang === 'EN' ? 'TOTAL' : 'एकूण'} (${entries.length} ${lang === 'EN' ? 'Records' : 'नोंदी'})
            </td>
            <td style="padding: 8px; text-align: right; border: 1px solid #92400e;">${formatCurrency(totalInitial, lang)}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #92400e; color: #fde68a;">${formatCurrency(totalPaid, lang)}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #92400e; color: #fecdd3;">${formatCurrency(totalRemaining, lang)}</td>
            <td colspan="2" style="border: 1px solid #92400e; text-align: center;">-</td>
          </tr>
        </tfoot>
      </table>

      <!-- Footer Info and Signature -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; font-size: 10px; font-weight: 700; color: #64748b;">
        <div>
          <div>${lang === 'EN' ? 'Generated: ' : 'निर्मिती दिनांक: '} ${dateFormatted} &nbsp;|&nbsp; ${lang === 'EN' ? 'Computer Generated — Sushant Bishi Management System' : 'संगणकीकृत प्रत — सुषांत भिशी व्यवस्थापन प्रणाली'}</div>
        </div>
        <div style="text-align: center;">
          <div style="height: 25px;"></div>
          <div style="border-top: 2px solid #78350f; padding-top: 4px; min-width: 150px; color: #78350f; font-weight: 900;">${lang === 'EN' ? 'Authorized Signature' : 'अधिकृत स्वाक्षरी'}</div>
        </div>
      </div>
    </div>
  `;

  const filename = (lang === 'EN' ? 'ThakBaki_Report_' : 'थकबाकी_अहवाल_') + todayStr + '.pdf';
  await renderHtmlToMultiPagePdf(container, 'landscape', filename);
};
