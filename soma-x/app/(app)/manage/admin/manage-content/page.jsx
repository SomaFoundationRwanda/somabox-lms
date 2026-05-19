import FileManager from "@/components/manage/fileManager/MainFileManager";
import ManageTitle from "@/components/manage/ManageTitle";

const ManageContent = () => {
    return (
        <div className="min-h-screen pb-24 md:pb-8">
            <ManageTitle title="Manage content" />
            <FileManager />
        </div>
    );
}
 
export default ManageContent;