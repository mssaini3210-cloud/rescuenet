import { collection, addDoc, onSnapshot } from "firebase/firestore";
import { db } from "./db.js";

export async function addIncident(data) {
  await addDoc(collection(db, "incidents"), {
    ...data,
    timestamp: new Date(),
    status: "active",
  });
}

export function listenToIncidents(callback) {
  return onSnapshot(collection(db, "incidents"), (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    callback(data);
  });
}