/**
 * Professional Pharmacy Receipt Printer Utility
 * Outputs a clean, dedicated receipt document for thermal (80mm) and A4 printers
 * without application headers, sidebar, URLs, or browser UI artifacts.
 */

export interface ReceiptPrintItem {
  medicineName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unitName?: string | null;
}

export interface ReceiptPrintData {
  saleId: string;
  createdAt: string;
  customerName?: string | null;
  cashierName?: string | null;
  paymentMethod: string;
  items: ReceiptPrintItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  creditBalanceAfter?: number | null;
}

export function printReceiptDocument(
  data: ReceiptPrintData,
  options: { isArabic?: boolean } = {}
) {
  const isAr = options.isArabic ?? false;
  const dir = isAr ? "rtl" : "ltr";
  const currency = isAr ? "ج.م" : "EGP";

  const paymentLabels: Record<string, { en: string; ar: string }> = {
    cash: { en: "Cash", ar: "نقداً" },
    card: { en: "Credit / Debit Card", ar: "بطاقة بنكية" },
    wallet: { en: "Digital Wallet", ar: "محفظة إلكترونية" },
    insurance: { en: "Health Insurance", ar: "تأمين صحي" },
    credit: { en: "Credit / Pay Later", ar: "آجل / حساب ائتماني" },
  };

  const paymentMethodLabel =
    paymentLabels[data.paymentMethod.toLowerCase()]?.[isAr ? "ar" : "en"] ||
    data.paymentMethod.toUpperCase();

  const formattedDate = new Date(data.createdAt).toLocaleString(
    isAr ? "ar-EG" : "en-US",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );

  const receiptHtml = `
<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${isAr ? "فاتورة مبيعات" : "Sales Receipt"} - ${data.saleId.substring(0, 8).toUpperCase()}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 4mm 4mm;
    }
    @media print {
      body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", "Tahoma", sans-serif;
        font-size: 12px;
        line-height: 1.4;
      }
      .no-print {
        display: none !important;
      }
    }
    body {
      width: 100%;
      max-width: 76mm;
      margin: 0 auto;
      padding: 6px 2px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", "Tahoma", sans-serif;
      font-size: 12px;
      color: #111;
      direction: ${dir};
    }
    .text-center { text-align: center; }
    .text-end { text-align: ${isAr ? "left" : "right"}; }
    .text-start { text-align: ${isAr ? "right" : "left"}; }
    .bold { font-weight: 700; }
    .header {
      text-align: center;
      margin-bottom: 8px;
      border-bottom: 1px dashed #000;
      padding-bottom: 8px;
    }
    .pharmacy-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .pharmacy-subtitle {
      font-size: 11px;
      color: #333;
      margin-bottom: 2px;
    }
    .meta-table {
      width: 100%;
      font-size: 11px;
      margin-bottom: 8px;
      border-bottom: 1px dashed #000;
      padding-bottom: 6px;
    }
    .meta-table td {
      padding: 1.5px 0;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 8px;
    }
    .items-table th {
      border-bottom: 1px solid #000;
      padding: 3px 1px;
      text-align: ${isAr ? "right" : "left"};
      font-weight: 700;
    }
    .items-table td {
      padding: 3px 1px;
      vertical-align: top;
    }
    .items-table tr.item-row {
      border-bottom: 1px dotted #ccc;
    }
    .summary-section {
      border-top: 1px dashed #000;
      padding-top: 6px;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      font-weight: 800;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 4px 0;
      margin-top: 4px;
    }
    .credit-box {
      margin-top: 6px;
      padding: 4px;
      background: #f8f8f8;
      border: 1px solid #333;
      border-radius: 3px;
      font-size: 11px;
      text-align: center;
    }
    .footer {
      text-align: center;
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px dashed #000;
      font-size: 10px;
      color: #333;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="pharmacy-title">${isAr ? "صيدلية د. إيمان أمين" : "DR. EMAN AMEEN PHARMACY"}</div>
    <div class="pharmacy-subtitle">${isAr ? "رعاية صيدلانية متكاملة - خدمة 24 ساعة" : "Comprehensive Pharmaceutical Care"}</div>
    <div style="font-size: 10px; color: #555;">${isAr ? "المأمورية - الميزانية-دمياط" : "Al-Mamouria - Al-Mezania, Damietta, Egypt"}</div>
  </div>

  <table class="meta-table">
    <tr>
      <td class="bold">${isAr ? "رقم الفاتورة:" : "Receipt No:"}</td>
      <td class="text-end" style="font-family: monospace; font-size: 11px;">#${data.saleId.substring(0, 8).toUpperCase()}</td>
    </tr>
    <tr>
      <td>${isAr ? "التاريخ والوقت:" : "Date & Time:"}</td>
      <td class="text-end">${formattedDate}</td>
    </tr>
    <tr>
      <td>${isAr ? "العميل:" : "Customer:"}</td>
      <td class="text-end bold">${data.customerName || (isAr ? "عميل نقدي (مباشر)" : "Walk-in Customer")}</td>
    </tr>
    ${data.cashierName
      ? `<tr>
      <td>${isAr ? "الكاشير / الصيدلي:" : "Cashier:"}</td>
      <td class="text-end">${data.cashierName}</td>
    </tr>`
      : ""
    }
    <tr>
      <td>${isAr ? "طريقة الدفع:" : "Payment Method:"}</td>
      <td class="text-end bold">${paymentMethodLabel}</td>
    </tr>
  </table>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 50%;">${isAr ? "الصنف" : "Item"}</th>
        <th class="text-center" style="width: 15%;">${isAr ? "الكمية" : "Qty"}</th>
        <th class="text-end" style="width: 17%;">${isAr ? "السعر" : "Price"}</th>
        <th class="text-end" style="width: 18%;">${isAr ? "الإجمالي" : "Total"}</th>
      </tr>
    </thead>
    <tbody>
      ${data.items
      .map(
        (item) => `
      <tr class="item-row">
        <td>
          <div>${item.medicineName}</div>
          ${item.unitName ? `<div style="font-size: 10px; color: #555;">(${item.unitName})</div>` : ""}
        </td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-end">${Number(item.unitPrice).toFixed(2)}</td>
        <td class="text-end bold">${Number(item.totalPrice).toFixed(2)}</td>
      </tr>`
      )
      .join("")}
    </tbody>
  </table>

  <div class="summary-section">
    <div class="summary-row">
      <span>${isAr ? "المجموع الفرعي:" : "Subtotal:"}</span>
      <span>${Number(data.subtotal).toFixed(2)} ${currency}</span>
    </div>
    ${Number(data.discount) > 0
      ? `<div class="summary-row" style="color: #000;">
      <span>${isAr ? "الخصم الممنوح:" : "Discount:"}</span>
      <span>-${Number(data.discount).toFixed(2)} ${currency}</span>
    </div>`
      : ""
    }
    <div class="total-row">
      <span>${isAr ? "الإجمالي النهائي:" : "TOTAL DUE:"}</span>
      <span>${Number(data.totalAmount).toFixed(2)} ${currency}</span>
    </div>
  </div>

  ${data.paymentMethod === "credit" && data.creditBalanceAfter !== undefined && data.creditBalanceAfter !== null
      ? `
  <div class="credit-box">
    <div class="bold">${isAr ? "حساب آجل (ذمم مدينة)" : "Credit / Pay Later Sale"}</div>
    <div>${isAr ? "الرصيد المتبقي المستحق على العميل:" : "Current Outstanding Debt:"} <b>${Number(data.creditBalanceAfter).toFixed(2)} ${currency}</b></div>
  </div>`
      : ""
    }

  <div class="footer">
    <div class="bold">${isAr ? "نتمنى لكم دوام الصحة والشفاء العاجل" : "Wishing you speedy recovery & good health!"}</div>
    <div style="margin-top: 2px;">${isAr ? "يرجى الاحتفاظ بالإيصال في حال الاسترجاع أو الاستبدال" : "Please retain this receipt for returns within policy terms."}</div>
  </div>
</body>
</html>
  `;

  // Create an isolated hidden iframe for printing
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(receiptHtml);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch {
      // Fallback
    } finally {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch { }
      }, 1000);
    }
  }, 250);
}
