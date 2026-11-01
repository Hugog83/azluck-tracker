import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Crosshair,
  Download,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { download } from "../data";
import type { Dataset, Weapon } from "../domain";
import { PageTitle, Empty } from "../ui";
import {
  OFFICIAL_SOURCE,
  findProgress,
  progressPercent,
  statusOf,
  weaponSummary,
  catalogSchema,
  type CamoDefinition,
  type CamoCatalog,
} from "./domain";
import type { CamoController } from "./useCamoCatalog";

const tracks: Record<CamoDefinition["track"], string> = {
  military: "Militaires",
  special: "Spéciaux",
  gold: "Or",
  platinum: "Platine",
  harmonic: "Rupture harmonique",
  divergence: "Divergence",
  mastery: "Maîtrises de mode",
  prestige: "Prestige d’arme",
  legacy: "Archives conservées",
};
const modes = {
  shared: "Progression partagée",
  mp: "Multijoueur",
  dmz: "DMZ",
  warzone: "Warzone",
};
const states = {
  obtained: "Obtenu",
  available: "Accessible",
  locked: "Verrouillé",
  unknown: "À vérifier",
};
const sources = {
  official: "Source officielle",
  owner: "Information propriétaire",
  community: "Source communautaire",
  unknown: "À vérifier",
};
export function CamoTracker({
  data,
  controller,
  admin,
}: {
  data: Dataset;
  controller: CamoController;
  admin: boolean;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("Toutes"),
    [filter, setFilter] = useState("Toutes"),
    [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState<"weapons" | "mastery" | "prestige">("weapons"),
    [confirmImport, setConfirmImport] = useState(false),
    [pendingCatalog, setPendingCatalog] = useState<CamoCatalog | null>(null),
    [importError, setImportError] = useState("");
  const { catalog } = controller;
  const weapons = data.weapons.filter((w) => w.game === "mw4");
  const currentWeapon = weapons.find((w) => w.id === selected);
  const counts = weapons.reduce(
    (n, w) => {
      const s = weaponSummary(w.id, catalog);
      return {
        gold: n.gold + Number(s.gold),
        platinum: n.platinum + Number(s.platinum),
        harmonic: n.harmonic + Number(s.harmonic),
      };
    },
    { gold: 0, platinum: 0, harmonic: 0 },
  );
  const visible = weapons.filter((w) => {
    const s = weaponSummary(w.id, catalog);
    const ds = catalog.definitions.filter(
      (d) =>
        d.weaponId === w.id &&
        d.mode === "shared" &&
        !["legacy", "prestige"].includes(d.track),
    );
    const ps = ds.map((d) => findProgress(catalog, d.id));
    return (
      w.name.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")) &&
      (category === "Toutes" || w.category === category) &&
      (filter === "Toutes" ||
        (filter === "À faire" && s.completed < s.total) ||
        (filter === "En cours" &&
          ps.some((p) => (p?.current ?? 0) > 0 || p?.completed === true) &&
          s.completed < s.total) ||
        (filter === "Or" && s.gold) ||
        (filter === "Platine" && s.platinum) ||
        (filter === "Rupture harmonique" && s.harmonic) ||
        (filter === "À vérifier" &&
          ds.some((d) => statusOf(d, catalog, weapons).state === "unknown")))
    );
  });
  const global = catalog.definitions.find((d) => d.track === "divergence");
  return (
    <>
      <PageTitle
        title="La route vers Divergence"
        description="33 armes. Un parcours partagé. Chaque camouflage, une étape."
      />
      <div className="camo-topline">
        <span className="pill">CATALOGUE V2</span>
        <span className="camo-access">
          {admin ? <Shield size={14} /> : <Lock size={14} />}{" "}
          {controller.canEdit
            ? "Administration · modifications autorisées"
            : "Consultation publique · lecture seule"}
        </span>
        <button
          className="icon-button"
          onClick={() => void controller.refresh()}
          disabled={controller.loading || controller.busy}
          aria-label="Recharger le catalogue"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {controller.message && (
        <div className="camo-info" role="status">
          {controller.message}
        </div>
      )}
      {controller.error && (
        <div className="alert" role="alert">
          {controller.error}
        </div>
      )}
      {controller.notice && (
        <p role="status" className="cyan">
          {controller.notice}
        </p>
      )}
      <div className="camo-summary">
        <Milestone name="Or" count={counts.gold} total={33} className="gold" />
        <Milestone
          name="Platine"
          count={counts.platinum}
          total={33}
          className="platinum"
        />
        <Milestone
          name="Rupture harmonique"
          count={counts.harmonic}
          total={33}
          className="harmonic"
        />
        <div className="camo-milestone divergence">
          <div className="eyebrow">OBJECTIF GLOBAL</div>
          <h2>Divergence</h2>
          <strong>
            {counts.harmonic}
            <small>/ 33 armes</small>
          </strong>
          <div className="bar">
            <i
              style={{
                width: Math.min(100, (counts.harmonic / 33) * 100) + "%",
              }}
            />
          </div>
          <small>
            {global
              ? states[statusOf(global, catalog, weapons).state]
              : "À vérifier"}{" "}
            · Obtention confirmée séparément
          </small>
        </div>
      </div>
      <div
        className="camo-tabs"
        role="group"
        aria-label="Parcours de camouflage"
      >
        {(
          [
            ["weapons", "Armes & camouflages"],
            ["mastery", "Maîtrises de mode"],
            ["prestige", "Prestige d’arme"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            aria-pressed={view === id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "weapons" && (
        <>
          <div className="camo-toolbar">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Rechercher une arme"
                placeholder="Rechercher parmi vos armes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Catégorie
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {["Toutes", ...new Set(weapons.map((w) => w.category))].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Progression
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  "Toutes",
                  "À faire",
                  "En cours",
                  "Or",
                  "Platine",
                  "Rupture harmonique",
                  "À vérifier",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="camo-list-heading">
            <h2>
              Votre arsenal{" "}
              <span>
                {visible.length} / {weapons.length} armes enregistrées
              </span>
            </h2>
            <span>8 militaires · 3 spéciaux · 3 érudit par arme</span>
          </div>
          {controller.loading ? (
            <Empty text="Chargement du catalogue…" />
          ) : (
            <div className="camo-weapon-grid">
              {visible.map((w) => {
                const s = weaponSummary(w.id, catalog);
                return (
                  <button
                    className="camo-weapon"
                    key={w.id}
                    aria-label={`${w.name} : ${s.completed}/${s.total} camouflages obtenus. Or ${s.gold ? "obtenu" : "non confirmé"}, Platine ${s.platinum ? "obtenu" : "non confirmé"}, Rupture harmonique ${s.harmonic ? "obtenu" : "non confirmé"}.`}
                    onClick={() => setSelected(w.id)}
                  >
                    <div className="camo-card-top">
                      <span className="eyebrow">{w.category}</span>
                      <ChevronRight size={16} />
                    </div>
                    <div className="camo-weapon-name">
                      <Crosshair size={32} strokeWidth={1} />
                      <strong>{w.name}</strong>
                    </div>
                    <div className="camo-awards">
                      <span className={s.gold ? "earned gold-text" : ""}>
                        Or {s.gold && <Check size={11} />}
                      </span>
                      <span className={s.platinum ? "earned cyan" : ""}>
                        Platine {s.platinum && <Check size={11} />}
                      </span>
                      <span className={s.harmonic ? "earned purple-text" : ""}>
                        Rupture {s.harmonic && <Check size={11} />}
                      </span>
                    </div>
                    <div className="bar">
                      <i style={{ width: s.percent + "%" }} />
                    </div>
                    <div className="camo-card-bottom">
                      <span>
                        {s.completed}/{s.total} obtenus
                      </span>
                      <strong>{Math.round(s.percent)} %</strong>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {!visible.length && !controller.loading && (
            <Empty text="Aucune arme ne correspond à ces filtres" />
          )}
        </>
      )}
      {view === "mastery" && (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Après Divergence, la maîtrise.</h2>
              <small>
                Trois parcours distincts. Les compteurs mesurent les objectifs
                du mode concerné.
              </small>
            </div>
            <Target size={20} />
          </div>
          {global && (
            <CamoRow
              key={global.id}
              definition={global}
              controller={controller}
              weapons={weapons}
            />
          )}
          <div className="camo-mode-grid">
            {(["mp", "dmz", "warzone"] as const).map((mode) => (
              <div key={mode} className="camo-mode">
                <h3>{modes[mode]}</h3>
                <p>
                  {mode === "warzone"
                    ? "Conditions encore classifiées dans la source officielle."
                    : "Ouvrez la fiche d’une arme pour saisir sa progression."}
                </p>
                {catalog.definitions
                  .filter(
                    (d) =>
                      d.track === "mastery" &&
                      d.mode === mode &&
                      d.weaponId === weapons[0]?.id,
                  )
                  .map((d) => (
                    <div key={d.id} className="mastery-preview">
                      <strong>{d.name || "À vérifier"}</strong>
                      <small>{d.description || "À vérifier"}</small>
                    </div>
                  ))}
              </div>
            ))}
          </div>
          <div className="camo-jump-grid">
            {weapons.map((w) => (
              <button key={w.id} onClick={() => setSelected(w.id)}>
                {w.name}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        </section>
      )}
      {view === "prestige" && (
        <section className="panel">
          <h2>Prestige d’arme</h2>
          <p className="muted">
            Un parcours séparé des camouflages érudit et des maîtrises de mode.
            Un niveau d’arme normal ne suffit pas à confirmer le Prestige.
            L’administrateur peut confirmer manuellement une récompense
            constatée en jeu.
          </p>
          <div className="camo-mode-grid">
            {catalog.definitions
              .filter(
                (d) => d.track === "prestige" && d.weaponId === weapons[0]?.id,
              )
              .map((d) => (
                <div className="camo-mode" key={d.id}>
                  <h3>{d.name}</h3>
                  <p>{d.description}</p>
                  <span className="badge">
                    NIVEAU DE PRESTIGE · À CONFIRMER
                  </span>
                </div>
              ))}
          </div>
          <div className="camo-jump-grid">
            {weapons.map((w) => (
              <button key={w.id} onClick={() => setSelected(w.id)}>
                {w.name}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="panel camo-method">
        <h2>Des faits, pas des suppositions.</h2>
        <p>
          Un camouflage obtenu reste distinct d’un défi accessible. Une
          condition absente n’est jamais validée automatiquement. La progression
          partagée ne se duplique pas entre Multijoueur et DMZ.
        </p>
        <div className="camo-legend">
          <span className="source-official">Officiel</span>
          <span className="source-owner">Propriétaire</span>
          <span className="source-community">Communautaire</span>
          <span className="source-unknown">À vérifier</span>
        </div>
        <a
          className="text-link"
          href={OFFICIAL_SOURCE}
          target="_blank"
          rel="noreferrer"
        >
          Règles officielles : progression et Prestige
          <ArrowUpRight size={15} />
        </a>
        <a
          className="text-link"
          href="https://www.callofduty.com/fr/blog/2026/10/call-of-duty-modern-warfare-4-launch-multiplayer-operators-weapons-equipment-create-a-class"
          target="_blank"
          rel="noreferrer"
        >
          Catalogue officiel des 33 armes
          <ArrowUpRight size={15} />
        </a>
        <small>
          Militaires : seuils à vérifier. Spéciaux : seuls HAN 86 et SANG 9 mm
          sont détaillés officiellement. Les données M4 sont des informations du
          propriétaire. La valeur 1/1 historique de Myriade et Opérations
          nocturnes ne signifie pas « une élimination requise ».
        </small>
      </section>
      {admin && (
        <section className="panel camo-maintenance">
          <h2>Gestion du catalogue V2</h2>
          <p className="muted">
            Import additionnel : les définitions sont mises à jour sans
            remplacer les progrès déjà enregistrés. Les anciennes collections
            restent intactes.
          </p>
          <div className="toolbar wrap">
            <button
              className="button secondary"
              onClick={() =>
                download(
                  "azluck-camo-v2.json",
                  JSON.stringify(
                    { version: 2, legacy: data, catalog },
                    null,
                    2,
                  ),
                  "application/json",
                )
              }
            >
              <Download size={16} />
              Exporter la sauvegarde V2
            </button>
            <button
              className="button secondary"
              disabled={controller.busy || controller.loading}
              onClick={() => setConfirmImport(true)}
            >
              Préparer / actualiser le catalogue
            </button>
            <label className="button secondary">
              Importer des corrections JSON
              <input
                className="file-input"
                type="file"
                accept=".json"
                disabled={controller.busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImportError("");
                  try {
                    if (file.size > 2_000_000)
                      throw Error("Fichier limité à 2 Mo.");
                    const parsed = JSON.parse(
                      (await file.text()).replace(/^\uFEFF/, ""),
                    );
                    setPendingCatalog(
                      catalogSchema.parse(parsed.catalog ?? parsed),
                    );
                  } catch (error) {
                    setImportError(
                      error instanceof Error
                        ? error.message
                        : "Catalogue invalide.",
                    );
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {importError && (
            <p role="alert" className="alert">
              {importError}
            </p>
          )}
          {pendingCatalog && (
            <div className="camo-info">
              <p>
                Import à revoir : {pendingCatalog.definitions.length}{" "}
                définitions, {pendingCatalog.progress.length} états initiaux.
                Seules les définitions sont actualisées ; les progrès existants
                en base ne sont jamais remplacés. Les identifiants et
                emplacements doivent rester stables.
              </p>
              <button
                className="button"
                disabled={controller.busy}
                onClick={async () => {
                  await controller.importCatalog(pendingCatalog);
                  setPendingCatalog(null);
                }}
              >
                Confirmer ces définitions
              </button>{" "}
              <button onClick={() => setPendingCatalog(null)}>Annuler</button>
            </div>
          )}
          {confirmImport && (
            <div className="camo-info">
              <p>
                La migration SQL doit avoir été revue et appliquée au préalable.
                Cette action relit vos données actuelles, conserve les
                identifiants existants et ne réinitialise aucun progrès V2. Les
                définitions personnalisées seront conservées sauf si leur
                identifiant correspond à une définition générée ; exportez
                d’abord une sauvegarde.
              </p>
              <button
                className="button"
                disabled={controller.busy}
                onClick={async () => {
                  await controller.initialize();
                  setConfirmImport(false);
                }}
              >
                Confirmer l’import additionnel
              </button>{" "}
              <button onClick={() => setConfirmImport(false)}>Annuler</button>
            </div>
          )}
        </section>
      )}
      {currentWeapon && (
        <WeaponDialog
          weapon={currentWeapon}
          controller={controller}
          weapons={weapons}
          onClose={() => setSelected(null)}
          initialView={view}
        />
      )}
    </>
  );
}
function Milestone({
  name,
  count,
  total,
  className,
}: {
  name: string;
  count: number;
  total: number;
  className: string;
}) {
  return (
    <div className={"camo-milestone " + className}>
      <Trophy size={19} />
      <div className="eyebrow">ARMES CONFIRMÉES</div>
      <h2>{name}</h2>
      <strong>
        {count}
        <small>/ {total}</small>
      </strong>
      <div className="bar">
        <i style={{ width: Math.min(100, (count / total) * 100) + "%" }} />
      </div>
    </div>
  );
}
function WeaponDialog({
  weapon,
  controller,
  weapons,
  onClose,
  initialView,
}: {
  weapon: Weapon;
  controller: CamoController;
  weapons: Weapon[];
  onClose: () => void;
  initialView: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [tab, setTab] = useState(
      initialView === "weapons"
        ? "shared"
        : initialView === "prestige"
          ? "prestige"
          : "mp",
    );
  useEffect(() => {
    const d = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    d?.showModal();
    return () => {
      d?.close();
      previous?.focus();
    };
  }, []);
  const definitions = controller.catalog.definitions.filter(
    (d) =>
      d.weaponId === weapon.id &&
      (tab === "prestige"
        ? d.track === "prestige"
        : tab === "legacy"
          ? d.track === "legacy"
          : d.mode === tab && d.track !== "prestige" && d.track !== "legacy"),
  );
  return (
    <dialog
      ref={dialog}
      className="camo-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="camo-weapon-title"
    >
      <div className="camo-dialog-header">
        <div>
          <div className="eyebrow">FICHE ARME · {weapon.category}</div>
          <h2 id="camo-weapon-title">{weapon.name}</h2>
        </div>
        <button autoFocus aria-label="Fermer la fiche" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="camo-tabs">
        {(
          ["shared", "mp", "dmz", "warzone", "prestige", "legacy"] as const
        ).map((mode) => (
          <button
            key={mode}
            aria-pressed={tab === mode}
            className={tab === mode ? "active" : ""}
            onClick={() => setTab(mode)}
          >
            {mode === "prestige"
              ? "Prestige"
              : mode === "legacy"
                ? "Archives"
                : modes[mode]}
          </button>
        ))}
      </div>
      <p className="data-note">
        Cases modifiables uniquement par l’administrateur. « Obtenu » est une
        confirmation explicite ; atteindre un compteur ne valide rien
        automatiquement.
      </p>
      {tab === "shared" && (
        <div className="camo-info">
          Parcours commun : 8 militaires → 3 spéciaux → Or → Or de toute la
          catégorie pour Platine → tous les Platine pour Rupture harmonique.
        </div>
      )}
      {definitions.map((d) => (
        <CamoRow
          key={d.id}
          definition={d}
          controller={controller}
          weapons={weapons}
        />
      ))}
      {!definitions.length && (
        <Empty text="Aucun détail renseigné pour ce parcours" />
      )}
      <div className="camo-dialog-footer">
        <span className="muted">
          {controller.canEdit
            ? "Modifications enregistrées individuellement dans Supabase"
            : "Consultation uniquement"}
        </span>
        <button onClick={onClose}>Fermer</button>
      </div>
    </dialog>
  );
}
function CamoRow({
  definition: d,
  controller,
  weapons,
}: {
  definition: CamoDefinition;
  controller: CamoController;
  weapons: Weapon[];
}) {
  const saved = findProgress(controller.catalog, d.id),
    status = statusOf(d, controller.catalog, weapons),
    percent = progressPercent(d, saved);
  const [current, setCurrent] = useState(saved?.current?.toString() ?? ""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setCurrent(saved?.current?.toString() ?? "");
  }, [saved?.current, saved?.revision]);
  const editable =
    controller.canEdit && !controller.busy && d.track !== "legacy";
  async function commit(patch: {
    completed?: boolean | null;
    current?: number | null;
  }) {
    setError("");
    try {
      await controller.update(d, patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de sauvegarde");
    }
    setConfirm(false);
  }
  const label = d.name || "À vérifier";
  return (
    <article className={"camo-row state-" + status.state}>
      <div className="camo-row-heading">
        <label className="camo-check">
          <input
            type="checkbox"
            aria-label={"Camouflage obtenu : " + label}
            checked={saved?.completed === true}
            disabled={
              !editable ||
              (status.state === "locked" && saved?.completed !== true)
            }
            onChange={(e) => {
              if (e.target.checked && status.state === "unknown")
                setConfirm(true);
              else void commit({ completed: e.target.checked });
            }}
          />
          <span>
            <small>
              {tracks[d.track]} · {d.slot}
            </small>
            <strong>{label}</strong>
          </span>
        </label>
        <span className={"camo-status " + status.state}>
          {status.state === "obtained" ? (
            <Check size={12} />
          ) : status.state === "locked" ? (
            <Lock size={12} />
          ) : (
            <Target size={12} />
          )}{" "}
          {states[status.state]}
        </span>
      </div>
      <p>{d.description || "Condition de déblocage : À vérifier"}</p>
      <div className="camo-row-meta">
        <span>Niveau requis : {d.unlockLevel ?? "À vérifier"}</span>
        <span className={"source-" + d.source}>
          {sources[d.source]}
          {d.sourceUrl && (
            <a
              href={d.sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={"Source de " + label}
            >
              <ArrowUpRight size={12} />
            </a>
          )}
        </span>
      </div>
      <p className="camo-prerequisite">{status.reason}</p>
      {d.track !== "legacy" && (
        <form
          className="camo-counter"
          onSubmit={(e) => {
            e.preventDefault();
            void commit({ current: current === "" ? null : Number(current) });
          }}
        >
          <label>
            Compteur {d.track === "gold" ? "(mode et partie à confirmer)" : ""}
            <input
              type="number"
              min={0}
              max={d.target ?? undefined}
              step={1}
              value={current}
              placeholder="Non renseigné"
              disabled={!editable || status.state === "locked"}
              onChange={(e) => setCurrent(e.target.value)}
              aria-label={"Compteur : " + label}
            />
          </label>
          <span>/ {d.target ?? "À vérifier"}</span>
          {controller.canEdit && (
            <button disabled={!editable || status.state === "locked"}>
              Enregistrer
            </button>
          )}
          <strong>{percent === null ? "—" : Math.round(percent) + " %"}</strong>
        </form>
      )}
      {percent !== null && (
        <div
          className="bar"
          role="progressbar"
          aria-label={"Progression : " + label}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: percent + "%" }} />
        </div>
      )}
      {confirm && (
        <div className="camo-info">
          <p>
            Les conditions de ce camouflage sont incomplètes. Confirmer une
            obtention constatée en jeu ? Cette confirmation ne valide pas les
            prérequis manquants.
          </p>
          <button
            disabled={controller.busy}
            onClick={() => void commit({ completed: true })}
          >
            Confirmer l’obtention
          </button>{" "}
          <button onClick={() => setConfirm(false)}>Annuler</button>
        </div>
      )}
      {saved?.current !== null &&
        saved?.current !== undefined &&
        d.target !== null &&
        saved.current > d.target && (
          <p role="alert" className="gold-text">
            Le catalogue a changé : le compteur conservé dépasse la cible
            actuelle. Vérifiez-le avant toute modification.
          </p>
        )}
      {error && (
        <p role="alert" className="camo-row-error">
          {error}
        </p>
      )}
    </article>
  );
}
