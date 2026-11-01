import { describe, it, expect } from "vitest";
import {
  initial,
  aggregate,
  ratio,
  progress,
  datasetSchema,
  matchSchema,
} from "./domain";
import { toCsv, fromCsv } from "./data";
describe("Calculs fiables", () => {
  it("ne fabrique pas de ratio sans dénominateur", () => {
    expect(ratio(10, 0)).toBeNull();
    expect(ratio(null, 3)).toBeNull();
    expect(ratio(10, 4)).toBe(2.5);
  });
  it("conserve les statistiques absentes et les données connues", () => {
    expect(initial.profiles[0].kills).toBeNull();
    expect(initial.weapons.filter((w) => w.gold)).toHaveLength(3);
    expect(initial.challenges[3].current).toBe(14);
  });
  it("calcule la progression par défi", () => {
    expect(progress(initial.challenges[3])).toBeCloseTo(56);
    expect(progress(initial.challenges[0])).toBe(100);
  });
  it("ne produit pas de statistiques pour un historique vide", () => {
    expect(aggregate([]).kd).toBeNull();
    expect(aggregate([]).winrate).toBeNull();
  });
  it("agrège les éliminations avant de calculer le ratio", () => {
    const m = matchSchema.parse({
      id: "1",
      game: "mw4",
      date: "2026-11-01T12:00:00Z",
      map: "Test",
      mode: "Test",
      result: "Victoire",
      kills: 10,
      deaths: 2,
      assists: 0,
      weaponId: "m4",
      notes: "",
    });
    expect(
      aggregate([m, { ...m, id: "2", result: "Défaite", kills: 2, deaths: 4 }]),
    ).toMatchObject({ kd: 2, winrate: 50, kills: 12, deaths: 6 });
  });
  it("rejette les compteurs impossibles et références inconnues", () => {
    expect(
      datasetSchema.safeParse({
        ...initial,
        challenges: [{ ...initial.challenges[3], current: 26 }],
      }).success,
    ).toBe(false);
    expect(
      datasetSchema.safeParse({
        ...initial,
        challenges: [{ ...initial.challenges[3], weaponId: "inconnue" }],
      }).success,
    ).toBe(false);
  });
  it("préserve les virgules, guillemets et sauts de ligne en CSV", () => {
    const d = structuredClone(initial);
    d.weapons[0].name = 'Test, "arme"\nligne 2';
    expect(fromCsv(toCsv(d))).toEqual(d);
  });
  it("refuse les identifiants dupliqués et statistiques négatives", () => {
    expect(
      datasetSchema.safeParse({
        ...initial,
        weapons: [initial.weapons[0], initial.weapons[0]],
      }).success,
    ).toBe(false);
    expect(
      datasetSchema.safeParse({
        ...initial,
        profiles: [{ ...initial.profiles[0], kills: -1 }],
      }).success,
    ).toBe(false);
  });
});
