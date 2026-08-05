import { badRequest } from './errors';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(input: string): string {
  let phone = input.trim();
  if (phone.startsWith('00')) {
    phone = `+${phone.slice(2)}`;
  } else if (phone.startsWith('0')) {
    phone = `+6${phone}`;
  } else if (!phone.startsWith('+')) {
    phone = `+${phone}`;
  }
  phone = phone.replace(/[\s()-]/g, '');
  if (!E164_REGEX.test(phone)) {
    throw badRequest('Phone number must be a valid E.164 number, e.g. +60123456789');
  }
  return phone;
}
