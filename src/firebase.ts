import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAEm383COVanWy4fr630zCVfl4H8oSvr_M",
  authDomain: "lettre-de-voiture-ntransports.firebaseapp.com",
  projectId: "lettre-de-voiture-ntransports",
  storageBucket: "lettre-de-voiture-ntransports.appspot.com",
  messagingSenderId: "195528971208",
  appId: "1:195528971208:android:17965a8fd43a528de8a6fd"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const db = firebase.firestore();
