// Which files on the box came from the cloud catalogue (soma-x-server): the catalogue id, hash and
// version each was downloaded at. Lets the box tell when the cloud has a newer copy, and lets
// content usage events name the catalogue item so the cloud can report on it.
export async function up(client) {
    await client.query(`
        CREATE TABLE cloud_content (
            path_key TEXT PRIMARY KEY,
            collection TEXT NOT NULL CHECK (collection IN ('curriculum', 'library')),
            cloud_id BIGINT NOT NULL,
            sha256 TEXT,
            version INTEGER,
            downloaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`CREATE INDEX cloud_content_cloud_id_idx ON cloud_content (collection, cloud_id)`);
}
