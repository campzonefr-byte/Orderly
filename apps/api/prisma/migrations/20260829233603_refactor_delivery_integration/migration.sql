/*
  Warnings:

  - You are about to drop the column `statusMapping` on the `DeliveryIntegration` table. All the data in the column will be lost.
  - You are about to drop the column `storeId` on the `DeliveryIntegration` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "DeliveryIntegration" DROP CONSTRAINT "DeliveryIntegration_storeId_fkey";

-- DropIndex
DROP INDEX "DeliveryIntegration_storeId_idx";

-- AlterTable
ALTER TABLE "DeliveryIntegration" DROP COLUMN "statusMapping",
DROP COLUMN "storeId",
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Cosmos',
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "DeliveryIntegrationStore" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryIntegrationStore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryIntegrationStore_storeId_idx" ON "DeliveryIntegrationStore"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryIntegrationStore_integrationId_storeId_key" ON "DeliveryIntegrationStore"("integrationId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryIntegrationStore_storeId_integrationId_key" ON "DeliveryIntegrationStore"("storeId", "integrationId");

-- CreateIndex
CREATE INDEX "DeliveryIntegration_provider_idx" ON "DeliveryIntegration"("provider");

-- AddForeignKey
ALTER TABLE "DeliveryIntegrationStore" ADD CONSTRAINT "DeliveryIntegrationStore_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "DeliveryIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIntegrationStore" ADD CONSTRAINT "DeliveryIntegrationStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
