import { z } from "zod";
const count = z.number().int().nonnegative();
export const weaponSchema = z
  .object({
    id: z.string().min(1),
    game: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    level: count.nullable(),
    maxLevel: count.nullable(),
    kills: count.nullable(),
    deaths: count.nullable(),
    gold: z.boolean(),
    platinum: z.boolean(),
  })
  .passthrough();
export const challengeSchema = z
  .object({
    id: z.string().min(1),
    weaponId: z.string().min(1),
    name: z.string().min(1),
    tier: z.enum(["Militaire", "Spécial", "Or", "Platine", "Maîtrise"]),
    description: z.string(),
    current: count,
    target: count.positive(),
    completed: z.boolean(),
  })
  .passthrough()
  .refine((c) => c.current <= c.target, {
    message: "Le compteur dépasse la cible",
  });
export const matchSchema = z
  .object({
    id: z.string().min(1),
    game: z.string().min(1),
    date: z.string().datetime({ offset: true }),
    map: z.string().min(1),
    mode: z.string().min(1),
    result: z.enum(["Victoire", "Défaite", "Égalité"]),
    kills: count,
    deaths: count,
    assists: count,
    weaponId: z.string(),
    notes: z.string(),
  })
  .passthrough();
export const profileSchema = z
  .object({
    id: z.string(),
    nickname: z.string().min(1),
    kills: count.nullable(),
    deaths: count.nullable(),
    wins: count.nullable(),
    losses: count.nullable(),
    hours: z.number().nonnegative().nullable(),
    accuracy: z.number().min(0).max(100).nullable(),
  })
  .passthrough();
export const loadoutSchema = z
  .object({
    id: z.string().min(1),
    game: z.string().min(1),
    name: z.string().min(1),
    weaponId: z.string().min(1),
    type: z.enum(["Ranked", "Multijoueur", "Camouflage"]),
    attachments: z.array(z.string().min(1)).length(5),
    equipment: z.string(),
    perks: z.string(),
    notes: z.string(),
  })
  .passthrough();
export const schemas = {
  profiles: profileSchema,
  weapons: weaponSchema,
  challenges: challengeSchema,
  matches: matchSchema,
  loadouts: loadoutSchema,
};
export const datasetSchema = z
  .object({
    profiles: z.array(profileSchema).length(1),
    weapons: z.array(weaponSchema),
    challenges: z.array(challengeSchema),
    matches: z.array(matchSchema),
    loadouts: z.array(loadoutSchema),
  })
  .superRefine((d, ctx) => {
    for (const key of Object.keys(d) as Table[]) {
      const ids = d[key].map((r) => r.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          message: "Identifiants dupliqués : " + key,
        });
    }
    const ids = new Set(d.weapons.map((w) => w.id));
    for (const r of [...d.challenges, ...d.loadouts, ...d.matches])
      if (r.weaponId && !ids.has(r.weaponId))
        ctx.addIssue({
          code: "custom",
          message: "Référence arme inconnue : " + r.weaponId,
        });
  });
export type Weapon = z.infer<typeof weaponSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type Match = z.infer<typeof matchSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type Table = keyof typeof schemas;
export const initial: Dataset = {
  profiles: [
    {
      id: "azluck",
      nickname: "AZLUCK",
      kills: null,
      deaths: null,
      wins: null,
      losses: null,
      hours: null,
      accuracy: null,
    },
  ],
  weapons: ["Axion", "HAN 86", "VEL 46", "M4"].map((name, i) => ({
    id: ["axion", "han86", "vel46", "m4"][i],
    game: "mw4",
    name,
    category: "À renseigner",
    level: null,
    maxLevel: null,
    kills: null,
    deaths: null,
    gold: i < 3,
    platinum: false,
  })),
  challenges: [
    {
      id: "m4-military",
      weaponId: "m4",
      name: "Camouflages militaires",
      tier: "Militaire",
      description:
        "8 camouflages militaires terminés (information du propriétaire).",
      current: 8,
      target: 8,
      completed: true,
    },
    {
      id: "m4-myriad",
      weaponId: "m4",
      name: "Myriade",
      tier: "Spécial",
      description: "Condition à renseigner.",
      current: 1,
      target: 1,
      completed: true,
    },
    {
      id: "m4-night",
      weaponId: "m4",
      name: "Opérations nocturnes",
      tier: "Spécial",
      description: "Condition à renseigner.",
      current: 1,
      target: 1,
      completed: true,
    },
    {
      id: "m4-green",
      weaponId: "m4",
      name: "Vert",
      tier: "Spécial",
      description: "Effectuer 25 éliminations dans le dos.",
      current: 14,
      target: 25,
      completed: false,
    },
  ],
  matches: [],
  loadouts: [],
};
export function ratio(a: number | null, b: number | null) {
  return a === null || b === null || b === 0 ? null : a / b;
}
export function progress(c: Challenge) {
  return c.completed
    ? 100
    : Math.min(100, Math.max(0, (c.current / c.target) * 100));
}
export function aggregate(matches: Match[]) {
  const kills = matches.reduce((n, m) => n + m.kills, 0),
    deaths = matches.reduce((n, m) => n + m.deaths, 0),
    wins = matches.filter((m) => m.result === "Victoire").length;
  return {
    kills,
    deaths,
    kd: matches.length ? ratio(kills, deaths) : null,
    winrate: matches.length ? (wins / matches.length) * 100 : null,
  };
}
export function format(value: number | null, suffix = "") {
  return value === null
    ? "—"
    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
        value,
      ) + suffix;
}
export const blank: Record<Table, object> = {
  profiles: initial.profiles[0],
  weapons: {
    id: "",
    game: "mw4",
    name: "",
    category: "À renseigner",
    level: null,
    maxLevel: null,
    kills: null,
    deaths: null,
    gold: false,
    platinum: false,
  },
  challenges: {
    id: "",
    weaponId: "m4",
    name: "",
    tier: "Spécial",
    description: "",
    current: 0,
    target: 25,
    completed: false,
  },
  matches: {
    id: "",
    game: "mw4",
    date: new Date().toISOString(),
    map: "",
    mode: "",
    result: "Victoire",
    kills: 0,
    deaths: 0,
    assists: 0,
    weaponId: "m4",
    notes: "",
  },
  loadouts: {
    id: "",
    game: "mw4",
    name: "",
    weaponId: "m4",
    type: "Multijoueur",
    attachments: ["", "", "", "", ""],
    equipment: "",
    perks: "",
    notes: "",
  },
};
