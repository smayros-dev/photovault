import { execSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';

const apiDir = path.resolve(__dirname, '..');

const describeIfDb = process.env.CI || process.env.DATABASE_URL ? describe : describe.skip;

jest.setTimeout(30_000);

describeIfDb('prisma schema and migrations', () => {
  it('prisma validate exits 0', () => {
    expect(() => {
      execSync('npx prisma validate', { cwd: apiDir, stdio: 'pipe' });
    }).not.toThrow();
  });

  it('migrate deploy creates the User and RefreshToken tables', async () => {
    execSync('npx prisma migrate deploy', { cwd: apiDir, stdio: 'pipe' });

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const res = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN ('User', 'RefreshToken')`,
      );
      const tables = res.rows.map((row) => row.table_name).sort();
      expect(tables).toEqual(['RefreshToken', 'User']);
    } finally {
      await client.end();
    }
  });
});
