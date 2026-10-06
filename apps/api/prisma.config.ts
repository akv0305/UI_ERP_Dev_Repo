import { createRequire } from 'node:module';
import { defineConfig } from 'prisma/config';

const require = createRequire(import.meta.url);
const { resolveDirectUrl } = require('./prisma/connection.cjs') as {
  resolveDirectUrl: (env: NodeJS.ProcessEnv) => string;
};

try {
  process.loadEnvFile('.env');
} catch {
  // The file is optional; CI and production provide variables directly.
}

// Migrations use the direct (non-pooled) URL. When no database variables exist (CI),
// a placeholder keeps `prisma generate` working.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.cjs',
  },
  datasource: {
    url: resolveDirectUrl(process.env),
  },
});
