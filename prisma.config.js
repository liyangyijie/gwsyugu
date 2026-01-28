// CommonJS format for runtime compatibility without TypeScript
module.exports = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL || "file:/app/prisma/dev.db",
  },
};
