import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAEm383COVanWy4fr630zCVfl4H8oSvr_M',
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    'lettre-de-voiture-ntransports.firebaseapp.com',
  projectId:
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'lettre-de-voiture-ntransports',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    'lettre-de-voiture-ntransports.appspot.com',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '195528971208',
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ??
    '1:195528971208:android:17965a8fd43a528de8a6fd',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let firestore: Firestore;

try {
  firestore = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
  });
} catch {
  firestore = getFirestore(app);
}

export const db = firestore;
