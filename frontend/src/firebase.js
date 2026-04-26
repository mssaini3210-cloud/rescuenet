// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA3-oaMdOhlD4VCUHjIB8LMzksvl8V8e8s",
    authDomain: "rescuenet-c5e08.firebaseapp.com",
    projectId: "rescuenet-c5e08",
    storageBucket: "rescuenet-c5e08.firebasestorage.app",
    messagingSenderId: "1081804714755",
    appId: "1:1081804714755:web:df6410a7dd399c8d8eef36"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);