'use client';

import { toast as sonnerToast } from 'sonner';

export function success(message: string): void {
  sonnerToast.success(message);
}

export function error(message: string): void {
  sonnerToast.error(message);
}

export function info(message: string): void {
  sonnerToast.info(message);
}
