import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../data";
import type { Dataset } from "../domain";
import {
  buildCatalog,
  catalogSchema,
  progressSchema,
  type CamoCatalog,
  type CamoProgress,
} from "./domain";

export interface CamoStore {
  catalog: CamoCatalog;
  ready: boolean;
  message: string;
}
export const canEditCamos = (
  admin: boolean,
  configured: boolean,
  ready: boolean,
) => admin && configured && ready;

// Pagination explicite : ne jamais tronquer silencieusement un catalogue à 1 000 entrées.
async function readAll(client: SupabaseClient, table: string, columns: string) {
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(table === "camo_definitions" ? "id" : "definition_id")
      .range(start, start + 999);
    if (error) throw error;
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) return rows;
  }
}
export async function readCamoStore(
  legacy: Dataset,
  client = supabase,
): Promise<CamoStore> {
  const fallback = buildCatalog(legacy);
  if (!client)
    return {
      catalog: fallback,
      ready: false,
      message: "Aperçu en lecture seule : Supabase n’est pas configuré.",
    };
  try {
    const [definitions, progress] = await Promise.all([
      readAll(client, "camo_definitions", "id,definition"),
      readAll(
        client,
        "camo_progress",
        "definition_id,current,completed,revision",
      ),
    ]);
    if (!definitions.length)
      return {
        catalog: fallback,
        ready: false,
        message:
          "Le catalogue V2 doit être importé après revue de la migration. Vos données actuelles restent intactes.",
      };
    const catalog = catalogSchema.parse({
      definitions: definitions.map((r) => r.definition),
      progress: progress.map((r) => ({
        definitionId: r.definition_id,
        current: r.current,
        completed: r.completed,
        revision: r.revision,
      })),
    });
    return { catalog, ready: true, message: "" };
  } catch (e) {
    const error = e as { code?: string; message?: string };
    const missing = error.code === "42P01" || error.code === "PGRST205";
    return {
      catalog: fallback,
      ready: false,
      message: missing
        ? "Migration V2 non appliquée : aperçu calculé depuis les données existantes, sans écriture."
        : "Lecture du catalogue V2 impossible : " +
          (error.message || "erreur inconnue") +
          ". Modifications désactivées.",
    };
  }
}
async function requireAdmin(client: SupabaseClient | null) {
  if (!client) throw Error("Supabase non configuré.");
  const { data, error } = await client.rpc("is_admin");
  if (error || data !== true) throw Error("Accès administrateur requis.");
  return client;
}
export async function persistCamoProgress(
  progress: CamoProgress,
  client = supabase,
): Promise<CamoProgress> {
  const api = await requireAdmin(client);
  const { data, error } = await api.rpc("set_camo_progress", {
    p_definition_id: progress.definitionId,
    p_current: progress.current,
    p_completed: progress.completed,
    p_expected_revision: progress.revision,
  });
  if (error)
    throw Error(
      error.code === "40001"
        ? "Cette progression a changé sur un autre appareil. Rechargez avant de réessayer."
        : error.message,
    );
  const row = Array.isArray(data) ? data[0] : data;
  return progressSchema.parse({
    definitionId: row.definition_id,
    current: row.current,
    completed: row.completed,
    revision: row.revision,
  });
}
export async function installCamoCatalog(
  catalog: CamoCatalog,
  client = supabase,
) {
  const payload = catalogSchema.parse(catalog);
  const api = await requireAdmin(client);
  const { error } = await api.rpc("install_camo_catalog", { payload });
  if (error) throw Error(error.message);
}
