# Backing up and replacing a school box

## What a backup contains
`npm run backup` (or the nightly `soma-x-backup` pm2 job) writes one folder,
`somabox-backup-<time>/`, containing:

| File | What it holds |
|---|---|
| `db.dump` | the whole PostgreSQL database (`pg_dump` custom format): users, courses, grades, results, AI drafts, the sync outbox, settings, including the box id |
| `files.tar.gz` | what people uploaded: `local-content/course-files`, `course-covers`, `custom-content`, `library` |
| `manifest.json` | when the backup was made, the box id, the migrations applied, row counts and checksums |

Shipped content (Khan Academy, W3Schools, Wikipedia, Rwandan education packs) is **not** included.
It comes with the box image and is reinstalled with it.

## Nightly backups
- The pm2 config (`ecosystem.config.cjs`) runs `soma-x-backup` at 02:30 every night and keeps the
  newest 14 backups. pm2 also runs it once when it starts.
- **Set `BACKUP_DIR`** in `soma-x-backend/.env` to a disk other than the one the database lives on,
  ideally a USB drive that can be taken away. Otherwise a failed disk loses the database and its
  backups together.
- Check that backups are being made: `pm2 logs soma-x-backup`, or list `$BACKUP_DIR`.
- Check that a backup is intact: `npm run backup:verify --workspace=soma-x-backend -- --from <folder>`.

Manual backup, for example before an update:
```bash
npm run backup -- --out /media/usb/somabox-backups --keep 14
```

## Replacing a broken box
1. Install the new box from the standard image: PostgreSQL, the repo, shipped content and
   `.env`. Use the same `.env` as the old box if you have it; it holds the database settings and
   the sync key path.
2. Create an **empty** database (for example `createdb somabox_lms`). Don't start the server
   yet, because starting it would create tables.
3. Restore the most recent backup:
   ```bash
   cd soma-x-backend
   npm run restore -- --from /media/usb/somabox-backups/somabox-backup-<time>
   ```
   The restore:
   - checks the checksums first and refuses a damaged backup
   - refuses a database that isn't empty
   - puts the uploaded files back
   - checks that every counted table has the same number of rows as when the backup was made
4. Start the services (`npm run pm2:start` from the repo root). The server applies any migrations
   newer than the backup when it starts.
5. **The replacement keeps the old box's id**, so the cloud sees one box continuing. Changes that
   were waiting to sync when the backup was made are sent again. The cloud ignores duplicates,
   because every record has its own sync id.
6. Learners and teachers sign in again: sessions are kept, but people usually need a new login on
   new hardware anyway.

**Anything done after the last backup is lost.** That is at most one day with nightly backups.
Before an update or other risky work, make a manual backup.

## Copying a box (a second school, a training box)
Restore as above, but add `--new-box-id`, so the cloud treats the copy as a different box. Then
remove or replace the learners: a copy holds real learners' data.

## Restoring into a database that already has data
`--force` overwrites it. Only use it when you are sure. Make a backup of the current state first.
