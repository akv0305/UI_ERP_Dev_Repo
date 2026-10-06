// Resolves the connection string for Prisma CLI and seed (migrations need a direct, non-pooled connection).
// Uses DIRECT_URL when it is a real postgres URL; otherwise derives one from DATABASE_URL
// (Neon pooled host "-pooler" removed, channel_binding parameter dropped). Never logs values.

const PLACEHOLDER = 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

function isPostgresUrl(value) {
  return typeof value === 'string' && /^postgres(ql)?:\/\//.test(value.trim());
}

function deriveDirectUrl(pooledUrl) {
  try {
    const url = new URL(pooledUrl);
    url.hostname = url.hostname.replace('-pooler', '');
    url.searchParams.delete('channel_binding');
    return url.toString();
  } catch {
    return pooledUrl;
  }
}

function resolveDirectUrl(env) {
  if (isPostgresUrl(env.DIRECT_URL)) {
    return env.DIRECT_URL.trim();
  }

  if (isPostgresUrl(env.DATABASE_URL)) {
    return deriveDirectUrl(env.DATABASE_URL.trim());
  }

  return PLACEHOLDER;
}

module.exports = { resolveDirectUrl };
