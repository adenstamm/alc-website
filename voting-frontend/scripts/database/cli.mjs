import process from "node:process";
import pg from "pg";
import {
  getApplied,
  migrate,
  pendingMigrations,
  readMigrations,
} from "./migrations.mjs";
import { adoptLegacy } from "./legacy.mjs";

const command = process.argv[2] || "status";
if (!["status", "up", "adopt-legacy"].includes(command))
  throw new Error("Use status, up, or adopt-legacy.");
if (!process.env.DATABASE_URL)
  throw new Error(
    "Set DATABASE_URL using a direct/session PostgreSQL connection.",
  );
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
});
const db = {
  query: (...args) => client.query(...args),
  exec: (sql) => client.query(sql),
};
try {
  await client.connect();
  const migrations = await readMigrations();
  if (command === "up") console.log({ applied: await migrate(db, migrations) });
  else if (command === "adopt-legacy")
    console.log(await adoptLegacy(db, migrations));
  else
    console.log({
      pending: pendingMigrations(migrations, await getApplied(db)).map(
        (file) => file.name,
      ),
    });
} catch (error) {
  // Do not print connection strings or SQL payloads from driver errors.
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
