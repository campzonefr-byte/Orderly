-- AlterTable
ALTER TABLE "QuantityOffer" ADD COLUMN     "percent" DECIMAL(5,2),
ADD COLUMN     "priceType" TEXT NOT NULL DEFAULT 'FIXED',
ALTER COLUMN "price" DROP NOT NULL;
