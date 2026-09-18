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
import { calculateCustomerFinancials, calculateLoanDueInterest, getLoanRemainingPrincipal } from '../utils/calculations';
import { StorageService } from './db';
import { calculateMemberLedger } from './ledger';

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
  container.style.fontFamily = "'Noto Sans Devanagari', 'Mukta', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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
 * Includes customer info, financial cards, complete collection table with totals,
 * loan details & payment history, and signature authorization.
 */
export const generateCustomerPDF = async (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  loanPayments: LoanPayment[] = []
) => {
  // A4 Portrait target width: 794px
  const container = createPdfContainer(794);

  const financials = calculateCustomerFinancials(customer, collections, loan);
  const customerCollections = collections
    .filter((c) => c.customerId === customer.id)
    .sort((a, b) => a.periodIndex - b.periodIndex);
  const todayStr = formatDateMarathi(new Date().toISOString().split('T')[0]);

  const effectiveLoanPayments = loanPayments.length > 0 ? loanPayments : StorageService.getLoanPayments();
  const customerLoanPayments = effectiveLoanPayments.filter(
    (lp: LoanPayment) => lp.customerId === customer.id || (loan && lp.loanId === loan.id)
  );
  const totalLoanInterestPaid = customerLoanPayments.reduce(
    (sum: number, lp: LoanPayment) => sum + (Number(lp.interestPaid) || 0),
    0
  );
  const totalLoanPrincipalPaid = customerLoanPayments.reduce(
    (sum: number, lp: LoanPayment) => sum + (Number(lp.paidAmount) || 0),
    0
  );
  const totalLoanDiscount = customerLoanPayments.reduce(
    (sum: number, lp: LoanPayment) => sum + (Number(lp.discountAmount) || 0),
    0
  );

  const loanDueInterest = loan ? calculateLoanDueInterest(loan) : 0;

  // Table Totals
  const totalExpected = customerCollections.reduce((sum, c) => sum + (c.expectedAmount || 0), 0);
  const totalCollected = customerCollections.reduce((sum, c) => sum + (c.collectedAmount || 0), 0);
  const totalRemaining = customerCollections.reduce((sum, c) => sum + (c.remainingAmount || 0), 0);
  const totalInterest = customerCollections.reduce((sum, c) => sum + (c.interestAmount || 0), 0);
  const totalPenalty = customerCollections.reduce((sum, c) => sum + (c.penaltyAmount || 0), 0);

  container.innerHTML = `
    <div style="border: 3px double #8B4513; padding: 20px; background: #fffdfa; border-radius: 8px;">
      <!-- Title Header Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8B4513; padding-bottom: 8px; margin-bottom: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 14px; font-weight: 900; color: #8B4513;">सुषांत भिशी</h2>
          <h1 style="margin: 2px 0 0 0; font-size: 19px; font-weight: 900; color: #5c3a21;">खातेदार व्यवहार अहवाल (Customer Account Statement)</h1>
        </div>
        <div style="text-align: right; font-size: 11px; font-weight: 800; color: #5c3a21;">
          <div>कार्यालय: ${getOfficeNameMarathi(customer.officeId)}</div>
          <div>दिनांक: ${todayStr}</div>
        </div>
      </div>

      <!-- Customer Details Meta Grid Box (Brown Register Look) -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-weight: 800; margin-bottom: 12px;">
        <tr>
          <td style="width: 14%; background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">खाते नंबर:</td>
          <td style="width: 36%; background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-size: 13px; color: #0f172a;">${customer.accountNumber}</td>
          <td style="width: 16%; background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">खातेदाराचे नाव:</td>
          <td style="width: 34%; background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-size: 13px; color: #0f172a;">${customer.name}</td>
        </tr>
        <tr>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">हप्ता रुपये:</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; color: #166534;">₹${customer.amount} (${getModalityShort(customer.modality)})</td>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">पत्ता / मोबाईल:</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a;">${customer.address || '-'} (${customer.mobile})</td>
        </tr>
        <tr>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">भिशी योजना:</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a;">${getBishiNameMarathi(customer.bishiType)}</td>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">सद्यस्थिती:</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-weight: 800; color: ${financials.isBishiCompleted ? '#166534' : '#8B4513'};">${financials.isBishiCompleted ? 'पूर्ण (Completed)' : 'सुरू (Active)'}</td>
        </tr>
      </table>

      <!-- Financial Summary Cards (Warm Register Look) -->
      <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 12px;">
        <div style="background: #fffde7; border: 1px solid #b8a99a; padding: 6px; border-radius: 6px; text-align: center;">
          <span style="font-size: 9px; font-weight: 700; color: #5c3a21; display: block;">अपेक्षित भिशी</span>
          <span style="font-size: 12px; font-weight: 900; color: #0f172a;">${formatCurrency(financials.totalExpectedBishi)}</span>
        </div>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px; border-radius: 6px; text-align: center;">
          <span style="font-size: 9px; font-weight: 700; color: #166534; display: block;">एकूण जमा</span>
          <span style="font-size: 12px; font-weight: 900; color: #15803d;">${formatCurrency(financials.totalCollectedBishi)}</span>
        </div>
        <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 6px; border-radius: 6px; text-align: center;">
          <span style="font-size: 9px; font-weight: 700; color: #9f1239; display: block;">उरलेली बाकी</span>
          <span style="font-size: 12px; font-weight: 900; color: #be123c;">${formatCurrency(financials.totalRemainingBishi)}</span>
        </div>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 6px; border-radius: 6px; text-align: center;">
          <span style="font-size: 9px; font-weight: 700; color: #1e40af; display: block;">एकूण व्याज</span>
          <span style="font-size: 12px; font-weight: 900; color: #1d4ed8;">${formatCurrency(financials.totalInterest)}</span>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 6px; border-radius: 6px; text-align: center;">
          <span style="font-size: 9px; font-weight: 700; color: #92400e; display: block;">एकूण दंड</span>
          <span style="font-size: 12px; font-weight: 900; color: #b45309;">${formatCurrency(financials.totalPenalty)}</span>
        </div>
        <div style="background: #8B4513; padding: 6px; border-radius: 6px; text-align: center; color: #ffffff;">
          <span style="font-size: 9px; font-weight: 700; color: #f5e6d3; display: block;">एकूण देय</span>
          <span style="font-size: 12px; font-weight: 900; color: #ffffff;">${formatCurrency(financials.totalPayableBishi)}</span>
        </div>
      </div>

      <!-- Transaction History Table -->
      <div style="margin-bottom: 12px;">
        <h3 style="font-size: 12px; font-weight: 800; color: #5c3a21; margin: 0 0 6px 0; display: flex; justify-content: space-between;">
          <span>भिशी व्यवहार इतिहास (${customer.modality === 'W' ? 'साप्ताहिक' : 'मासिक'})</span>
          <span style="font-size: 11px; color: #8B4513; font-weight: 700;">एकूण हप्ते: ${customerCollections.length}</span>
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; font-weight: 600; border: 1px solid #8B4513;">
          <thead>
            <tr style="background: #f5e6d3; color: #333333; font-weight: 900;">
              <th style="padding: 5px 3px; border: 1px solid #8B4513; text-align: center; width: 30px;">क्र.</th>
              <th style="padding: 5px 4px; border: 1px solid #8B4513; text-align: center; width: 80px;">देय तारीख</th>
              <th style="padding: 5px 6px; border: 1px solid #8B4513; text-align: right; width: 75px;">अपेक्षित (₹)</th>
              <th style="padding: 5px 6px; border: 1px solid #8B4513; text-align: right; width: 75px;">जमा (₹)</th>
              <th style="padding: 5px 6px; border: 1px solid #8B4513; text-align: right; width: 75px;">बाकी (₹)</th>
              <th style="padding: 5px 4px; border: 1px solid #8B4513; text-align: right; width: 60px;">व्याज (₹)</th>
              <th style="padding: 5px 4px; border: 1px solid #8B4513; text-align: right; width: 60px;">दंड (₹)</th>
              <th style="padding: 5px 4px; border: 1px solid #8B4513; text-align: center; width: 65px;">पद्धत</th>
              <th style="padding: 5px 4px; border: 1px solid #8B4513; text-align: center; width: 70px;">स्थिती</th>
            </tr>
          </thead>
          <tbody>
            ${customerCollections
              .map(
                (item, idx) => `
              <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#fcf8f2'};">
                <td style="padding: 4px 3px; border: 1px solid #b8a99a; text-align: center; font-weight: 700;">${idx + 1}</td>
                <td style="padding: 4px 4px; border: 1px solid #b8a99a; text-align: center; font-weight: 700;">${formatDateMarathi(item.dueDate)}</td>
                <td style="padding: 4px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 700; color: #334155;">${formatCurrency(item.expectedAmount)}</td>
                <td style="padding: 4px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 800; color: #15803d;">${formatCurrency(item.collectedAmount)}</td>
                <td style="padding: 4px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 900; color: #be123c;">${formatCurrency(item.remainingAmount)}</td>
                <td style="padding: 4px 4px; border: 1px solid #b8a99a; text-align: right; color: #475569;">${formatCurrency(item.interestAmount)}</td>
                <td style="padding: 4px 4px; border: 1px solid #b8a99a; text-align: right; font-weight: 700; color: #b45309;">${formatCurrency(item.penaltyAmount)}</td>
                <td style="padding: 4px 4px; border: 1px solid #b8a99a; text-align: center; color: #475569;">${
                  item.paymentMode === 'ONLINE' ? 'ऑनलाइन' : item.paymentMode === 'BANK' ? 'बँक' : 'नगद'
                }</td>
                <td style="padding: 4px 4px; border: 1px solid #b8a99a; text-align: center;">
                  <span style="display: inline-block; padding: 2px 5px; border-radius: 4px; font-size: 9px; font-weight: 800; background: ${
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
          <tfoot>
            <tr style="background: #8B4513; color: #ffffff; font-weight: 900; font-size: 10px;">
              <td style="padding: 5px 3px; border: 1px solid #5c3a21; text-align: center;">-</td>
              <td style="padding: 5px 4px; border: 1px solid #5c3a21; text-align: center;">एकूण (TOTAL)</td>
              <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right;">${formatCurrency(totalExpected)}</td>
              <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right;">${formatCurrency(totalCollected)}</td>
              <td style="padding: 5px 6px; border: 1px solid #5c3a21; text-align: right;">${formatCurrency(totalRemaining)}</td>
              <td style="padding: 5px 4px; border: 1px solid #5c3a21; text-align: right;">${formatCurrency(totalInterest)}</td>
              <td style="padding: 5px 4px; border: 1px solid #5c3a21; text-align: right;">${formatCurrency(totalPenalty)}</td>
              <td style="padding: 5px 4px; border: 1px solid #5c3a21; text-align: center;">-</td>
              <td style="padding: 5px 4px; border: 1px solid #5c3a21; text-align: center;">-</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Loan Section (If Applicable) -->
      ${
        customer.hasLoan && loan
          ? `
        <div style="margin-bottom: 12px; border: 1px solid #8B4513; border-radius: 8px; background: #fffdfa; padding: 10px;">
          <h3 style="font-size: 12px; font-weight: 800; color: #5c3a21; margin: 0 0 6px 0;">कर्जाचा तपशील (Loan Summary)</h3>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 10px; font-weight: 700; margin-bottom: 8px;">
            <div style="background: #fffde7; padding: 4px 6px; border: 1px solid #b8a99a; border-radius: 4px;"><span style="color: #5c3a21;">कर्ज रक्कम:</span> <strong style="color: #8B4513; font-size: 11px;">${formatCurrency(loan.principalAmount)}</strong></div>
            <div style="background: #fffde7; padding: 4px 6px; border: 1px solid #b8a99a; border-radius: 4px;"><span style="color: #5c3a21;">व्याज दर:</span> <strong style="color: #8B4513;">${loan.interestRate}%</strong></div>
            <div style="background: #fffde7; padding: 4px 6px; border: 1px solid #b8a99a; border-radius: 4px;"><span style="color: #5c3a21;">एकूण देय:</span> <strong>${formatCurrency(loan.totalPayable)}</strong></div>
            <div style="background: #fffde7; padding: 4px 6px; border: 1px solid #b8a99a; border-radius: 4px;"><span style="color: #5c3a21;">तारीख:</span> <strong>${formatDateMarathi(loan.issueDate)}</strong></div>
            <div style="background: #f0fdf4; padding: 4px 6px; border: 1px solid #bbf7d0; border-radius: 4px;"><span style="color: #166534;">भरलेली मुद्दल:</span> <strong style="color: #15803d; font-size: 11px;">${formatCurrency(totalLoanPrincipalPaid)}</strong></div>
            <div style="background: #fffbeb; padding: 4px 6px; border: 1px solid #fde68a; border-radius: 4px;"><span style="color: #92400e;">भरलेले व्याज:</span> <strong style="color: #b45309; font-size: 11px;">${formatCurrency(totalLoanInterestPaid)}</strong></div>
            <div style="background: #fff1f2; padding: 4px 6px; border: 1px solid #fecdd3; border-radius: 4px;"><span style="color: #9f1239;">कर्ज बाकी मुद्दल:</span> <strong style="color: #be123c; font-size: 11px;">${formatCurrency(loan.remainingAmount)}</strong></div>
            <div style="background: #fffde7; padding: 4px 6px; border: 1px solid #b8a99a; border-radius: 4px;"><span style="color: #5c3a21;">कर्ज स्थिती:</span> <strong style="color: ${loan.status === 'ACTIVE' ? '#c2410c' : '#15803d'};">${loan.status === 'ACTIVE' ? 'सुरू' : 'पूर्ण बंद'}</strong></div>
          </div>

          ${
            customerLoanPayments.length > 0
              ? `
            <div style="border-top: 1px solid #8B4513; padding-top: 6px; margin-top: 6px;">
              <h4 style="font-size: 11px; font-weight: 800; color: #5c3a21; margin: 4px 0 4px 0;">कर्ज भरणा इतिहास (Loan Payment History)</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 9px; font-weight: 600; border: 1px solid #8B4513;">
                <thead>
                  <tr style="background: #faebd7; color: #333333; font-weight: 900;">
                    <th style="padding: 4px; text-align: center; width: 30px; border: 1px solid #8B4513;">क्र.</th>
                    <th style="padding: 4px 6px; text-align: center; width: 80px; border: 1px solid #8B4513;">दिनांक</th>
                    <th style="padding: 4px 6px; text-align: right; width: 85px; border: 1px solid #8B4513;">भरलेली मुद्दल (₹)</th>
                    <th style="padding: 4px 6px; text-align: right; width: 85px; border: 1px solid #8B4513;">भरलेले व्याज (₹)</th>
                    <th style="padding: 4px 6px; text-align: right; width: 70px; border: 1px solid #8B4513;">सूट (₹)</th>
                    <th style="padding: 4px 6px; text-align: right; width: 85px; border: 1px solid #8B4513;">बाकी मुद्दल (₹)</th>
                    <th style="padding: 4px 4px; text-align: center; width: 65px; border: 1px solid #8B4513;">पद्धत</th>
                    <th style="padding: 4px 6px; text-align: left; border: 1px solid #8B4513;">टीप</th>
                  </tr>
                </thead>
                <tbody>
                  ${customerLoanPayments
                    .map(
                      (lp, idx) => `
                    <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#fcf8f2'};">
                      <td style="padding: 3px; border: 1px solid #b8a99a; text-align: center;">${idx + 1}</td>
                      <td style="padding: 3px 6px; border: 1px solid #b8a99a; text-align: center; font-weight: 700;">${formatDateMarathi(lp.paymentDate)}</td>
                      <td style="padding: 3px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 800; color: #15803d;">${formatCurrency(lp.paidAmount)}</td>
                      <td style="padding: 3px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 800; color: #b45309;">${formatCurrency(lp.interestPaid)}</td>
                      <td style="padding: 3px 6px; border: 1px solid #b8a99a; text-align: right; color: #475569;">${lp.discountAmount ? formatCurrency(lp.discountAmount) : '-'}</td>
                      <td style="padding: 3px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 800; color: #be123c;">${formatCurrency(lp.remainingLoan)}</td>
                      <td style="padding: 3px 4px; border: 1px solid #b8a99a; text-align: center; color: #475569;">${lp.paymentMode === 'ONLINE' ? 'ऑनलाइन' : 'नगद'}</td>
                      <td style="padding: 3px 6px; border: 1px solid #b8a99a; color: #64748b;">${lp.note || '-'}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
                <tfoot>
                  <tr style="background: #8B4513; color: #ffffff; font-weight: 900; font-size: 9px;">
                    <td style="padding: 4px; text-align: center; border: 1px solid #5c3a21;">-</td>
                    <td style="padding: 4px 6px; text-align: center; border: 1px solid #5c3a21;">एकूण</td>
                    <td style="padding: 4px 6px; text-align: right; border: 1px solid #5c3a21;">${formatCurrency(totalLoanPrincipalPaid)}</td>
                    <td style="padding: 4px 6px; text-align: right; border: 1px solid #5c3a21;">${formatCurrency(totalLoanInterestPaid)}</td>
                    <td style="padding: 4px 6px; text-align: right; border: 1px solid #5c3a21;">${formatCurrency(totalLoanDiscount)}</td>
                    <td style="padding: 4px 6px; text-align: right; border: 1px solid #5c3a21;">${formatCurrency(loan.remainingAmount)}</td>
                    <td style="padding: 4px 4px; text-align: center; border: 1px solid #5c3a21;">-</td>
                    <td style="padding: 4px 6px; border: 1px solid #5c3a21;">-</td>
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

      <!-- Footer Notes & Signature Block (matching Image 1) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14px; font-size: 11px; font-weight: 700;">
        <div style="border: 1px solid #8B4513; padding: 6px 12px; border-radius: 6px; background: #fffde7; min-width: 220px; line-height: 1.5;">
          <div>१) टाकणी: ___________________</div>
          <div>२) डिव्हिडंड: ___________________</div>
          <div>३) खाते नं.: <strong>${customer.accountNumber}</strong></div>
          <div>४) शेरा: ___________________</div>
        </div>

        <div style="text-align: right; padding-right: 16px;">
          <p style="margin: 0 0 25px 0; color: #5c3a21; font-size: 10px;">सदर भिशीची रक्कम मिळाल्या बद्दल...</p>
          <div style="font-weight: 900; font-size: 12px; border-top: 1px solid #8B4513; padding-top: 4px; display: inline-block; min-width: 150px; text-align: center; color: #5c3a21;">
            सेक्रेटरी / अध्यक्ष
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
 * Landscape layout with 11 aligned columns, zebra striping, and full totals.
 */
export const generateReportPDF = async (
  title: string,
  officeName: string,
  bishiName: string,
  customers: Customer[],
  collections: CollectionEntry[]
) => {
  // A4 Landscape target width: 1122px
  const container = createPdfContainer(1122);

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
    <div style="border: 3px double #8B4513; padding: 20px; background: #fffdfa; border-radius: 8px;">
      <!-- Title Header Bar -->
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #8B4513; padding-bottom: 10px; margin-bottom: 14px;">
        <div>
          <h2 style="margin: 0; font-size: 14px; font-weight: 900; color: #8B4513;">सुषांत भिशी</h2>
          <h1 style="margin: 2px 0 0 0; font-size: 19px; font-weight: 900; color: #5c3a21;">${title}</h1>
        </div>
        <div style="text-align: right; font-size: 11px; font-weight: 800; color: #5c3a21; line-height: 1.5;">
          <div>कार्यालय: <strong>${officeName}</strong> | भिशी योजना: <strong>${bishiName}</strong></div>
          <div>दिनांक: <strong>${todayStr}</strong> | एकूण खातेदार: <strong>${customers.length}</strong></div>
        </div>
      </div>

      <!-- Summary Report Data Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-weight: 700; border: 1px solid #8B4513;">
        <thead>
          <tr style="background: #f5e6d3; color: #333333; font-weight: 900;">
            <th style="padding: 7px 4px; border: 1px solid #8B4513; text-align: center; width: 35px;">अ.क्र.</th>
            <th style="padding: 7px 6px; border: 1px solid #8B4513; text-align: center; width: 75px;">खाते क्र.</th>
            <th style="padding: 7px 8px; border: 1px solid #8B4513; text-align: left;">खातेदाराचे नाव</th>
            <th style="padding: 7px 6px; border: 1px solid #8B4513; text-align: center; width: 95px;">मोबाईल</th>
            <th style="padding: 7px 6px; border: 1px solid #8B4513; text-align: center; width: 80px;">प्रकार</th>
            <th style="padding: 7px 6px; border: 1px solid #8B4513; text-align: center; width: 65px;">पद्धत</th>
            <th style="padding: 7px 8px; border: 1px solid #8B4513; text-align: right; width: 95px;">अपेक्षित (₹)</th>
            <th style="padding: 7px 8px; border: 1px solid #8B4513; text-align: right; width: 95px;">जमा (₹)</th>
            <th style="padding: 7px 8px; border: 1px solid #8B4513; text-align: right; width: 95px;">बाकी (₹)</th>
            <th style="padding: 7px 8px; border: 1px solid #8B4513; text-align: right; width: 100px;">व्याज/दंड (₹)</th>
            <th style="padding: 7px 6px; border: 1px solid #8B4513; text-align: center; width: 85px;">स्थिती</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, idx) => `
            <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#fcf8f2'};">
              <td style="padding: 6px 4px; border: 1px solid #b8a99a; text-align: center; font-weight: 700;">${idx + 1}</td>
              <td style="padding: 6px 6px; border: 1px solid #b8a99a; text-align: center; font-weight: 800; color: #0f172a;">${r.cust.accountNumber}</td>
              <td style="padding: 6px 8px; border: 1px solid #b8a99a; font-weight: 800; color: #1e293b;">${r.cust.name}</td>
              <td style="padding: 6px 6px; border: 1px solid #b8a99a; text-align: center; color: #475569;">${r.cust.mobile}</td>
              <td style="padding: 6px 6px; border: 1px solid #b8a99a; text-align: center; color: #475569;">${getBishiNameMarathi(r.cust.bishiType)}</td>
              <td style="padding: 6px 6px; border: 1px solid #b8a99a; text-align: center; color: #475569;">${r.cust.modality === 'W' ? 'साप्ताहिक' : 'मासिक'}</td>
              <td style="padding: 6px 8px; border: 1px solid #b8a99a; text-align: right; font-weight: 700; color: #334155;">${formatCurrency(r.exp)}</td>
              <td style="padding: 6px 8px; border: 1px solid #b8a99a; text-align: right; font-weight: 800; color: #15803d;">${formatCurrency(r.coll)}</td>
              <td style="padding: 6px 8px; border: 1px solid #b8a99a; text-align: right; font-weight: 900; color: #be123c;">${formatCurrency(r.rem)}</td>
              <td style="padding: 6px 8px; border: 1px solid #b8a99a; text-align: right; font-weight: 700; color: #64748b;">
                ${r.int > 0 ? `<span style="color: #1d4ed8;">व्याज: ${formatCurrency(r.int)}</span><br>` : ''}
                ${r.pen > 0 ? `<span style="color: #b45309;">दंड: ${formatCurrency(r.pen)}</span>` : ''}
                ${r.int === 0 && r.pen === 0 ? '-' : ''}
              </td>
              <td style="padding: 6px 6px; border: 1px solid #b8a99a; text-align: center;">
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
          <tr style="background: #8B4513; color: #ffffff; font-weight: 900; font-size: 11px;">
            <td style="padding: 8px 4px; border: 1px solid #5c3a21; text-align: center;">-</td>
            <td style="padding: 8px 6px; border: 1px solid #5c3a21; text-align: center;">एकूण</td>
            <td style="padding: 8px 8px; border: 1px solid #5c3a21;">एकूण खातेदार: ${customers.length}</td>
            <td style="padding: 8px 6px; border: 1px solid #5c3a21;">-</td>
            <td style="padding: 8px 6px; border: 1px solid #5c3a21;">-</td>
            <td style="padding: 8px 6px; border: 1px solid #5c3a21;">-</td>
            <td style="padding: 8px 8px; border: 1px solid #5c3a21; text-align: right;">${formatCurrency(totalExp)}</td>
            <td style="padding: 8px 8px; border: 1px solid #5c3a21; text-align: right;">${formatCurrency(totalColl)}</td>
            <td style="padding: 8px 8px; border: 1px solid #5c3a21; text-align: right;">${formatCurrency(totalRem)}</td>
            <td style="padding: 8px 8px; border: 1px solid #5c3a21; text-align: right;">${formatCurrency(totalInt + totalPen)}</td>
            <td style="padding: 8px 6px; border: 1px solid #5c3a21; text-align: center;">-</td>
          </tr>
        </tfoot>
      </table>

      <!-- Footer Info and Signature -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; font-size: 11px; font-weight: 700; color: #5c3a21;">
        <div>
          <div>अहवाल निर्मिती: ${todayStr} | संगणकीकृत प्रत: सुषांत भिशी व्यवस्थापन</div>
        </div>
        <div style="text-align: center;">
          <div style="height: 30px;"></div>
          <div style="border-top: 1px solid #8B4513; padding-top: 4px; min-width: 150px; color: #5c3a21; font-weight: 900;">अधिकृत स्वाक्षरी</div>
        </div>
      </div>
    </div>
  `;

  await renderHtmlToMultiPagePdf(
    container,
    'landscape',
    `${title.replace(/\s+/g, '_')}_मराठी_अहवाल.pdf`
  );
};

/**
 * Generate PDF for Member Ledger Card (खातेदार खाते उतारा)
 * Exactly matches the authentic physical register passbook in Landscape A4 format.
 * Features 11 aligned columns, two-tier header, complete totals, and notes box.
 */
export const generateMemberLedgerPDF = async (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  loanPayments: LoanPayment[] = [],
  showAllWeeks: boolean = false
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

  const tableRowsHtml = ledgerCalculation.rows.length === 0
    ? `<tr><td colspan="11" style="padding: 18px; text-align: center; color: #64748b; font-weight: 700; border: 1px solid #b8a99a;">या खातेदाराची अद्याप कोणतीही पूर्ण जमा नोंद झालेली नाही.</td></tr>`
    : ledgerCalculation.rows
        .map((row, idx) => {
          return `
            <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#fcf8f2'};">
              <td style="padding: 5px 4px; border: 1px solid #b8a99a; text-align: center; font-weight: 700;">${row.srNo}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: center; font-weight: 700;">${formatDateMarathi(row.date)}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 800; color: #15803d;">${row.deposit > 0 ? row.deposit : '-'}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 900; color: #0b5c45;">${row.cumulativeDeposit > 0 ? row.cumulativeDeposit : '-'}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #be123c;">${row.bishiPenalty > 0 ? row.bishiPenalty : '-'}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 700;">${row.expected > 0 ? row.expected : '-'}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #c2410c; font-weight: 700;">${row.loanIssued > 0 ? row.loanIssued : '-'}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #15803d; font-weight: 800;">${row.loanPrincipalPaid > 0 ? row.loanPrincipalPaid : '-'}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #15803d; font-weight: 800;">${row.loanInterestPaid > 0 ? row.loanInterestPaid : '-'}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; color: #be123c;">${row.loanPenalty > 0 ? row.loanPenalty : '-'}</td>
              <td style="padding: 5px 6px; border: 1px solid #b8a99a; text-align: right; font-weight: 900; color: #be123c;">${row.balanceRemaining > 0 ? row.balanceRemaining : '0'}</td>
            </tr>
          `;
        })
        .join('');

  container.innerHTML = `
    <div style="border: 3px double #8B4513; padding: 20px; background: #fffdfa; border-radius: 8px;">
      <!-- Title Header Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8B4513; padding-bottom: 8px; margin-bottom: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 14px; font-weight: 900; color: #8B4513;">सुषांत भिशी</h2>
          <h1 style="margin: 2px 0 0 0; font-size: 19px; font-weight: 900; color: #5c3a21;">खातेदार खाते उतारा (Member Ledger Card Register)</h1>
        </div>
        <div style="text-align: right; font-size: 11px; font-weight: 800; color: #5c3a21;">
          <div>कार्यालय: ${getOfficeNameMarathi(customer.officeId)}</div>
          <div>दिनांक: ${formatDateMarathi(new Date().toISOString().split('T')[0])}</div>
        </div>
      </div>

      <!-- Customer Meta Grid Box (Brown Register Look) -->
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; font-weight: 800; margin-bottom: 12px;">
        <tr>
          <td style="width: 14%; background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">खाते नंबर:</td>
          <td style="width: 36%; background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-size: 14px; color: #0f172a;">${customer.accountNumber}</td>
          <td style="width: 16%; background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">खातेदाराचे नाव:</td>
          <td style="width: 34%; background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; font-size: 14px; color: #0f172a;">${customer.name}</td>
        </tr>
        <tr>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">हप्ता रुपये:</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a; color: #166534;">₹${customer.amount} (${customer.modality === 'W' ? 'साप्ताहिक' : 'मासिक'})</td>
          <td style="background: #8B4513; color: white; padding: 6px 8px; border: 1px solid #8B4513;">पत्ता / मोबाईल:</td>
          <td style="background: #fffde7; padding: 6px 8px; border: 1px solid #b8a99a;">${customer.address || '-'} (${customer.mobile})</td>
        </tr>
      </table>

      <!-- Ledger Register 11-Column Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-weight: 700; border: 1px solid #8B4513;">
        <thead>
          <tr style="background: #f5e6d3; color: #333333; font-weight: 900; text-align: center;">
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px 4px; width: 40px;">अ. क्र.</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px; width: 85px;">तारीख</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px; width: 100px;">खात्यात जमा रुपये</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px; width: 100px;">एकूण जमा रुपये</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px; width: 65px;">दंड</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px; width: 75px;">देणे</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px; width: 95px;">दिलेले कर्ज</th>
            <th colspan="2" style="border: 1px solid #8B4513; padding: 5px;">कर्ज परत फेड</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px; width: 65px;">दंड</th>
            <th rowspan="2" style="border: 1px solid #8B4513; padding: 6px; width: 95px;">देणे बाकी</th>
          </tr>
          <tr style="background: #faebd7; color: #333333; font-weight: 900; text-align: center;">
            <th style="border: 1px solid #8B4513; padding: 5px; width: 85px;">कर्ज (मुद्दल)</th>
            <th style="border: 1px solid #8B4513; padding: 5px; width: 85px;">व्याज</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #8B4513; color: #ffffff; font-weight: 900; font-size: 11px;">
            <td style="padding: 6px 4px; border: 1px solid #5c3a21; text-align: center;">-</td>
            <td style="padding: 6px 8px; border: 1px solid #5c3a21; text-align: center;">एकूण</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalDeposit > 0 ? ledgerCalculation.totalDeposit : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalCumulativeDeposit > 0 ? ledgerCalculation.totalCumulativeDeposit : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalBishiPenalty > 0 ? ledgerCalculation.totalBishiPenalty : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalExpected > 0 ? ledgerCalculation.totalExpected : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalLoanIssued > 0 ? ledgerCalculation.totalLoanIssued : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalLoanPrincipalPaid > 0 ? ledgerCalculation.totalLoanPrincipalPaid : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalLoanInterestPaid > 0 ? ledgerCalculation.totalLoanInterestPaid : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.totalLoanPenalty > 0 ? ledgerCalculation.totalLoanPenalty : '-'}</td>
            <td style="padding: 6px 6px; border: 1px solid #5c3a21; text-align: right;">${ledgerCalculation.finalRemainingBalance > 0 ? ledgerCalculation.finalRemainingBalance : '0'}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Footer Notes & Signature Block -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; font-size: 11px; font-weight: 700;">
        <div style="border: 1px solid #8B4513; padding: 8px 14px; border-radius: 6px; background: #fffde7; min-width: 240px; line-height: 1.6;">
          <div>१) टाकणी: ___________________</div>
          <div>२) डिव्हिडंड: ___________________</div>
          <div>३) खाते नं.: <strong>${customer.accountNumber}</strong></div>
          <div>४) शेरा: ___________________</div>
        </div>

        <div style="text-align: right; padding-right: 20px;">
          <p style="margin: 0 0 35px 0; color: #475569;">सदर भिशीची रक्कम मिळाल्या बद्दल...</p>
          <div style="font-weight: 900; font-size: 13px; border-top: 1px solid #333; padding-top: 4px; display: inline-block; min-width: 160px; text-align: center; color: #0f172a;">
            सेक्रेटरी / अध्यक्ष
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
