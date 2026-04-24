import { GoogleMap, LoadScript, Marker } from "@react-google-maps/api";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

const containerStyle = {
  width: "100%",
  height: "100vh"
};

const center = {
  lat: 28.6139,
  lng: 77.2090
};

function MapComponent() {
  const [incidents, setIncidents] = useState([]);

  // REAL-TIME LISTENER
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "incidents"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setIncidents(data);
    });

    return () => unsubscribe();
  }, []);

  return (
    <LoadScript googleMapsApiKey="AIzaSyDHY9Jn_bwWnHZdn5f_fGjy9J9AKDqupPk">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={10}
      >
        {/* MARKERS */}
        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            position={{
              lat: incident.location.lat,
              lng: incident.location.lng
            }}
          />
        ))}
      </GoogleMap>
    </LoadScript>
  );
}

export default MapComponent;