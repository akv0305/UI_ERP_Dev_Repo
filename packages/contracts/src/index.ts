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

export * from './audit';

export * from './validators';

export * from './masters';

export * from './sites';

export * from './access';

export * from './items';

export * from './item-import';

export * from './vendors';

export * from './indents';

export * from './enquiries';

export * from './quotations';

export * from './comparisons';

export * from './purchase-orders';
