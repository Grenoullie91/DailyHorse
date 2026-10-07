import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { api, type Kpi, type Source } from "./api";
import "./workspace.css";
import { AgentWorkspace } from "./components/AgentWorkspace";
import { WorkOsHome } from "./components/WorkOsHome";
import { RemoteFilesWorkspace } from "./components/RemoteFilesWorkspace";

const labels: Record<string, string> = { users: "Aktive Nutzer", sessions: "Sitzungen", pageviews: "Seitenaufrufe", youtube_views: "YouTube Views", instagram_reach: "Instagram Reichweite", search_clicks: "Google Klicks", play_downloads: "Play Installationen", github_views: "GitHub Views" };
const time = (value: string | null) => value ? new Date(value).toLocaleString("de-DE") : "noch nie";
type View = "today" | "kpis" | "sources" | "editor" | "agent" | "files";
type DeviceCommand = { id: string; name: string; reachable: boolean };

function SourceCard({ source }: { source: Source }) {
  return <article className={`source-card source-card--${source.state}`}><div className="source-card-head"><b>{source.name}</b><span className="connector-state">{source.state_label}</span></div><p>{source.status_detail}</p>{source.last_success_at ? <small>Letzter erfolgreicher Sync: {time(source.last_success_at)}</small> : source.action ? <small className="connector-action">{source.action}</small> : <small>Keine Aktion erforderlich.</small>}</article>;
}

export default function App() {
  const [view, setView] = useState<View>("today");
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [palette, setPalette] = useState(false);
  const [devices, setDevices] = useState<DeviceCommand[]>([]);
  const load = async () => { const [overview, sourceData] = await Promise.all([api.overview(), api.sources()]); setKpis(overview.kpis); setSources(sourceData); };
  useEffect(() => { void load(); }, []);
  useEffect(() => { void (async () => { const session = await fetch("/api/workspace/bootstrap"); const { token } = await session.json() as { token?: string }; if (!session.ok || !token) return; const response = await fetch("/api/devices", { headers: { "x-daily-horse-token": token } }); if (response.ok) setDevices((await response.json() as { devices: DeviceCommand[] }).devices); })(); }, []);
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((open) => !open); } if (event.key === "Escape") setPalette(false); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
  const navigate = (next: View) => { setView(next); setPalette(false); };
  const metrics = <section className="metrics">{kpis.map((item) => <article key={item.id}><span>{labels[item.id] ?? item.id}</span><strong>{item.value === null ? "—" : new Intl.NumberFormat("de-DE").format(item.value)}</strong><small>{item.value === null ? "Keine aktuellen Messwerte" : `Direkt gemessen · ${item.info.source}`}</small></article>)}</section>;
  const commands: Array<[View, string]> = [["today", "Heute öffnen"], ["files", "Dateien öffnen"], ["agent", "OpenCode Command Center"], ["kpis", "KPI-Dashboard öffnen"], ["sources", "Datenquellen prüfen"], ["editor", "Redaktionsmaske öffnen"]];
   return <main className="workhorse"><header className="hero"><img src="/api/assets/header" alt="Haas Arts"/><div><p>DAILY WORKHORSE</p><h1>Heute klar. Morgen vorbereitet.</h1></div></header><nav className="workspace-nav" aria-label="Workspaces">{([ ["today", "Heute"], ["files", "Dateien"], ["kpis", "KPI-Dashboard"], ["sources", "Datenquellen"], ["editor", "Redaktionsmaske"], ["agent", "OpenCode"] ] as Array<[View, string]>).map(([id, label]) => <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}>{label}</button>)}<button className="palette-trigger" onClick={() => setPalette(true)}><Search size={16}/> Suche <kbd>Ctrl K</kbd></button></nav>{palette && <div className="palette-backdrop" onMouseDown={() => setPalette(false)}><section className="palette" role="dialog" aria-modal="true" aria-label="Command Palette" onMouseDown={(event) => event.stopPropagation()}><header><b>Command Palette</b><button aria-label="Schließen" onClick={() => setPalette(false)}><X size={16}/></button></header>{commands.map(([target, label]) => <button key={target} onClick={() => navigate(target)}>{label}</button>)}{devices.filter((device) => device.reachable).flatMap((device) => ["clipboard", "file", "ring"] as const).map((action, index) => { const device = devices.filter((item) => item.reachable)[Math.floor(index / 3)]; const labels = { clipboard: "Zwischenablage an", file: "Datei an", ring: "Klingeln:" }; return <button key={`${device.id}-${action}`} onClick={() => { navigate("today"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("dailyhorse:device-action", { detail: { id: device.id, action } })), 0); }}>{labels[action]} {device.name}</button>; })}</section></div>}{view === "files" ? <RemoteFilesWorkspace/> : view === "agent" ? <AgentWorkspace/> : view === "editor" ? <section className="editor"><a href="http://127.0.0.1:8081/" target="_blank" rel="noreferrer">Redaktionsmaske separat öffnen</a><iframe title="Haas Arts Redaktionsmaske" src="http://127.0.0.1:8081/"/></section> : view === "kpis" ? metrics : view === "sources" ? <section className="sources" aria-label="Datenquellen">{sources.map((source) => <SourceCard key={source.id} source={source}/>)}</section> : <WorkOsHome/>}</main>;
}
