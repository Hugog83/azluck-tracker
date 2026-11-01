import { describe, it, expect } from "vitest";
import { initial, type Dataset, type Weapon } from "../domain";
import {
  buildCatalog,
  catalogSchema,
  definitionId,
  findProgress,
  progressPercent,
  statusOf,
  weaponSummary,
  mergeCatalog,
  validateProgressChange,
  canEditProgress,
  type CamoCatalog,
  type CamoDefinition,
} from "./domain";
const one = (
  catalog: CamoCatalog,
  track: CamoDefinition["track"],
  weaponId: string | null = "m4",
  mode: CamoDefinition["mode"] = "shared",
) =>
  catalog.definitions.find(
    (d) => d.track === track && d.weaponId === weaponId && d.mode === mode,
  )!;
function complete(catalog: CamoCatalog, defs: CamoDefinition[]) {
  for (const d of defs) {
    const p = findProgress(catalog, d.id)!;
    p.completed = true;
  }
}
function roster(): Dataset {
  const d = structuredClone(initial);
  d.weapons = Array.from({ length: 33 }, (_, i) => ({
    ...initial.weapons[3],
    id: `w${i}`,
    name: `Arme ${i}`,
    category: i < 8 ? "Fusil d'assaut" : "Mitraillette",
  }));
  d.challenges = [];
  return d;
}

