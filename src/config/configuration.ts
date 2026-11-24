export interface AppConfiguration {
  port: number;
  databaseUrl: string | undefined;
  jwtSecret: string | undefined;
  superAdminEmail: string | undefined;
  superAdminPassword: string | undefined;
  frontendOrigin: string;
  commissionPercent: number;
}

export default function configuration(): AppConfiguration {
  const port = Number(process.env.PORT ?? 3000);

  return {
    port: Number.isInteger(port) && port > 0 ? port : 3000,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    superAdminEmail: process.env.SUPER_ADMIN_EMAIL,
    superAdminPassword: process.env.SUPER_ADMIN_PASSWORD,
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3001',
    commissionPercent: readCommissionPercent(process.env.COMMISSION_PERCENT),
  };
}

function readCommissionPercent(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return 0;
  }
  if (!/^(?:0|[1-9]\d?|100)$/.test(raw)) {
    throw new Error(
      'COMMISSION_PERCENT is not a whole number from 0 to 100',
    );
  }
  return Number(raw);
}
