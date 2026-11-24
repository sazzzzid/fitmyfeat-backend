import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The Prisma config runs before the CLI loads .env. Without this, migrate
// falls back to a URL with no user and Postgres returns P1010.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/dolphin',
  },
});
