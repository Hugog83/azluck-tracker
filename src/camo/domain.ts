import { z } from "zod";
import type { Dataset, Weapon, Challenge } from "../domain";

export const OFFICIAL_SOURCE =
  "https://www.callofduty.com/fr/blog/2026/10/call-of-duty-modern-warfare-4-ready-for-launch-progression-prestige";
const count = z.number().int().nonnegative();
export const definitionSchema = z.object({
  id: z.string().min(1),
  weaponId: z.string().min(1).nullable(),
  mode: z.enum(["shared", "mp", "dmz", "warzone"]),
  track: z.enum([
    "military",
    "special",
    "gold",
    "platinum",
    "harmonic",
    "divergence",
    "mastery",
    "prestige",
    "legacy",
  ]),
  slot: count.min(1),
  name: z.string().nullable(),
  description: z.string().nullable(),
  target: count.positive().nullable(),
  unlockLevel: count.min(1).nullable(),
  rule: z.enum([
    "none",
    "base",
    "category-gold",
    "all-platinum",
    "all-harmonic",
    "previous",
    "unknown",
  ]),
  prerequisiteId: z.string().nullable(),
  source: z.enum(["official", "community", "owner", "unknown"]),
  sourceUrl: z
    .url()
    .refine(
      (value) => value.startsWith("https://"),
      "Une source HTTPS est requise.",
    )
    .nullable(),
});
export const progressSchema = z.object({
  definitionId: z.string().min(1),
  current: count.nullable(),
  completed: z.boolean().nullable(),
  revision: count,
});
export type CamoDefinition = z.infer<typeof definitionSchema>;
export type CamoProgress = z.infer<typeof progressSchema>;
export type CamoMode = CamoDefinition["mode"];
export type CamoTrack = CamoDefinition["track"];
export const catalogSchema = z
  .object({
    definitions: z.array(definitionSchema),
    progress: z.array(progressSchema),
  })
  .superRefine((catalog, ctx) => {
    const ids = new Set<string>(),
      slots = new Set<string>(),
      progressIds = new Set<string>();
    for (const d of catalog.definitions) {
      const slot = JSON.stringify([d.weaponId, d.mode, d.track, d.slot]);
      if (ids.has(d.id) || slots.has(slot))
        ctx.addIssue({ code: "custom", message: "Défi dupliqué : " + d.id });
      ids.add(d.id);
      slots.add(slot);
    }
    for (const p of catalog.progress) {
      if (progressIds.has(p.definitionId))
        ctx.addIssue({
          code: "custom",
          message: "Progression dupliquée : " + p.definitionId,
        });
      if (!ids.has(p.definitionId))
        ctx.addIssue({
          code: "custom",
          message: "Définition absente : " + p.definitionId,
        });
      progressIds.add(p.definitionId);
    }
    for (const d of catalog.definitions)
      if (d.prerequisiteId && !ids.has(d.prerequisiteId))
        ctx.addIssue({
          code: "custom",
          message: "Prérequis absent : " + d.prerequisiteId,
        });
    const prerequisites = new Map(
      catalog.definitions.map((d) => [d.id, d.prerequisiteId]),
    );
    const checked = new Set<string>();
    for (const definition of catalog.definitions) {
      const path = new Set<string>();
      let cursor: string | null = definition.id;
      while (cursor && prerequisites.has(cursor) && !checked.has(cursor)) {
        if (path.has(cursor)) {
          ctx.addIssue({
            code: "custom",
            message: "Cycle de prérequis : " + cursor,
          });
          break;
        }
        path.add(cursor);
        cursor = prerequisites.get(cursor) ?? null;
      }
      for (const id of path) checked.add(id);
    }
  });
