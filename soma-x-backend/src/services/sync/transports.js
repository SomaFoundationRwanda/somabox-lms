// Where sync records go. Chosen by SYNC_TRANSPORT (http | firestore | none); without it, an
// HTTP endpoint (SYNC_URL) is used if set, else Firestore if a service account is configured,
// else nothing (records wait in the outbox until a transport is configured).
// Every transport must be idempotent per record syncId: a batch may be sent twice.
import fs from "fs";
import path from "path";

export function createTransport(env = process.env) {
  const kind = env.SYNC_TRANSPORT || (env.SYNC_URL ? "http" : env.FIREBASE_SERVICE_ACCOUNT_PATH ? "firestore" : "none");
  if (kind === "http" && env.SYNC_URL) return httpTransport(env.SYNC_URL, env.SYNC_TOKEN);
  if (kind === "firestore" && env.FIREBASE_SERVICE_ACCOUNT_PATH) return firestoreTransport(env);
  return null;
}

/**
 * POST { boxId, device, history, records } as JSON; any 2xx is success. `device` is the box's
 * hardware identity (serial, MACs, machine id) and `history` its recent sync runs; a run with
 * nothing new still sends them (records: []) so the cloud knows the box is alive.
 */
export function httpTransport(url, token) {
  const post = async (body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(process.env.SYNC_TIMEOUT_MS) || 60000),
    });
    if (!res.ok) throw new Error(`Cloud answered ${res.status}`);
  };
  return {
    name: "http",
    send: (records, { boxId, device, history }) => post({ boxId, device, history, records }),
    status: ({ boxId, device, history }) => post({ boxId, device, history, records: [] }),
  };
}

let firestore = null;
async function firestoreDb(env) {
  if (firestore) return firestore;
  const { default: admin } = await import("firebase-admin");
  if (!admin.apps.length) {
    // The service account key must live outside the repository (see README).
    const keyPath = path.resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (!fs.existsSync(keyPath)) throw new Error(`Firebase service account file not found at ${keyPath}`);
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, "utf8"))) });
  }
  firestore = admin.firestore();
  return firestore;
}

/** One document per record (id = syncId) in FIRESTORE_SYNC_COLLECTION (default sync_records). */
export function firestoreTransport(env) {
  return {
    name: "firestore",
    async send(records) {
      const db = await firestoreDb(env);
      const collection = db.collection(env.FIRESTORE_SYNC_COLLECTION || "sync_records");
      for (let i = 0; i < records.length; i += 400) {
        const batch = db.batch();
        for (const record of records.slice(i, i + 400)) batch.set(collection.doc(record.syncId), record);
        await batch.commit();
      }
    },
    // One document per box (id = boxId) with its hardware identity and recent sync runs.
    async status({ boxId, device, history }) {
      const db = await firestoreDb(env);
      await db.collection(env.FIRESTORE_BOX_COLLECTION || "boxes").doc(boxId).set({ boxId, device, history, lastSeenAt: new Date().toISOString() }, { merge: true });
    },
  };
}
