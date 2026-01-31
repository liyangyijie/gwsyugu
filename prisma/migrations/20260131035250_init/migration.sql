-- CreateIndex
CREATE INDEX "MeterReading_unitId_readingDate_idx" ON "MeterReading"("unitId", "readingDate");

-- CreateIndex
CREATE INDEX "MeterReading_isBilled_idx" ON "MeterReading"("isBilled");

-- CreateIndex
CREATE INDEX "Unit_parentUnitId_idx" ON "Unit"("parentUnitId");
