import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

export const migrationDirectory = new URL(
  "../../supabase/migrations/",
  import.meta.url,
);
export async function readMigrations() {
  const names = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return Promise.all(
    names.map(async (name, index) => {
      if (!name.startsWith(`${String(index + 1).padStart(4, "0")}_`)) {
        throw new Error(`Migration sequence has a gap or duplicate: ${name}`);
      }
      const sql = await readFile(new URL(name, migrationDirectory), "utf8");
      if (/^\s*(begin|commit|rollback);/im.test(sql))
        throw new Error(`Transaction control belongs to the runner: ${name}`);
      return {
        version: name.slice(0, 4),
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

export async function getApplied(db) {
  const { rows } = await db.query(
    "select to_regclass('app_migrations.history') as ledger",
  );
  return rows[0].ledger
    ? (
        await db.query(
          "select version, name, checksum from app_migrations.history order by version",
        )
      ).rows
    : [];
}
export function pendingMigrations(migrations, applied) {
  applied.forEach((row, index) => {
    const file = migrations[index];
    if (
      !file ||
      row.version !== file.version ||
      row.name !== file.name ||
      row.checksum !== file.checksum
    ) {
      throw new Error(
        `Migration history mismatch at ${row.version}. Restore immutable files; add a forward migration.`,
      );
    }
  });
  return migrations.slice(applied.length);
}
export async function initializeLedger(db) {
  await db.exec(`create schema if not exists app_migrations;
    revoke all on schema app_migrations from public, anon, authenticated;
    create table if not exists app_migrations.history(
      version text primary key, name text not null, checksum text not null,
      applied_at timestamptz not null default now());
    revoke all on app_migrations.history from public, anon, authenticated;`);
}
export async function recordMigration(db, file) {
  await db.query(
    "insert into app_migrations.history(version, name, checksum) values($1,$2,$3)",
    [file.version, file.name, file.checksum],
  );
}
// One transaction for the entire batch: no intermediate pre-hardening schema is
// committed. Advisory lock serializes deployers using the same database.
export async function migrate(db, migrations) {
  await db.exec("begin; set local lock_timeout = '10s'");
  try {
    await db.query("select pg_advisory_xact_lock(7142026)");
    const applied = await getApplied(db);
    const pending = pendingMigrations(migrations, applied);
    const existing = (
      await db.query("select to_regclass('public.memberships') as app")
    ).rows[0].app;
    if (existing && !applied.length)
      throw new Error(
        "Untracked existing database. Follow docs/database-migrations.md to verify and adopt the legacy baseline first.",
      );
    await initializeLedger(db);
    for (const file of pending) {
      try {
        await db.exec(file.sql);
      } catch (error) {
        throw new Error(`${file.name}: ${error.message}`, { cause: error });
      }
      await recordMigration(db, file);
    }
    await db.exec("commit");
    return pending.map((file) => file.name);
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
