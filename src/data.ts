import { createClient } from "@supabase/supabase-js";
import { datasetSchema, initial, type Dataset } from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export async function readData(): Promise<Dataset> {
  if (!supabase) return structuredClone(initial);
  const { data, error } = await supabase.from("tracker").select("id,data");
  if (error) throw error;
  const grouped = Object.fromEntries(
    ["profiles", "weapons", "challenges", "matches", "loadouts"].map((k) => [
      k,
      data.filter((r) => r.id === k).flatMap((r) => r.data),
    ]),
  );
  return datasetSchema.parse(grouped);
}
export async function writeData(data: Dataset) {
  datasetSchema.parse(data);
  if (!supabase) throw Error("Configurez Supabase pour enregistrer.");
  const { error } = await supabase.rpc("save_tracker", { payload: data });
  if (error) throw error;
}
// Un connecteur futur doit retourner des données normalisées sans toucher à l’interface.
export interface StatsConnector {
  name: string;
  fetchProfile(playerId: string, gameId: string): Promise<Partial<Dataset>>;
}
export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob(["\ufeff", content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCsv(data: Dataset) {
  const rows = [
    ["collection", "id", "data"],
    ...Object.entries(data).flatMap(([key, rows]) =>
      rows.map((r: { id: string }) => [key, r.id, JSON.stringify(r)]),
    ),
  ];
  return rows
    .map((row) => row.map((s) => '"' + s.replaceAll('"', '""') + '"').join(","))
    .join("\r\n");
}
export function fromCsv(text: string): Dataset {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (c === "\n" && !quoted) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("CSV invalide");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const d: Record<string, unknown[]> = {
    profiles: [],
    weapons: [],
    challenges: [],
    matches: [],
    loadouts: [],
  };
  if (rows.shift()?.join(",") !== "collection,id,data")
    throw Error("En-tête CSV attendu : collection,id,data");
  for (const [table, id, json] of rows) {
    if (!d[table]) throw Error("Collection inconnue");
    const r = JSON.parse(json);
    if (r.id !== id) throw Error("Identifiant incohérent");
    d[table].push(r);
  }
  return datasetSchema.parse(d);
}
