-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('EMAIL_VERIFICATION', 'CHANGE_PASSWORD', 'FORGOT_PASSWORD');

-- AlterTable
ALTER TABLE "EmailVerification" ADD COLUMN     "type" "VerificationType" NOT NULL DEFAULT 'EMAIL_VERIFICATION';
