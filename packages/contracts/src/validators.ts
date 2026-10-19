import { z } from 'zod';

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const TAN_PATTERN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
export const CIN_PATTERN = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export const LLPIN_PATTERN = /^[A-Z]{3}-[0-9]{4}$/;
export const PIN_CODE_PATTERN = /^[1-9][0-9]{5}$/;
export const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;
export const MASTER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,19}$/;
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UDYAM_PATTERN = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
export const BANK_ACCOUNT_PATTERN = /^[0-9]{9,18}$/;

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Trim and uppercase: every identifier is normalised this way before it is checked or stored. */
export function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase();
}

/** Check character (15th) for the first 14 characters of a GSTIN, or null if one is not in the charset. */
export function gstinCheckCharacter(first14: string): string | null {
  let sum = 0;

  for (let index = 0; index < first14.length; index += 1) {
    const value = GSTIN_CHARSET.indexOf(first14.charAt(index));

    if (value < 0) {
      return null;
    }

    const factor = index % 2 === 0 ? 1 : 2;
    const product = value * factor;

    sum += Math.floor(product / 36) + (product % 36);
  }

  return GSTIN_CHARSET.charAt((36 - (sum % 36)) % 36);
}

function matches(pattern: RegExp, value: string): boolean {
  return pattern.test(normalizeIdentifier(value));
}

export const isValidPan = (value: string): boolean => matches(PAN_PATTERN, value);
export const isValidTan = (value: string): boolean => matches(TAN_PATTERN, value);
export const isValidCin = (value: string): boolean => matches(CIN_PATTERN, value);
export const isValidLlpin = (value: string): boolean => matches(LLPIN_PATTERN, value);
export const isValidPinCode = (value: string): boolean => matches(PIN_CODE_PATTERN, value);
export const isValidPhone = (value: string): boolean => matches(PHONE_PATTERN, value);
export const isValidMasterCode = (value: string): boolean => matches(MASTER_CODE_PATTERN, value);

/** Format check plus the check digit. */
export function isValidGstin(value: string): boolean {
  const gstin = normalizeIdentifier(value);

  return GSTIN_PATTERN.test(gstin) && gstinCheckCharacter(gstin.slice(0, 14)) === gstin.charAt(14);
}

/** Characters 3-12 of a GSTIN are the holder's PAN. */
export function panOfGstin(gstin: string): string {
  return normalizeIdentifier(gstin).slice(2, 12);
}

/** First two digits of a GSTIN are the state's GST code. */
export function stateCodeOfGstin(gstin: string): string {
  return normalizeIdentifier(gstin).slice(0, 2);
}

// ---------- zod building blocks (trim + uppercase before checking) ----------

/** Blank or missing becomes null, so optional text fields can be sent as '' or left out. */
export const blankToNull = (value: unknown): unknown =>
  value === undefined || (typeof value === 'string' && value.trim().length === 0) ? null : value;

const identifier = (pattern: RegExp) => z.string().trim().toUpperCase().regex(pattern);

export const PanSchema = identifier(PAN_PATTERN);
export const TanSchema = identifier(TAN_PATTERN);
export const CinSchema = identifier(CIN_PATTERN);
export const LlpinSchema = identifier(LLPIN_PATTERN);
export const PinCodeSchema = identifier(PIN_CODE_PATTERN);
export const PhoneSchema = identifier(PHONE_PATTERN);
export const MasterCodeSchema = identifier(MASTER_CODE_PATTERN);
export const IfscSchema = identifier(IFSC_PATTERN);
export const UdyamSchema = identifier(UDYAM_PATTERN);
export const BankAccountNumberSchema = z.string().trim().regex(BANK_ACCOUNT_PATTERN);

/** Uppercased only; the GSTIN format and check digit are verified by the API (INVALID_GSTIN). */
export const GstinInputSchema = z.string().trim().toUpperCase().min(1).max(30);

export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToNull, schema.nullable());

export const OptionalText = (max: number) => optional(z.string().trim().min(1).max(max));
