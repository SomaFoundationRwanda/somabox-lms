// System notifications keep their English text and also a text key with its values, so the
// notification bell can show them in the reader's language.
export async function up(client) {
    await client.query(`ALTER TABLE user_notifications ADD COLUMN text_key TEXT, ADD COLUMN text_params JSONB`);
}
