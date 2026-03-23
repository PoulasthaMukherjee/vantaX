import admin from 'firebase-admin';

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!admin.apps.length) {
  admin.initializeApp({
    // In development (no service account), Firebase Admin can verify tokens
    // using just the project ID via the public JWKS endpoint.
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

export const firebaseAdmin = admin;
export const adminAuth = admin.auth();
