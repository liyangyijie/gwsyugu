-- CreateTable
CREATE TABLE "DailyWeather" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "temp" REAL NOT NULL,
    "minTemp" REAL,
    "maxTemp" REAL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UnitPrediction" (
    "unitId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "data" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UnitPrediction_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
