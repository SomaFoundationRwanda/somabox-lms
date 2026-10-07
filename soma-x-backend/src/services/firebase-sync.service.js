import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { serverDb } from '../helpers/db-manager.js';

let db;

function initFirebase() {
    if (admin.apps.length > 0) {
        db = admin.firestore();
        return;
    }
    // The service account key must live outside the repository (see README).
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        console.warn('Firebase Sync: FIREBASE_SERVICE_ACCOUNT_PATH is not set; skipping cloud sync.');
        return;
    }
    const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (!fs.existsSync(serviceAccountPath)) {
        console.error(`Firebase Sync: Service account file not found at ${serviceAccountPath}`);
        return;
    }
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
}

export async function runFirebaseSync() {
    try {
        initFirebase();
        if (!db) return;

        console.log('--- Syncing Staff (users) ---');
        const users = await serverDb.prepare('SELECT id, email, role, created_at FROM users').all();
        for (const user of users) {
            const docId = `staff_${user.id}_${user.email.replace(/[^a-zA-Z0-9]/g, '_')}`;
            await db.collection(process.env.FIRESTORE_STAFF_COLLECTION || 'staff').doc(docId).set({
                localId: user.id,
                email: user.email,
                role: user.role,
                createdAt: user.created_at,
                syncedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        try {
            console.log('--- Syncing Students (portal_users) ---');
            const students = await serverDb.prepare('SELECT id, full_name, contact, school_name, login_code, avatar_url, created_at FROM portal_users').all();
            for (const student of students) {
                const docId = `student_${student.login_code}`;
                await db.collection(process.env.FIRESTORE_STUDENTS_COLLECTION || 'students').doc(docId).set({
                    localId: student.id,
                    fullName: student.full_name,
                    contact: student.contact,
                    schoolName: student.school_name,
                    loginCode: student.login_code,
                    avatarUrl: student.avatar_url,
                    createdAt: student.created_at,
                    syncedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        } catch (err) {
            // ignore if portal_users table doesn't exist
        }

        console.log('Firebase Sync process completed successfully.');
    } catch (error) {
        console.error('Firebase Sync failed:', error.message);
    }
}
