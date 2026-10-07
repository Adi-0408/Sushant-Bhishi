"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsappTemplate = sendWhatsappTemplate;
exports.sendCollectionConfirmation = sendCollectionConfirmation;
exports.sendCollectionReminder = sendCollectionReminder;
exports.sendThakbakiReminder = sendThakbakiReminder;
const API_KEY = '305b2241e64b47b336d3eb0a69fd944257d48a1aa2f24c64b0b82369b83a2dcf';
const BASE_URL = 'https://app.itplconnect.com/api/v1';
async function sendWhatsappTemplate(phone, templateName, variables) {
    if (!phone)
        return;
    // Format phone number to start with 91 if it's a 10-digit Indian number
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
        formattedPhone = `91${formattedPhone}`;
    }
    const payload = {
        phone: formattedPhone,
        template_name: templateName,
        language: 'en_US', // Replace with your approved template's language if different (e.g., mr for Marathi, hi for Hindi)
        variables,
    };
    try {
        const response = await fetch(`${BASE_URL}/messages/template`, {
            method: 'POST',
            headers: {
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        console.log(`[WhatsApp API] Sent ${templateName} to ${formattedPhone}`, data);
        return data;
    }
    catch (error) {
        console.error(`[WhatsApp API] Error sending to ${formattedPhone}`, error);
        // Don't throw to prevent breaking the main flow
    }
}
/**
 * Sends a confirmation when a collection is successfully made.
 */
async function sendCollectionConfirmation(phone, customerName, totalCollected, totalRemaining, installmentRequired) {
    // Important: You must have an approved template named 'collection_confirmation' in ITPL Connect
    // Example template body: "Hello {{1}}, we received your collection. Total collected: Rs. {{2}}. Total remaining: Rs. {{3}}. Next required installment: Rs. {{4}}."
    const variables = [
        customerName,
        String(totalCollected),
        String(totalRemaining),
        String(installmentRequired),
    ];
    return sendWhatsappTemplate(phone, 'collection_confirmation', variables);
}
/**
 * Sends a reminder 1 or 2 days before the collection date.
 */
async function sendCollectionReminder(phone, customerName, installmentRequired, dueDate) {
    // Important: You must have an approved template named 'collection_reminder' in ITPL Connect
    // Example template body: "Hello {{1}}, this is a reminder for your upcoming collection of Rs. {{2}} due on {{3}}."
    const variables = [
        customerName,
        String(installmentRequired),
        dueDate,
    ];
    return sendWhatsappTemplate(phone, 'collection_reminder', variables);
}
/**
 * Sends a reminder for Thakbaki (Arrears).
 */
async function sendThakbakiReminder(phone, customerName, remainingAmount) {
    // Important: You must have an approved template named 'thakbaki_reminder' in ITPL Connect
    // Example template body: "Hello {{1}}, this is a reminder for your pending Thakbaki (arrears) of Rs. {{2}}."
    const variables = [
        customerName,
        String(remainingAmount),
    ];
    return sendWhatsappTemplate(phone, 'thakbaki_reminder', variables);
}
//# sourceMappingURL=whatsapp.js.map