import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  getApplied,
  initializeLedger,
  migrate,
  recordMigration,
} from "./migrations.mjs";

// Definitions, security attributes, and grants, without OIDs, ownership, or data.
// Adoption fails closed if the running schema differs from the legacy baseline.
export async function catalogSnapshot(db) {
  const { rows } = await db.query(`
    with objects as (
      select 'function' as kind, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name,
        pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','app_private') and p.prokind='f'
      union all
      select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname,
        pg_get_triggerdef(t.oid) || '|' || t.tgenabled::text
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and (n.nspname in ('public','app_private') or (n.nspname='auth' and t.tgname='create_membership_after_signup'))
      union all
      select 'schema-grant', n.nspname || ':' || coalesce(r.rolname,'PUBLIC') || ':' || a.privilege_type, a.is_grantable::text
      from pg_namespace n, lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a left join pg_roles r on r.oid=a.grantee
      where n.nspname='app_private' and a.grantee<>n.nspowner
      union all
      select 'column', table_schema || '.' || table_name || '.' || column_name,
        concat_ws('|', data_type, udt_name, is_nullable, column_default, is_generated, generation_expression)
      from information_schema.columns where table_schema in ('public','app_private')
      union all
      select 'constraint', n.nspname || '.' || c.relname || '.' || con.conname, pg_get_constraintdef(con.oid)
      from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','app_private')
      union all
      select 'index', schemaname || '.' || indexname, indexdef from pg_indexes where schemaname in ('public','app_private')
      union all
      select 'policy', schemaname || '.' || tablename || '.' || policyname,
        concat_ws('|', permissive, roles::text, cmd, qual, with_check)
      from pg_policies where schemaname in ('public','app_private') or (schemaname='storage' and tablename='objects' and (qual like '%record-shelf-covers%' or with_check like '%record-shelf-covers%'))
      union all
      select 'rls', n.nspname || '.' || c.relname, c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private') and c.relkind='r'
      union all
      select 'function-grant', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || coalesce(r.rolname,'PUBLIC') || ':' || a.privilege_type,
        a.is_grantable::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
        lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a left join pg_roles r on r.oid=a.grantee
      where n.nspname in ('public','app_private') and a.grantee<>p.proowner
      union all
      select 'table-grant', table_schema || '.' || table_name || ':' || grantee || ':' || privilege_type, is_grantable
      from information_schema.role_table_grants where table_schema in ('public','app_private') and grantee in ('anon','authenticated','service_role','PUBLIC')
      union all
      select 'column-grant', table_schema || '.' || table_name || '.' || column_name || ':' || grantee || ':' || privilege_type, is_grantable
      from information_schema.role_column_grants where table_schema in ('public','app_private') and grantee in ('anon','authenticated','service_role','PUBLIC')
    ) select * from objects order by kind, name, definition
  `);
  return rows;
}

export async function adoptLegacy(db, migrations) {
  const baseline = migrations.filter((file) => file.version <= "0012");
  if (baseline.length !== 12)
    throw new Error("The complete legacy baseline is required.");
  const reference = new PGlite();
  let expected;
  try {
    await reference.exec(
      await readFile(
        new URL("../../tests/database/platform.sql", import.meta.url),
        "utf8",
      ),
    );
    await migrate(reference, baseline);
    expected = await catalogSnapshot(reference);
  } finally {
    await reference.close();
  }
  await db.exec("begin");
  try {
    await db.query("select pg_advisory_xact_lock(7142026)");
    if ((await getApplied(db)).length)
      throw new Error("Database is already tracked; use status or up.");
    const actual = await catalogSnapshot(db);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      const expectedRows = new Set(expected.map((row) => JSON.stringify(row)));
      const actualRows = new Set(actual.map((row) => JSON.stringify(row)));
      const differences = [
        ...expected.filter((row) => !actualRows.has(JSON.stringify(row))),
        ...actual.filter((row) => !expectedRows.has(JSON.stringify(row))),
      ];
      throw new Error(
        `Legacy schema drift: ${[...new Set(differences.map((row) => row.kind + ":" + row.name))].slice(0, 20).join(", ")}. No history recorded. Reconcile on a restored staging copy first.`,
      );
    }
    await initializeLedger(db);
    for (const file of baseline) await recordMigration(db, file);
    await db.exec("commit");
    return {
      adopted: baseline.map((file) => file.name),
      message:
        "Schema matched; application data and definitions were not changed. Run status, then up.",
    };
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
