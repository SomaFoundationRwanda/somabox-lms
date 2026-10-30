// Everyone answers their gender: male, female or other. There's no "prefer not to say" and no
// default any more; people who had one (or no answer) are asked at their next visit. The old
// "non_binary" option of the admin form is "other".
export async function up(client) {
    await client.query(`ALTER TABLE users ALTER COLUMN gender DROP DEFAULT`);
    await client.query(`UPDATE users SET gender = 'other' WHERE gender = 'non_binary'`);
    await client.query(`UPDATE users SET gender = NULL WHERE gender IS NOT NULL AND gender NOT IN ('male', 'female', 'other')`);
}