export type CamoCatalog = z.infer<typeof catalogSchema>;
export type CamoStatus = {
  state: "obtained" | "available" | "locked" | "unknown";
  reason: string;
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function definitionId(
  weaponId: string | null,
  mode: CamoMode,
  track: CamoTrack,
  slot = 1,
) {
  return `mw4:${weaponId ?? "global"}:${mode}:${track}:${slot}`;
}
export function findProgress(catalog: CamoCatalog, id: string) {
  return catalog.progress.find((p) => p.definitionId === id);
}
const unknownProgress = (id: string): CamoProgress => ({
  definitionId: id,
  current: null,
  completed: null,
  revision: 0,
});
function definition(
  weaponId: string | null,
  track: CamoTrack,
  slot: number,
  changes: Partial<CamoDefinition> = {},
): CamoDefinition {
  const mode = changes.mode ?? "shared";
  return {
    id: definitionId(weaponId, mode, track, slot),
    weaponId,
    mode,
    track,
    slot,
    name: null,
    description: null,
    target: null,
    unlockLevel: null,
    rule: "unknown",
    prerequisiteId: null,
    source: "unknown",
    sourceUrl: null,
    ...changes,
  };
}
const specials: Record<string, Array<[string, string, number]>> = {
  han86: [
    ["Fumée", "Éliminations en appui ; quantité à vérifier.", 25],
    [
      "Vague d’orage",
      "Éliminations avec silencieux ; quantité à vérifier.",
      46,
    ],
    ["Rouge", "Éliminations sans mourir ; quantité à vérifier.", 72],
  ],
  sang9mm: [
    ["Automne", "Éliminations en visée ; quantité à vérifier.", 13],
    ["Peau de serpent", "Éliminations sans mourir ; quantité à vérifier.", 25],
    ["Espace-temps", "Éliminations en Akimbo ; quantité à vérifier.", 38],
  ],
};
const masteries: Record<
  "mp" | "dmz" | "warzone",
  Array<[string, string | null, number | null]>
> = {
  mp: [
    ["Dérive mercuriale", "250 parties avec au moins 10 éliminations.", 250],
    [
      "Polyatomique reforgé",
      "250 séries de 3 éliminations sans dégâts subis.",
      250,
    ],
    ["Orion reforgé", "250 séries de 5 éliminations sans mourir.", 250],
  ],
  dmz: [
    ["Chiral", "1 000 ennemis de niveau 3 ou supérieur.", 1000],
    [
      "Marée ondulante",
      "25 exfiltrations avec au moins 2 plaques de lieutenant par déploiement.",
      25,
    ],
    [
      "Hélio",
      "2 500 ennemis ; arme légendaire et opérateur de niveau maximal.",
      2500,
    ],
  ],
  warzone: [
    ["Parallaxe", null, null],
    ["Damas reforgé", null, null],
    ["Empyrée", null, null],
  ],
};
const prestiges: Array<[string, string]> = [
  ["Pyroclaste", "Prestige d’arme 1, niveau 1."],
  ["Terminus pyroclastique", "Prestige d’arme 1, niveau maximal."],
  ["Dispersion pyroclastique", "Maître Prestige d’arme, niveau 150."],
  ["Cascade pyroclastique", "Maître Prestige d’arme, niveau 250."],
];
const categoryConditions: Record<string, [string, string]> = {
  fusildassaut: ["Tirs dans la tête", "Doubles éliminations"],
  mitraillette: ["Éliminations dans le dos", "Éliminations au jugé"],
  fusilapompe: ["Éliminations au jugé", "Éliminations sans recharger"],
  mitrailleuse: [
    "Éliminations sans mourir",
    "Éliminations sans relâcher la gâchette",
  ],
  fusilmitrailleurs: [
    "Éliminations sans mourir",
    "Éliminations sans relâcher la gâchette",
  ],
  fusilmitrailleur: [
    "Éliminations sans mourir",
    "Éliminations sans relâcher la gâchette",
  ],
  fusiltactiques: [
    "Éliminations en position allongée",
    "Éliminations en une balle",
  ],
  fusiltactique: [
    "Éliminations en position allongée",
    "Éliminations en une balle",
  ],
  fusildeprecision: [
    "Éliminations en position allongée",
    "Éliminations en une balle",
  ],
  pistolet: ["Éliminations dans le dos", "Éliminations au jugé"],
  lanceur: ["Éliminations sans subir de dégâts", "Éliminations de joueurs"],
};
function categoryDescription(category: string, track: "platinum" | "harmonic") {
  const condition =
    categoryConditions[categoryKey(category)]?.[track === "platinum" ? 0 : 1];
  return condition ? `${condition} ; quantité à vérifier.` : null;
}
function isMilitaryAggregate(c: Challenge) {
  return (
    c.tier === "Militaire" &&
    (c.id === "m4-military" ||
      (c.target === 8 && normalize(c.name).includes("camouflagesmilitaires")))
  );
}
function legacyDefinition(c: Challenge, slot: number): CamoDefinition {
  return definition(c.weaponId, "legacy", slot, {
    id: c.id,
    name: c.name,
    description: c.description,
    target: c.target,
    source: "owner",
  });
}

/** Pure projection. The legacy collections, their identifiers and their values are never changed. */
export function buildCatalog(data: Dataset): CamoCatalog {
  const definitions: CamoDefinition[] = [],
    progress: CamoProgress[] = [];
  const official = { source: "official" as const, sourceUrl: OFFICIAL_SOURCE };
  const divergence = definition(null, "divergence", 1, {
    name: "Divergence",
    description: "Obtenir Rupture harmonique sur les 33 armes de lancement.",
    target: 33,
    rule: "all-harmonic",
    ...official,
  });
  definitions.push(divergence);
  progress.push(unknownProgress(divergence.id));
  for (const weapon of data.weapons.filter((w) => w.game === "mw4")) {
    const challenges = data.challenges
      .filter((c) => c.weaponId === weapon.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    const legacyUsed = new Set<string>();
    const aggregate = challenges.find(isMilitaryAggregate);
    const military = challenges.filter(
      (c) => c.tier === "Militaire" && !isMilitaryAggregate(c),
    );
    const priority = ["m4-myriad", "m4-night", "m4-green"];
    const special = challenges
      .filter((c) => c.tier === "Spécial")
      .sort((a, b) => {
        const ai = priority.indexOf(a.id),
          bi = priority.indexOf(b.id);
        return (
          (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.id.localeCompare(b.id)
        );
      });
    const publishedSpecials = specials[normalize(weapon.name)];
    const specialSlots = Array.from({ length: 3 }, (_, index) =>
      publishedSpecials?.[index]
        ? special.find(
            (c) => normalize(c.name) === normalize(publishedSpecials[index][0]),
          )
        : undefined,
    );
    const assigned = new Set(specialSlots.filter(Boolean).map((c) => c!.id));
    const remaining = special.filter((c) => !assigned.has(c.id));
    for (let slot = 0; slot < specialSlots.length; slot++)
      specialSlots[slot] ??= remaining.shift();
    const add = (d: CamoDefinition, old?: Challenge, obtained?: boolean) => {
      if (old) {
        legacyUsed.add(old.id);
        d = {
          ...d,
          id: old.id,
          name: old.name,
          description: old.description,
          target: old.target,
          source: "owner",
          sourceUrl: null,
          unlockLevel:
            d.name && normalize(old.name) === normalize(d.name)
              ? d.unlockLevel
              : null,
          rule: d.track === "special" ? "none" : d.rule,
        };
      }
      definitions.push(d);
      progress.push(
        old
          ? {
              definitionId: d.id,
              current: old.current,
              completed: old.completed || obtained === true,
              revision: 0,
            }
          : obtained
            ? {
                definitionId: d.id,
                current: null,
                completed: true,
                revision: 0,
              }
            : unknownProgress(d.id),
      );
    };
    for (let slot = 1; slot <= 8; slot++)
      add(
        definition(weapon.id, "military", slot, {
          name: `Camouflage militaire ${slot}`,
          ...official,
        }),
        military[slot - 1],
        aggregate?.completed === true,
      );
    for (let slot = 1; slot <= 3; slot++) {
      const verified = specials[normalize(weapon.name)]?.[slot - 1];
      add(
        definition(
          weapon.id,
          "special",
          slot,
          verified
            ? {
                name: verified[0],
                description: verified[1],
                unlockLevel: verified[2],
                rule: "none",
                ...official,
              }
            : {},
        ),
        specialSlots[slot - 1],
      );
    }
    add(
      definition(weapon.id, "gold", 1, {
        name: "Or",
        description:
          "15 éliminations en une partie multijoueur, ou 100 en une partie DMZ.",
        rule: "base",
        ...official,
      }),
      challenges.find((c) => c.tier === "Or"),
      weapon.gold,
    );
    add(
      definition(weapon.id, "platinum", 1, {
        name: "Platine",
        description: categoryDescription(weapon.category, "platinum"),
        rule: "category-gold",
        ...official,
      }),
      challenges.find((c) => c.tier === "Platine"),
      weapon.platinum,
    );
    add(
      definition(weapon.id, "harmonic", 1, {
        name: "Rupture harmonique",
        description: categoryDescription(weapon.category, "harmonic"),
        rule: "all-platinum",
        ...official,
      }),
      challenges.find((c) => normalize(c.name) === "ruptureharmonique"),
    );
    for (const mode of ["mp", "dmz", "warzone"] as const) {
      let previousId = divergence.id;
      masteries[mode].forEach(([name, description, target], index) => {
        const old = challenges.find(
          (c) => c.tier === "Maîtrise" && normalize(c.name) === normalize(name),
        );
        const d = definition(weapon.id, "mastery", index + 1, {
          mode,
          name,
          description,
          target,
          rule: "previous",
          prerequisiteId: previousId,
          ...official,
        });
        add(d, old);
        previousId = old?.id ?? d.id;
      });
    }
    prestiges.forEach(([name, description], index) =>
      add(
        definition(weapon.id, "prestige", index + 1, {
          name,
          description,
          ...official,
        }),
        challenges.find((c) => normalize(c.name) === normalize(name)),
      ),
    );
    let legacySlot = 1;
    for (const old of challenges.filter((c) => !legacyUsed.has(c.id))) {
      const d = legacyDefinition(old, legacySlot++);
      definitions.push(d);
      progress.push({
        definitionId: d.id,
        current: old.current,
        completed: old.completed,
        revision: 0,
      });
    }
  }
  return catalogSchema.parse({ definitions, progress });
}

const obtained = (catalog: CamoCatalog, id: string) =>
  findProgress(catalog, id)?.completed === true;
const unknown = (reason = "Condition à vérifier."): CamoStatus => ({
  state: "unknown",
  reason,
});
const locked = (reason: string): CamoStatus => ({ state: "locked", reason });
const available = (
  reason = "Prérequis remplis ; défi accessible.",
): CamoStatus => ({ state: "available", reason });
const sharedDefinitions = (
  catalog: CamoCatalog,
  track: CamoTrack,
  weaponId?: string,
) =>
  catalog.definitions.filter(
    (d) =>
      d.mode === "shared" &&
      d.track === track &&
      (weaponId === undefined || d.weaponId === weaponId),
  );
function completeSet(
  catalog: CamoCatalog,
  defs: CamoDefinition[],
  expected: number,
) {
  return defs.length === expected && defs.every((d) => obtained(catalog, d.id));
}
const categoryCounts: Record<string, number> = {
  fusildassaut: 8,
  fusilsdassaut: 8,
  mitraillette: 5,
  mitraillettes: 5,
  fusilapompe: 2,
  fusilsapompe: 2,
  mitrailleuse: 3,
  mitrailleuses: 3,
  fusilmitrailleur: 3,
  fusilsmitrailleurs: 3,
  fusiltactique: 3,
  fusilstactiques: 3,
  fusildeprecision: 3,
  fusilsdeprecision: 3,
  pistolet: 4,
  pistolets: 4,
  lanceur: 4,
  lanceurs: 4,
  corpsacorps: 1,
  armedecorpsacorps: 1,
};
const categoryKey = (category: string) =>
  normalize(category)
    .replace(/^fusils/, "fusil")
    .replace(/^fusiltactiques$/, "fusiltactique")
    .replace(/^mitraillettes$/, "mitraillette")
    .replace(/^mitrailleuses$/, "mitrailleuse")
    .replace(/^pistolets$/, "pistolet")
    .replace(/^lanceurs$/, "lanceur");

/** Accessibility is not completion. Unknown conditions and missing roster entries remain explicit. */
export function statusOf(
  def: CamoDefinition,
  catalog: CamoCatalog,
  weapons: Weapon[],
): CamoStatus {
  if (obtained(catalog, def.id))
    return {
      state: "obtained",
      reason: "Obtention confirmée par le propriétaire.",
    };
  const weapon = weapons.find((w) => w.id === def.weaponId);
  if (def.unlockLevel !== null) {
    if (weapon?.level === null || weapon?.level === undefined)
      return unknown("Niveau de l’arme à renseigner.");
    if (weapon.level < def.unlockLevel)
      return locked(`Niveau d’arme ${def.unlockLevel} requis.`);
  }
  if (def.rule === "unknown") return unknown();
  if (def.rule === "base") {
    const military = sharedDefinitions(catalog, "military", def.weaponId ?? "");
    const special = sharedDefinitions(catalog, "special", def.weaponId ?? "");
    if (!completeSet(catalog, military, 8) || !completeSet(catalog, special, 3))
      return locked(
        "Obtenir les 8 militaires et les 3 spéciaux de cette arme.",
      );
  }
  if (def.rule === "category-gold") {
    if (!weapon || !categoryCounts[normalize(weapon.category)])
      return unknown("Catégorie d’arme à vérifier.");
    const category = weapons.filter(
      (w) =>
        w.game === "mw4" &&
        categoryKey(w.category) === categoryKey(weapon.category),
    );
    if (category.length !== categoryCounts[normalize(weapon.category)])
      return unknown("Catalogue de cette catégorie incomplet ou à vérifier.");
    const gold = category.flatMap((w) =>
      sharedDefinitions(catalog, "gold", w.id),
    );
    if (!completeSet(catalog, gold, category.length))
      return locked("Obtenir l’Or de toutes les armes de cette catégorie.");
  }
  if (def.rule === "all-platinum" || def.rule === "all-harmonic") {
    const roster = weapons.filter((w) => w.game === "mw4");
    if (roster.length !== 33)
      return unknown("Les 33 armes de lancement doivent être renseignées.");
    const track = def.rule === "all-platinum" ? "platinum" : "harmonic";
    const defs = roster.flatMap((w) => sharedDefinitions(catalog, track, w.id));
    if (!completeSet(catalog, defs, 33))
      return locked(
        def.rule === "all-platinum"
          ? "Obtenir Platine sur les 33 armes de lancement."
          : "Obtenir Rupture harmonique sur les 33 armes de lancement.",
      );
  }
  if (def.rule === "previous") {
    if (
      !def.prerequisiteId ||
      !catalog.definitions.some((d) => d.id === def.prerequisiteId)
    )
      return unknown("Prérequis à vérifier.");
    if (!obtained(catalog, def.prerequisiteId))
      return locked("Obtenir le camouflage précédent de cette voie.");
  }
  if (def.track === "divergence")
    return available(
      "33 Rupture harmonique confirmés ; obtention à confirmer.",
    );
  if (def.track === "gold" && def.description)
    return available("8 militaires et 3 spéciaux obtenus. Défi Or accessible.");
  if (
    !def.description ||
    def.target === null ||
    def.description.includes("à vérifier") ||
    def.description.includes("à renseigner")
  )
    return unknown();
  return available();
}
export function progressPercent(
  def: CamoDefinition,
  progress: CamoProgress | undefined,
): number | null {
  if (progress?.completed === true) return 100;
  if (
    def.target === null ||
    progress?.current === null ||
    progress?.current === undefined
  )
    return null;
  return Math.max(0, Math.min(100, (progress.current / def.target) * 100));
}
export function weaponSummary(
  weaponId: string,
  catalog: CamoCatalog,
  mode: CamoMode = "shared",
) {
  const definitions = catalog.definitions.filter(
    (d) =>
      d.weaponId === weaponId &&
      d.mode === mode &&
      ["military", "special", "gold", "platinum", "harmonic"].includes(d.track),
  );
  const completed = definitions.filter((d) => obtained(catalog, d.id)).length;
  const has = (track: CamoTrack) =>
    definitions.some((d) => d.track === track && obtained(catalog, d.id));
  return {
    total: definitions.length,
    completed,
    percent: definitions.length ? (completed / definitions.length) * 100 : 0,
    gold: has("gold"),
    platinum: has("platinum"),
    harmonic: has("harmonic"),
  };
}
/** The server must authorize the administrator and compare revision before persisting this patch. */
export function validateProgressChange(
  def: CamoDefinition,
  patch: Partial<CamoProgress>,
  catalog: CamoCatalog,
  weapons: Weapon[],
): CamoProgress {
  if (!catalog.definitions.some((d) => d.id === def.id))
    throw Error("Défi absent du catalogue.");
  if (patch.definitionId && patch.definitionId !== def.id)
    throw Error("Identifiant de défi incohérent.");
  const existing = findProgress(catalog, def.id) ?? unknownProgress(def.id);
  const next = progressSchema.parse({
    ...existing,
    ...patch,
    definitionId: def.id,
    revision: existing.revision,
  });
  if (def.target !== null && next.current !== null && next.current > def.target)
    throw Error("Le compteur dépasse l’objectif.");
  if (
    next.completed === true &&
    existing.completed !== true &&
    statusOf(def, catalog, weapons).state === "locked"
  )
    throw Error("Les prérequis de ce défi sont verrouillés.");
  return next;
}
/** Definition refreshes retain every existing progress row, including manual corrections. */
export function mergeCatalog(
  existing: CamoCatalog,
  incoming: CamoCatalog,
): CamoCatalog {
  catalogSchema.parse(existing);
  catalogSchema.parse(incoming);
  const definitions = new Map(existing.definitions.map((d) => [d.id, d]));
  for (const d of incoming.definitions) definitions.set(d.id, d);
  const progress = new Map(incoming.progress.map((p) => [p.definitionId, p]));
  for (const p of existing.progress) progress.set(p.definitionId, p);
  return catalogSchema.parse({
    definitions: [...definitions.values()],
    progress: [...progress.values()],
  });
}
export function canEditProgress(isAdmin: boolean, catalogReady: boolean) {
  return isAdmin && catalogReady;
}
