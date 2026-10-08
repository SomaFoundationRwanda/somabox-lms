"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import Unauthorized from "@/components/sections/Unauthorized";
import { PageHeader, Section, List, ListRow, DataTable, EmptyState } from "@/components/layout";
import { aiFetch, DRAFT_TYPE_LABELS } from "@/lib/ai";
import { fill } from "@/lib/fill";
import Loader from "@/components/ui/Loader";

// Feature and draft-type names are translated under admin.ai.features / admin.ai.draftTypes.
const FEATURE_KEYS = ["fill_week", "story", "quiz", "outline", "outcome_rewrite", "rubric", "grading", "ask"];

const fmtInt = (n) => Number(n || 0).toLocaleString();

export default function AdminAiSettingsPage() {
  const { SERVER_URL, authenticated, role } = useContext(DataContext);
  const { showToast } = useToast();
  const { t } = useLanguage();
  const isAdmin = role === "admin";

  const [settings, setSettings] = useState(null);
  const [usage, setUsage] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [pickEmail, setPickEmail] = useState("");

  const load = useCallback(async () => {
    if (!SERVER_URL || !isAdmin) return;
    setLoading(true);
    setError("");
    const [s, u, people] = await Promise.all([
      aiFetch(`${SERVER_URL}/ai/admin/settings`),
      aiFetch(`${SERVER_URL}/ai/admin/usage?days=30`),
      aiFetch(`${SERVER_URL}/users?role=teacher,admin&limit=100&sortBy=name&sortOrder=asc`),
    ]);
    if (s.ok) setSettings(s.data); else setError(s.message);
    if (u.ok) setUsage(u.data); else setError((e) => e || u.message);
    if (people.ok) setStaff(people.data?.users || []);
    setLoading(false);
  }, [SERVER_URL, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const toggleSchool = async () => {
    const next = !settings?.enabled;
    if (!next && !window.confirm(t("admin.ai.confirmOff"))) return;
    setBusy("school");
    const r = await aiFetch(`${SERVER_URL}/ai/admin/settings`, { method: "PUT", body: { enabled: next } });
    setBusy("");
    if (!r.ok) { showToast(r.message, "error"); return; }
    setSettings((st) => ({ ...st, enabled: r.data?.enabled ?? next }));
    showToast(next ? t("admin.ai.switchedOn") : t("admin.ai.switchedOff"), "success");
  };

  // AI summaries of books and videos for learners (GET/PUT /ai/admin/settings learnerSummaries).
  const toggleSummaries = async () => {
    const next = !settings?.learnerSummaries;
    setBusy("summaries");
    const r = await aiFetch(`${SERVER_URL}/ai/admin/settings`, { method: "PUT", body: { learnerSummaries: next } });
    setBusy("");
    if (!r.ok) { showToast(r.message, "error"); return; }
    setSettings((st) => ({ ...st, learnerSummaries: r.data?.learnerSummaries ?? next }));
    showToast(next ? t("explore.summary.admin.turnedOn") : t("explore.summary.admin.turnedOff"), "success");
  };

  const setUserAi = async (user, aiEnabled) => {
    setBusy(`user-${user.id}`);
    const r = await aiFetch(`${SERVER_URL}/ai/admin/users/${user.id}`, { method: "PATCH", body: { aiEnabled } });
    setBusy("");
    if (!r.ok) { showToast(r.message, "error"); return false; }
    showToast(fill(t(aiEnabled ? "admin.ai.userOn" : "admin.ai.userOff"), { name: user.full_name || user.email }), "success");
    const s = await aiFetch(`${SERVER_URL}/ai/admin/settings`);
    if (s.ok) setSettings(s.data);
    return true;
  };

  const disabledIds = useMemo(() => new Set((settings?.disabledUsers || []).map((u) => Number(u.id))), [settings]);
  const candidates = staff.filter((u) => !disabledIds.has(Number(u.id)));

  const turnOffPicked = async (e) => {
    e.preventDefault();
    const email = pickEmail.trim().toLowerCase();
    const user = candidates.find((u) => String(u.email).toLowerCase() === email);
    if (!user) { showToast(t("admin.ai.pickFromList"), "error"); return; }
    if (await setUserAi(user, false)) setPickEmail("");
  };

  const draftRows = useMemo(() => {
    const byType = {};
    for (const d of usage?.drafts || []) {
      const t = byType[d.type] || (byType[d.type] = { type: d.type, approved_as_is: 0, approved_edited: 0, rejected: 0, pending: 0 });
      t.approved_as_is += Number(d.approved_as_is || 0);
      t.approved_edited += Number(d.approved_edited || 0);
      t.rejected += Number(d.rejected || 0);
      t.pending += Number(d.pending || 0);
    }
    return Object.values(byType);
  }, [usage]);

  const callRows = useMemo(() => {
    const byUser = {};
    for (const c of usage?.calls || []) {
      const key = c.user_id ?? c.email ?? "unknown";
      const row = byUser[key] || (byUser[key] = { key, name: c.full_name || c.email || t("admin.ai.unknown"), email: c.email, features: [], calls: 0, failed: 0, tokens: 0, latencySum: 0 });
      row.calls += Number(c.calls || 0);
      row.failed += Number(c.failed || 0);
      row.tokens += Number(c.prompt_tokens || 0) + Number(c.completion_tokens || 0);
      row.latencySum += Number(c.avg_latency_ms || 0) * Number(c.calls || 0);
      row.features.push(FEATURE_KEYS.includes(c.feature) ? t(`admin.ai.features.${c.feature}`) : c.feature);
    }
    return Object.values(byUser).map((r) => ({ ...r, avgSeconds: r.calls ? r.latencySum / r.calls / 1000 : 0 })).sort((a, b) => b.calls - a.calls);
  }, [usage, t]);

  if (!authenticated || !isAdmin) return <Unauthorized />;

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <div className="px-4 pt-4 flex flex-col gap-8 max-w-5xl">
        <Link href="/manage/admin" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-3.5 h-3.5" /> {t("admin.home.title")}
        </Link>
        <PageHeader
          eyebrow={t("admin.home.eyebrow")}
          title={t("admin.home.aiTitle")}
          description={t("admin.ai.description")}
        />

        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}

        {/* First load: the SOMABOX loader until the school's AI settings and use arrive. */}
        {loading && settings == null ? (
          <Loader variant="page" />
        ) : (
        <>
        <Section title={t("admin.ai.schoolSwitch")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${settings?.enabled ? "text-[#0D9488]" : "text-slate-400"}`} aria-hidden="true" />
              <p className="text-sm text-slate-800 dark:text-slate-100" id="ai-school-label">
                {settings == null ? t("admin.common.loading") : settings.enabled ? t("admin.ai.isOn") : t("admin.ai.isOff")}
              </p>
            </div>
            {settings ? (
              <button
                type="button"
                role="switch"
                aria-checked={!!settings.enabled}
                aria-labelledby="ai-school-label"
                onClick={toggleSchool}
                disabled={busy === "school"}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${settings.enabled ? "bg-[#0D9488]" : "bg-slate-300 dark:bg-slate-700"}`}
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.enabled ? "translate-x-6" : "translate-x-1"}`} />
                <span className="sr-only">{settings.enabled ? t("admin.ai.switchOff") : t("admin.ai.switchOn")}</span>
              </button>
            ) : null}
          </div>
        </Section>

        <Section divided title={t("explore.summary.admin.title")}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-800 dark:text-slate-100" id="ai-summaries-label">
                {settings == null
                  ? t("explore.summary.loading")
                  : settings.learnerSummaries
                    ? t("explore.summary.admin.on")
                    : t("explore.summary.admin.off")}
              </p>
              {settings ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.learnerSummaries}
                  aria-labelledby="ai-summaries-label"
                  aria-describedby="ai-summaries-help"
                  onClick={toggleSummaries}
                  disabled={busy === "summaries"}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-1 disabled:opacity-50 ${settings.learnerSummaries ? "bg-[#0D9488]" : "bg-slate-300 dark:bg-slate-700"}`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.learnerSummaries ? "translate-x-6" : "translate-x-1"}`} />
                  <span className="sr-only">{t("explore.summary.admin.switchLabel")}</span>
                </button>
              ) : null}
            </div>
            <ul id="ai-summaries-help" className="list-disc pl-5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <li>{t("explore.summary.admin.helpBooks")}</li>
              <li>{t("explore.summary.admin.helpVideos")}</li>
              <li>{t("explore.summary.admin.helpShared")}</li>
              <li>{t("explore.summary.admin.helpLimit")}</li>
            </ul>
            {settings && !settings.enabled ? (
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("explore.summary.admin.needsAi")}</p>
            ) : null}
          </div>
        </Section>

        <Section divided title={t("admin.ai.peopleOff")} description={t("admin.ai.peopleOffHelp")}>
          <div className="space-y-4">
            {(settings?.disabledUsers || []).length === 0 ? (
              <EmptyState compact title={loading ? t("admin.common.loading") : t("admin.ai.nobodyOff")} />
            ) : (
              <List label={t("admin.ai.peopleOff")}>
                {settings.disabledUsers.map((u) => (
                  <ListRow
                    key={u.id}
                    title={u.full_name || u.email}
                    subtitle={`${u.email} · ${t(`role.${u.role}`) || u.role}`}
                    actions={
                      <button type="button" onClick={() => setUserAi(u, true)} disabled={busy === `user-${u.id}`} className="text-xs font-semibold text-[#0D9488] border border-teal-200 hover:bg-teal-50 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                        {t("admin.ai.turnBackOn")}
                      </button>
                    }
                  />
                ))}
              </List>
            )}

            <form onSubmit={turnOffPicked} className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[14rem] max-w-md">
                <label htmlFor="ai-off-email" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t("admin.ai.turnOffFor")}</label>
                <input
                  id="ai-off-email"
                  list="ai-staff-emails"
                  value={pickEmail}
                  onChange={(e) => setPickEmail(e.target.value)}
                  placeholder={t("admin.ai.typeEmail")}
                  autoComplete="off"
                  className="w-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
                />
                <datalist id="ai-staff-emails">
                  {candidates.map((u) => (
                    <option key={u.id} value={u.email}>{u.full_name ? `${u.full_name} (${t(`role.${u.role}`) || u.role})` : (t(`role.${u.role}`) || u.role)}</option>
                  ))}
                </datalist>
              </div>
              <button type="submit" disabled={!pickEmail.trim() || busy.startsWith("user-")} className="text-xs font-bold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 px-4 py-2.5 rounded-lg">
                {t("admin.ai.turnOff")}
              </button>
            </form>
          </div>
        </Section>

        <Section divided title={fill(t("admin.ai.useInDays"), { days: usage?.days || 30 })} description={t("admin.ai.useHelp")}>
          <DataTable
            caption={t("admin.ai.callsCaption")}
            rows={callRows}
            rowKey={(r) => r.key}
            empty={loading ? t("admin.common.loading") : t("admin.ai.noUse")}
            columns={[
              {
                key: "name",
                header: t("admin.ai.colPerson"),
                render: (r) => (
                  <div className="min-w-[9rem]">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{r.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{[...new Set(r.features)].join(", ")}</p>
                  </div>
                ),
              },
              { key: "calls", header: t("admin.ai.colCalls"), align: "right", render: (r) => fmtInt(r.calls) },
              { key: "failed", header: t("admin.ai.colFailed"), align: "right", render: (r) => (r.failed ? <span className="text-rose-600 font-semibold">{fmtInt(r.failed)}</span> : "0") },
              { key: "tokens", header: t("admin.ai.colTokens"), align: "right", hideOnMobile: true, render: (r) => fmtInt(r.tokens) },
              { key: "avg", header: t("admin.ai.colAvg"), align: "right", render: (r) => r.avgSeconds.toFixed(1) },
            ]}
          />
        </Section>

        <Section divided title={t("admin.ai.draftsTitle")} description={t("admin.ai.draftsHelp")}>
          <DataTable
            caption={t("admin.ai.draftsCaption")}
            rows={draftRows}
            rowKey={(r) => r.type}
            empty={loading ? t("admin.common.loading") : t("admin.ai.noDrafts")}
            columns={[
              { key: "type", header: t("admin.ai.colType"), render: (r) => <span className="font-semibold">{DRAFT_TYPE_LABELS[r.type] ? t(`admin.ai.draftTypes.${r.type}`) : r.type}</span> },
              { key: "approved_as_is", header: t("admin.ai.colAsIs"), align: "right", render: (r) => fmtInt(r.approved_as_is) },
              { key: "approved_edited", header: t("admin.ai.colEdited"), align: "right", render: (r) => fmtInt(r.approved_edited) },
              { key: "rejected", header: t("admin.ai.colRejected"), align: "right", render: (r) => fmtInt(r.rejected) },
              { key: "pending", header: t("admin.ai.colWaiting"), align: "right", render: (r) => fmtInt(r.pending) },
            ]}
          />
        </Section>
        </>
        )}
      </div>
    </div>
  );
}
