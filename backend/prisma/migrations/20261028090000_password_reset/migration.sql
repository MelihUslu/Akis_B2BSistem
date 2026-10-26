-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetExpires" TIMESTAMP(3),
ADD COLUMN     "passwordResetHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetHash_key" ON "User"("passwordResetHash");

