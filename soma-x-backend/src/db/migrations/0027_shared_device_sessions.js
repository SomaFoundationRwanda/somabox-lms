// A session started with "This is a shared device" ends sooner (see helpers/auth.js).
export async function up(client) {
    await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shared_device INTEGER NOT NULL DEFAULT 0`);
}
