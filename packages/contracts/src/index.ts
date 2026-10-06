import { z } from 'zod';

export const HealthResponse = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;

export * from './permissions';

export * from './auth';

export * from './admin';
