import FileManager from "@/components/manage/fileManager/MainFileManager";
import ManageTitle from "@/components/manage/ManageTitle";

const ManageContent = () => {
    return (
        <div className="min-h-screen pb-24 md:pb-8">
            <div className="px-4 md:px-4">
                <ManageTitle
                    title="Manage content"
                    description="Browse, upload and organise the files learners can open on this device."
                />
            </div>
            <FileManager />
        </div>
    );
}
 
export default ManageContent;