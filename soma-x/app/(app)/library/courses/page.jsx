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
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { startRouteLoading } from "@/components/global/RouteLoader";
import Loader from "@/components/ui/Loader";

// Course library (teachers and admins): bundles exported from courses on this box or uploaded
// as files. Creating a course from a bundle always makes a NEW draft course.

// Labels live in shell.courseLibrary (sources.*, itemTypes.*); unknown values show as they are.
const SOURCE_KEYS = ["upload", "export", "cloud"];
const ITEM_TYPE_KEYS = ["page", "quiz", "assignment", "discussion", "sub_header", "file", "external_url"];

// "{n} weeks" / "1 week": oneKey and manyKey are full translation keys.
const plural = (t, n, oneKey, manyKey) => fill(t(n === 1 ? oneKey : manyKey), { n });
const networkMessage = (t, err, fallback) =>
  err?.name === "TypeError" ? t("shell.courseLibrary.unreachable") : err?.message || fallback;

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
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SERVER_URL}/bundles/${entryId}`);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.message || t("shell.courseLibrary.bundleLoadFailed"));
        if (!cancelled) setData(payload.bundle || {});
      } catch (err) {
        if (!cancelled) setError(networkMessage(t, err, t("shell.courseLibrary.bundleLoadFailed")));
      }
    })();
    return () => { cancelled = true; };
  }, [SERVER_URL, entryId, t]);

  if (error) return <p role="alert" className="text-xs text-rose-600">{error}</p>;
  if (!data) return <Loader variant="page" size={40} className="min-h-[8rem]" label={t("shell.courseLibrary.loadingPreview")} />;

  const modules = Array.isArray(data.modules) ? data.modules : [];
  const outcomes = Array.isArray(data.outcomes) ? data.outcomes : [];
  const weekLabel = (m) => (m.kind === "baseline" ? t("shell.courseLibrary.weekBaseline") : fill(t("shell.courseLibrary.weekN"), { n: m.weekOffset }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-4 text-xs">
      <div className="min-w-0">
        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-1">{t("shell.courseLibrary.weeks")}</h4>
        {modules.length === 0 ? <p className="text-slate-500">{t("shell.courseLibrary.noWeeks")}</p> : (
          <ol className="space-y-2">
            {modules.map((m, i) => (
              <li key={i} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{weekLabel(m)}: {m.title}</p>
                {m.items?.length ? (
                  <ul className="mt-0.5 space-y-0.5 text-slate-600 dark:text-slate-300">
                    {m.items.map((it, j) => (
                      <li key={j} className="flex flex-wrap gap-x-2">
                        <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400 w-20 shrink-0">{ITEM_TYPE_KEYS.includes(it.type) ? t(`shell.courseLibrary.itemTypes.${it.type}`) : it.type}</span>
                        <span className="min-w-0 break-words">{it.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-slate-400">{t("shell.courseLibrary.emptyWeek")}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="min-w-0">
        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-1">{t("shell.courseLibrary.outcomes")}</h4>
        {outcomes.length === 0 ? <p className="text-slate-500">{t("shell.courseLibrary.noOutcomes")}</p> : (
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
  const { t } = useLanguage();
  const [showPreview, setShowPreview] = useState(false);
  const details = [
    entry.grade ? fill(t("shell.courseLibrary.grade"), { grade: entry.grade }) : null,
    plural(t, entry.weeks || 0, "shell.courseLibrary.oneWeek", "shell.courseLibrary.nWeeks"),
    plural(t, entry.outcomes || 0, "shell.courseLibrary.oneOutcome", "shell.courseLibrary.nOutcomes"),
  ].filter(Boolean).join(" · ");
  const origin = [SOURCE_KEYS.includes(entry.source) ? t(`shell.courseLibrary.sources.${entry.source}`) : entry.source, entry.createdAt ? fill(t("shell.courseLibrary.addedOn"), { date: formatInstantDate(entry.createdAt, { day: "numeric", month: "short", year: "numeric" }) }) : null, entry.addedBy ? fill(t("shell.courseLibrary.addedBy"), { name: entry.addedBy }) : null]
    .filter(Boolean).join(" · ");
  const previewId = `bundle-preview-${entry.id}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={`${latest ? "text-sm" : "text-xs"} font-semibold text-slate-900 dark:text-white break-words`}>
            {latest ? entry.title : fill(t("shell.courseLibrary.version"), { n: entry.version })}
            {latest ? <span className="ml-2 text-[11px] font-semibold text-[var(--brand-secondary)]">{fill(t("shell.courseLibrary.version"), { n: entry.version })}</span> : null}
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
            {showPreview ? t("shell.courseLibrary.hidePreview") : t("shell.courseLibrary.preview")}
          </button>
          <button
            type="button"
            onClick={() => onCreate(entry)}
            disabled={creating}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] disabled:opacity-50 rounded-lg px-3 py-1.5"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
            {creating ? t("shell.courseLibrary.creating") : t("shell.courseLibrary.createFrom")}
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
  const { t } = useLanguage();
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
          <span className="font-semibold text-slate-600 dark:text-slate-300">{t("shell.courseLibrary.yourCopies")} </span>
          {copies.map((c, i) => (
            <span key={c.courseId}>
              {i > 0 ? ", " : ""}
              <Link href={`/course/${c.courseId}/home`} className="text-[var(--brand-secondary)] hover:underline">{c.title}</Link>
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
            {fill(t("shell.courseLibrary.olderVersions"), { n: older.length })}
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
  const { t } = useLanguage();
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
      setError(t("shell.courseLibrary.notBundle"));
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
      if (!res.ok) throw new Error(payload.message || t("shell.courseLibrary.uploadFailed"));
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      if (mode === "import") {
        onCreated(payload);
      } else {
        setResult({ added: payload.added !== false, title: payload.title, version: payload.version });
        onUploaded();
      }
    } catch (err) {
      setError(networkMessage(t, err, t("shell.courseLibrary.uploadFailed")));
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
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${dragging ? "border-[var(--brand-secondary)] bg-teal-50 dark:bg-teal-950/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}
      >
        <FileUp className="w-6 h-6 text-slate-400" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{file ? file.name : t("shell.courseLibrary.chooseFile")}</span>
        <span className="text-xs text-slate-500">{file ? t("shell.courseLibrary.chooseOther") : t("shell.courseLibrary.orDrop")}</span>
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
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] disabled:opacity-50 rounded-lg px-4 py-2"
          >
            {busy === "add" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
            {busy === "add" ? t("shell.courseLibrary.uploading") : t("shell.courseLibrary.addToLibrary")}
          </button>
          <button
            type="button"
            onClick={() => send("import")}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-secondary)] bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 rounded-lg px-4 py-2"
          >
            {busy === "import" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
            {busy === "import" ? t("shell.courseLibrary.creating") : t("shell.courseLibrary.addAndCreate")}
          </button>
        </div>
      ) : null}

      <div aria-live="polite">
        {error ? <p role="alert" className="text-xs font-semibold text-rose-600 break-words">{error}</p> : null}
        {result ? (
          <p className={`text-xs font-semibold ${result.added ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}>
            {fill(t(result.added ? "shell.courseLibrary.addedResult" : "shell.courseLibrary.alreadyResult"), { title: result.title, n: result.version })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function CourseLibraryPage() {
  const { SERVER_URL, authenticated, role } = useContext(DataContext);
  const { showToast } = useToast();
  const { t } = useLanguage();
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
      if (!res.ok) throw new Error(payload.message || t("shell.courseLibrary.loadFailed"));
      setEntries(Array.isArray(payload) ? payload : []);
      setError("");
    } catch (err) {
      setError(networkMessage(t, err, t("shell.courseLibrary.loadFailed")));
      setEntries((e) => e || []);
    }
  }, [SERVER_URL, allowed, t]);

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
    showToast(t("shell.courseLibrary.createdToast"), "success");
    if (!warnings.length && !existingCopies.length) {
      startRouteLoading();
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
      if (!res.ok) throw new Error(payload.message || t("shell.courseLibrary.createFailed"));
      handleCreated(payload, entry.title);
    } catch (err) {
      showToast(networkMessage(t, err, t("shell.courseLibrary.createFailed")), "error");
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
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {role === "admin" ? t("shell.courseLibrary.backAdmin") : t("shell.courseLibrary.backCourses")}
        </Link>
        <PageHeader
          title={t("shell.courseLibrary.title")}
          description={t("shell.courseLibrary.description")}
        />

        <p className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 max-w-2xl">
          <Info className="w-4 h-4 shrink-0 text-[var(--brand-secondary)]" aria-hidden="true" />
          <span>
            <strong>{t("shell.courseLibrary.noteStrong")}</strong> {t("shell.courseLibrary.noteRest")}
          </span>
        </p>

        {created ? (
          <section id="created-course" aria-labelledby="created-course-title" className="space-y-2 scroll-mt-4" role="status">
            <h2 id="created-course-title" className="text-sm font-bold text-slate-900 dark:text-white">{created.title ? fill(t("shell.courseLibrary.createdNamed"), { title: created.title }) : t("shell.courseLibrary.createdToast")}</h2>
            {created.existingCopies.length ? (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {plural(t, created.existingCopies.length, "shell.courseLibrary.alreadyOneCopy", "shell.courseLibrary.alreadyNCopies")}
              </p>
            ) : null}
            <Warnings items={created.warnings} />
            <Link
              href={`/course/${created.courseId}/home`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-dark)] rounded-lg px-4 py-2"
            >
              {t("shell.courseLibrary.openNew")}
            </Link>
          </section>
        ) : null}

        <Section title={t("shell.courseLibrary.addTitle")} description={t("shell.courseLibrary.addDescription")}>
          <UploadArea SERVER_URL={SERVER_URL} onUploaded={load} onCreated={(payload) => handleCreated(payload)} />
        </Section>

        <Section divided title={t("shell.courseLibrary.bundlesTitle")}>
          {error ? <p role="alert" className="text-sm text-rose-600 mb-2">{error}</p> : null}
          {entries === null ? (
            <Loader variant="page" size={56} className="min-h-[30vh]" label={t("shell.courseLibrary.loading")} />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<Library className="w-8 h-8" aria-hidden="true" />}
              title={t("shell.courseLibrary.emptyTitle")}
              description={t("shell.courseLibrary.emptyDescription")}
            />
          ) : (
            <List label={t("shell.courseLibrary.listLabel")}>
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
