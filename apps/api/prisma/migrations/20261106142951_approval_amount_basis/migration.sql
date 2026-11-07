-- CreateEnum
CREATE TYPE "ApprovalAmountBasis" AS ENUM ('NET_AMOUNT', 'GRAND_TOTAL');

-- AlterTable
ALTER TABLE "approval_workflows" ADD COLUMN     "amountBasis" "ApprovalAmountBasis" NOT NULL DEFAULT 'NET_AMOUNT';
