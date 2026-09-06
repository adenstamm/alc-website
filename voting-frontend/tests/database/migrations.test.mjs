import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import {
  getApplied,
  migrate,
  pendingMigrations,
  readMigrations,
} from "../../scripts/database/migrations.mjs";
import { adoptLegacy } from "../../scripts/database/legacy.mjs";

const migrations = await readMigrations();
const platform = await readFile(
  new URL("./platform.sql", import.meta.url),
  "utf8",
);
async function testDatabase() {
  if (!process.env.DATABASE_TEST_URL) return new PGlite();
  const target = new URL(process.env.DATABASE_TEST_URL);
  if (
    !["localhost", "127.0.0.1", "postgres"].includes(target.hostname) ||
    !target.pathname.startsWith("/alc_test")
  ) {
    throw new Error(
      "Database tests require a local disposable alc_test database.",
    );
  }
  const client = new pg.Client({ connectionString: target.toString() });
  await client.connect();
  return {
    query: (...args) => client.query(...args),
    exec: (sql) => client.query(sql),
    close: () => client.end(),
  };
}
const db = await testDatabase();
await db.exec(platform);
await migrate(db, migrations);

async function rejected(sql, params, pattern) {
  await db.exec("savepoint expected_failure");
  try {
    await assert.rejects(db.query(sql, params), pattern);
  } finally {
    await db.exec(
      "rollback to savepoint expected_failure; release savepoint expected_failure",
    );
  }
}
async function asUser(index) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
    `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
  ]);
  await db.exec("set local role authenticated");
}
async function election() {
  await db.exec("begin");
  for (let i = 1; i <= 6; i++) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      `fixture${i}@example.test`,
    ]);
  }
  await db.exec(
    "update public.memberships set status='approved', role=case when email='fixture1@example.test' then 'admin' else 'member' end",
  );
  await asUser(1);
  await db.query(
    "select public.create_poll('fixture','Fixture','Choose','Nominate','Fixture prior album','Fixture artist')",
  );
}
async function finalElection() {
  await election();
  for (let i = 2; i <= 6; i++) {
    await asUser(i);
    await db.query("select public.submit_nomination('fixture',$1,$2)", [
      `Fixture album ${i}`,
      `Fixture artist ${i}`,
    ]);
  }
  await asUser(1);
  await db.query("select public.advance_to_primary('fixture')");
  const ids = (
    await db.query("select public.get_current_poll() as poll")
  ).rows[0].poll.candidates.map((r) => r.id);
  await asUser(2);
  await db.query("select public.submit_primary_ballot('fixture',$1)", [
    ids.slice(0, 2),
  ]);
  await rejected(
    "select public.submit_primary_ballot('fixture',$1)",
    [ids.slice(0, 1)],
    /ALREADY|duplicate/i,
  );
  await asUser(1);
  await db.query("select public.advance_to_final('fixture',$1)", [ids]);
  return ids;
}
try {
  await test("empty installation applies all numbered migrations; replay is a no-op", async () => {
    assert.equal((await getApplied(db)).length, migrations.length);
    assert.deepEqual(await migrate(db, migrations), []);
    const awaitedApplied = await getApplied(db);
    assert.throws(
      () =>
        pendingMigrations(
          [{ ...migrations[0], checksum: "changed" }, ...migrations.slice(1)],
          awaitedApplied,
        ),
      /history mismatch/,
    );
  });
  await test("database bans and normalized punctuation agree", async () => {
    const { rows } = await db.query(
      "select public.normalize_music_name(' Illinois! ') as punct, public.normalize_music_name('Ｉｌｌｉｎｏｉｓ') as unicode, public.normalize_music_name('!!!') as empty",
    );
    assert.deepEqual(rows[0], {
      punct: "illinois",
      unicode: "illinois",
      empty: null,
    });
    await election();
    try {
      await asUser(2);
      await rejected(
        "select public.submit_nomination('fixture','Illinois!','Fixture artist')",
        [],
        /banned|already|used/i,
      );
    } finally {
      await db.exec("rollback");
    }
  });
  await test("zero-turnout final can reopen, accept a ballot, publish, and allow next poll", async () => {
    try {
      const ids = await finalElection();
      await db.query("select public.close_final_voting('fixture')");
      await rejected(
        "select public.create_poll('next','Next','Choose','Nominate','Prior','Artist')",
        [],
        /FINAL_WINNER_REQUIRED/,
      );
      await asUser(2);
      await rejected(
        "select public.reopen_empty_final('fixture')",
        [],
        /ADMIN_REQUIRED/,
      );
      await asUser(1);
      await db.query("select public.reopen_empty_final('fixture')");
      await asUser(2);
      await db.query("select public.submit_final_ballot('fixture',$1)", [ids]);
      await asUser(1);
      await db.query("select public.close_final_voting('fixture')");
      await rejected(
        "select public.reopen_empty_final('fixture')",
        [],
        /CLOSED_EMPTY_FINAL_REQUIRED|FINAL_HAS_BALLOTS/,
      );
      await db.query(
        "select public.create_poll('next','Next','Choose','Nominate','Prior','Artist')",
      );
      await db.exec("reset role");
      assert.equal(
        (
          await db.query(
            "select winner_published_at is not null as published from public.polls where id='fixture'",
          )
        ).rows[0].published,
        true,
      );
    } finally {
      await db.exec("rollback");
    }
  });
  await test("authenticated members cannot change migrations or call admin RPCs", async () => {
    await election();
    try {
      await asUser(2);
      await rejected(
        "select * from app_migrations.history",
        [],
        /permission denied/,
      );
      await rejected(
        "select public.advance_to_primary('fixture')",
        [],
        /ADMIN_REQUIRED/,
      );
    } finally {
      await db.exec("rollback");
    }
  });
  await test("failed batches roll back both schema and ledger", async () => {
    const version = String(migrations.length + 1).padStart(4, "0");
    await assert.rejects(
      migrate(db, [
        ...migrations,
        {
          version,
          name: `${version}_bad.sql`,
          checksum: "fixture",
          sql: "create table public.must_rollback(id int); select nonexistent_function();",
        },
      ]),
      /nonexistent_function/,
    );
    assert.equal(
      (
        await db.query(
          "select to_regclass('public.must_rollback') as table_name",
        )
      ).rows[0].table_name,
      null,
    );
    assert.equal((await getApplied(db)).length, migrations.length);
  });
  await test("legacy adoption verifies definitions before recording history", async () => {
    const legacy = new PGlite();
    try {
      await legacy.exec(platform);
      await migrate(legacy, migrations.slice(0, 12));
      await legacy.exec("drop schema app_migrations cascade");
      await assert.rejects(migrate(legacy, migrations), /Untracked existing/);
      await legacy.exec(
        "create or replace function public.is_admin() returns boolean language sql as $$select true$$",
      );
      await assert.rejects(
        adoptLegacy(legacy, migrations),
        /Legacy schema drift/,
      );
      assert.equal((await getApplied(legacy)).length, 0);
      // Restore the trusted definition by reconstructing a separate clean baseline.
    } finally {
      await legacy.close();
    }
    const clean = new PGlite();
    try {
      await clean.exec(platform);
      await migrate(clean, migrations.slice(0, 12));
      await clean.exec("drop schema app_migrations cascade");
      assert.equal((await adoptLegacy(clean, migrations)).adopted.length, 12);
      assert.equal(
        (await migrate(clean, migrations)).length,
        migrations.length - 12,
      );
    } finally {
      await clean.close();
    }
  });
} finally {
  await db.close();
}