describe("Catalogue V2 non destructif", () => {
  it("conserve les collections et identifiants V1 sans muter le dataset", () => {
    const input = structuredClone(initial),
      before = structuredClone(input),
      catalog = buildCatalog(input);
    expect(input).toEqual(before);
    for (const old of initial.challenges) {
      expect(catalog.definitions.some((d) => d.id === old.id)).toBe(true);
      expect(findProgress(catalog, old.id)).toMatchObject({
        current: old.current,
        completed: old.completed,
      });
    }
  });
  it("conserve trois Or sans inventer les bases des armes en Or", () => {
    const c = buildCatalog(initial);
    expect(
      initial.weapons.filter((w) => weaponSummary(w.id, c).gold),
    ).toHaveLength(3);
    expect(weaponSummary("axion", c)).toMatchObject({
      completed: 1,
      total: 14,
    });
  });
  it("développe les huit militaires M4 confirmés en huit entrées et garde la preuve agrégée", () => {
    const c = buildCatalog(initial),
      defs = c.definitions.filter(
        (d) => d.weaponId === "m4" && d.track === "military",
      );
    expect(defs).toHaveLength(8);
    expect(defs.every((d) => findProgress(c, d.id)?.completed)).toBe(true);
    expect(one(c, "legacy").id).toBe("m4-military");
    expect(weaponSummary("m4", c).completed).toBe(10);
  });
  it("ne développe pas une obtention à partir du seul compteur agrégé", () => {
    const d = structuredClone(initial);
    d.challenges[0].completed = false;
    const c = buildCatalog(d);
    expect(
      c.definitions
        .filter((x) => x.track === "military" && x.weaponId === "m4")
        .every((x) => findProgress(c, x.id)?.completed === null),
    ).toBe(true);
  });
  it("préserve Vert à 14/25 et son pourcentage sans le terminer", () => {
    const c = buildCatalog(initial),
      d = c.definitions.find((x) => x.id === "m4-green")!;
    expect(findProgress(c, d.id)).toMatchObject({
      current: 14,
      completed: false,
    });
    expect(progressPercent(d, findProgress(c, d.id))).toBeCloseTo(56);
  });
  it("génère 14 entrées partagées par arme sans tripler les progressions", () => {
    const c = buildCatalog(initial);
    expect(
      c.definitions.filter(
        (d) =>
          d.weaponId === "m4" &&
          ["military", "special", "gold", "platinum", "harmonic"].includes(
            d.track,
          ),
      ),
    ).toHaveLength(14);
    expect(c.definitions.filter((d) => d.track === "divergence")).toHaveLength(
      1,
    );
    expect(
      c.definitions.filter((d) => d.weaponId === "m4" && d.track === "mastery"),
    ).toHaveLength(9);
    expect(
      c.definitions.filter(
        (d) => d.weaponId === "m4" && d.track === "prestige",
      ),
    ).toHaveLength(4);
  });
  it("marque les conditions inconnues explicitement et ne crée pas de progression fictive", () => {
    const c = buildCatalog(initial),
      d = one(c, "military", "axion");
    expect(d.target).toBeNull();
    expect(d.unlockLevel).toBeNull();
    expect(statusOf(d, c, initial.weapons).state).toBe("unknown");
    expect(progressPercent(d, findProgress(c, d.id))).toBeNull();
  });
  it("conserve toutes les armes, classes et statistiques de jeux différents", () => {
    const d = structuredClone(initial);
    d.weapons.push({ ...initial.weapons[0], id: "other", game: "next" });
    d.profiles[0].kills = 123;
    d.matches.push({
      id: "match",
      game: "mw4",
      date: "2026-11-01T12:00:00Z",
      map: "Carte",
      mode: "Test",
      result: "Victoire",
      kills: 4,
      deaths: 2,
      assists: 1,
      weaponId: "m4",
      notes: "Note",
    });
    d.loadouts.push({
      id: "loadout",
      game: "mw4",
      name: "Classe",
      weaponId: "m4",
      type: "Multijoueur",
      attachments: ["1", "2", "3", "4", "5"],
      equipment: "A",
      perks: "B",
      notes: "C",
    });
    const before = structuredClone(d);
    buildCatalog(d);
    expect(d).toEqual(before);
  });
  it("rejette doublons d’identifiant, emplacement, progression et références", () => {
    const c = buildCatalog(initial);
    expect(
      catalogSchema.safeParse({
        ...c,
        definitions: [...c.definitions, c.definitions[0]],
      }).success,
    ).toBe(false);
    expect(
      catalogSchema.safeParse({
        ...c,
        definitions: [
          ...c.definitions,
          { ...c.definitions[0], id: "duplicate" },
        ],
      }).success,
    ).toBe(false);
    expect(
      catalogSchema.safeParse({
        ...c,
        progress: [...c.progress, c.progress[0]],
      }).success,
    ).toBe(false);
    expect(
      catalogSchema.safeParse({
        ...c,
        progress: [
          {
            definitionId: "missing",
            current: null,
            completed: null,
            revision: 0,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("rafraîchit les définitions sans écraser les compteurs ni les confirmations", () => {
    const c = buildCatalog(initial),
      update = structuredClone(c);
    update.definitions.find((d) => d.id === "m4-green")!.description =
      "Condition révisée";
    findProgress(update, "m4-green")!.current = 0;
    const merged = mergeCatalog(c, update);
    expect(findProgress(merged, "m4-green")?.current).toBe(14);
    expect(
      merged.definitions.find((d) => d.id === "m4-green")?.description,
    ).toBe("Condition révisée");
    expect(mergeCatalog(merged, update)).toEqual(merged);
  });
});
describe("Prérequis, accessibilité et obtention", () => {
  it("verrouille Or avant les 8 militaires et 3 spéciaux, sans déduire Or du compteur", () => {
    const c = buildCatalog(initial),
      gold = one(c, "gold");
    expect(statusOf(gold, c, initial.weapons).state).toBe("locked");
    findProgress(c, "m4-green")!.completed = true;
    expect(statusOf(gold, c, initial.weapons).state).toBe("available");
    expect(findProgress(c, gold.id)?.completed).toBeNull();
    expect(gold.target).toBeNull();
  });
  it("respecte les confirmations historiques même si le détail des prérequis manque", () => {
    const c = buildCatalog(initial);
    expect(statusOf(one(c, "gold", "axion"), c, initial.weapons).state).toBe(
      "obtained",
    );
  });
  it("laisse Platine inconnu si la catégorie ou son inventaire manque", () => {
    const c = buildCatalog(initial);
    expect(statusOf(one(c, "platinum"), c, initial.weapons).state).toBe(
      "unknown",
    );
    const weapons = initial.weapons.map((w) => ({
      ...w,
      category: "Fusil d'assaut",
    }));
    expect(statusOf(one(c, "platinum"), c, weapons).state).toBe("unknown");
  });
  it("verrouille Platine jusqu’à Or sur chaque arme de la catégorie entière", () => {
    const d = roster(),
      c = buildCatalog(d),
      p = one(c, "platinum", "w0");
    expect(statusOf(p, c, d.weapons).state).toBe("locked");
    complete(
      c,
      c.definitions.filter(
        (x) => x.track === "gold" && Number(x.weaponId?.slice(1)) < 8,
      ),
    );
    expect(statusOf(p, c, d.weapons).state).toBe("unknown");
    expect(statusOf(p, c, d.weapons).reason).toContain("Condition");
    findProgress(c, p.id)!.completed = true;
    expect(statusOf(p, c, d.weapons).state).toBe("obtained");
  });
  it("n’ouvre pas Rupture harmonique avec un catalogue de moins de 33 armes", () => {
    const c = buildCatalog(initial);
    complete(
      c,
      c.definitions.filter((d) => d.track === "platinum"),
    );
    expect(statusOf(one(c, "harmonic"), c, initial.weapons).state).toBe(
      "unknown",
    );
  });
  it("Rupture harmonique exige 33 Platine, puis laisse son objectif exact à vérifier", () => {
    const d = roster(),
      c = buildCatalog(d),
      h = one(c, "harmonic", "w0");
    expect(statusOf(h, c, d.weapons).state).toBe("locked");
    complete(
      c,
      c.definitions.filter((x) => x.track === "platinum").slice(0, 32),
    );
    expect(statusOf(h, c, d.weapons).state).toBe("locked");
    complete(
      c,
      c.definitions.filter((x) => x.track === "platinum"),
    );
    expect(statusOf(h, c, d.weapons).state).toBe("unknown");
  });
  it("Divergence exige 33 Ruptures et sa disponibilité ne vaut pas obtention", () => {
    const d = roster(),
      c = buildCatalog(d),
      v = one(c, "divergence", null);
    complete(
      c,
      c.definitions.filter((x) => x.track === "harmonic").slice(0, 32),
    );
    expect(statusOf(v, c, d.weapons).state).toBe("locked");
    complete(
      c,
      c.definitions.filter((x) => x.track === "harmonic"),
    );
    expect(statusOf(v, c, d.weapons).state).toBe("available");
    expect(findProgress(c, v.id)?.completed).toBeNull();
  });
  it("chaîne les maîtrises dans leur mode après Divergence et sépare les Prestiges", () => {
    const c = buildCatalog(initial),
      mp = one(c, "mastery", "m4", "mp"),
      dmz = one(c, "mastery", "m4", "dmz");
    expect(statusOf(mp, c, initial.weapons).state).toBe("locked");
    findProgress(c, one(c, "divergence", null).id)!.completed = true;
    expect(statusOf(mp, c, initial.weapons).state).toBe("available");
    expect(statusOf(dmz, c, initial.weapons).state).toBe("available");
    expect(
      statusOf(
        c.definitions.find(
          (d) =>
            d.weaponId === "m4" &&
            d.mode === "mp" &&
            d.slot === 2 &&
            d.track === "mastery",
        )!,
        c,
        initial.weapons,
      ).state,
    ).toBe("locked");
    expect(
      statusOf(one(c, "mastery", "m4", "warzone"), c, initial.weapons).state,
    ).toBe("unknown");
    expect(statusOf(one(c, "prestige"), c, initial.weapons).state).toBe(
      "unknown",
    );
  });
  it("ne considère pas le compteur seul comme une obtention et refuse les éditions impossibles", () => {
    const c = buildCatalog(initial),
      green = c.definitions.find((d) => d.id === "m4-green")!;
    const next = validateProgressChange(
      green,
      { current: 25 },
      c,
      initial.weapons,
    );
    expect(next.completed).toBe(false);
    expect(() =>
      validateProgressChange(green, { current: 26 }, c, initial.weapons),
    ).toThrow();
    expect(() =>
      validateProgressChange(green, { current: -1 }, c, initial.weapons),
    ).toThrow();
    expect(() =>
      validateProgressChange(
        one(c, "gold"),
        { completed: true },
        c,
        initial.weapons,
      ),
    ).toThrow("verrouillés");
  });
  it("permet une confirmation manuelle inconnue, sans auto-complétion et sans changer de révision attendue", () => {
    const c = buildCatalog(initial),
      d = one(c, "military", "axion");
    const p = validateProgressChange(
      d,
      { completed: true },
      c,
      initial.weapons,
    );
    expect(p).toMatchObject({ completed: true, current: null, revision: 0 });
    expect(findProgress(c, d.id)?.completed).toBeNull();
  });
  it("l’écriture UI nécessite à la fois le rôle administrateur et la migration prête", () => {
    expect(canEditProgress(false, true)).toBe(false);
    expect(canEditProgress(true, false)).toBe(false);
    expect(canEditProgress(false, false)).toBe(false);
    expect(canEditProgress(true, true)).toBe(true);
  });
});
describe("Vérification du catalogue officiel et conflits hérités", () => {
  it("nomme les huit militaires sans inventer leur niveau ni leur condition", () => {
    const c = buildCatalog(initial),
      defs = c.definitions.filter(
        (d) => d.weaponId === "axion" && d.track === "military",
      );
    expect(defs.map((d) => d.name)).toEqual(
      Array.from({ length: 8 }, (_, i) => `Camouflage militaire ${i + 1}`),
    );
    expect(
      defs.every(
        (d) =>
          d.unlockLevel === null && d.target === null && d.description === null,
      ),
    ).toBe(true);
  });
  it("garde toute obtention Or ou Platine explicite en cas de compteur historique contradictoire", () => {
    const d = structuredClone(initial);
    d.weapons[0].platinum = true;
    d.challenges.push(
      {
        id: "axion-old-gold",
        weaponId: "axion",
        name: "Or",
        tier: "Or",
        description: "Note historique",
        current: 7,
        target: 15,
        completed: false,
      },
      {
        id: "axion-old-platinum",
        weaponId: "axion",
        name: "Platine",
        tier: "Platine",
        description: "Note historique",
        current: 2,
        target: 10,
        completed: false,
      },
    );
    const c = buildCatalog(d);
    expect(findProgress(c, "axion-old-gold")).toMatchObject({
      current: 7,
      completed: true,
    });
    expect(findProgress(c, "axion-old-platinum")).toMatchObject({
      current: 2,
      completed: true,
    });
    expect(weaponSummary("axion", c)).toMatchObject({
      gold: true,
      platinum: true,
      completed: 2,
    });
    expect(d.challenges.find((c) => c.id === "axion-old-gold")?.completed).toBe(
      false,
    );
  });
  it.each([
    ["Fusil d'assaut", "Tirs dans la tête", "Doubles éliminations"],
    ["Mitraillette", "Éliminations dans le dos", "Éliminations au jugé"],
    ["Pistolet", "Éliminations dans le dos", "Éliminations au jugé"],
    ["Fusil à pompe", "Éliminations au jugé", "Éliminations sans recharger"],
    [
      "Mitrailleuse",
      "Éliminations sans mourir",
      "Éliminations sans relâcher la gâchette",
    ],
    [
      "Fusil tactique",
      "Éliminations en position allongée",
      "Éliminations en une balle",
    ],
    [
      "Fusils tactiques",
      "Éliminations en position allongée",
      "Éliminations en une balle",
    ],
    [
      "Fusil de précision",
      "Éliminations en position allongée",
      "Éliminations en une balle",
    ],
    ["Lanceur", "Éliminations sans subir de dégâts", "Éliminations de joueurs"],
  ])(
    "décrit Platine et Rupture pour %s sans inventer de quantité",
    (category, platinum, harmonic) => {
      const d = structuredClone(initial);
      d.weapons[3].category = category;
      const c = buildCatalog(d);
      expect(one(c, "platinum").description).toBe(
        platinum + " ; quantité à vérifier.",
      );
      expect(one(c, "harmonic").description).toBe(
        harmonic + " ; quantité à vérifier.",
      );
      expect(one(c, "platinum").target).toBeNull();
      expect(one(c, "harmonic").target).toBeNull();
    },
  );
  it("laisse le corps-à-corps et les catégories inconnues sans condition inventée", () => {
    for (const category of ["Corps à corps", "À renseigner"]) {
      const d = structuredClone(initial);
      d.weapons[3].category = category;
      const c = buildCatalog(d);
      expect(one(c, "platinum").description).toBeNull();
      expect(one(c, "harmonic").description).toBeNull();
    }
  });
  it("rejette les cycles importés et les dépendances sur soi-même", () => {
    const c = buildCatalog(initial);
    const a = c.definitions[0],
      b = c.definitions[1];
    a.prerequisiteId = b.id;
    b.prerequisiteId = a.id;
    expect(catalogSchema.safeParse(c).success).toBe(false);
    a.prerequisiteId = a.id;
    b.prerequisiteId = null;
    expect(catalogSchema.safeParse(c).success).toBe(false);
  });
  it("rattache les niveaux publiés aux noms exacts plutôt qu’à l’ordre des identifiants", () => {
    const d = structuredClone(initial);
    d.challenges.push(
      {
        id: "han-a-rouge",
        weaponId: "han86",
        name: "Rouge",
        tier: "Spécial",
        description: "À vérifier",
        current: 0,
        target: 1,
        completed: false,
      },
      {
        id: "han-z-fumee",
        weaponId: "han86",
        name: "Fumée",
        tier: "Spécial",
        description: "À vérifier",
        current: 0,
        target: 1,
        completed: false,
      },
    );
    const c = buildCatalog(d);
    expect(c.definitions.find((d) => d.id === "han-a-rouge")?.unlockLevel).toBe(
      72,
    );
    expect(c.definitions.find((d) => d.id === "han-z-fumee")?.unlockLevel).toBe(
      25,
    );
  });
});
