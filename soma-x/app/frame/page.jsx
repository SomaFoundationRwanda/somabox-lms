export async function generateMetadata({ searchParams }) {
    const {slug} = await searchParams
    
        if (slug) {
        const pageTitle = slug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        return {
            title: `${pageTitle} - SomaBox`,
        };
        }
    
        return { title: "SomaBox" };
    }
    
export default async function Frame({ searchParams }) {
    const {slug} = await searchParams

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL

    if (!slug) {
    return <div>Missing slug</div>;
    }

        const iframeUrl = slug==="kolibri" ? "http://10.0.0.1:8081/"
		: slug === "wikipedia" ? "http://10.0.0.1:8083/"
		: `${SERVER_URL}/${slug}`;

    return (
        <iframe
            src={iframeUrl}
            className="w-full h-screen"
            title={`SomaBox Frame - ${slug}`}
            style={{ border: "none" }}
        />
    );
}
