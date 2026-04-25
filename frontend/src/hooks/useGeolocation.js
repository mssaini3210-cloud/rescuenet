import { useState, useEffect } from 'react';

const center = { lat: 28.6139, lng: 77.2090 };

export function useGeolocation() {
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          console.warn("Failed automatic location fetch", err);
          setUserLocation(center); // fallback
        }
      );
    } else {
      setUserLocation(center);
    }
  }, []);

  return userLocation;
}
