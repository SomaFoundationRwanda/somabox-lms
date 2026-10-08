"use client"
import ManageTitle from "@/components/manage/ManageTitle";
import { useLanguage } from "@/context/LanguageContext";

const ManageContent = () => {
    const { t } = useLanguage();
    return (
        <div className="min-h-screen pb-24 md:pb-8">
            <div className="px-4 md:px-4">
                <ManageTitle title={t("admin.manageContent.title")} />
            </div>
        </div>
    );
}

export default ManageContent;
