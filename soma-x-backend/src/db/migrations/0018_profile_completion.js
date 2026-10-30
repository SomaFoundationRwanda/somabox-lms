// The profile step collects the demographics the school reports on (gender, province, district,
// rural/urban, disability, grade). The old column defaults ("prefer not to say", "Not Specified",
// urban, no disability) can't be told apart from real answers, so completion is now recorded
// explicitly. Existing accounts are asked once to confirm their details (pre-filled where known);
// admins aren't asked.
export async function up(client) {
    await client.query(`ALTER TABLE users ADD COLUMN profile_completed_at TIMESTAMP WITH TIME ZONE`);
}
