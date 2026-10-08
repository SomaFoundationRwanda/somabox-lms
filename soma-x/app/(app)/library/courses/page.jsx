"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, FileUp, Info, Library, Loader2 } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import Unauthorized from "@/components/sections/Unauthorized";
import { PageHeader, Section, List, EmptyState } from "@/components/layout";
import { formatInstantDate } from "@/lib/dates";

// Course library (teachers and admins): bundles exported from courses on this box or uploaded
// as files. Creating a course from a bundle always makes a NEW draft course.

const SOURCE_LABELS = {
  upload: "Uploaded",
  export: "Exported from a course on this box",
  cloud: "From the cloud",
};

const ITEM_TYPE_LABELS = {
  page: "Page",
  quiz: "Quiz",
  assignment: "Assignment",
  discussion: "Discussion",
  sub_header: "Heading",
  file: "File",
  external_url: "Link",
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const networkMessage = (err, fallback) =>
  err?.name === "TypeError" ? "Couldn't reach the box. Check the connection and try again." : err?.message || fallback;

function Warnings({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      {items.map((w, i) => (
        <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />{w}</li>
      ))}
    </ul>
  );
}

function BundlePreview({ SERVER_URL, entryId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SERVER_URL}/bundles/${entryId}`);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.message || "Couldn't load this bundle.");
        if (!cancelled) setData(payload.bundle || {});
      } catch (err) {
        if (!cancelled) setError(networkMessage(err, "Couldn't load this bundle."));
      }
    })();
    return () => { cancelled = true; };
  }, [SERVER_URL, entryId]);

  if (error) return <p role="alert" className="text-xs text-rose-600">{error}</p>;
  if (!data) return <p className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Loading the preview...</p>;

  const modules = Array.isArray(data.modules) ? data.modules : [];
  const outcomes = Array.isArray(data.outcomes) ? data.outcomes : [];
  const weekLabel = (m) => (m.kind === "baseline" ? "Week 0 (baseline)" : `Week ${m.weekOffset}`);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-4 text-xs">
      <div className="min-w-0">
        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-1">Weeks</h4>
        {modules.length === 0 ? <p className="text-slate-500">No weeks.</p> : (
          <ol className="space-y-2">
            {modules.map((m, i) => (
              <li key={i} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{weekLabel(m)}: {m.title}</p>
                {m.items?.length ? (
                  <ul className="mt-0.5 space-y-0.5 text-slate-600 dark:text-slate-300">
                    {m.items.map((it, j) => (
                      <li key={j} className="flex flex-wrap gap-x-2">
                        <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400 w-20 shrink-0">{ITEM_TYPE_LABELS[it.type] || it.type}</span>
                        <span className="min-w-0 break-words">{it.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-slate-400">Nothing in this week.</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="min-w-0">
        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-1">Outcomes</h4>
        {outcomes.length === 0 ? <p className="text-slate-500">No outcomes.</p> : (
          <ul className="space-y-1 text-slate-600 dark:text-slate-300">
            {outcomes.map((o, i) => (
              <li key={o.ref || i} className="break-words">
                {o.code ? <span className="font-semibold text-slate-800 dark:text-slate-100">{o.code} </span> : null}
                {o.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VersionRow({ SERVER_URL, entry, latest, creating, onCreate }) {
  const [showPreview, setShowPreview] = useState(false);
  const details = [
    entry.grade ? `Grade ${entry.grade}` : null,
    plural(entry.weeks || 0, "week", "weeks"),
    plural(entry.outcomes || 0, "outcome", "outcomes"),
  ].filter(Boolean).join(" · ");
  const origin = [SOURCE_LABELS[entry.source] || entry.source, entry.createdAt ? `added ${formatInstantDate(entry.createdAt, { day: "numeric", month: "short", year: "numeric" })}` : null, entry.addedBy ? `by ${entry.addedBy}` : null]
    .filter(Boolean).join(" · ");
  const previewId = `bundle-preview-${entry.id}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={`${latest ? "text-sm" : "text-xs"} font-semibold text-slate-900 dark:text-white break-words`}>
            {latest ? entry.title : `Version ${entry.version}`}
            {latest ? <span className="ml-2 text-[11px] font-semibold text-[#0D9488]">Version {entry.version}</span> : null}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{details}</p>
          <p className="text-[11px] text-slate-500 break-words">{origin}</p>
          {latest && entry.description ? <p className="mt-1 text-xs text-slate-500 line-clamp-2">{entry.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            aria-expanded={showPreview}
            aria-controls={previewId}
            className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 rounded-lg px-3 py-1.5"
          >
            {showPreview ? "Hide preview" : "Preview"}
          </button>
          <button
            type="button"
            onClick={() => onCreate(entry)}
            disabled={creating}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 rounded-lg px-3 py-1.5"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
            {creating ? "Creating..." : "Create a course from this"}
          </button>
        </div>
      </div>
      {showPreview ? (
        <div id={previewId} className="border-t border-slate-100 dark:border-slate-800 pt-2">
          <BundlePreview SERVER_URL={SERVER_URL} entryId={entry.id} />
        </div>
      ) : null}
    </div>
  );
}

function BundleGroup({ SERVER_URL, versions, creatingId, onCreate }) {
  const [showOlder, setShowOlder] = useState(false);
  const [latest, ...older] = versions;
  const copies = useMemo(() => {
    const seen = new Map();
    for (const v of versions) for (const c of v.myCopies || []) seen.set(c.courseId, c);
    return [...seen.values()];
  }, [versions]);

  return (
    <li className="px-3 py-3 space-y-2">
      <VersionRow SERVER_URL={SERVER_URL} entry={latest} latest creating={creatingId === latest.id} onCreate={onCreate} />

      {copies.length ? (
        <div className="text-xs">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Your copies: </span>
          {copies.map((c, i) => (
            <span key={c.courseId}>
              {i > 0 ? ", " : ""}
              <Link href={`/course/${c.courseId}/home`} className="text-[#0D9488] hover:underline">{c.title}</Link>
              {c.version ? <span className="text-slate-400"> (v{c.version})</span> : null}
            </span>
          ))}
        </div>
      ) : null}

      {older.length ? (
        <div>
          <button
            type="button"
            onClick={() => setShowOlder((v) => !v)}
            aria-expanded={showOlder}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            {showOlder ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}
            Older versions ({older.length})
          </button>
          {showOlder ? (
            <ul className="mt-2 space-y-3 border-l-2 border-slate-100 dark:border-slate-800 pl-3">
              {older.map((v) => (
                <li key={v.id}>
                  <VersionRow SERVER_URL={SERVER_URL} entry={v} creating={creatingId === v.id} onCreate={onCreate} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function UploadArea({ SERVER_URL, onUploaded, onCreated }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(""); // "add" | "import" | ""
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { added, title, version }

  const pick = (f) => {
    setError("");
    setResult(null);
    if (!f) return;
    if (!/\.json$/i.test(f.name) && f.type !== "application/json") {
      setError("That isn't a bundle file. Bundle files end in .somabox.json.");
      return;
    }
    setFile(f);
  };

  const send = async (mode) => {
    if (!file) return;
    setBusy(mode);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("bundle", file);
      const res = await fetch(`${SERVER_URL}/bundles${mode === "import" ? "/import" : ""}`, { method: "POST", body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Couldn't upload this bundle.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      if (mode === "import") {
        onCreated(payload);
      } else {
        setResult({ added: payload.added !== false, title: payload.title, version: payload.version });
        onUploaded();
      }
    } catch (err) {
      setError(networkMessage(err, "Couldn't upload this bundle."));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-3">
      <label
        htmlFor="bundle-file"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${dragging ? "border-[#0D9488] bg-teal-50 dark:bg-teal-950/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}
      >
        <FileUp className="w-6 h-6 text-slate-400" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{file ? file.name : "Choose a bundle file"}</span>
        <span className="text-xs text-slate-500">{file ? "Choose a different file" : "or drop it here (.somabox.json)"}</span>
        <input
          ref={inputRef}
          id="bundle-file"
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>

      {file ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => send("add")}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 rounded-lg px-4 py-2"
          >
            {busy === "add" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
            {busy === "add" ? "Uploading..." : "Add to the library"}
          </button>
          <button
            type="button"
            onClick={() => send("import")}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D9488] bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 rounded-lg px-4 py-2"
          >
            {busy === "import" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
            {busy === "import" ? "Creating..." : "Add and create a course"}
          </button>
        </div>
      ) : null}

      <div aria-live="polite">
        {error ? <p role="alert" className="text-xs font-semibold text-rose-600 break-words">{error}</p> : null}
        {result ? (
          <p className={`text-xs font-semibold ${result.added ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}>
            {result.added ? `Added: ${result.title} (version ${result.version}).` : `Already in your library: ${result.title} (version ${result.version}).`}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function CourseLibraryPage() {
  const { SERVER_URL, authenticated, role } = useContext(DataContext);
  const { showToast } = useToast();
  const router = useRouter();
  const allowed = role === "teacher" || role === "admin";

  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [creatingId, setCreatingId] = useState(null);
  const [created, setCreated] = useState(null); // { courseId, warnings, existingCopies, title }

  const load = useCallback(async () => {
    if (!SERVER_URL || !allowed) return;
    try {
      const res = await fetch(`${SERVER_URL}/bundles`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Couldn't load the course library.");
      setEntries(Array.isArray(payload) ? payload : []);
      setError("");
    } catch (err) {
      setError(networkMessage(err, "Couldn't load the course library."));
      setEntries((e) => e || []);
    }
  }, [SERVER_URL, allowed]);

  useEffect(() => { load(); }, [load]);

  // One group per bundleId, newest version first; groups sorted by their latest title.
  const groups = useMemo(() => {
    const byId = new Map();
    for (const e of entries || []) {
      if (!byId.has(e.bundleId)) byId.set(e.bundleId, []);
      byId.get(e.bundleId).push(e);
    }
    return [...byId.values()]
      .map((list) => list.sort((a, b) => Number(b.version) - Number(a.version)))
      .sort((a, b) => String(a[0].title).localeCompare(String(b[0].title)));
  }, [entries]);

  const handleCreated = (payload, title) => {
    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    const existingCopies = Array.isArray(payload.existingCopies) ? payload.existingCopies : [];
    showToast("New draft course created", "success");
    if (!warnings.length && !existingCopies.length) {
      router.push(`/course/${payload.courseId}/home`);
      return;
    }
    setCreated({ courseId: payload.courseId, warnings, existingCopies, title: title || payload.bundle?.title });
    load();
    requestAnimationFrame(() => document.getElementById("created-course")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const createFrom = async (entry) => {
    setCreatingId(entry.id);
    setCreated(null);
    try {
      const res = await fetch(`${SERVER_URL}/bundles/${entry.id}/courses`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Couldn't create a course from this bundle.");
      handleCreated(payload, entry.title);
    } catch (err) {
      showToast(networkMessage(err, "Couldn't create a course from this bundle."), "error");
    } finally {
      setCreatingId(null);
    }
  };

  if (!authenticated || !allowed) return <Unauthorized />;

  const backHref = role === "admin" ? "/manage/admin" : "/teacher/courses";

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <div className="px-4 pt-4 flex flex-col gap-8 max-w-5xl">
        <Link href={backHref} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {role === "admin" ? "Administration" : "My courses"}
        </Link>
        <PageHeader
          title="Course library"
          description="Shared courses you can start from. A bundle holds a course's outcomes, weeks, pages, quizzes, assignments and discussions, but no learners, no work and no dates."
        />

        <p className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 max-w-2xl">
          <Info className="w-4 h-4 shrink-0 text-[#0D9488]" aria-hidden="true" />
          <span>
            <strong>Creating a course from a bundle always makes a new draft course.</strong> You become its teacher. It has no learners and no start date yet, and the setup checklist will guide you. It never changes an existing course, even one made from the same bundle.
          </span>
        </p>

        {created ? (
          <section id="created-course" aria-labelledby="created-course-title" className="space-y-2 scroll-mt-4" role="status">
            <h2 id="created-course-title" className="text-sm font-bold text-slate-900 dark:text-white">New draft course created{created.title ? `: ${created.title}` : ""}</h2>
            {created.existingCopies.length ? (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                You already have {plural(created.existingCopies.length, "copy", "copies")} of this course — this made a new one.
              </p>
            ) : null}
            <Warnings items={created.warnings} />
            <Link
              href={`/course/${created.courseId}/home`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-lg px-4 py-2"
            >
              Open the new course
            </Link>
          </section>
        ) : null}

        <Section title="Add a bundle" description="Upload a bundle file someone shared with you. To share one of your own courses, open it and go to Settings, then Share.">
          <UploadArea SERVER_URL={SERVER_URL} onUploaded={load} onCreated={(payload) => handleCreated(payload)} />
        </Section>

        <Section divided title="Bundles on this box">
          {error ? <p role="alert" className="text-sm text-rose-600 mb-2">{error}</p> : null}
          {entries === null ? (
            <div className="space-y-2" aria-label="Loading the course library">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<Library className="w-8 h-8" aria-hidden="true" />}
              title="The course library is empty"
              description="Bundles get here when a teacher exports a course on this box (Settings, then Share), or when someone uploads a bundle file above."
            />
          ) : (
            <List label="Course bundles">
              {groups.map((versions) => (
                <BundleGroup
                  key={versions[0].bundleId}
                  SERVER_URL={SERVER_URL}
                  versions={versions}
                  creatingId={creatingId}
                  onCreate={createFrom}
                />
              ))}
            </List>
          )}
        </Section>
      </div>
    </div>
  );
}
