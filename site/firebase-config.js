/**
 * Firebase configuration for cross-device progress sync.
 *
 * Setup steps:
 *   1. Go to https://console.firebase.google.com
 *   2. Create a project (or use an existing one)
 *   3. Add a Web app — copy the firebaseConfig values below
 *   4. Authentication → Sign-in method → enable "Google"
 *   5. Firestore Database → Create database (production mode)
 *   6. Firestore → Rules → paste and publish:
 *
 *        rules_version = '2';
 *        service cloud.firestore {
 *          match /databases/{database}/documents {
 *            match /users/{uid}/progress/{doc} {
 *              allow read, write: if request.auth != null && request.auth.uid == uid;
 *            }
 *          }
 *        }
 *
 *   7. Fill in your values below and save.
 *
 * This file is .gitignored — never commit real credentials.
 */

window.AIFS_FIREBASE_CONFIG = {
  apiKey: "AIzaSyC060NiXtGoiygJ3YEUfFg0DsWuRPLNwZg",
  authDomain: "ai-engineering-from-scratch.firebaseapp.com",
  projectId: "ai-engineering-from-scratch",
  storageBucket: "ai-engineering-from-scratch.firebasestorage.app",
  messagingSenderId: "1:368044769917:web:289bba75ee2f76a67ba714",
  appId: "YOUR_APP_ID",
  measurementId: "G-CXF75L5L1X",
};
