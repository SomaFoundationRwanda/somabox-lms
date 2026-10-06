import { serverDb } from '../../helpers/db-manager.js';
import { config } from '../../config/index.js';

const DEFAULT_THUMBNAIL = config.defaults.thumbnail;

let mainCategoriesCache = [];
let summaryDataCache = {};

async function hydrateCaches() {
    mainCategoriesCache = [];
    summaryDataCache = {};
    
    // main categories (top-level)
    mainCategoriesCache = await serverDb.prepare(`
        SELECT id, title, subtitle, path_key, parent_id, is_disabled
        FROM categories
        WHERE is_main = 1 AND is_disabled = 0
    `).all();

    // all categories
    const allCategories = await serverDb.prepare(`
        SELECT id, title, subtitle, path_key, parent_id, is_disabled
        FROM categories
    `).all();

    // all content items
    const allContent = await serverDb.prepare(`
        SELECT id, category_id, title, subtitle, type, url, path_key, size, duration, pages
        FROM content_items
    `).all();
    
    mainCategoriesCache = mainCategoriesCache.map(cat => {
        const slug = cat.path_key;
        const items = allCategories.filter(c => c.parent_id === cat.id);
        return { ...cat, slug, items };
    });

    mainCategoriesCache = mainCategoriesCache.map(cat => {
        const slug = cat.path_key;
        const items = allCategories
            .filter(c => c.parent_id === cat.id)
            .map(item => ({
                title: item.title,
                slug: item.path_key.split('/')[1],
            }));
        return { ...cat, slug, items };
    });

    const categoryMap = Object.fromEntries(allCategories.map(c => [c.id, c]));

    const contentMap = allContent.reduce((acc, item) => {
        if (!acc[item.category_id]) acc[item.category_id] = [];
        acc[item.category_id].push({
            id: item.id,
            slug: item.path_key,
            title: item.title,
            type: item.type,
            thumbnail: DEFAULT_THUMBNAIL,
            url: `/${item.path_key}`,
            description: item.subtitle || `Description for ${item.title}`,
            duration: item.duration ? `${item.duration} min` : undefined,
            pages: item.pages || undefined
        });
        return acc;
    }, {});

    function buildCategoryJSON(catId) {
        const cat = categoryMap[catId];
        if (!cat) return null;
        const children = allCategories.filter(c => c.parent_id === catId);
        let contentItems = contentMap[catId] || [];
        const navItems = [];

        children.forEach(child => {
            const childContent = contentMap[child.id] || [];
            const isTypeFolder = ['video', 'book', 'audio'].includes(child.title.toLowerCase());

            if (childContent.length && isTypeFolder) {
                contentItems = contentItems.concat(
                    childContent.map(item => ({ ...item }))
                );
            } else {
                navItems.push({
                    title: child.path_key.split('/').pop(),
                    slug: child.path_key,
                    image: DEFAULT_THUMBNAIL,
                    colorClass: "bg-gray-400"
                });
            }
        });

        return {
            slug: cat.path_key,
            title: cat.title,
            subtitle: cat.subtitle || "",
            isContentLevel: contentItems.length > 0,
            content: contentItems,
            items: navItems
        };
    }

    summaryDataCache = Object.fromEntries(
        allCategories.map(cat => [cat.path_key, buildCategoryJSON(cat.id)])
    );
}

export { mainCategoriesCache, summaryDataCache, hydrateCaches };