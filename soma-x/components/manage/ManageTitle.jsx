"use client"
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { useLanguage } from "@/context/LanguageContext";

// Admin sub-page header: a back link to the admin home plus the shared PageHeader.
// The notification bell and avatar live in the app shell header, so they are not repeated here.
const ManageTitle = ({ title, description, actions, meta }) => {
    const { t } = useLanguage();
    return (
        <div className="pt-4 mb-6 space-y-3">
            <Link
                href="/manage/admin"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
                <ArrowLeft className="w-3.5 h-3.5" /> {t("admin.common.backToAdmin")}
            </Link>
            <PageHeader title={title} description={description} actions={actions} meta={meta} />
        </div>
    );
}

export default ManageTitle;
