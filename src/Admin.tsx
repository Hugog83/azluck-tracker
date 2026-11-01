import { useState } from "react";
import { Download, Plus, LogOut, Lock, ArrowUpRight } from "lucide-react";
import {
  schemas,
  blank,
  datasetSchema,
  type Dataset,
  type Table,
} from "./domain";
import { supabase, download, toCsv, fromCsv } from "./data";
import { Empty } from "./ui";
export function Login({ fail }: { fail: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel login">
      <div className="brand-icon">
        <Lock />
      </div>
      <h2>Accès propriétaire</h2>
      <p className="muted">Seul un compte autorisé peut modifier le profil.</p>
      {!supabase ? (
        <div className="alert">
          Supabase n’est pas configuré. Consultez le README pour activer la
          connexion et la sauvegarde.
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            try {
              const { error } = await supabase!.auth.signInWithPassword({
                email: String(f.get("email")),
                password: String(f.get("password")),
              });
              if (error) throw error;
              const result = await supabase!.rpc("is_admin");
              if (result.error || !result.data)
                fail(
                  "Ce compte ne figure pas dans la liste des administrateurs.",
                );
            } catch (e) {
              fail(e instanceof Error ? e.message : "Connexion impossible");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Adresse e-mail
            <input required type="email" name="email" autoComplete="username" />
          </label>
          <label>
            Mot de passe
            <input
              required
              type="password"
              name="password"
              autoComplete="current-password"
            />
          </label>
          <button disabled={busy} className="button">
            {busy ? "Connexion…" : "Se connecter"}
            <ArrowUpRight size={16} />
          </button>
        </form>
      )}
    </section>
  );
}
const labels: Record<string, string> = {
  id: "Identifiant unique",
  game: "Identifiant du jeu",
  name: "Nom",
  nickname: "Pseudo",
  category: "Catégorie",
  level: "Niveau actuel",
  maxLevel: "Niveau maximal",
  kills: "Éliminations",
  deaths: "Morts",
  gold: "Or débloqué",
  platinum: "Platine débloqué",
  weaponId: "Arme",
  tier: "Palier",
  description: "Condition de déblocage",
  current: "Compteur actuel",
  target: "Objectif",
  completed: "Terminé",
  date: "Date ISO (avec fuseau)",
  map: "Carte",
  mode: "Mode",
  result: "Résultat",
  assists: "Assistances",
  notes: "Notes publiques",
  wins: "Victoires",
  losses: "Défaites",
  hours: "Temps de jeu (heures)",
  accuracy: "Précision (%)",
  type: "Type de classe",
  attachments: "Cinq accessoires (un par ligne)",
  equipment: "Équipements",
  perks: "Atouts",
};
export function Admin({
  data,
  save,
  busy,
  notify,
  fail,
}: {
  data: Dataset;
  save: (d: Dataset) => Promise<boolean>;
  busy: boolean;
  notify: (s: string) => void;
  fail: (s: string) => void;
}) {
  const [table, setTable] = useState<Table>("matches"),
    [editing, setEditing] = useState<Record<string, unknown> | null>(null),
    [original, setOriginal] = useState(""),
    [imported, setImported] = useState<Dataset | null>(null),
    [deleting, setDeleting] = useState<string | null>(null);
  const names: Record<Table, string> = {
    profiles: "Statistiques",
    weapons: "Armes",
    challenges: "Défis",
    matches: "Parties",
    loadouts: "Classes",
  };
  return (
    <>
      <div className="toolbar wrap">
        <button
          className="button secondary"
          onClick={() =>
            download(
              "azluck.json",
              JSON.stringify(data, null, 2),
              "application/json",
            )
          }
        >
          <Download size={16} />
          JSON
        </button>
        <button
          className="button secondary"
          onClick={() => download("azluck.csv", toCsv(data), "text/csv")}
        >
          <Download size={16} />
          CSV
        </button>
        <label className="button secondary">
          Importer JSON / CSV
          <input
            className="file-input"
            type="file"
            accept=".json,.csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.size > 2_000_000) throw Error("Fichier limité à 2 Mo");
                const text = (await f.text()).replace(/^\uFEFF/, "");
                setImported(
                  f.name.endsWith(".csv")
                    ? fromCsv(text)
                    : datasetSchema.parse(JSON.parse(text)),
                );
              } catch (e) {
                fail(e instanceof Error ? e.message : "Import invalide");
              }
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="button secondary"
          onClick={() => void supabase?.auth.signOut()}
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
      {imported && (
        <section className="panel spaced">
          <h2>Vérifier l’import avant remplacement</h2>
          <p>
            {Object.entries(imported)
              .map(([k, v]) => `${names[k as Table]} : ${v.length}`)
              .join(" · ")}
          </p>
          <p>
            Cette opération remplace toutes les collections publiques. Exportez
            une sauvegarde au préalable.
          </p>
          <button
            disabled={busy}
            className="button"
            onClick={async () => {
              if (await save(imported)) {
                setImported(null);
                notify("Import enregistré");
              }
            }}
          >
            Confirmer le remplacement
          </button>{" "}
          <button onClick={() => setImported(null)}>Annuler</button>
        </section>
      )}
      <div className="tabs">
        {Object.entries(names).map(([k, n]) => (
          <button
            key={k}
            className={table === k ? "active" : ""}
            onClick={() => {
              setTable(k as Table);
              setEditing(null);
              setDeleting(null);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>{names[table]}</h2>
          {table !== "profiles" && (
            <button
              className="button"
              onClick={() => {
                setEditing({ ...blank[table], id: crypto.randomUUID() });
                setOriginal("");
              }}
            >
              <Plus size={16} />
              Ajouter
            </button>
          )}
        </div>
        {data[table].map((row) => (
          <div className="admin-row" key={row.id}>
            <span>
              {"name" in row
                ? row.name
                : "nickname" in row
                  ? row.nickname
                  : "map" in row
                    ? `${row.map} · ${row.date}`
                    : "Enregistrement"}
              <small>{row.id}</small>
            </span>
            <button
              onClick={() => {
                setEditing({ ...row });
                setOriginal(row.id);
              }}
            >
              Modifier
            </button>
            {table !== "profiles" && (
              <button disabled={busy} onClick={() => setDeleting(row.id)}>
                Supprimer
              </button>
            )}
          </div>
        ))}
        {deleting && (
          <div role="alert" className="alert">
            Supprimer cet enregistrement ?{" "}
            <button
              disabled={busy}
              onClick={async () => {
                const next = {
                  ...data,
                  [table]: data[table].filter((r) => r.id !== deleting),
                };
                try {
                  datasetSchema.parse(next);
                  if (await save(next)) setDeleting(null);
                } catch {
                  fail(
                    "Cette arme est référencée par des défis, parties ou classes. Supprimez ces références avant de continuer.",
                  );
                }
              }}
            >
              Confirmer
            </button>
            <button onClick={() => setDeleting(null)}>Annuler</button>
          </div>
        )}
        {!data[table].length && <Empty text="Aucun enregistrement" />}
      </section>
      {editing && (
        <section className="panel spaced">
          <h2>
            {original ? "Modifier" : "Ajouter"} · {names[table]}
          </h2>
          <p className="data-note">
            Tous ces champs sont publics. Laissez vide une statistique inconnue.
          </p>
          <form
            className="edit-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const parsed = schemas[table].parse(editing);
                const next = {
                  ...data,
                  [table]: [
                    ...data[table].filter((r) => r.id !== original),
                    parsed,
                  ],
                };
                datasetSchema.parse(next);
                if (await save(next)) setEditing(null);
              } catch (e) {
                fail(e instanceof Error ? e.message : "Données invalides");
              }
            }}
          >
            {Object.entries(editing).map(([key, value]) => {
              const numeric = [
                "level",
                "maxLevel",
                "kills",
                "deaths",
                "current",
                "target",
                "assists",
                "wins",
                "losses",
                "hours",
                "accuracy",
              ].includes(key);
              const options =
                key === "weaponId"
                  ? data.weapons.map((w) => [w.id, w.name])
                  : key === "tier"
                    ? ["Militaire", "Spécial", "Or", "Platine", "Maîtrise"].map(
                        (v) => [v, v],
                      )
                    : key === "result"
                      ? ["Victoire", "Défaite", "Égalité"].map((v) => [v, v])
                      : key === "type"
                        ? ["Ranked", "Multijoueur", "Camouflage"].map((v) => [
                            v,
                            v,
                          ])
                        : null;
              return (
                <label key={key}>
                  {labels[key] || key}
                  {typeof value === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) =>
                        setEditing({ ...editing, [key]: e.target.checked })
                      }
                    />
                  ) : options ? (
                    <select
                      value={String(value)}
                      onChange={(e) =>
                        setEditing({ ...editing, [key]: e.target.value })
                      }
                    >
                      {options.map(([v, n]) => (
                        <option value={v} key={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : Array.isArray(value) ? (
                    <textarea
                      rows={5}
                      value={value.join("\n")}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          [key]: e.target.value.split("\n"),
                        })
                      }
                    />
                  ) : (
                    <input
                      disabled={key === "id" && !!original}
                      type={numeric ? "number" : "text"}
                      step={numeric ? "any" : undefined}
                      min={numeric ? 0 : undefined}
                      value={value === null ? "" : String(value)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          [key]: numeric
                            ? e.target.value === ""
                              ? null
                              : Number(e.target.value)
                            : e.target.value,
                        })
                      }
                    />
                  )}
                </label>
              );
            })}
            <div className="form-actions">
              <button disabled={busy} className="button">
                {busy ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" onClick={() => setEditing(null)}>
                Annuler
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
