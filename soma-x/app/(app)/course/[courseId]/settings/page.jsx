"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Eye, EyeOff, ListChecks, X, ImageUp } from "lucide-react";
import { compareDates, isDateString } from "@somabox/timeline";
import { useQueryClient } from "@tanstack/react-query";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/context/ToastContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section } from "@/components/layout";
import { toDateInput } from "@/lib/dates";
import { useCourseText } from "@/components/course/useCourseText";
import SetupChecklist from "@/components/teacher/SetupChecklist";
import BaselinePanel from "@/components/teacher/BaselinePanel";
import CourseSetupWizard from "@/components/teacher/CourseSetupWizard";
import GradeSelect from "@/components/teacher/GradeSelect";
import Explainer from "@/components/help/Explainer";
import ShareCourseSection from "@/components/course/ShareCourseSection";
import CourseStatusSection from "@/components/course/CourseStatusSection";
import { Fieldset, FileButton, Label, Select, TextInput, Textarea } from "@/components/form";

// Settings > Course setup (teachers): the setup checklist, the Week 0 baseline and the guided wizard.
function CourseSetupSection({ courseId, course, userEmail, onCourseChanged }) {
  const { t } = useCourseText();
  // The same kept setup status as the course's Home page.
  const statusQuery = useCourseSection("setup-status");
  const status = statusQuery.data;
  const statusError = statusQuery.error ? statusQuery.error || t("settings.setupStatusFailed") : "";
  const loadStatus = statusQuery.refetch;
  // "#guided-setup" (e.g. right after creating a course) opens the wizard straight away.
  const [showWizard, setShowWizard] = useState(() => typeof window !== "undefined" && window.location.hash === "#guided-setup");
  useEffect(() => {
    if (showWizard && window.location.hash === "#guided-setup") {
      requestAnimationFrame(() => document.getElementById("guided-setup")?.scrollIntoView({ block: "start" }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [baselineKey, setBaselineKey] = useState(0); // remounts the baseline panel after the wizard changes things

  const isDraft = status ? !status.isOpened : (!course?.lifecycle || course.lifecycle === "draft");

  return (
    <section id="course-setup" aria-labelledby="course-setup-title" className="space-y-6 scroll-mt-4">
      <h2 id="course-setup-title" className="sr-only">{t("settings.tabs.setup")}</h2>
      {statusError && <p className="text-caption text-danger-fg" role="alert">{statusError}</p>}
      {status && (
        <SetupChecklist
          courseId={courseId}
          status={status}
          showSettingsLink={false}
          onChanged={() => { loadStatus(); onCourseChanged(); }}
        />
      )}

      <Section divided title={t("settings.baseline")} actions={<Explainer k="pages.baseline" />}>
        <BaselinePanel
          key={baselineKey}
          courseId={courseId}
          isDraft={isDraft}
          onChanged={loadStatus}
        />
      </Section>

      <Section
        divided
        title={t("settings.guided")}
        description={t("settings.guidedHelp")}
        actions={
          <button
            type="button"
            onClick={() => {
              if (showWizard) { setBaselineKey((k) => k + 1); loadStatus(); onCourseChanged(); }
              setShowWizard(!showWizard);
            }}
            aria-expanded={showWizard}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg bg-brand-soft border border-brand/40 px-3 py-2 rounded-lg hover:bg-brand-soft transition-colors"
          >
            {showWizard ? <><X className="w-3.5 h-3.5" aria-hidden="true" /> {t("settings.closeGuided")}</> : <><ListChecks className="w-3.5 h-3.5" aria-hidden="true" /> {t("settings.guided")}</>}
          </button>
        }
      />

      {showWizard && (
        <div id="guided-setup" className="scroll-mt-4">
        <CourseSetupWizard
          courseId={courseId}
          userEmail={userEmail}
          course={course}
          onCompleted={() => {
            setShowWizard(false);
            setBaselineKey((k) => k + 1);
            loadStatus();
            onCourseChanged();
          }}
        />
        </div>
      )}
    </section>
  );
}

// "Shift timeline": preview moving dates by N days (whole course or from one module on),
// then apply exactly what was previewed.
function ShiftTimelinePanel({ courseId, startDate, onApplied }) {
  const hasStartDate = Boolean(startDate);
  const { showToast } = useToast();
  const { t, tf, weekLabel, fmtDay } = useCourseText();
  const formatDate = (d) => fmtDay(d);
  // The kept weeks (shared with the Modules page), in date order, without the "unassigned" bucket.
  const { data: weeks } = useCourseSection("modules");
  const modules = (Array.isArray(weeks) ? weeks : [])
    .filter((m) => m.kind !== "unassigned")
    .sort((a, b) => compareDates(a.startDate || "9999-12-31", b.startDate || "9999-12-31") || (a.position ?? 0) - (b.position ?? 0));
  const [days, setDays] = useState("7");
  const [fromModuleId, setFromModuleId] = useState("");
  const [preview, setPreview] = useState(null); // { key, result }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const n = Number(days);
  const validDays = days.trim() !== "" && Number.isInteger(n) && n !== 0;
  const key = `${n}|${fromModuleId}`;
  const previewIsCurrent = preview && preview.key === key;

  const send = async (isPreview) => {
    if (!validDays) { setError(t("settings.shift.daysError")); return; }
    setBusy(true);
    setError("");
    try {
      const payload = await apiFetch(`/courses/${courseId}/shift-timeline`, {
        method: "PATCH",
        json: {
          days: n,
          ...(fromModuleId ? { fromModuleId: Number(fromModuleId) } : {}),
          preview: isPreview,
        },
      });
      if (isPreview) {
        setPreview({ key, result: payload });
      } else {
        showToast(payload?.message || t("settings.shift.done"), "success");
        setPreview(null);
        // New dates everywhere in the course (refresh marks it all out of date).
        onApplied();
      }
    } catch (err) {
      setError(err?.body?.message || t("settings.shift.failed"));
      if (isPreview) setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const result = previewIsCurrent ? preview.result : null;
  const movedModules = Array.isArray(result?.modules) ? result.modules : [];
  const movedItems = Array.isArray(result?.items) ? result.items : [];

  return (
    <Fieldset legend={<>{t("settings.shift.title")} <Explainer k="pages.shiftTimeline" variant="icon" /></>} className="space-y-3">
      {!hasStartDate ? (
        <p className="text-caption text-fg-subtle">{t("settings.shift.needStart")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
            <div>
              <Label htmlFor="shift-days">{t("settings.shift.days")}</Label>
              <TextInput id="shift-days" type="number" step="1" value={days} onChange={(e) => setDays(e.target.value)} className="w-full" />
              <p className="text-caption text-fg-subtle mt-0.5">{t("settings.shift.negative")}</p>
            </div>
            <div>
              <Label htmlFor="shift-from">{t("settings.shift.from")}</Label>
              <Select id="shift-from" value={fromModuleId} onChange={(e) => setFromModuleId(e.target.value)} className="w-full" >
                <option value="">{t("settings.shift.whole")}</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {weekLabel(m)}: {m.title}{m.startDate ? ` (${formatDate(m.startDate)})` : ""}
                  </option>
                ))}
              </Select>
              <p className="text-caption text-fg-subtle mt-0.5">{t("settings.shift.fromHelp")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => send(true)}
              disabled={busy || !validDays}
              className="text-caption font-semibold text-fg-muted bg-surface-sunken hover:bg-surface-hover disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {busy && !previewIsCurrent ? t("settings.shift.working") : t("blocks.preview")}
            </button>
            <button
              type="button"
              onClick={() => send(false)}
              disabled={busy || !previewIsCurrent}
              className="text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
              title={previewIsCurrent ? undefined : t("settings.shift.previewFirst")}
            >
              {busy && previewIsCurrent ? t("settings.shift.applying") : t("settings.shift.apply")}
            </button>
            {preview && !previewIsCurrent && <span className="text-caption text-warning-fg">{t("settings.shift.changed")}</span>}
          </div>

          {error && <p className="text-caption text-danger-fg" role="alert">{error}</p>}

          {result && (
            <div className="space-y-2 text-caption" aria-live="polite">
              {result.message && <p className="text-fg-muted font-medium">{result.message}</p>}
              {movedModules.length === 0 && movedItems.length === 0 && <p className="text-fg-subtle">{t("settings.shift.nothing")}</p>}
              {movedModules.length > 0 && (
                <div>
                  <h3 className="text-caption font-bold text-fg-subtle mb-1">{tf("settings.shift.modulesCount", { n: movedModules.length })}</h3>
                  <ul className="border border-line rounded-lg divide-y divide-line max-h-56 overflow-y-auto">
                    {movedModules.map((m) => (
                      <li key={m.moduleId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5">
                        <span className="font-medium text-fg-muted flex-1 min-w-[8rem] truncate">{m.title}</span>
                        <span className="text-fg-subtle">{formatDate(m.fromStart) || "—"}</span>
                        <ArrowRight className="w-3 h-3 text-fg-subtle" aria-label={t("settings.shift.to")} />
                        <span className="font-semibold text-brand-fg">{formatDate(m.toStart) || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {movedItems.length > 0 && (
                <div>
                  <h3 className="text-caption font-bold text-fg-subtle mb-1">{tf("settings.shift.dueCount", { n: movedItems.length })}</h3>
                  <ul className="border border-line rounded-lg divide-y divide-line max-h-56 overflow-y-auto">
                    {movedItems.map((i) => (
                      <li key={i.moduleItemId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5">
                        <span className="font-medium text-fg-muted flex-1 min-w-[8rem] truncate">{i.title}</span>
                        <span className="text-fg-subtle">{formatDate(i.fromDue) || "—"}</span>
                        <ArrowRight className="w-3 h-3 text-fg-subtle" aria-label={t("settings.shift.to")} />
                        <span className="font-semibold text-brand-fg">{formatDate(i.toDue) || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Fieldset>
  );
}

export default function CourseSettingsPage() {
  const { courseId, course, nav, refresh, isTeacher, userEmail } = useCourse();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t, tf, navLabel } = useCourseText();
  const [detailsError, setDetailsError] = useState("");
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState({ title: "", description: "", grade: "", visibility: "private" });
  const [navItems, setNavItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [coverFile, setCoverFile] = useState(null);

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title || "",
        description: course.description || "",
        grade: course.grade || "",
        visibility: course.visibility || "private",
        startDate: toDateInput(course.start_date),
        endDate: toDateInput(course.end_date),
        lengthWeeks: course.length_weeks || 4,
      });
    }
  }, [course]);

  useEffect(() => {
    setNavItems(nav.map((item) => ({ ...item })));
  }, [nav]);

  // "#course-setup" links (from the Home checklist and setup-status hrefs) open the Course setup tab.
  useEffect(() => {
    if (!isTeacher) return;
    const syncFromHash = () => {
      if (window.location.hash === "#share") setTab("share");
      if (window.location.hash === "#course-setup" || window.location.hash === "#guided-setup") {
        setTab("setup");
        requestAnimationFrame(() => document.getElementById("course-setup")?.scrollIntoView({ block: "start" }));
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [isTeacher]);

  const saveDetails = async () => {
    setDetailsError("");
    if (form.startDate && form.endDate && compareDates(form.endDate, form.startDate) < 0) {
      setDetailsError(t("settings.endBeforeStart"));
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/courses/${courseId}`, {
        method: "PATCH",
        json: {
          ...form,
          startDate: isDateString(form.startDate) ? form.startDate : null,
          endDate: isDateString(form.endDate) ? form.endDate : null,
        },
      }).catch((err) => { throw new Error(err?.body?.message || t("settings.saveFailed")); });
      if (coverFile) {
        const formData = new FormData();
        formData.append("image", coverFile);
        await apiFetch(`/courses/${courseId}/cover-image`, { method: "POST", body: formData })
          .catch((err) => { throw new Error(err?.body?.message || t("settings.bannerFailed")); });
      }
      showToast(t("settings.saved"), "success");
      refresh();
      // Title, grade and cover show on the course lists too.
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
    } catch (err) {
      setDetailsError(err.message || t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const enabled = navItems.filter((i) => i.visibleToStudents).sort((a, b) => a.position - b.position);
  const hidden = navItems.filter((i) => !i.visibleToStudents).sort((a, b) => a.position - b.position);

  const toggleVisibility = (navKey) => {
    setNavItems((prev) => prev.map((item) => (item.navKey === navKey ? { ...item, visibleToStudents: !item.visibleToStudents } : item)));
  };

  const moveWithinList = (list, navKey, direction) => {
    const idx = list.findIndex((i) => i.navKey === navKey);
    const target = idx + direction;
    if (target < 0 || target >= list.length) return;
    // The lists are shown sorted by position, so the two items swap positions (not just places).
    const reordered = [...list];
    reordered[idx] = { ...list[target], position: list[idx].position };
    reordered[target] = { ...list[idx], position: list[target].position };
    return reordered;
  };

  const moveEnabled = (navKey, direction) => {
    const reordered = moveWithinList(enabled, navKey, direction);
    if (!reordered) return;
    setNavItems((prev) => {
      const others = prev.filter((i) => !i.visibleToStudents);
      return [...reordered, ...others];
    });
  };

  const moveHidden = (navKey, direction) => {
    const reordered = moveWithinList(hidden, navKey, direction);
    if (!reordered) return;
    setNavItems((prev) => {
      const others = prev.filter((i) => i.visibleToStudents);
      return [...others, ...reordered];
    });
  };

  const saveNav = async () => {
    setSaving(true);
    const items = [...enabled, ...hidden].map((item, index) => ({
      nav_key: item.navKey,
      position: index,
      visible_to_students: item.visibleToStudents,
    }));
    try {
      await apiFetch(`/courses/${courseId}/nav`, { method: "PATCH", json: { items } });
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
    setSaving(false);
    refresh();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="settings" />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <PageHeader help="pages.settings" title={t("nav.settings")} />

        <div className="flex items-center gap-1.5 border-b border-line overflow-x-auto">
          <button onClick={() => setTab("details")} className={`text-ui font-semibold px-3 py-2 border-b-2 ${tab === "details" ? "border-brand-strong text-brand-fg" : "border-transparent text-fg-subtle"}`}>{t("settings.tabs.details")}</button>
          <button onClick={() => setTab("navigation")} className={`text-ui font-semibold px-3 py-2 border-b-2 ${tab === "navigation" ? "border-brand-strong text-brand-fg" : "border-transparent text-fg-subtle"}`}>{t("settings.tabs.navigation")}</button>
          {isTeacher && (
            <button onClick={() => setTab("setup")} className={`text-ui font-semibold px-3 py-2 border-b-2 ${tab === "setup" ? "border-brand-strong text-brand-fg" : "border-transparent text-fg-subtle"}`}>{t("settings.tabs.setup")}</button>
          )}
          {isTeacher && (
            <button onClick={() => setTab("share")} className={`text-ui font-semibold px-3 py-2 border-b-2 whitespace-nowrap ${tab === "share" ? "border-brand-strong text-brand-fg" : "border-transparent text-fg-subtle"}`}>{t("settings.tabs.share")}</button>
          )}
        </div>

        {tab === "share" && isTeacher ? (
          <ShareCourseSection courseId={courseId} />
        ) : tab === "setup" && isTeacher ? (
          <CourseSetupSection
            courseId={courseId}
            course={course}
            userEmail={userEmail}
            onCourseChanged={refresh}
          />
        ) : tab === "details" ? (
          <div className="space-y-8">
            <Section title={t("settings.dates")} description={t("settings.datesHelp")}>
            <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="course-start-date">{t("settings.startDate")}</Label>
                <TextInput id="course-start-date" type="date" value={form.startDate || ""} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full" />
              </div>
              <div>
                <Label htmlFor="course-end-date">{t("settings.endDate")}</Label>
                <TextInput id="course-end-date" type="date" value={form.endDate || ""} min={form.startDate || undefined} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} className="w-full" />
              </div>
            </div>
            <div>
              <Label htmlFor="course-length">{t("settings.duration")}</Label>
              <TextInput id="course-length" type="number" min={1} max={52} value={form.lengthWeeks} onChange={(e) => setForm((p) => ({ ...p, lengthWeeks: Number(e.target.value) }))} className="w-full" />
            </div>
            </div>
            </Section>

            <Section divided>
            <ShiftTimelinePanel
              courseId={courseId}
              startDate={toDateInput(course?.start_date)}
              onApplied={refresh}
            />
            </Section>

            <Section divided title={t("settings.about")}>
            <div className="space-y-3">
            <div>
              <Label htmlFor="course-grade">{t("settings.grade")}</Label>
              <GradeSelect id="course-grade" value={form.grade || ""} onChange={(grade) => setForm((p) => ({ ...p, grade }))} />
            </div>
            <div>
              <Label htmlFor="course-description">{t("common.description")}</Label>
              <Textarea id="course-description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={4} className="w-full" />
            </div>
            <div>
              <p className="text-caption font-semibold text-fg-muted mb-1">{t("settings.banner")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <FileButton id="course-banner" accept="image/*" onFiles={([f]) => setCoverFile(f)} aria-label={t("settings.banner")}>
                  <ImageUp className="w-3.5 h-3.5" aria-hidden="true" /> {coverFile ? t("settings.bannerChange") : t("settings.bannerChoose")}
                </FileButton>
                {coverFile ? <span className="text-caption text-fg-muted truncate max-w-[16rem]">{coverFile.name}</span> : null}
              </div>
            </div>
            <div>
              <Label htmlFor="course-visibility">{t("settings.visibility")}</Label>
              <Select id="course-visibility" value={form.visibility} onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.value }))} className="w-full" >
                <option value="private">{t("settings.private")}</option>
                <option value="public">{t("settings.public")}</option>
              </Select>
              <p className="text-caption text-fg-subtle mt-1">
                {t("settings.publicHelp")}
              </p>
            </div>
            </div>
            </Section>
            {detailsError && <p className="text-caption text-danger-fg" role="alert">{detailsError}</p>}
            <button onClick={saveDetails} disabled={saving} className="text-caption font-semibold text-on-brand-strong bg-brand-strong rounded-lg px-4 py-2 disabled:opacity-50">
              {saving ? t("common.saving") : t("editors.saveChanges")}
            </button>
            {isTeacher ? <CourseStatusSection courseId={courseId} course={course} refresh={refresh} /> : null}
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-caption text-fg-subtle">{t("settings.navHelp")}</p>

            <Section title={t("settings.enabled")}>
              <ul aria-label={t("settings.enabledItems")} className="border border-line rounded-xl divide-y divide-line">
                {enabled.map((item, idx) => (
                  <li key={item.navKey} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-ui text-fg-muted">{navLabel(item.navKey, item.label)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveEnabled(item.navKey, -1)} disabled={idx === 0} aria-label={tf("settings.moveUp", { name: navLabel(item.navKey, item.label) })} className="p-1 rounded hover:bg-surface-hover disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => moveEnabled(item.navKey, 1)} disabled={idx === enabled.length - 1} aria-label={tf("settings.moveDown", { name: navLabel(item.navKey, item.label) })} className="p-1 rounded hover:bg-surface-hover disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => toggleVisibility(item.navKey)} className="p-1 rounded hover:bg-surface-hover text-fg-subtle" title={t("settings.hide")} aria-label={tf("settings.hideNamed", { name: navLabel(item.navKey, item.label) })}><Eye className="w-3.5 h-3.5 text-success-fg" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={t("nav.hiddenFromStudents")}>
              <ul aria-label={t("settings.hiddenItems")} className="border border-line rounded-xl divide-y divide-line">
                {hidden.map((item, idx) => (
                  <li key={item.navKey} className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-sunken">
                    <span className="text-ui text-fg-subtle">{navLabel(item.navKey, item.label)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveHidden(item.navKey, -1)} disabled={idx === 0} aria-label={tf("settings.moveUp", { name: navLabel(item.navKey, item.label) })} className="p-1 rounded hover:bg-surface disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => moveHidden(item.navKey, 1)} disabled={idx === hidden.length - 1} aria-label={tf("settings.moveDown", { name: navLabel(item.navKey, item.label) })} className="p-1 rounded hover:bg-surface disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => toggleVisibility(item.navKey)} className="p-1 rounded hover:bg-surface text-fg-subtle" title={t("settings.show")} aria-label={tf("settings.showNamed", { name: navLabel(item.navKey, item.label) })}><EyeOff className="w-3.5 h-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            <button onClick={saveNav} disabled={saving} className="text-caption font-semibold text-on-brand-strong bg-brand-strong rounded-lg px-4 py-2 disabled:opacity-50">
              {saving ? t("common.saving") : t("settings.saveNav")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
