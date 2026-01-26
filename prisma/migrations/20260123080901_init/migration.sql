-- CreateTable
CREATE TABLE "Unit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactInfo" TEXT,
    "area" REAL,
    "unitPrice" DECIMAL NOT NULL DEFAULT 88.0,
    "accountBalance" DECIMAL NOT NULL DEFAULT 0.0,
    "initialBalance" DECIMAL NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'NORMAL',
    "baseTemp" REAL NOT NULL DEFAULT 15.0,
    "baseHeat" REAL,
    "tempCoeff" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "readingDate" DATETIME NOT NULL,
    "readingValue" DECIMAL NOT NULL,
    "dailyAvgTemp" REAL,
    "heatUsage" DECIMAL,
    "costAmount" DECIMAL,
    "isBilled" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "unitId" INTEGER NOT NULL,
    CONSTRAINT "MeterReading_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "balanceAfter" DECIMAL NOT NULL,
    "summary" TEXT NOT NULL,
    "remarks" TEXT,
    "unitId" INTEGER NOT NULL,
    "relatedReadingId" INTEGER,
    CONSTRAINT "AccountTransaction_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountTransaction_relatedReadingId_fkey" FOREIGN KEY ("relatedReadingId") REFERENCES "MeterReading" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");
