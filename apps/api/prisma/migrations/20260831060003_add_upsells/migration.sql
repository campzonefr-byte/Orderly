-- CreateTable
CREATE TABLE "Upsell" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerProductId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Upsell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpsellItem" (
    "id" TEXT NOT NULL,
    "upsellId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "UpsellItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Upsell_storeId_idx" ON "Upsell"("storeId");

-- CreateIndex
CREATE INDEX "Upsell_triggerProductId_idx" ON "Upsell"("triggerProductId");

-- CreateIndex
CREATE UNIQUE INDEX "UpsellItem_upsellId_productId_key" ON "UpsellItem"("upsellId", "productId");

-- AddForeignKey
ALTER TABLE "Upsell" ADD CONSTRAINT "Upsell_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upsell" ADD CONSTRAINT "Upsell_triggerProductId_fkey" FOREIGN KEY ("triggerProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpsellItem" ADD CONSTRAINT "UpsellItem_upsellId_fkey" FOREIGN KEY ("upsellId") REFERENCES "Upsell"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpsellItem" ADD CONSTRAINT "UpsellItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
