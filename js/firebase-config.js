// Firebase init. SDK modulare via CDN: nessun build step.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// === INCOLLA QUI LA CONFIG DEL TUO PROGETTO ===
// console.firebase.google.com -> Impostazioni progetto -> Le tue app -> Web (</>)
// Crea anche un Realtime Database (non Firestore) in modalita test.
export const firebaseConfig = {
  apiKey: "AIzaSyCgqQIznFfsEfRaQJ-QrvefyOJV3WO2V5Y",
  authDomain: "chrome-racer-4b00f.firebaseapp.com",
  databaseURL: "https://chrome-racer-4b00f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "chrome-racer-4b00f",
  storageBucket: "chrome-racer-4b00f.firebasestorage.app",
  messagingSenderId: "1060036170138",
  appId: "1:1060036170138:web:1fc5299e1f3526895b6a23",
  measurementId: "G-BZ3Q86HXZX",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// Auth anonima: nessun login per l'utente, ma le regole del DB possono
// richiedere auth != null per evitare scritture anonime random sul DB pubblico.
export const auth = getAuth(app);
export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => { if (user) resolve(user); });
  signInAnonymously(auth).catch((e) => console.error("Auth anonima fallita:", e));
});
