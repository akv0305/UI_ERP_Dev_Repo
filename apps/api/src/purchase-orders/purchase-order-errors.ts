import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';

export function invalidPurchaseOrderStatus(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_STATUS', message);
}

export function invalidPurchaseOrderComparison(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'INVALID_COMPARISON', message);
}

export function duplicatePurchaseOrder(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_PURCHASE_ORDER', message);
}

export function invalidPurchaseOrderProject(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_PROJECT', message);
}

export function invalidPurchaseOrderSite(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_SITE', message);
}

export function invalidPurchaseOrderStore(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_STORE', message);
}

export function invalidPurchaseOrderVendor(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_VENDOR', message);
}

export function invalidPurchaseOrderVendorGst(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_VENDOR_GST', message);
}

export function invalidPurchaseOrderVendorContact(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_VENDOR_CONTACT', message);
}

/** The project has no billing GST registration (PD-031); set it in Masters → Projects first. */
export function billingGstMissing(message: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'BILLING_GST_MISSING', message);
}

export function invalidPurchaseOrderItem(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_ITEM', message);
}

export function invalidPurchaseOrderLines(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_LINES', message);
}

export function invalidPurchaseOrderDate(message: string): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_DATE', message);
}
