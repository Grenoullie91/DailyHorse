import { useEffect, useState } from "react";
import { LocalFilesWorkspace } from "./LocalFilesWorkspace";

type Profile = {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: "sftp";
  username: string;
  remoteRoot: string;
  localRoot: string;
  environment: "production" | "staging" | "development";
  credentialStored?: boolean;
};
type Entry = {
  name: string;
  path: string;
  directory: boolean;
  size: number | null;
  modified: string | null;
};
type Transfer = {
  id: string;
  direction: string;
  name: string;
  target: string;
  status: string;
  error?: string;
};
const format = (size: number | null) =>
  size === null
    ? "Ordner"
    : new Intl.NumberFormat("de-DE", {
        notation: "compact",
        style: "unit",
        unit: "byte",
      }).format(size);
const displayPath = (root: string, relative: string) => `/${[...root.split("/"), ...relative.split("/")].filter(Boolean).join("/")}` || "/";

function RemoteFilesContent() {
  const [token, setToken] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [profileId, setProfileId] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [local, setLocal] = useState<Entry[]>([]);
  const [remote, setRemote] = useState<Entry[]>([]);
  const [localSelected, setLocalSelected] = useState<Entry>();
  const [remoteSelected, setRemoteSelected] = useState<Entry>();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [error, setError] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [showCredential, setShowCredential] = useState(false);
  const [password, setPassword] = useState("");
  const [form, setForm] = useState({
    name: "",
    host: "",
    port: "22",
    username: "",
    remoteRoot: "/",
    localRoot: "",
    environment: "production",
    projectId: "",
  });
  const headers = {
    "x-daily-horse-token": token,
    "Content-Type": "application/json",
  };
  const api = async <T,>(path: string, init?: RequestInit) => {
    const response = await fetch(path, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
    const body = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Dateioperation fehlgeschlagen.");
    return body;
  };
  const refresh = async (id = profileId, nextLocal = localPath, nextRemote = remotePath) => {
    if (!id) return;
    const [left, right, queue] = await Promise.all([api<{ entries: Entry[] }>(`/api/remote-files/${id}/local?path=${encodeURIComponent(nextLocal)}`), api<{ entries: Entry[] }>(`/api/remote-files/${id}/remote?path=${encodeURIComponent(nextRemote)}`), api<{ transfers: Transfer[] }>("/api/remote-files/transfers")]);
    setLocal(left.entries);
    setRemote(right.entries);
    setTransfers(queue.transfers);
  };
  useEffect(() => {
    void (async () => {
      try {
        const boot = await fetch("/api/workspace/bootstrap");
        const session = (await boot.json()) as { token?: string };
        if (!session.token) throw new Error("Lokale Workspace-Sitzung erforderlich.");
        setToken(session.token);
        const [response, workOs] = await Promise.all([
          fetch("/api/remote-files/profiles", {
            headers: { "x-daily-horse-token": session.token },
          }),
          fetch("/api/work-os", {
            headers: { "x-daily-horse-token": session.token },
          }),
        ]);
        const data = (await response.json()) as { profiles: Profile[] };
        setProfiles(data.profiles);
        setProfileId(data.profiles[0]?.id ?? "");
        if (workOs.ok)
          setProjects(
            (
              (await workOs.json()) as {
                projects: Array<{ id: string; name: string }>;
              }
            ).projects,
          );
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Dateien sind nicht verfügbar.");
      }
    })();
  }, []);
  const open = (side: "local" | "remote", entry: Entry) => {
    if (!entry.directory) return side === "local" ? setLocalSelected(entry) : setRemoteSelected(entry);
    const next = entry.path;
    if (side === "local") {
      setLocalPath(next);
      void refresh(profileId, next, remotePath).catch((reason) => setError(reason.message));
    } else {
      setRemotePath(next);
      void refresh(profileId, localPath, next).catch((reason) => setError(reason.message));
    }
  };
  const transfer = async (direction: "upload" | "download", entry: Entry | undefined) => {
    if (!entry || entry.directory) return;
    const source = direction === "upload" ? entry.path : entry.path;
    const destination = direction === "upload" ? `${remotePath ? `${remotePath}/` : ""}${entry.name}` : `${localPath ? `${localPath}/` : ""}${entry.name}`;
    try {
      await api(`/api/remote-files/${profileId}/${direction}`, {
        method: "POST",
        body: JSON.stringify({ source, destination, overwrite: false }),
      });
      await refresh();
    } catch (reason) {
      if (reason instanceof Error && reason.message.includes("existiert bereits") && confirm(`Die Zieldatei existiert bereits. Auf ${profiles.find((item) => item.id === profileId)?.environment === "production" ? "PRODUCTION" : "diesem"} überschreiben?`)) {
        await api(`/api/remote-files/${profileId}/${direction}`, {
          method: "POST",
          body: JSON.stringify({ source, destination, overwrite: true }),
        });
        await refresh();
      } else setError(reason instanceof Error ? reason.message : "Übertragung fehlgeschlagen.");
    }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const data = await api<{ profile: Profile }>("/api/remote-files/profiles", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          port: Number(form.port),
          protocol: "sftp",
          projectId: form.projectId || null,
        }),
      });
      setProfiles((current) => [...current, data.profile]);
      setProfileId(data.profile.id);
      setShowSetup(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profil konnte nicht angelegt werden.");
    }
  };
  const profile = profiles.find((item) => item.id === profileId);
  const storeCredential = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api(`/api/remote-files/${profileId}/credential`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setShowCredential(false);
      setProfiles((items) => items.map((item) => (item.id === profileId ? { ...item, credentialStored: true } : item)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Credential konnte nicht gespeichert werden.");
    }
  };
  return (
    <section className="file-workspace">
      <header className="today-head">
        <div>
          <p>REMOTE WORKSPACE</p>
          <h2>Dateien</h2>
          <span>Bewusste SFTP-Transfers innerhalb konfigurierter Projekt-Roots.</span>
        </div>
        <div className="file-toolbar">
          <select
            value={profileId}
            onChange={(event) => {
              setProfileId(event.target.value);
              setLocalPath("");
              setRemotePath("");
              setPassword("");
              setShowCredential(false);
            }}
          >
            <option value="">Website wählen</option>
            {profiles.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {item.environment}
              </option>
            ))}
           </select>
           {profile && (
             <button
               type="button"
               onClick={() =>
                 void refresh().catch((reason) =>
                   setError(reason instanceof Error ? reason.message : "Dateien konnten nicht aktualisiert werden."),
                 )
               }
             >
               Aktualisieren
             </button>
           )}
           {profile && (
             <button
               type="button"
               onClick={() => {
                setPassword("");
                setShowCredential(true);
              }}
            >
              {profile.credentialStored ? "Passwort ändern" : "Passwort speichern"}
            </button>
          )}
          <button onClick={() => setShowSetup(true)}>Verbindung hinzufügen</button>
        </div>
      </header>
      {error && <p className="work-os-error">{error}</p>}
      {profile && showCredential && (
        <div
          className="palette-backdrop"
          onMouseDown={() => {
            setPassword("");
            setShowCredential(false);
          }}
        >
          <section
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="SFTP-Passwort sicher speichern"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <form className="file-setup" onSubmit={storeCredential}>
              <header>
                <b>SFTP-Passwort sicher speichern</b>
                <button
                  type="button"
                  onClick={() => {
                    setPassword("");
                    setShowCredential(false);
                  }}
                >
                  Schließen
                </button>
              </header>
              <input required type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="SFTP-Passwort" />
              <button>In KDE Wallet speichern</button>
              <small>Das Passwort wird nur an KDE Wallet übergeben und nie wieder angezeigt.</small>
            </form>
          </section>
        </div>
      )}
      {showSetup && (
        <form className="file-setup" onSubmit={create}>
          <b>SFTP-Verbindung</b>
          <input required placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input required placeholder="Host" value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} />
          <input required placeholder="SSH-Benutzer" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <input required placeholder="Lokaler Projekt-Root" value={form.localRoot} onChange={(event) => setForm({ ...form, localRoot: event.target.value })} />
          <input required placeholder="Remote-Root" value={form.remoteRoot} onChange={(event) => setForm({ ...form, remoteRoot: event.target.value })} />
          <select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
            <option value="">Kein DailyHorse-Projekt</option>
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
          <button>Sicher speichern</button>
        </form>
      )}
      {profile ? (
        <>
          <p className={`file-environment ${profile.environment}`}>
            {profile.environment.toUpperCase()} · {profile.protocol.toUpperCase()} · {profile.host} · {profile.credentialStored ? "Credential gespeichert" : "Credential fehlt"}
          </p>
          <section className="file-explorers">
            <Explorer
               title="Lokal"
               root={profile.localRoot}
               atRoot={!localPath}
              entries={local}
              selected={localSelected}
              onOpen={(entry) => open("local", entry)}
              onUp={() => {
                const next = localPath.split("/").slice(0, -1).join("/");
                setLocalPath(next);
                void refresh(profileId, next, remotePath);
              }}
              action="Hochladen"
              onAction={() => void transfer("upload", localSelected)}
            />
            <Explorer
               title="Server"
               root={displayPath(profile.remoteRoot, remotePath)}
               atRoot={!remotePath}
              entries={remote}
              selected={remoteSelected}
              onOpen={(entry) => open("remote", entry)}
              onUp={() => {
                const next = remotePath.split("/").slice(0, -1).join("/");
                setRemotePath(next);
                void refresh(profileId, localPath, next);
              }}
              action="Herunterladen"
              onAction={() => void transfer("download", remoteSelected)}
            />
          </section>
          <section className="file-queue">
            <b>Transfers</b>
            {transfers.length ? (
              transfers.slice(0, 8).map((transfer) => (
                <p key={transfer.id}>
                  <strong>{transfer.name}</strong>
                  <span>
                    {transfer.direction} · {transfer.target}
                  </span>
                  <em className={transfer.status}>{transfer.status === "completed" ? "Abgeschlossen" : transfer.status === "failed" ? transfer.error : transfer.status}</em>
                </p>
              ))
            ) : (
              <small>Noch keine Transfers in dieser Sitzung.</small>
            )}
          </section>
        </>
      ) : (
        <section className="file-empty">
          <b>Keine Verbindung eingerichtet.</b>
          <p>Lege ein SFTP-Profil für einen expliziten lokalen Projekt-Root an.</p>
        </section>
      )}
    </section>
  );
}
function Explorer({ title, root, atRoot, entries, selected, onOpen, onUp, action, onAction }: { title: string; root: string; atRoot: boolean; entries: Entry[]; selected?: Entry; onOpen: (entry: Entry) => void; onUp: () => void; action: string; onAction: () => void }) {
  const [sort, setSort] = useState<{ key: "name" | "type" | "size" | "modified"; ascending: boolean }>({ key: "name", ascending: true });
  const pathParts = root.split("/").filter(Boolean);
  const sortedEntries = [...entries].sort((left, right) => {
    const value = (entry: Entry) => sort.key === "name" ? entry.name : sort.key === "type" ? (entry.directory ? "Ordner" : "Datei") : sort.key === "size" ? entry.size ?? -1 : entry.modified ?? "";
    const order = typeof value(left) === "number" && typeof value(right) === "number" ? Number(value(left)) - Number(value(right)) : String(value(left)).localeCompare(String(value(right)), "de");
    return sort.ascending ? order || left.name.localeCompare(right.name, "de") : -(order || left.name.localeCompare(right.name, "de"));
  });
  const changeSort = (key: typeof sort.key) => setSort((current) => ({ key, ascending: current.key === key ? !current.ascending : true }));
  return (
    <article className="file-panel">
      <header>
        <div>
          <p>{title.toUpperCase()}</p>
          <nav className="file-breadcrumbs" aria-label={`${title} Pfad`}><b>/</b>{pathParts.map((part, index) => <span key={`${part}-${index}`}>/ {part}</span>)}</nav>
        </div>
        <button disabled={atRoot} onClick={onUp}>Ordner hoch</button>
      </header>
      <div className="file-list" role="list" aria-label={`${title} Dateien`}>
        <div className="file-list-head" role="row">
          {([ ["name", "Name"], ["type", "Typ"], ["size", "Größe"], ["modified", "Geändert"] ] as const).map(([key, label]) => <button key={key} type="button" onClick={() => changeSort(key)} aria-pressed={sort.key === key}>{label}{sort.key === key ? (sort.ascending ? " ↑" : " ↓") : ""}</button>)}
        </div>
        {sortedEntries.map((entry) => (
          <button role="listitem" className={selected?.path === entry.path ? "selected" : ""} key={entry.path} onDoubleClick={() => onOpen(entry)} onClick={() => onOpen(entry)}>
            <b>{entry.name}</b>
            <span>{entry.directory ? "Ordner" : "Datei"}</span>
            <small>{format(entry.size)}</small>
            <small>{entry.modified ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.modified)) : "-"}</small>
          </button>
        ))}
      </div>
      <footer>
        <button disabled={!selected || selected.directory} onClick={onAction}>
          {action}
        </button>
      </footer>
    </article>
  );
}

export function RemoteFilesWorkspace() {
  return (
    <>
      <LocalFilesWorkspace />
      <RemoteFilesContent />
    </>
  );
}
