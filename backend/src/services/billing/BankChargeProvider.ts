import { randomBytes } from 'node:crypto';

export interface BankChargeRequest {
  accountNumber: string;
  amountCents: number;
  reference: string;
}

export interface BankChargeResult {
  success: boolean;
  bankRef?: string;
  failureReason?: string;
}

export interface BankChargeProvider {
  charge(request: BankChargeRequest): Promise<BankChargeResult>;
}

export class MockBankChargeProvider implements BankChargeProvider {
  async charge(request: BankChargeRequest): Promise<BankChargeResult> {
    if (request.accountNumber.endsWith('0000')) {
      return {
        success: false,
        failureReason: 'Insufficient funds (mock bank: account number ends in 0000)',
      };
    }
    return {
      success: true,
      bankRef: `BANK-${randomBytes(5).toString('hex').toUpperCase()}`,
    };
  }
}
