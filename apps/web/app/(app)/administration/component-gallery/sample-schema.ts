import { z } from 'zod';
import { terminology } from '@/config/terminology';

export const sampleFormSchema = z.object({
  name: z.string().min(1, terminology.validation.required),
  quantity: z.string().regex(/^\d+(\.\d+)?$/, terminology.validation.invalidQuantity),
  status: z.string().min(1, terminology.validation.required),
  date: z.string().min(1, terminology.validation.required),
  active: z.boolean(),
  notes: z.string(),
  vendor: z.string(),
});

export type SampleFormValues = z.infer<typeof sampleFormSchema>;

export const sampleFormDefaults: SampleFormValues = {
  name: 'Sample 001',
  quantity: '1.500',
  status: 'sample-001',
  date: '2026-01-01',
  active: true,
  notes: '',
  vendor: '',
};
