
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const connectionString = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const path = connectionString.replace('file:', '');

const adapter = new PrismaBetterSqlite3({
  url: path
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting migration: Fix DEDUCTION transaction dates...');

  try {
    // Find all DEDUCTION transactions that have a related reading
    const transactions = await prisma.accountTransaction.findMany({
      where: {
        type: 'DEDUCTION',
        relatedReadingId: { not: null }
      },
      include: {
        relatedReading: true
      }
    });

    console.log(`Found ${transactions.length} DEDUCTION transactions to check.`);

    let updatedCount = 0;

    for (const tx of transactions) {
      if (!tx.relatedReading) continue;

      const readingDate = tx.relatedReading.readingDate;
      const txDate = tx.date;

      // Check if dates are different (ignoring milliseconds if needed, but strict equality is safer for now)
      if (readingDate.getTime() !== txDate.getTime()) {
        await prisma.accountTransaction.update({
          where: { id: tx.id },
          data: { date: readingDate }
        });
        updatedCount++;
      }
    }

    console.log(`Migration complete. Updated ${updatedCount} transactions.`);
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
