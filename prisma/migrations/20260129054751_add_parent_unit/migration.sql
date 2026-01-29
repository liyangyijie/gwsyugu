-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Unit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactInfo" TEXT,
    "area" REAL,
    "unitPrice" DECIMAL NOT NULL DEFAULT 88.0,
    "accountBalance" DECIMAL NOT NULL DEFAULT 0.0,
    "initialBalance" DECIMAL NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'NORMAL',
    "parentUnitId" INTEGER,
    "baseTemp" REAL NOT NULL DEFAULT 15.0,
    "baseHeat" REAL,
    "tempCoeff" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Unit_parentUnitId_fkey" FOREIGN KEY ("parentUnitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Unit" ("accountBalance", "area", "baseHeat", "baseTemp", "code", "contactInfo", "createdAt", "id", "initialBalance", "name", "status", "tempCoeff", "unitPrice", "updatedAt") SELECT "accountBalance", "area", "baseHeat", "baseTemp", "code", "contactInfo", "createdAt", "id", "initialBalance", "name", "status", "tempCoeff", "unitPrice", "updatedAt" FROM "Unit";
DROP TABLE "Unit";
ALTER TABLE "new_Unit" RENAME TO "Unit";
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
