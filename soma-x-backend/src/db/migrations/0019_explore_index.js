// Explore: the files on disk are the source of truth; categories/content_items are an index of
// them plus what people decided (titles, hidden items). An edited title must survive rescans, so
// it's marked. The indexer (services/explore/indexer.js) rebuilds the rest from disk, including
// fixing the old mix of path formats ("nursery-school-content" vs "rwandan-education/...").
export async function up(client) {
    await client.query(`ALTER TABLE categories ADD COLUMN title_locked BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE content_items ADD COLUMN title_locked BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE content_items ADD COLUMN indexed_at TIMESTAMP WITH TIME ZONE`);
}
