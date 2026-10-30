"use client"
import { useLanguage } from "@/context/LanguageContext";
import FileManager from "@/components/manage/fileManager/MainFileManager";
import ManageTitle from "@/components/manage/ManageTitle";

const ManageContent = () => {
    const { t } = useLanguage();
    return (
        <div className="min-h-screen pb-24 md:pb-8">
            <div className="px-4 md:px-4">
                <ManageTitle
                    title={t("admin.manageContent.title")}
                    description={t("admin.manageContent.description")}
                />
            </div>
            <FileManager />
        </div>
    );
}
 
export default ManageContent;