import type { Prisma } from '@prisma/client';
import type { DocumentType } from '@uie/contracts';

export interface SeriesKey {
  companyId: string;
  documentType: DocumentType;
  /** null for company-level series. */
  projectId: string | null;
  fiscalYear: string;
}

/**
 * Next number of a document series (PD-003), taken inside the caller's transaction. The UPDATE locks
 * the series row until the transaction ends, so concurrent submits queue, and a rollback gives the
 * number back: no gaps. The row is created on first use.
 */
export async function takeNextNumber(
  tx: Prisma.TransactionClient,
  key: SeriesKey,
): Promise<number> {
  await tx.$executeRaw`
    INSERT INTO "document_series"
      ("id", "companyId", "documentType", "projectId", "fiscalYear", "lastNumber", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), ${key.companyId}::uuid, ${key.documentType}::"DocumentType",
       ${key.projectId}::uuid, ${key.fiscalYear}, 0, now(), now())
    ON CONFLICT ON CONSTRAINT "document_series_key" DO NOTHING`;

  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    UPDATE "document_series"
    SET "lastNumber" = "lastNumber" + 1, "updatedAt" = now()
    WHERE "companyId" = ${key.companyId}::uuid
      AND "documentType" = ${key.documentType}::"DocumentType"
      AND "projectId" IS NOT DISTINCT FROM ${key.projectId}::uuid
      AND "fiscalYear" = ${key.fiscalYear}
    RETURNING "lastNumber"`;

  const row = rows[0];

  if (row === undefined) {
    throw new Error('Document series row missing after insert');
  }

  return row.lastNumber;
}
