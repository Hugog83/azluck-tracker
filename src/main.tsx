import { Admin, Login } from "./Admin";
import { PageTitle, Empty } from "./ui";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Crosshair,
  LayoutDashboard,
  Target,
  Swords,
  Layers,
  History,
  Shield,
  ArrowUpRight,
  ChevronRight,
  Check,
  Lock,
  Search,
  Activity,
  Trophy,
  Clock,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  initial,
  aggregate,
  ratio,
  format,
  progress,
  type Dataset,
  type Weapon,
} from "./domain";
import {
  supabase,
  readData,
  writeData,
} from "./data";
import "./style.css";
const nav = [
  ["dashboard", "Vue d’ensemble", LayoutDashboard],
  ["camos", "Camouflages", Target],
  ["arsenal", "Arsenal", Swords],
  ["matches", "Historique", History],
  ["loadouts", "Mes classes", Layers],
] as const;
function App() {
  const [page, setPage] = useState(location.hash.slice(1) || "dashboard"),
    [data, setData] = useState<Dataset>(initial),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [admin, setAdmin] = useState(false),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Toutes"),
    [selected, setSelected] = useState<Weapon | null>(null);
  useEffect(() => {
    const f = () => {
      setPage(location.hash.slice(1) || "dashboard");
      setSearch("");
      setCategory("Toutes");
    };
    window.addEventListener("hashchange", f);
    readData()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const check = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("is_admin");
      setAdmin(!error && data === true);
    };
    void check();
    const listener = supabase?.auth.onAuthStateChange(() => {
      setAdmin(false);
      setTimeout(() => void check(), 0);
    });
    return () => {
      window.removeEventListener("hashchange", f);
      listener?.data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  async function save(next: Dataset) {
    setBusy(true);
    try {
      await writeData(next);
      setData(next);
      setNotice("Modifications enregistrées");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de sauvegarde");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const p = data.profiles[0],
    stats = aggregate(data.matches),
    gold = data.weapons.filter((w) => w.gold).length,
    known = data.challenges.length
      ? data.challenges.reduce((s, c) => s + progress(c), 0) /
        data.challenges.length
      : 0;
  const filtered = data.weapons.filter(
    (w) =>
      w.game === "mw4" &&
      w.name.toLowerCase().includes(search.toLowerCase()) &&
      (category === "Toutes" || w.category === category),
  );
  const chart = [...data.matches]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({
      date: new Date(m.date).toLocaleDateString("fr-FR"),
      kd: ratio(m.kills, m.deaths),
    }));
  function chartView() {
    return chart.length ? (
      <div className="chart">
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={chart}>
            <defs>
              <linearGradient id="chart" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#9d7aff" stopOpacity={0.4} />
                <stop offset="1" stopColor="#9d7aff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#232a3b" vertical={false} />
            <XAxis dataKey="date" stroke="#7f899f" />
            <YAxis stroke="#7f899f" />
            <Tooltip
              contentStyle={{
                background: "#151b2a",
                border: "1px solid #30374a",
              }}
            />
            <Area
              dataKey="kd"
              name="K/D"
              stroke="#a88aff"
              fill="url(#chart)"
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    ) : (
      <div className="empty graph-empty">
        <Activity size={30} />
        <strong>Votre prochaine partie commence ici.</strong>
        <span>Enregistrez vos parties pour voir évoluer votre K/D.</span>
        <div className="grid-lines" />
      </div>
    );
  }
  function matchesView(limit?: number) {
    const rows = [...data.matches]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter(
        (m) =>
          (m.map + " " + m.mode + " " + m.result)
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (category === "Toutes" || m.result === category),
      )
      .slice(0, limit);
    return rows.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Date",
                "Carte / Mode",
                "Résultat",
                "Élim.",
                "Morts",
                "Assist.",
                "K/D",
                "Arme / Notes",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.date).toLocaleString("fr-FR")}</td>
                <td>
                  {m.map}
                  <small>{m.mode}</small>
                </td>
                <td className={m.result === "Victoire" ? "cyan" : ""}>
                  {m.result}
                </td>
                <td>{m.kills}</td>
                <td>{m.deaths}</td>
                <td>{m.assists}</td>
                <td>{format(ratio(m.kills, m.deaths))}</td>
                <td>
                  {data.weapons.find((w) => w.id === m.weaponId)?.name || "—"}
                  <small>{m.notes}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        text="Aucune partie enregistrée"
        sub="Votre historique sera disponible après la première saisie."
      />
    );
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <a href="#dashboard" className="brand">
          <div className="brand-icon">
            <Crosshair />
          </div>
          <div>
            AZLUCK<span>TRACKER</span>
          </div>
        </a>
        <div className="workspace-label">VOTRE QUARTIER GÉNÉRAL</div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <a key={id} href={"#" + id} className={page === id ? "active" : ""}>
              <Icon size={19} />
              {label}
              {page === id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-card">
          <div className="eyebrow cyan">OBJECTIF EN COURS</div>
          <strong>La route vers l’Or</strong>
          <span>M4 · Camouflage Vert</span>
          <div className="bar">
            <i
              style={{
                width:
                  progress(
                    data.challenges.find((c) => c.id === "m4-green") ||
                      initial.challenges[3],
                  ) + "%",
              }}
            />
          </div>
          <a href="#camos">
            Voir la progression <ArrowUpRight size={15} />
          </a>
        </div>
        <div className="sidebar-bottom">
          <a href="#admin">
            <Shield size={17} />
            Administration <Lock size={13} />
          </a>
          <div>
            <span className="status-dot" />
            Profil public · Lecture seule
          </div>
        </div>
      </aside>
      <div className="shell">
        <header>
          <div className="game-select">
            <span className="game-mark">
              MW<span>4</span>
            </span>
            <div>
              MODERN WARFARE 4<small>Suivi manuel des données</small>
            </div>
          </div>
          <div className="header-right">
            <span className="live-tag">
              <span className="status-dot" />
              {supabase ? "SUPABASE CONNECTÉ" : "DONNÉES INITIALES"}
            </span>
            <a href="#admin" className="avatar" aria-label="Administration">
              AZ
            </a>
          </div>
        </header>
        <main>
          <div className="breadcrumb">
            QUARTIER GÉNÉRAL <ChevronRight size={12} />{" "}
            {nav.find((n) => n[0] === page)?.[1] || "Administration"}
          </div>
          {error && (
            <div role="alert" className="alert">
              {error}
              <button onClick={() => setError("")}>Fermer</button>
            </div>
          )}
          {notice && (
            <div role="status" className="toast">
              <Check size={18} />
              {notice}
            </div>
          )}
          {loading ? (
            <Empty text="Chargement du profil…" />
          ) : (
            <>
              {page === "dashboard" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        LE SUIVI. LA PROGRESSION. LA MAÎTRISE.
                      </div>
                      <h1>
                        Vue d’ensemble<span>.</span>
                      </h1>
                      <p>Chaque partie compte. Chaque camouflage se mérite.</p>
                    </div>
                    <a className="button secondary" href="#camos">
                      <Target size={16} />
                      Mes camouflages
                      <ArrowUpRight size={15} />
                    </a>
                  </div>
                  <section className="hero">
                    <div className="hero-content">
                      <span className="pill">PROFIL JOUEUR</span>
                      <h2>
                        {p.nickname}
                        <span className="cyan"> /</span>
                      </h2>
                      <p>
                        La précision comme signature.
                        <br />
                        La maîtrise comme objectif.
                      </p>
                      <div className="hero-tags">
                        <span>
                          <span className="status-dot" />
                          Modern Warfare 4
                        </span>
                        <span>Suivi personnel</span>
                      </div>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <Crosshair />
                      <span>AZ / 04</span>
                    </div>
                    <div className="hero-stat">
                      <Trophy size={23} />
                      <strong>{gold.toString().padStart(2, "0")}</strong>
                      <span>ARMES EN OR</span>
                    </div>
                  </section>
                  <div className="section-title">
                    <h2>Statistiques globales</h2>
                    <span className="muted badge">SAISIE MANUELLE</span>
                  </div>
                  <div className="stats-grid">
                    {[
                      [
                        Crosshair,
                        "Ratio K/D",
                        format(ratio(p.kills, p.deaths)),
                        "Éliminations / morts",
                      ],
                      [
                        Trophy,
                        "Taux de victoire",
                        p.wins === null || p.losses === null
                          ? "—"
                          : format(
                              ratio(p.wins, p.wins + p.losses) === null
                                ? null
                                : (p.wins / (p.wins + p.losses)) * 100,
                              "%",
                            ),
                        "V/D : " + format(ratio(p.wins, p.losses)),
                      ],
                      [
                        Swords,
                        "Éliminations",
                        format(p.kills),
                        "Morts : " + format(p.deaths),
                      ],
                      [
                        Clock,
                        "Temps de jeu",
                        format(p.hours, " h"),
                        "Précision : " + format(p.accuracy, "%"),
                      ],
                    ].map(([Icon, label, value, sub]) => {
                      const I = Icon as typeof Crosshair;
                      return (
                        <div className="stat-card" key={String(label)}>
                          <div>
                            <span>{String(label)}</span>
                            <I size={18} />
                          </div>
                          <strong>{String(value)}</strong>
                          <small>{String(sub)}</small>
                        </div>
                      );
                    })}
                  </div>
                  <p className="data-note">
                    — Non renseigné · Les statistiques globales sont
                    indépendantes des parties enregistrées.
                  </p>
                  <div className="dashboard-grid">
                    <section className="panel">
                      <div className="panel-title">
                        <div>
                          <h2>Évolution des performances</h2>
                          <small>
                            K/D calculé sur les parties enregistrées
                          </small>
                        </div>
                        <span className="badge">
                          {data.matches.length} PARTIES
                        </span>
                      </div>
                      {chartView()}
                      <div className="chart-footer">
                        <span>
                          K/D enregistré <b>{format(stats.kd)}</b>
                        </span>
                        <span>
                          Winrate <b>{format(stats.winrate, "%")}</b>
                        </span>
                      </div>
                    </section>
                    <section className="panel mastery">
                      <div className="panel-title">
                        <h2>Objectif maîtrise</h2>
                        <Target size={18} />
                      </div>
                      <div className="mastery-main">
                        <div
                          className="progress-ring"
                          style={{
                            background: `conic-gradient(#a68aff ${known}%, #252b3a 0)`,
                          }}
                        >
                          <div>
                            <strong>
                              {Math.round(known)}
                              <span>%</span>
                            </strong>
                            <small>RENSEIGNÉ</small>
                          </div>
                        </div>
                        <div>
                          <strong>
                            {data.challenges.filter((c) => c.completed).length}/
                            {data.challenges.length}
                          </strong>
                          <p>défis terminés</p>
                          <small>Périmètre connu uniquement</small>
                        </div>
                      </div>
                      <div className="mastery-counts">
                        <span>
                          <i className="gold-dot" />
                          {gold} Or
                        </span>
                        <span>
                          <i className="silver-dot" />
                          {data.weapons.filter((w) => w.platinum).length}{" "}
                          Platine
                        </span>
                      </div>
                      <a href="#camos" className="text-link">
                        Ouvrir le tracker
                        <ArrowUpRight size={16} />
                      </a>
                    </section>
                  </div>
                  <div className="dashboard-grid">
                    <section className="panel">
                      <div className="panel-title">
                        <h2>Dernières parties</h2>
                        <a href="#matches">
                          Tout voir <ArrowUpRight size={14} />
                        </a>
                      </div>
                      {matchesView(5)}
                    </section>
                    <section className="panel">
                      <div className="panel-title">
                        <h2>Dans votre arsenal</h2>
                        <a href="#arsenal" aria-label="Voir l’arsenal">
                          <ArrowUpRight size={16} />
                        </a>
                      </div>
                      {[...data.weapons]
                        .sort((a, b) => (b.kills ?? -1) - (a.kills ?? -1))
                        .slice(0, 4)
                        .map((w) => (
                          <button
                            className="weapon-row"
                            key={w.id}
                            onClick={() => setSelected(w)}
                          >
                            <div className="weapon-mini">
                              <Crosshair size={20} />
                            </div>
                            <div>
                              <strong>{w.name}</strong>
                              <small>
                                {w.kills === null
                                  ? "Utilisation non renseignée"
                                  : format(w.kills) + " éliminations"}
                              </small>
                            </div>
                            <span
                              className={w.gold ? "gold-text" : "purple-text"}
                            >
                              {w.gold ? "OR" : "EN COURS"}
                            </span>
                          </button>
                        ))}
                    </section>
                  </div>
                </>
              )}
              {["camos", "arsenal"].includes(page) && (
                <>
                  <PageTitle
                    title={
                      page === "camos"
                        ? "Tracker de camouflages"
                        : "Votre arsenal"
                    }
                    description={
                      page === "camos"
                        ? "Un défi après l’autre. Suivez le chemin vers la maîtrise."
                        : "Vos armes, leur progression et vos configurations."
                    }
                  />
                  <div className="toolbar">
                    <label className="search">
                      <Search size={17} />
                      <input
                        placeholder="Rechercher une arme…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Catégorie"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {[
                        "Toutes",
                        ...new Set(data.weapons.map((w) => w.category)),
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <span className="muted">{filtered.length} armes</span>
                  </div>
                  <div className="weapon-grid">
                    {filtered.map((w) => (
                      <section className="panel weapon-card" key={w.id}>
                        <div className="weapon-top">
                          <span className="eyebrow">{w.category}</span>
                          <span
                            className={
                              "badge " + (w.gold ? "gold-text" : "purple-text")
                            }
                          >
                            {w.gold ? "OR DÉBLOQUÉ" : "EN PROGRESSION"}
                          </span>
                        </div>
                        <div className="weapon-visual">
                          <Crosshair size={72} strokeWidth={0.65} />
                          <span>{w.name}</span>
                        </div>
                        <h2>{w.name}</h2>
                        <p className="muted">
                          Niveau {format(w.level)} / {format(w.maxLevel)}
                        </p>
                        {page === "camos" ? (
                          <div className="challenge-list">
                            {data.challenges
                              .filter((c) => c.weaponId === w.id)
                              .map((c) => (
                                <div key={c.id} className="challenge">
                                  <div>
                                    <strong>
                                      {c.completed ? (
                                        <Check size={14} />
                                      ) : (
                                        <Target size={14} />
                                      )}{" "}
                                      {c.name}
                                    </strong>
                                    <span>
                                      {c.current}/{c.target}
                                    </span>
                                  </div>
                                  <div className="bar">
                                    <i style={{ width: progress(c) + "%" }} />
                                  </div>
                                  <small>{c.description}</small>
                                </div>
                              ))}
                            {!data.challenges.some(
                              (c) => c.weaponId === w.id,
                            ) && (
                              <p className="muted">
                                {w.gold
                                  ? "Or confirmé par le propriétaire. "
                                  : ""}
                                Détails des défis à renseigner.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="arsenal-stats">
                            <span>
                              Éliminations <b>{format(w.kills)}</b>
                            </span>
                            <span>
                              K/D <b>{format(ratio(w.kills, w.deaths))}</b>
                            </span>
                          </div>
                        )}
                        <button
                          className="text-link"
                          onClick={() => setSelected(w)}
                        >
                          Consulter la fiche
                          <ArrowUpRight size={16} />
                        </button>
                      </section>
                    ))}
                  </div>
                  {!filtered.length && (
                    <Empty text="Aucune arme ne correspond" />
                  )}
                  <p className="data-note">
                    Catalogue et conditions saisis manuellement. Aucune
                    condition non vérifiée n’est ajoutée.
                  </p>
                </>
              )}
              {page === "matches" && (
                <>
                  <PageTitle
                    title="Historique des parties"
                    description="Revenez sur vos performances, partie après partie."
                  />
                  <div className="toolbar">
                    <label className="search">
                      <Search size={17} />
                      <input
                        placeholder="Carte, mode ou résultat…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      value={category}
                      aria-label="Résultat"
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {["Toutes", "Victoire", "Défaite", "Égalité"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                  <section className="panel">{chartView()}</section>
                  <section className="panel spaced">{matchesView()}</section>
                </>
              )}
              {page === "loadouts" && (
                <>
                  <PageTitle
                    title="Mes classes"
                    description="Vos configurations favorites, prêtes pour la prochaine partie."
                  />
                  {!data.loadouts.length ? (
                    <section className="panel">
                      <Empty
                        text="Votre première classe reste à créer"
                        sub="Ajoutez une arme et ses cinq accessoires depuis l’administration."
                      />
                    </section>
                  ) : (
                    <div className="weapon-grid">
                      {data.loadouts.map((l) => (
                        <section className="panel" key={l.id}>
                          <span className="badge">{l.type}</span>
                          <h2>{l.name}</h2>
                          <p className="cyan">
                            {
                              data.weapons.find((w) => w.id === l.weaponId)
                                ?.name
                            }
                          </p>
                          <ul>
                            {l.attachments.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                          <p>Équipements : {l.equipment || "—"}</p>
                          <p>Atouts : {l.perks || "—"}</p>
                          <p className="muted">{l.notes}</p>
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
              {page === "admin" && (
                <>
                  <PageTitle
                    title="Administration"
                    description="Un espace privé pour garder votre progression à jour."
                  />
                  {admin ? (
                    <Admin
                      data={data}
                      save={save}
                      busy={busy}
                      notify={setNotice}
                      fail={setError}
                    />
                  ) : (
                    <Login fail={setError} />
                  )}
                </>
              )}
              {![
                "dashboard",
                "camos",
                "arsenal",
                "matches",
                "loadouts",
                "admin",
              ].includes(page) && (
                <Empty
                  text="Page introuvable"
                  sub="Utilisez la navigation pour retrouver votre quartier général."
                />
              )}
            </>
          )}
          <footer>
            <span>
              AZLUCK <b>TRACKER</b>
              <span className="footer-sep">/</span>Chaque progression a son
              histoire.
            </span>
            <span>Projet personnel · Non affilié à Activision</span>
          </footer>
        </main>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={"Fiche " + selected.name}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSelected(null);
              if (e.key === "Tab") {
                e.preventDefault();
                e.currentTarget
                  .querySelector<HTMLButtonElement>("button")
                  ?.focus();
              }
            }}
            className="modal panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="close"
              onClick={() => setSelected(null)}
            >
              Fermer
            </button>
            <span className="eyebrow">FICHE ARME</span>
            <h1>{selected.name}</h1>
            <p>{selected.category}</p>
            <p>
              Niveau : {format(selected.level)} / {format(selected.maxLevel)}
            </p>
            <p>
              Éliminations : {format(selected.kills)} · Morts :{" "}
              {format(selected.deaths)}
            </p>
            <p className="gold-text">
              {selected.gold ? "Or débloqué" : "Or en progression"}
            </p>
            <p>Platine : {selected.platinum ? "Débloqué" : "Non confirmé"}</p>
            <h3>Défis renseignés</h3>
            {data.challenges
              .filter((c) => c.weaponId === selected.id)
              .map((c) => (
                <p key={c.id}>
                  {c.name} · {c.current}/{c.target} {c.completed ? "✓" : ""}
                </p>
              ))}
            <h3>Classes favorites</h3>
            {data.loadouts
              .filter((l) => l.weaponId === selected.id)
              .map((l) => (
                <p key={l.id}>
                  {l.name} : {l.attachments.join(", ")}
                </p>
              ))}
            {!data.loadouts.some((l) => l.weaponId === selected.id) && (
              <p className="muted">Aucune classe renseignée.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
