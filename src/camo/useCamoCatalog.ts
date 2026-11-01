import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "../domain";
import { supabase, readData } from "../data";
import {
  buildCatalog,
  catalogSchema,
  validateProgressChange,
  type CamoCatalog,
  type CamoDefinition,
  type CamoProgress,
} from "./domain";
import {
  readCamoStore,
  persistCamoProgress,
  installCamoCatalog,
  canEditCamos,
  type CamoStore,
} from "./repository";

export function useCamoCatalog(
  legacy: Dataset,
  enabled: boolean,
  admin: boolean,
) {
  const fallback = useMemo(() => buildCatalog(legacy), [legacy]);
  const [store, setStore] = useState<CamoStore>({
    catalog: fallback,
    ready: false,
    message: "",
  });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0),
    writeLock = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    const next = await readCamoStore(legacy);
    if (request === generation.current) {
      setStore(next);
      setLoading(false);
    }
  }, [legacy]);
  useEffect(() => {
    if (enabled) void refresh();
    return () => {
      generation.current++;
    };
  }, [enabled, refresh]);
  const canEdit = canEditCamos(admin, !!supabase, store.ready) && !loading;
  async function update(
    definition: CamoDefinition,
    patch: Partial<CamoProgress>,
  ) {
    if (!canEdit || writeLock.current)
      throw Error(
        "Modification indisponible : accès administrateur et catalogue actif requis.",
      );
    const change = validateProgressChange(
      definition,
      patch,
      store.catalog,
      legacy.weapons,
    );
    writeLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await persistCamoProgress(change);
      setStore((previous) => ({
        ...previous,
        catalog: {
          ...previous.catalog,
          progress: [
            ...previous.catalog.progress.filter(
              (p) => p.definitionId !== saved.definitionId,
            ),
            saved,
          ],
        },
      }));
      setNotice("Progression enregistrée.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sauvegarde impossible";
      setError(message);
      throw e;
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  }
  async function initialize() {
    if (!admin || !supabase || writeLock.current)
      throw Error("Accès administrateur requis.");
    writeLock.current = true;
    setBusy(true);
    setError("");
    try {
      // Relecture impérative juste avant import : aucun snapshot initial ancien n’est envoyé.
      const current = await readData();
      await installCamoCatalog(buildCatalog(current));
      await refresh();
      setNotice(
        "Catalogue importé. Les progressions déjà présentes sont conservées.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible");
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  }
  async function importCatalog(incoming: CamoCatalog) {
    if (!admin || !supabase || writeLock.current)
      throw Error("Accès administrateur requis.");
    writeLock.current = true;
    setBusy(true);
    setError("");
    try {
      await installCamoCatalog(catalogSchema.parse(incoming));
      await refresh();
      setNotice("Définitions importées ; progressions existantes conservées.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible");
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  }
  return {
    ...store,
    loading,
    busy,
    error,
    notice,
    canEdit,
    update,
    refresh,
    initialize,
    importCatalog,
  };
}
export type CamoController = ReturnType<typeof useCamoCatalog>;
