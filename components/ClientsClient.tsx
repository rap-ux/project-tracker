"use client";

import { useState, useMemo } from "react";
import { toCSV, downloadCSV } from "@/lib/csv";

const fmt$ = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

interface Project {
  id: number;
  name: string;
  foreman: string;
  stage: string;
  is_pipeline: number;
  region: string | null;
  builder: string | null;
  contacts: string | null;
  phone: string | null;
  project_notes: string | null;
  basecamp_link: string | null;
  drive_folder: string | null;
  contract_value: number;
}

const EDITABLE_FIELDS: Array<{ key: keyof Project; label: string; type: "text" | "textarea" }> = [
  { key: "name",         label: "Project Name",  type: "text" },
  { key: "region",       label: "Region",        type: "text" },
  { key: "builder",      label: "Builder / GC",  type: "text" },
  { key: "contacts",     label: "Contact Name",  type: "text" },
  { key: "phone",        label: "Phone",         type: "text" },
  { key: "project_notes",label: "Notes",         type: "textarea" },
  { key: "basecamp_link",label: "Basecamp Link", type: "text" },
  { key: "drive_folder", label: "Drive Folder (URL or name)", type: "text" },
];

export default function ClientsClient({ projects: initial, role }: { projects: Project[]; role: string }) {
  const [projects, setProjects]   = useState(initial);
  const [search,   setSearch]     = useState("");
  const [region,   setRegion]     = useState("all");
  const [foreman,  setForeman]    = useState("all");
  const [showMinor, setShowMinor] = useState(true);
  const [sortKey,  setSortKey]    = useState<"name" | "region" | "builder" | "foreman">("region");
  const [editing,  setEditing]    = useState<Project | null>(null);
  const [adding,   setAdding]     = useState(false);
  const [saving,   setSaving]     = useState(false);

  const isAdmin = role === "owner" || role === "admin";

  const regions  = useMemo(() => ["all", ...Array.from(new Set(projects.map(p => p.region).filter(Boolean) as string[])).sort()], [projects]);
  const foremen  = useMemo(() => ["all", ...Array.from(new Set(projects.map(p => p.foreman))).sort()], [projects]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return projects
      .filter(p => {
        if (!showMinor && p.is_pipeline === 1) return false;
        if (region  !== "all" && p.region  !== region)  return false;
        if (foreman !== "all" && p.foreman !== foreman) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.builder  ?? "").toLowerCase().includes(q) ||
          (p.contacts ?? "").toLowerCase().includes(q) ||
          (p.phone    ?? "").toLowerCase().includes(q) ||
          (p.region   ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortKey === "name")    return a.name.localeCompare(b.name);
        if (sortKey === "foreman") return a.foreman.localeCompare(b.foreman);
        if (sortKey === "builder") return (a.builder ?? "").localeCompare(b.builder ?? "");
        // region
        const rA = a.region ?? "ZZZ";
        const rB = b.region ?? "ZZZ";
        if (rA !== rB) return rA.localeCompare(rB);
        return a.name.localeCompare(b.name);
      });
  }, [projects, search, region, foreman, showMinor, sortKey]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, any> = {};
    for (const f of EDITABLE_FIELDS) {
      body[f.key] = (fd.get(f.key) as string) || null;
    }
    const res = await fetch(`/api/projects/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setProjects(prev => prev.map(p => p.id === editing.id ? { ...p, ...body } : p));
      setEditing(null);
    }
    setSaving(false);
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name:           (fd.get("name") as string)?.trim(),
      foreman:        (fd.get("foreman") as string)?.trim() || "Unassigned",
      stage:          (fd.get("stage") as string) || "Contracting Phase",
      region:         (fd.get("region") as string) || null,
      builder:        (fd.get("builder") as string) || null,
      contacts:       (fd.get("contacts") as string) || null,
      phone:          (fd.get("phone") as string) || null,
      project_notes:  (fd.get("project_notes") as string) || null,
      basecamp_link:  (fd.get("basecamp_link") as string) || null,
      drive_folder:   (fd.get("drive_folder") as string) || null,
      contract_value: Number(fd.get("contract_value")) || 0,
      is_pipeline:    (fd.get("is_pipeline") as string) === "active" ? 0 : 1,
    };
    const res  = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      // Server may return { id, ... } — merge into list
      const newProject: Project = {
        id:             data.id ?? Math.max(0, ...projects.map(p => p.id)) + 1,
        name:           body.name,
        foreman:        body.foreman,
        stage:          body.stage,
        is_pipeline:    body.is_pipeline,
        region:         body.region,
        builder:        body.builder,
        contacts:       body.contacts,
        phone:          body.phone,
        project_notes:  body.project_notes,
        basecamp_link:  body.basecamp_link,
        drive_folder:   body.drive_folder,
        contract_value: body.contract_value,
      };
      setProjects(prev => [...prev, newProject]);
      setAdding(false);
    }
    setSaving(false);
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, builder, contact, phone…"
          className="px-3 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2 w-full sm:w-72"
          style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}
        />
        <select value={region} onChange={e => setRegion(e.target.value)}
          className="px-3 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none">
          {regions.map(r => <option key={r} value={r}>{r === "all" ? "All Regions" : r}</option>)}
        </select>
        <select value={foreman} onChange={e => setForeman(e.target.value)}
          className="px-3 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none">
          {foremen.map(f => <option key={f} value={f}>{f === "all" ? "All Foremen" : f}</option>)}
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as any)}
          className="px-3 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none">
          <option value="region">Sort: Region</option>
          <option value="name">Sort: Name</option>
          <option value="foreman">Sort: Foreman</option>
          <option value="builder">Sort: Builder</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input type="checkbox" checked={showMinor} onChange={e => setShowMinor(e.target.checked)}
            className="w-4 h-4 rounded accent-cyan-500" />
          Include minor projects
        </label>
        <span className="text-xs text-subtle ml-auto">{filtered.length} of {projects.length} projects</span>
        <button
          onClick={() => {
            const csv = toCSV(filtered.map(p => ({
              name: p.name, foreman: p.foreman, stage: p.stage,
              type: p.is_pipeline ? "Minor" : "Tracked",
              region: p.region, builder: p.builder, contacts: p.contacts, phone: p.phone,
              contract_value: p.contract_value, notes: p.project_notes,
              basecamp: p.basecamp_link, drive: p.drive_folder,
            })), [
              { key: "name", label: "Project" }, { key: "foreman", label: "Foreman" },
              { key: "stage", label: "Stage" }, { key: "type", label: "Type" },
              { key: "region", label: "Region" }, { key: "builder", label: "Builder / GC" },
              { key: "contacts", label: "Contact" }, { key: "phone", label: "Phone" },
              { key: "contract_value", label: "Contract $" }, { key: "notes", label: "Notes" },
              { key: "basecamp", label: "Basecamp Link" }, { key: "drive", label: "Drive Folder" },
            ]);
            downloadCSV(`clients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
          }}
          title="Export current filtered rows as CSV"
          className="text-sm px-3 py-1.5 bg-surface border border-border-strong hover:bg-surface-2 text-text rounded-lg font-medium transition-colors">
          ⬇ CSV
        </button>
        {isAdmin && (
          <button
            onClick={() => setAdding(true)}
            className="text-sm px-4 py-1.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#00BAD6" }}>
            + Add Client
          </button>
        )}
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2.5 print:hidden">
        {filtered.length === 0 && (
          <div className="bg-surface rounded-xl border border-border p-8 text-center text-sm text-subtle">
            No projects match your filters.
          </div>
        )}
        {filtered.map(p => (
          <div key={p.id} className={`bg-surface rounded-xl border border-border shadow-sm p-4 space-y-2 ${p.is_pipeline === 1 ? "opacity-80" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-text">{p.name}</p>
                {p.contract_value > 0 && (
                  <p className="text-xs text-subtle font-mono">{fmt$(p.contract_value)}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  p.stage === "Finish"            ? "bg-purple-100 text-purple-700" :
                  p.stage === "Extras"            ? "bg-warning-bg   text-warning"  :
                  p.stage === "Contracting Phase" ? "bg-surface-2    text-muted"   :
                  p.stage === "Underground"       ? "bg-warning-bg  text-warning" :
                                                    "bg-info-bg    text-info"
                }`}>{p.stage}</span>
                {p.is_pipeline === 1 && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-surface-2 text-muted font-medium">Minor</span>
                )}
              </div>
            </div>
            <div className="text-xs text-muted space-y-1">
              <div className="grid grid-cols-2 gap-2">
                <p><span className="text-subtle">Foreman:</span> {p.foreman}</p>
                <p><span className="text-subtle">Region:</span> {p.region || "—"}</p>
              </div>
              {p.builder  && <p><span className="text-subtle">🏗️ Builder:</span> {p.builder}</p>}
              {p.contacts && <p><span className="text-subtle">👤 Contact:</span> {p.contacts}</p>}
              {p.phone    && (
                <p>
                  <span className="text-subtle">📞 Phone:</span>{" "}
                  <a href={`tel:${p.phone}`} className="text-info underline">{p.phone}</a>
                </p>
              )}
              {p.project_notes && <p className="italic text-subtle">📝 {p.project_notes}</p>}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              {p.basecamp_link && (
                <a href={p.basecamp_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center w-8 h-8 rounded bg-surface-2 border border-border">
                  <img src="/icons/basecamp.svg" alt="Basecamp" className="w-5 h-5" />
                </a>
              )}
              {p.drive_folder && (
                <a href={p.drive_folder.startsWith("http") ? p.drive_folder : `https://drive.google.com/drive/search?q=${encodeURIComponent(p.drive_folder)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center w-8 h-8 rounded bg-surface-2 border border-border">
                  <img src="/icons/google-drive.svg" alt="Drive" className="w-5 h-5" />
                </a>
              )}
              {isAdmin && (
                <button
                  onClick={() => setEditing(p)}
                  className="ml-auto text-xs px-3 py-1.5 bg-surface-2 hover:bg-surface-3 rounded-lg font-medium">
                  ✏️ Edit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-surface rounded-xl border border-border shadow-sm overflow-hidden print:shadow-none print:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-[11px] uppercase tracking-wider text-muted font-semibold">
                <th className="px-4 py-2.5 text-left">Project</th>
                <th className="px-4 py-2.5 text-left">Region</th>
                <th className="px-4 py-2.5 text-left">Foreman</th>
                <th className="px-4 py-2.5 text-left">Stage</th>
                <th className="px-4 py-2.5 text-left">Builder / GC</th>
                <th className="px-4 py-2.5 text-left">Contact</th>
                <th className="px-4 py-2.5 text-left">Phone</th>
                <th className="px-4 py-2.5 text-left">Notes</th>
                <th className="px-4 py-2.5 text-center print:hidden">Links</th>
                {isAdmin && <th className="px-4 py-2.5 text-center w-16 print:hidden"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 10 : 9} className="px-4 py-10 text-center text-sm text-subtle">No projects match your filters.</td></tr>
              )}
              {filtered.map(p => (
                <tr key={p.id} className={`hover:bg-surface-2 transition-colors ${p.is_pipeline === 1 ? "opacity-75" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-text">
                    <div className="flex items-center gap-1.5">
                      <span>{p.name}</span>
                      {p.is_pipeline === 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted font-medium">Minor</span>
                      )}
                    </div>
                    {p.contract_value > 0 && (
                      <div className="text-xs text-subtle font-normal">{fmt$(p.contract_value)}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">{p.region || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{p.foreman}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.stage === "Finish"            ? "bg-purple-100 text-purple-700" :
                      p.stage === "Extras"            ? "bg-warning-bg   text-warning"  :
                      p.stage === "Contracting Phase" ? "bg-surface-2    text-muted"   :
                      p.stage === "Underground"       ? "bg-warning-bg  text-warning" :
                                                        "bg-info-bg    text-info"
                    }`}>{p.stage}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text">{p.builder || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{p.contacts || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">{p.phone || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-subtle italic max-w-[200px] truncate" title={p.project_notes ?? ""}>
                    {p.project_notes || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center print:hidden">
                    <div className="flex items-center gap-1.5 justify-center">
                      {p.basecamp_link && (
                        <a href={p.basecamp_link} target="_blank" rel="noopener noreferrer"
                          title="Open in Basecamp"
                          className="flex items-center justify-center w-6 h-6 rounded hover:opacity-75 transition-opacity">
                          <img src="/icons/basecamp.svg" alt="Basecamp" className="w-5 h-5" />
                        </a>
                      )}
                      {p.drive_folder && (
                        <a href={p.drive_folder.startsWith("http") ? p.drive_folder : `https://drive.google.com/drive/search?q=${encodeURIComponent(p.drive_folder)}`}
                          target="_blank" rel="noopener noreferrer"
                          title="Open in Google Drive"
                          className="flex items-center justify-center w-6 h-6 rounded hover:opacity-75 transition-opacity">
                          <img src="/icons/google-drive.svg" alt="Drive" className="w-5 h-5" />
                        </a>
                      )}
                      {!p.basecamp_link && !p.drive_folder && <span className="text-subtle text-xs">—</span>}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2.5 text-center print:hidden">
                      <button
                        onClick={() => setEditing(p)}
                        title="Edit client details"
                        className="text-xs px-2 py-1 bg-surface-2 hover:bg-surface-3 rounded transition-colors">
                        ✏️ Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 print:hidden">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface px-6 py-4 border-b flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-text">Edit Client Details</h2>
                <p className="text-xs text-subtle">{editing.name}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-subtle hover:text-muted text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {EDITABLE_FIELDS.map(f => (
                  <div key={f.key as string} className={f.type === "textarea" || f.key === "basecamp_link" || f.key === "drive_folder" ? "col-span-2" : ""}>
                    <label className="block text-xs font-medium text-muted mb-1">{f.label}</label>
                    {f.type === "textarea" ? (
                      <textarea name={f.key as string}
                        defaultValue={(editing[f.key] as string) ?? ""}
                        rows={2}
                        className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2 resize-none"
                        style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                    ) : (
                      <input name={f.key as string} type="text"
                        defaultValue={(editing[f.key] as string) ?? ""}
                        className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: "#00BAD6" }}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button type="button" onClick={() => setEditing(null)}
                  className="flex-1 py-2 bg-surface-2 hover:bg-surface-3 rounded-lg text-sm font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add modal */}
      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 print:hidden">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface px-6 py-4 border-b flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-text">Add New Client / Project</h2>
                <p className="text-xs text-subtle">Creates a new project with client details</p>
              </div>
              <button onClick={() => setAdding(false)} className="text-subtle hover:text-muted text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              {/* Required fields */}
              <div>
                <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide mb-2">Required</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted mb-1">Project Name *</label>
                    <input name="name" type="text" required autoFocus
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Foreman</label>
                    <input name="foreman" type="text" list="foreman-options" defaultValue=""
                      placeholder="e.g. Taimez"
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                    <datalist id="foreman-options">
                      {foremen.filter(f => f !== "all").map(f => <option key={f} value={f} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Starting Stage</label>
                    <select name="stage" defaultValue="Contracting Phase"
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}>
                      <option value="Contracting Phase">Contracting Phase</option>
                      <option value="Underground">Underground</option>
                      <option value="Rough">Rough</option>
                      <option value="Finish">Finish</option>
                      <option value="Extras">Extras</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted mb-1">Project Type</label>
                    <div className="flex gap-2">
                      <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border-strong cursor-pointer hover:border-border-strong has-[:checked]:bg-accent-soft has-[:checked]:border-cyan-400">
                        <input type="radio" name="is_pipeline" value="minor" defaultChecked className="accent-cyan-500" />
                        <span className="text-sm">
                          <span className="font-semibold">Minor / Pipeline</span>
                          <span className="block text-xs text-subtle">Pre-contract or small job</span>
                        </span>
                      </label>
                      <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border-strong cursor-pointer hover:border-border-strong has-[:checked]:bg-accent-soft has-[:checked]:border-cyan-400">
                        <input type="radio" name="is_pipeline" value="active" className="accent-cyan-500" />
                        <span className="text-sm">
                          <span className="font-semibold">Tracked</span>
                          <span className="block text-xs text-subtle">Signed contract</span>
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted mb-1">Contract Value ($)</label>
                    <input name="contract_value" type="number" step="0.01" min="0" defaultValue="0"
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2 font-mono"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                </div>
              </div>

              {/* Client details */}
              <div>
                <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide mb-2">Client Info</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Region</label>
                    <input name="region" type="text" list="region-options"
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                    <datalist id="region-options">
                      {regions.filter(r => r !== "all").map(r => <option key={r} value={r} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Builder / GC</label>
                    <input name="builder" type="text"
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Contact Name</label>
                    <input name="contacts" type="text"
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Phone</label>
                    <input name="phone" type="text"
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted mb-1">Notes</label>
                    <textarea name="project_notes" rows={2}
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2 resize-none"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted mb-1">Basecamp Link</label>
                    <input name="basecamp_link" type="text" placeholder="https://3.basecamp.com/…"
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted mb-1">Drive Folder (URL or name)</label>
                    <input name="drive_folder" type="text" placeholder="https://drive.google.com/…"
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: "#00BAD6" }}>
                  {saving ? "Creating…" : "+ Create Client"}
                </button>
                <button type="button" onClick={() => setAdding(false)}
                  className="flex-1 py-2.5 bg-surface-2 hover:bg-surface-3 rounded-lg text-sm font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
