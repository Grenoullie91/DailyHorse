import { useState } from "react";
import { Info, X } from "lucide-react";
import type { SourceInfo } from "../api";
export function SourceDialog({ info }: { info: SourceInfo }) {
  const [open, setOpen] = useState(false);
  return <><button className="info-button" aria-label="Datenquelle anzeigen" onClick={() => setOpen(true)}><Info size={15}/></button>{open && <div className="dialog-backdrop" onMouseDown={() => setOpen(false)}><section className="source-dialog" onMouseDown={(e) => e.stopPropagation()}><button className="close" onClick={() => setOpen(false)}><X size={18}/></button><p className="eyebrow">DATENHERKUNFT</p><h3>{info.source}</h3><dl><dt>Metrik</dt><dd>{info.metric}</dd><dt>Attribution</dt><dd>{info.attribution.replaceAll("_", " ")}</dd><dt>Letzter Abruf</dt><dd>{info.fetchedAt ? new Date(info.fetchedAt).toLocaleString("de-DE") : "Noch keine Daten"}</dd><dt>Status</dt><dd>{info.availability === "available" ? "Verfügbar" : "Nicht verfügbar"}</dd></dl>{info.detail && <p className="source-detail">{info.detail}</p>}</section></div>}</>;
}
