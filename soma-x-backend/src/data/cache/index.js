import { serverDb } from '../../helpers/db-manager.js';
import { config } from '../../config/index.js';

const DEFAULT_THUMBNAIL = config.defaults.thumbnail;

let mainCategoriesCache = [];
let summaryDataCache = {};

async function hydrateCaches() {
    mainCategoriesCache = [];
    summaryDataCache = {};
    // main categories (top-level)
    mainCategoriesCache = serverDb.prepare(`
        SELECT id, title, subtitle, path_key, parent_id, is_disabled
        FROM categories
        WHERE is_main = 1 AND is_disabled = 0
    `).all();

    // all categories
    const allCategories = serverDb.prepare(`
        SELECT id, title, subtitle, path_key, parent_id, is_disabled
        FROM categories
    `).all();

    // all content items
    const allContent = serverDb.prepare(`
        SELECT id, category_id, title, subtitle, type, url, path_key, size, duration, pages
        FROM content_items
    `).all();
    
    // // map categories by id, and add slug and items
    mainCategoriesCache = mainCategoriesCache.map(cat => {
        const slug = cat.path_key;
        const items = allCategories.filter(c => c.parent_id === cat.id); // This gets the child categories
        return { ...cat, slug, items };
    })
    console.log(mainCategoriesCache)
    mainCategoriesCache = mainCategoriesCache.map(cat => {
        const slug = cat.path_key;
        const items = allCategories
            .filter(c => c.parent_id === cat.id) // Only enabled items
            .map(item => ({
                title: item.title,
                slug: item.path_key.split('/')[1], // Extract just the slug part
                // No image, colorClass etc - just title and slug as you wanted
            }));
        // console.log("thissss", t)
        return { ...cat, slug, items };
    })
    const categoryMap = Object.fromEntries(allCategories.map(c => [c.id, c]));

    // map content by category_id
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

    // generate summary data recursively
    function buildCategoryJSON(catId) {
    const cat = categoryMap[catId];
    const children = allCategories.filter(c => c.parent_id === catId);
    let contentItems = contentMap[catId] || [];
    const navItems = [];

    children.forEach(child => {
        const childContent = contentMap[child.id] || [];
        console.log("children",children)
        const isTypeFolder = ['video', 'book', 'audio'].includes(child.title.toLowerCase());

        if (childContent.length && isTypeFolder) {
            // flatten type folder content into parent
            contentItems = contentItems.concat(
                childContent.map(item => ({ ...item }))
            );
        } else {
            // keep as navigation
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
    console.log(allCategories)
    summaryDataCache = Object.fromEntries(
        allCategories.map(cat => [cat.path_key, buildCategoryJSON(cat.id)])
    );
}

export { mainCategoriesCache, summaryDataCache, hydrateCaches };