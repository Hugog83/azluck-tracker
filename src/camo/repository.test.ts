import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canEditCamos,
  persistCamoProgress,
  installCamoCatalog,
  readCamoStore,
} from "./repository";
import { buildCatalog } from "./domain";
import { initial, datasetSchema } from "../domain";
function client(admin: boolean) {
  const rpc = vi.fn(async (name: string) =>
    name === "is_admin"
      ? { data: admin, error: null }
      : {
          data: {
            definition_id: "m4-green",
            current: 15,
            completed: false,
            revision: 4,
          },
          error: null,
        },
  );
  return { api: { rpc } as unknown as SupabaseClient, rpc };
}
describe("Séparation public / administration", () => {
  it("n’autorise jamais le visiteur ni un catalogue inactif", () => {
    expect(canEditCamos(false, true, true)).toBe(false);
    expect(canEditCamos(true, false, true)).toBe(false);
    expect(canEditCamos(true, true, false)).toBe(false);
    expect(canEditCamos(true, true, true)).toBe(true);
  });
  it("refuse une écriture non administrateur avant la RPC de mutation", async () => {
    const { api, rpc } = client(false);
    await expect(
      persistCamoProgress(
        {
          definitionId: "m4-green",
          current: 15,
          completed: false,
          revision: 3,
        },
        api,
      ),
    ).rejects.toThrow("administrateur");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith(
      "set_camo_progress",
      expect.anything(),
    );
  });
  it("transmet une seule progression avec sa version attendue", async () => {
    const { api, rpc } = client(true);
    const saved = await persistCamoProgress(
      { definitionId: "m4-green", current: 15, completed: false, revision: 3 },
      api,
    );
    expect(rpc).toHaveBeenLastCalledWith("set_camo_progress", {
      p_definition_id: "m4-green",
      p_current: 15,
      p_completed: false,
      p_expected_revision: 3,
    });
    expect(saved.revision).toBe(4);
  });
  it("ne permet pas l’import à un compte non administrateur", async () => {
    const { api, rpc } = client(false);
    await expect(
      installCamoCatalog(buildCatalog(initial), api),
    ).rejects.toThrow("administrateur");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("retombe en lecture seule si la migration n’est pas appliquée", async () => {
    const error = { code: "PGRST205", message: "Missing table" };
    const from = vi.fn(() => ({
      select: () => ({
        order: () => ({ range: async () => ({ data: null, error }) }),
      }),
    }));
    const store = await readCamoStore(initial, {
      from,
    } as unknown as SupabaseClient);
    expect(store.ready).toBe(false);
    expect(
      store.catalog.progress.find((p) => p.definitionId === "m4-green")
        ?.current,
    ).toBe(14);
    expect(store.message).toContain("Migration");
  });
  it("conserve les champs supplémentaires d’une collection historique", () => {
    const data = structuredClone(initial);
    data.weapons[0].futureMetadata = { note: "à conserver" };
    data.profiles[0].externalReference = "profil";
    const parsed = datasetSchema.parse(data);
    expect(parsed).toEqual(data);
  });
});
