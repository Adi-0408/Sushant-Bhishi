import { Customer, SmsLog } from '../types';
import { StorageService } from './db';
import { formatCurrency, formatDateMarathi, getBishiNameMarathi } from '../utils/formatters';

export type SmsTemplateType =
  | 'DUE_REMINDER_2_DAYS'
  | 'DUE_TODAY'
  | 'PENDING'
  | 'PENALTY'
  | 'COLLECTION'
  | 'LOAN_BALANCE';

export const SmsService = {
  // Generate Marathi message text based on specific requirement specs
  generateMessage: (
    type: SmsTemplateType,
    customer: Customer,
    data: {
      amount?: number;
      dueDate?: string;
      remaining?: number;
      penalty?: number;
      loanBalance?: number;
    }
  ): string => {
    const name = customer.name;
    const bishiName = getBishiNameMarathi(customer.bishiType);

    switch (type) {
      case 'DUE_REMINDER_2_DAYS':
        return `नमस्कार ${name}, तुमची ${bishiName} रक्कम ${formatCurrency(
          data.amount || customer.amount
        )} दिनांक ${formatDateMarathi(data.dueDate)} रोजी देय आहे.`;

      case 'DUE_TODAY':
        return `नमस्कार ${name}, तुमची ${formatCurrency(
          data.amount || customer.amount
        )} भिशी रक्कम आज देय आहे.`;

      case 'PENDING':
        return `नमस्कार ${name}, तुमची ${formatCurrency(
          data.remaining || customer.amount
        )} रक्कम बाकी आहे. कृपया रक्कम जमा करावी.`;

      case 'PENALTY':
        return `नमस्कार ${name}, तुमच्या खात्यावर ${formatCurrency(
          data.penalty || 0
        )} दंड लागू झाला आहे. सध्या एकूण बाकी ${formatCurrency(data.remaining || 0)} आहे.`;

      case 'COLLECTION':
        return `नमस्कार ${name}, तुमची ${formatCurrency(
          data.amount || 0
        )} रक्कम जमा झाली आहे. तुमच्या खात्यावर सध्या ${formatCurrency(data.remaining || 0)} बाकी आहे.`;

      case 'LOAN_BALANCE':
        return `नमस्कार ${name}, तुमच्या कर्जाची ${formatCurrency(
          data.loanBalance || 0
        )} बाकी आहे.`;

      default:
        return `नमस्कार ${name}, सुषांत भिशी संदर्भात संदेश.`;
    }
  },

  // Extensible SMS Gateway dispatch method
  sendSms: async (
    customer: Customer,
    type: SmsTemplateType,
    data: {
      amount?: number;
      dueDate?: string;
      remaining?: number;
      penalty?: number;
      loanBalance?: number;
    }
  ): Promise<SmsLog> => {
    const message = SmsService.generateMessage(type, customer, data);

    try {
      // In production, integrate external SMS Gateway API here (e.g. Fast2SMS, Twilio, Msg91, etc.)
      // const response = await fetch('YOUR_SMS_GATEWAY_ENDPOINT', { method: 'POST', body: ... });
      console.log(`[SMS SENT TO ${customer.mobile}]:`, message);

      const log = StorageService.addSmsLog({
        customerId: customer.id,
        customerName: customer.name,
        mobile: customer.mobile,
        message,
        type,
        status: 'SENT',
      });

      return log;
    } catch (err) {
      console.error('Error sending SMS:', err);
      const log = StorageService.addSmsLog({
        customerId: customer.id,
        customerName: customer.name,
        mobile: customer.mobile,
        message,
        type,
        status: 'FAILED',
      });
      return log;
    }
  },
};
