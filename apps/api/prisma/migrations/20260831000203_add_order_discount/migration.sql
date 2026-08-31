-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountGrantedBy" TEXT,
ADD COLUMN     "discountNote" TEXT,
ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DECIMAL(10,3);
