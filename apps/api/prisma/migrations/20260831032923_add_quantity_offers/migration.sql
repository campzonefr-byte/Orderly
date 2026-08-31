-- CreateTable
CREATE TABLE "QuantityOffer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,3) NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuantityOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuantityOffer_productId_idx" ON "QuantityOffer"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "QuantityOffer_productId_quantity_key" ON "QuantityOffer"("productId", "quantity");

-- AddForeignKey
ALTER TABLE "QuantityOffer" ADD CONSTRAINT "QuantityOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
