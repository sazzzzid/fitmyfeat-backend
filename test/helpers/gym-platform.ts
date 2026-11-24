import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import EmbeddedPostgres from 'embedded-postgres';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PlatformExceptionFilter } from '../../src/common/filters/platform-exception.filter.js';
import { PlatformSeedService } from '../../src/infrastructure/database/platform-seed.service.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { PlanSeedService } from '../../src/modules/plans/plan-seed.service.js';
import { TINY_PNG } from './tiny-png.js';

export interface GymPlatform {
  app: INestApplication<App>;
  prisma: PrismaService;
  seed: PlatformSeedService;
  planSeed: PlanSeedService;
}

let databaseReady: Promise<void> | undefined;

// The e2e suite truncates every table, so it must never use DATABASE_URL.
// Importing AppModule loads .env through ConfigModule, which would point the
// suite at the application's database. Only TEST_DATABASE_URL or the local
// embedded Postgres instance below are allowed.
async function ensureDatabase(): Promise<void> {
  if (process.env.TEST_DATABASE_URL) {
    return;
  }
  databaseReady ??= startEmbeddedPostgres();
  await databaseReady;
}

async function startEmbeddedPostgres(): Promise<void> {
  const port = 55432;
  const postgres = new EmbeddedPostgres({
    databaseDir: mkdtempSync(path.join(tmpdir(), 'dolphin-pg-')),
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    autoRehydrateSymlinks: true,
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('dolphin');
  process.env.TEST_DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/dolphin`;
  process.once('exit', () => {
    void postgres.stop();
  });
}

function applicationDatabaseUrl(): string | undefined {
  const envFile = path.join(process.cwd(), '.env');
  if (!existsSync(envFile)) {
    return undefined;
  }
  return parseEnv(readFileSync(envFile, 'utf8')).DATABASE_URL || undefined;
}

function assertTestDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl || databaseUrl !== process.env.TEST_DATABASE_URL) {
    throw new Error('The e2e suite only runs against TEST_DATABASE_URL');
  }
  if (databaseUrl === applicationDatabaseUrl()) {
    throw new Error('TEST_DATABASE_URL must not be the DATABASE_URL from .env');
  }
}

export function configureTestEnv(): void {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL is required');
  }
  assertTestDatabase(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET ??= 'test-jwt-secret-value';
  process.env.SUPER_ADMIN_EMAIL ??= 'admin@gym.test';
  process.env.SUPER_ADMIN_PASSWORD ??= 'admin-password';
}

export async function applyMigrations(): Promise<void> {
  await ensureDatabase();
  configureTestEnv();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  });
}

export async function createGymPlatform(): Promise<GymPlatform> {
  configureTestEnv();
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PlatformExceptionFilter());
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    seed: app.get(PlatformSeedService),
    planSeed: app.get(PlanSeedService),
  };
}

export async function resetPlatform(platform: GymPlatform): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  await platform.prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "messages", "gym_automations", "audit_logs", "staff_members", "platform_charges", "expenses", "membership_payments", "memberships", "membership_products", "members", "settlements", "subscriptions", "plans", "gyms", "owner_profiles", "user_accounts", "message_templates", "role_templates", "role_permissions", "permissions", "roles" RESTART IDENTITY CASCADE',
  );
  await platform.seed.seed();
  await platform.planSeed.seed();
}

export async function signIn(
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/sign-in')
    .send({ email, password })
    .expect(200);
  return response.body.accessToken as string;
}

export async function adminToken(app: INestApplication<App>): Promise<string> {
  return signIn(
    app,
    process.env.SUPER_ADMIN_EMAIL ?? '',
    process.env.SUPER_ADMIN_PASSWORD ?? '',
  );
}

/**
 * Registers a Gym_Owner and takes their Gym through the Phase 1 flow to
 * `active`: create, save all five Setup_Fields, complete setup, activate.
 */
export async function activeGymOwner(
  platform: GymPlatform,
  email: string,
  password = 'owner-password',
): Promise<{ token: string; gymId: string }> {
  const server = platform.app.getHttpServer();
  await request(server)
    .post('/auth/register')
    .send({ email, password })
    .expect(201);
  const token = await signIn(platform.app, email, password);
  const created = await request(server)
    .post('/gyms')
    .set('Authorization', `Bearer ${token}`)
    .expect(201);
  const gymId = created.body.id as string;
  await request(server)
    .post('/gyms/me/logo')
    .set('Authorization', `Bearer ${token}`)
    .attach('logo', TINY_PNG, { filename: 'logo.png', contentType: 'image/png' })
    .expect(200);
  await request(server)
    .patch('/gyms/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({
      gymName: 'Iron Works',
      address: '1 Main Street',
      contact: '555-0100',
    })
    .expect(200);
  await request(server)
    .patch('/gyms/me/setup')
    .set('Authorization', `Bearer ${token}`)
    .send({ timing: '06:00-22:00' })
    .expect(200);
  await request(server)
    .post('/gyms/me/complete-setup')
    .set('Authorization', `Bearer ${token}`)
    .expect(201);
  const admin = await adminToken(platform.app);
  await request(server)
    .post(`/gyms/${gymId}/activate`)
    .set('Authorization', `Bearer ${admin}`)
    .expect(201);
  return { token, gymId };
}

/**
 * Simulates time passing for one Gym by moving every stored period
 * backward by the same amount, which keeps the period CHECK satisfied.
 */
export async function shiftGymPeriods(
  platform: GymPlatform,
  gymId: string,
  milliseconds: number,
): Promise<void> {
  await platform.prisma.$executeRaw`
    UPDATE "subscriptions"
    SET "current_period_start" = "current_period_start" - ${milliseconds}::double precision * interval '1 millisecond',
        "current_period_end" = "current_period_end" - ${milliseconds}::double precision * interval '1 millisecond',
        "expired_at" = CASE
          WHEN "expired_at" IS NULL THEN NULL
          ELSE "expired_at" - ${milliseconds}::double precision * interval '1 millisecond'
        END
    WHERE "gym_id" = ${gymId}::uuid AND "status" <> 'pending_payment'`;
}
