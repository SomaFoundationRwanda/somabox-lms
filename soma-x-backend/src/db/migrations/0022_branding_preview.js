// The school's own look (logo replaces the SOMABOX logo; colours), visitor previews (people who
// haven't signed up can try a few items for a short time), and a record of whether the admin has
// set the school up yet (so the default "SOMABOX Partner School" isn't taken for a real name).
export async function up(client) {
    await client.query(`
        ALTER TABLE unit_branding
            ADD COLUMN logo_file TEXT,
            ADD COLUMN configured_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN guest_preview_enabled BOOLEAN NOT NULL DEFAULT true,
            ADD COLUMN guest_preview_seconds INTEGER NOT NULL DEFAULT 40 CHECK (guest_preview_seconds BETWEEN 10 AND 600),
            ADD COLUMN guest_preview_items INTEGER NOT NULL DEFAULT 5 CHECK (guest_preview_items BETWEEN 1 AND 50)
    `);
    // A school that already has a name other than the default counts as set up.
    await client.query(`UPDATE unit_branding SET configured_at = CURRENT_TIMESTAMP WHERE school_name IS NOT NULL AND school_name <> 'SOMABOX Partner School'`);
    await client.query(`
        CREATE TABLE guest_previews (
            id SERIAL PRIMARY KEY,
            guest_id TEXT NOT NULL,
            path_key TEXT NOT NULL,
            started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (guest_id, path_key)
        )
    `);
    await client.query(`CREATE INDEX guest_previews_started_idx ON guest_previews (started_at)`);
}
