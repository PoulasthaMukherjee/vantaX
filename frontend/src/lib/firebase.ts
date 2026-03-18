/**
 * Firebase configuration and initialization.
 */

import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

const isE2ETestMode =
  import.meta.env.VITE_E2E_TEST_MODE === 'true' || import.meta.env.VITE_AUTH_MODE === 'mock';

// Firebase config from environment
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let authInstance: ReturnType<typeof getAuth> | null = null;
if (!isE2ETestMode) {
  const app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);

  const emulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost) {
    connectAuthEmulator(authInstance, emulatorHost, { disableWarnings: true });
  }
}

export const auth = authInstance as unknown as ReturnType<typeof getAuth>;

// Auth providers
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

/**
 * Sign in with Google popup.
 */
export async function signInWithGoogle(): Promise<User> {
  if (!authInstance) {
    throw new Error('Firebase auth is disabled');
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Sign in with GitHub popup.
 */
export async function signInWithGitHub(): Promise<User> {
  if (!authInstance) {
    throw new Error('Firebase auth is disabled');
  }
  const result = await signInWithPopup(auth, githubProvider);
  return result.user;
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  if (!authInstance) {
    window.localStorage.clear();
    return;
  }
  await firebaseSignOut(auth);
}

/**
 * Subscribe to auth state changes.
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!authInstance) {
    queueMicrotask(() => callback(null));
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/**
 * Get the current user's ID token.
 */
export async function getIdToken(): Promise<string | null> {
  if (!authInstance) return null;
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
