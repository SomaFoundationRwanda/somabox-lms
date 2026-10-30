import { redirect } from "next/navigation";

// Branding (logo and colours) is part of the School page now. Cloud sync settings live on the
// Sync page.
export default function BrandingRedirect() {
    redirect("/manage/admin/school");
}
