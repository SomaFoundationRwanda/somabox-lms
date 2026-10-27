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
import { Field, Switch, TextInput } from "@/components/form";

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
        <Link href="/manage/admin" className="inline-flex items-center gap-1 text-caption font-semibold text-fg-subtle hover:text-fg-muted">
          <ArrowLeft className="w-3.5 h-3.5" /> {t("admin.home.title")}
        </Link>
        <PageHeader
          eyebrow={t("admin.home.eyebrow")}
          title={t("admin.home.aiTitle")}
          description={t("admin.ai.description")}
        />

        {error ? <p role="alert" className="text-ui text-danger-fg">{error}</p> : null}

        {/* First load: the SOMABOX loader until the school's AI settings and use arrive. */}
        {loading && settings == null ? (
          <Loader variant="page" />
        ) : (
        <>
        <Section title={t("admin.ai.schoolSwitch")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${settings?.enabled ? "text-brand-fg" : "text-fg-subtle"}`} aria-hidden="true" />
              <p className="text-ui text-fg" id="ai-school-label">
                {settings == null ? t("admin.common.loading") : settings.enabled ? t("admin.ai.isOn") : t("admin.ai.isOff")}
              </p>
            </div>
            {settings ? (
              <Switch checked={!!settings.enabled} onChange={toggleSchool} disabled={busy === "school"} aria-labelledby="ai-school-label">
                {settings.enabled ? t("admin.ai.switchOff") : t("admin.ai.switchOn")}
              </Switch>
            ) : null}
          </div>
        </Section>

        <Section divided title={t("explore.summary.admin.title")}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-ui text-fg" id="ai-summaries-label">
                {settings == null
                  ? t("explore.summary.loading")
                  : settings.learnerSummaries
                    ? t("explore.summary.admin.on")
                    : t("explore.summary.admin.off")}
              </p>
              {settings ? (
                <Switch checked={!!settings.learnerSummaries} onChange={toggleSummaries} disabled={busy === "summaries"}
                  aria-labelledby="ai-summaries-label" aria-describedby="ai-summaries-help">
                  {t("explore.summary.admin.switchLabel")}
                </Switch>
              ) : null}
            </div>
            <ul id="ai-summaries-help" className="list-disc pl-5 space-y-1 text-ui text-fg-muted">
              <li>{t("explore.summary.admin.helpBooks")}</li>
              <li>{t("explore.summary.admin.helpVideos")}</li>
              <li>{t("explore.summary.admin.helpShared")}</li>
              <li>{t("explore.summary.admin.helpLimit")}</li>
            </ul>
            {settings && !settings.enabled ? (
              <p className="text-ui font-semibold text-warning-fg">{t("explore.summary.admin.needsAi")}</p>
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
                      <button type="button" onClick={() => setUserAi(u, true)} disabled={busy === `user-${u.id}`} className="text-caption font-semibold text-brand-fg border border-brand/40 hover:bg-brand-soft disabled:opacity-50 px-3 py-1.5 rounded-lg">
                        {t("admin.ai.turnBackOn")}
                      </button>
                    }
                  />
                ))}
              </List>
            )}

            <form onSubmit={turnOffPicked} className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[14rem] max-w-md">
                <Field id="ai-off-email" label={t("admin.ai.turnOffFor")}>
                  <TextInput
                    list="ai-staff-emails"
                    value={pickEmail}
                    onChange={(e) => setPickEmail(e.target.value)}
                    placeholder={t("admin.ai.typeEmail")}
                    autoComplete="off"
                  />
                </Field>
                <datalist id="ai-staff-emails">
                  {candidates.map((u) => (
                    <option key={u.id} value={u.email}>{u.full_name ? `${u.full_name} (${t(`role.${u.role}`) || u.role})` : (t(`role.${u.role}`) || u.role)}</option>
                  ))}
                </datalist>
              </div>
              <button type="submit" disabled={!pickEmail.trim() || busy.startsWith("user-")} className="text-caption font-bold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 px-4 py-2.5 rounded-lg">
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
                    <p className="font-semibold text-fg">{r.name}</p>
                    <p className="text-caption text-fg-subtle truncate">{[...new Set(r.features)].join(", ")}</p>
                  </div>
                ),
              },
              { key: "calls", header: t("admin.ai.colCalls"), align: "right", render: (r) => fmtInt(r.calls) },
              { key: "failed", header: t("admin.ai.colFailed"), align: "right", render: (r) => (r.failed ? <span className="text-danger-fg font-semibold">{fmtInt(r.failed)}</span> : "0") },
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
