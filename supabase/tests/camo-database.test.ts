import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { buildCatalog } from "../../src/camo/domain";
import { initial } from "../../src/domain";

// PostgreSQL WASM local en mémoire. Aucune URL ou clé Supabase n'est utilisée.
const sql = (path: string) =>
  readFileSync(resolve(path), "utf8").replace(/^\uFEFF/, "");
const definition = {
  id: "m4-green",
  weaponId: "m4",
  mode: "shared",
  track: "special",
  slot: 3,
  name: "Vert",
  description: "Information propriétaire",
  target: 25,
  unlockLevel: null,
  rule: "unknown",
  prerequisiteId: null,
  source: "owner",
  sourceUrl: null,
};
const progress = {
  definitionId: "m4-green",
  current: 14,
  completed: false,
  revision: 0,
};
let db: PGlite;
async function role<T>(
  name: "anon" | "authenticated",
  admin: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    admin
      ? "00000000-0000-0000-0000-000000000001"
      : "00000000-0000-0000-0000-000000000002",
  ]);
  await db.exec(`set role ${name}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const install = (definitions = [definition], entries = [progress]) =>
  db.query("select public.install_camo_catalog($1::jsonb)", [
    JSON.stringify({ definitions, progress: entries }),
  ]);

describe("Migration camouflage V2 — vrai moteur PostgreSQL local", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    `);
    await db.exec(sql("supabase/migrations/001_tracker.sql"));
    await db.exec(sql("supabase/seed.sql"));
    await db.exec(
      "insert into private.administrators values('00000000-0000-0000-0000-000000000001')",
    );
    await db.exec(
      sql("supabase/migrations/20261101183223_mw4_camo_catalog_v2.sql"),
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec("truncate public.camo_progress, public.camo_definitions");
  });
  afterAll(async () => {
    await db?.close();
  });

  it("accepte le catalogue généré et conserve les données initiales à travers deux imports", async () => {
    const catalog = buildCatalog(initial);
    await role("authenticated", true, async () => {
      await db.query("select public.install_camo_catalog($1::jsonb)", [
        JSON.stringify(catalog),
      ]);
      await db.query("select public.install_camo_catalog($1::jsonb)", [
        JSON.stringify(catalog),
      ]);
    });
    expect(
      (
        await db.query(
          "select count(*)::integer as n from public.camo_definitions",
        )
      ).rows[0],
    ).toEqual({ n: catalog.definitions.length });
    expect(
      (
        await db.query(
          "select current,completed from public.camo_progress where definition_id='m4-green'",
        )
      ).rows[0],
    ).toEqual({ current: 14, completed: false });
  });
  it("préserve un profil TEST complet à 33 armes avec statistiques, historique et classe", async () => {
    // Fixture entièrement synthétique, créée exclusivement dans PGlite en mémoire.
    // La transaction est toujours annulée pour laisser le seed initial aux autres tests.
    const snapshot = structuredClone(initial);
    snapshot.profiles[0] = {
      ...snapshot.profiles[0],
      kills: 12345,
      deaths: 6789,
      wins: 101,
      losses: 72,
      hours: 42.5,
      accuracy: 31.25,
      testMetadata: { label: "TEST profil conservé" },
    };
    snapshot.weapons.push(
      ...Array.from({ length: 29 }, (_, i) => ({
        ...initial.weapons[3],
        id: "test-weapon-" + (i + 1),
        name: "TEST arme " + (i + 1),
        category: "TEST catégorie",
        level: i + 1,
        maxLevel: 100,
        kills: 100 + i,
        deaths: 50 + i,
        gold: false,
        platinum: false,
        testMetadata: { label: "TEST champ conservé" },
      })),
    );
    snapshot.matches.push({
      id: "test-match",
      game: "mw4",
      date: "2026-11-01T12:00:00Z",
      map: "TEST carte",
      mode: "TEST mode",
      result: "Victoire",
      kills: 32,
      deaths: 11,
      assists: 7,
      weaponId: "m4",
      notes: "TEST partie conservée",
    });
    snapshot.loadouts.push({
      id: "test-loadout",
      game: "mw4",
      name: "TEST classe",
      weaponId: "m4",
      type: "Camouflage",
      attachments: ["TEST 1", "TEST 2", "TEST 3", "TEST 4", "TEST 5"],
      equipment: "TEST équipement",
      perks: "TEST atout",
      notes: "TEST classe conservée",
    });
    const catalog = buildCatalog(snapshot);
    expect(snapshot.weapons).toHaveLength(33);
    expect(catalog.definitions).toHaveLength(893);
    await db.exec("begin");
    try {
      for (const [id, data] of Object.entries(snapshot)) {
        await db.query("update public.tracker set data=$2::jsonb where id=$1", [
          id,
          JSON.stringify(data),
        ]);
      }
      const before = (
        await db.query(
          "select id,data::text,updated_at from public.tracker order by id",
        )
      ).rows;
      await role("authenticated", true, async () => {
        await db.query("select public.install_camo_catalog($1::jsonb)", [
          JSON.stringify(catalog),
        ]);
        await db.query("select public.install_camo_catalog($1::jsonb)", [
          JSON.stringify(catalog),
        ]);
      });
      expect(
        (
          await db.query(
            "select id,data::text,updated_at from public.tracker order by id",
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await db.query(
            "select count(*)::integer as n from public.camo_definitions",
          )
        ).rows[0],
      ).toEqual({ n: 893 });
      expect(
        (
          await db.query(
            "select current,completed from public.camo_progress where definition_id='m4-green'",
          )
        ).rows[0],
      ).toEqual({ current: 14, completed: false });
      expect(
        (
          await db.query(
            "select definition->>'weaponId' as weapon_id from public.camo_definitions where id='m4-green'",
          )
        ).rows[0],
      ).toEqual({ weapon_id: "m4" });
      expect(
        (
          await db.query(
            "select count(*)::integer as n from public.camo_progress p join public.camo_definitions d on d.id=p.definition_id where d.definition->>'track'='gold' and p.completed is true",
          )
        ).rows[0],
      ).toEqual({ n: 3 });
    } finally {
      await db.exec("rollback");
    }
    expect(
      (
        await db.query(
          "select jsonb_array_length(data) as n from public.tracker where id='weapons'",
        )
      ).rows[0],
    ).toEqual({ n: 4 });
  });
  it("conserve les cinq collections originales bit pour bit pendant les imports et mises à jour", async () => {
    const before = await db.query(
      "select id,data,updated_at from public.tracker order by id",
    );
    await role("authenticated", true, () => install());
    await role("authenticated", true, () =>
      db.query("select public.set_camo_progress($1,$2,$3,$4)", [
        "m4-green",
        20,
        false,
        0,
      ]),
    );
    expect(
      (
        await db.query(
          "select id,data,updated_at from public.tracker order by id",
        )
      ).rows,
    ).toEqual(before.rows);
  });
  it("autorise la lecture anonyme et refuse toutes les écritures anonymes", async () => {
    await role("authenticated", true, () => install());
    await role("anon", false, async () => {
      expect(
        (await db.query("select * from public.camo_definitions")).rows,
      ).toHaveLength(1);
      expect(
        (await db.query("select * from public.camo_progress")).rows,
      ).toHaveLength(1);
      await expect(install()).rejects.toThrow();
      await expect(
        db.query("select public.set_camo_progress($1,$2,$3,$4)", [
          "m4-green",
          20,
          true,
          0,
        ]),
      ).rejects.toThrow();
      await expect(
        db.query("update public.camo_progress set completed=true"),
      ).rejects.toThrow();
      await expect(
        db.query("select * from private.administrators"),
      ).rejects.toThrow();
    });
  });
  it("refuse un utilisateur connecté non administrateur sur RPC et REST direct", async () => {
    await role("authenticated", true, () => install());
    await role("authenticated", false, async () => {
      await expect(install()).rejects.toThrow("Accès administrateur requis");
      await expect(
        db.query("select public.set_camo_progress($1,$2,$3,$4)", [
          "m4-green",
          20,
          true,
          0,
        ]),
      ).rejects.toThrow("Accès administrateur requis");
      expect(
        (
          await db.query(
            "update public.camo_progress set completed=true returning *",
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        db.query("insert into public.camo_definitions values($1,$2::jsonb)", [
          "second",
          JSON.stringify({ ...definition, id: "second", slot: 2 }),
        ]),
      ).rejects.toThrow();
      await expect(
        db.query(
          "insert into private.administrators values('00000000-0000-0000-0000-000000000002')",
        ),
      ).rejects.toThrow();
    });
  });
  it("réimporte sans écraser les compteurs, le statut ni la révision", async () => {
    await role("authenticated", true, async () => {
      await install();
      await db.query("select public.set_camo_progress($1,$2,$3,$4)", [
        "m4-green",
        22,
        false,
        0,
      ]);
      await install([
        { ...definition, description: "Condition corrigée", target: 15 },
      ]);
      const row = (await db.query("select * from public.camo_progress"))
        .rows[0];
      expect(row).toMatchObject({ current: 22, completed: false, revision: 1 });
      await expect(
        db.query("select public.set_camo_progress($1,$2,$3,$4)", [
          "m4-green",
          22,
          true,
          1,
        ]),
      ).rejects.toThrow("Le compteur dépasse la cible connue");
    });
  });
  it("préserve les états inconnus et ne déduit pas un succès d’un compteur", async () => {
    await role("authenticated", true, async () => {
      await install();
      await db.query("select public.set_camo_progress($1,$2,$3,$4)", [
        "m4-green",
        25,
        false,
        0,
      ]);
      expect(
        (await db.query("select completed from public.camo_progress")).rows[0],
      ).toEqual({ completed: false });
      await db.query("select public.set_camo_progress($1,$2,$3,$4)", [
        "m4-green",
        null,
        null,
        1,
      ]);
      expect(
        (await db.query("select current,completed from public.camo_progress"))
          .rows[0],
      ).toEqual({ current: null, completed: null });
    });
  });
  it("refuse les sauvegardes périmées sans écraser la progression récente", async () => {
    await role("authenticated", true, async () => {
      await install();
      await db.query("select public.set_camo_progress($1,$2,$3,$4)", [
        "m4-green",
        20,
        false,
        0,
      ]);
      await expect(
        db.query("select public.set_camo_progress($1,$2,$3,$4)", [
          "m4-green",
          15,
          false,
          0,
        ]),
      ).rejects.toThrow("Progression modifiée ailleurs");
      expect(
        (await db.query("select current,revision from public.camo_progress"))
          .rows[0],
      ).toEqual({ current: 20, revision: 1 });
    });
  });
  it("refuse les doublons de cases et les déplacements d’identifiants, atomiquement", async () => {
    await role("authenticated", true, async () => {
      await install();
      await expect(
        install([{ ...definition, id: "duplicate" }], []),
      ).rejects.toThrow();
      await expect(install([{ ...definition, slot: 2 }])).rejects.toThrow(
        "identité",
      );
      expect(
        (await db.query("select * from public.camo_definitions")).rows,
      ).toHaveLength(1);
      await expect(install([definition, definition])).rejects.toThrow(
        "dupliqués",
      );
    });
  });
  it("rejette JSON incomplet, références inconnues et types invalides, y compris null", async () => {
    await role("authenticated", true, async () => {
      await expect(
        db.query("select public.install_camo_catalog(null)"),
      ).rejects.toThrow();
      await expect(
        db.query("select public.install_camo_catalog($1)", [
          JSON.stringify({ definitions: null, progress: [] }),
        ]),
      ).rejects.toThrow();
      await expect(
        install([{ ...definition, weaponId: "missing" }]),
      ).rejects.toThrow("Arme inconnue");
      await expect(
        install([
          { ...definition, mode: null } as unknown as typeof definition,
        ]),
      ).rejects.toThrow("Définition invalide");
      await expect(install([{ ...definition, target: -1 }])).rejects.toThrow(
        "Définition invalide",
      );
      expect(
        (await db.query("select * from public.camo_definitions")).rows,
      ).toHaveLength(0);
    });
  });
});
