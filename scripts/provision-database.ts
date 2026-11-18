import { z } from 'zod';
import { PostgresDatabase } from '../server/database/postgres';

const parsed = z
  .object({
    DATABASE_ADMIN_URL: z.string().min(1),
    DATABASE_RUNTIME_PASSWORD: z.string().regex(/^[A-Za-z0-9+/=_-]{32,128}$/),
    AUTH_ADMIN_DATABASE_PASSWORD: z
      .string()
      .regex(/^[A-Za-z0-9+/=_-]{32,128}$/),
    DATABASE_CA_PATH: z.string().optional(),
  })
  .safeParse(process.env);
if (!parsed.success)
  throw new Error(
    'Set DATABASE_ADMIN_URL, DATABASE_RUNTIME_PASSWORD, and AUTH_ADMIN_DATABASE_PASSWORD (32–128 random base64 characters) in the controlled operator environment.',
  );
const db = new PostgresDatabase({
  url: parsed.data.DATABASE_ADMIN_URL,
  caPath: parsed.data.DATABASE_CA_PATH,
  max: 1,
});
try {
  await db.transaction(async () => {
    const exists = await db
      .prepare(
        "SELECT 1 FROM pg_roles WHERE rolname IN ('esmeraldinha_api', 'esmeraldinha_auth_admin_api')",
      )
      .get();
    if (exists)
      throw new Error(
        'The runtime login already exists. Inspect it instead of replacing its password automatically.',
      );
    // The validated alphabet excludes quotes; PostgreSQL role DDL does not accept bind parameters.
    await db.exec(
      `CREATE ROLE esmeraldinha_api LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${parsed.data.DATABASE_RUNTIME_PASSWORD}'`,
    );
    await db.exec('GRANT esmeraldinha_runtime TO esmeraldinha_api');
    await db.exec(
      `CREATE ROLE esmeraldinha_auth_admin_api LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${parsed.data.AUTH_ADMIN_DATABASE_PASSWORD}'`,
    );
    await db.exec(
      'GRANT esmeraldinha_auth_admin_runtime TO esmeraldinha_auth_admin_api',
    );
  });
  console.log(
    'Runtime logins created: esmeraldinha_api and esmeraldinha_auth_admin_api. Configure their separate connection URLs on the controlled servers. No password was printed.',
  );
} finally {
  await db.close();
}
