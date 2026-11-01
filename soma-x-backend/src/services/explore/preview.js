// Visitors used to get short, counted previews of Explore and Library items. Everyone can open them
// now (visitors are reminded to sign up), so only the old preview records are left to clear.
import { localDb } from "../../helpers/db-manager.js";

/** Old preview records (from before previews were dropped), removed after a week. */
export async function purgeOldPreviews() {
  await localDb.prepare("DELETE FROM guest_previews WHERE started_at < NOW() - INTERVAL '7 days'").run();
}
