import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { darkMapStyle } from '../utils';

const containerStyle = { width: '100%', height: '100vh' };

const FACILITY_TYPES = [
  { type: 'hospital', label: 'Hospital', icon: '🏥', color: '#ef5350', etaSpeed: 40 },
  { type: 'police', label: 'Police Station', icon: '🚓', color: '#42a5f5', etaSpeed: 60 },
  { type: 'fire_station', label: 'Fire Station', icon: '🚒', color: '#ff7043', etaSpeed: 55 },
];

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DispatchMapView() {
  const { incidentId } = useParams();
  const navigate = useNavigate();

  const [incident, setIncident] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [mapRef, setMapRef] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load incident from Firestore
  useEffect(() => {
    const fetchIncident = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'incidents', incidentId));
        if (docSnap.exists()) {
          setIncident({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (e) {
        console.error('Failed to fetch incident', e);
      }
    };
    fetchIncident();
  }, [incidentId]);

  // Fetch nearby facilities using Google Places API once we have the incident location
  const fetchFacilities = useCallback((map, incidentLoc) => {
    if (!map || !incidentLoc || !window.google) return;
    if (!window.google.maps.places) {
      console.error('Google Places library not loaded');
      setIsLoading(false);
      return;
    }

    const service = new window.google.maps.places.PlacesService(map);
    let completedSearches = 0;
    const allFacilities = [];

    FACILITY_TYPES.forEach(({ type, label, icon, etaSpeed, color }) => {
      service.nearbySearch({
        location: new window.google.maps.LatLng(incidentLoc.lat, incidentLoc.lng),
        radius: 10000, // 10km radius — much more reliable than RankBy.DISTANCE
        type: type,
      }, (results, status) => {
        completedSearches++;
        console.log(`Places search [${type}]: status=${status}, results=${results?.length}`);

        if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          // Sort by distance from incident and take the closest 2
          const sorted = results
            .map(place => {
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              const distKm = haversineKm(incidentLoc.lat, incidentLoc.lng, lat, lng);
              const etaMins = Math.max(1, Math.round((distKm / etaSpeed) * 60));
              return { id: place.place_id, name: place.name, lat, lng, distKm: distKm.toFixed(1), etaMins, label, icon, color, type };
            })
            .sort((a, b) => parseFloat(a.distKm) - parseFloat(b.distKm))
            .slice(0, 2);

          allFacilities.push(...sorted);
        }

        // Only update state once all 3 searches finish
        if (completedSearches === FACILITY_TYPES.length) {
          setFacilities([...allFacilities]);
          setIsLoading(false);
        }
      });
    });
  }, []);

  const onMapLoad = useCallback((map) => {
    setMapRef(map);
  }, []);

  useEffect(() => {
    if (mapRef && incident?.location) {
      fetchFacilities(mapRef, incident.location);
    }
  }, [mapRef, incident, fetchFacilities]);

  const incidentLoc = incident?.location;

  const getConfidenceColor = (score) => {
    if (score >= 85) return '#4caf50';
    if (score >= 60) return '#ff9800';
    return '#f44336';
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', fontFamily: 'Inter, sans-serif' }}>
      {/* Back Button */}
      <button
        onClick={() => navigate('/authority')}
        style={{
          position: 'absolute', top: '80px', left: '20px', zIndex: 1000,
          background: 'rgba(10,10,10,0.9)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
          padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600,
          backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: '8px',
        }}
      >
        ← Back to Command
      </button>

      {/* Header Panel */}
      {incident && (
        <div style={{
          position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
          padding: '14px 24px', color: '#fff', textAlign: 'center', minWidth: '350px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>
            Dispatch Map — {incident.type} Incident
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>{incident.address || 'GPS Location'}</div>
          {incident.aiConfidence && (
            <div style={{
              display: 'inline-block', marginTop: '8px', padding: '4px 12px', borderRadius: '20px',
              background: getConfidenceColor(incident.aiConfidence) + '22',
              border: `1px solid ${getConfidenceColor(incident.aiConfidence)}`,
              color: getConfidenceColor(incident.aiConfidence), fontSize: '12px', fontWeight: 700,
            }}>
              AI Confidence: {incident.aiConfidence}%
            </div>
          )}
        </div>
      )}

      {/* Facility Legend Panel */}
      <div style={{
        position: 'absolute', top: '200px', right: '20px', zIndex: 1000,
        background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
        padding: '16px', color: '#fff', minWidth: '280px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#aaa', marginBottom: '12px' }}>
          Nearest Responders
        </div>
        {isLoading ? (
          <div style={{ color: '#ffb74d', fontSize: '13px', textAlign: 'center' }}>⚡ NEXUS locating facilities...</div>
        ) : (
          facilities.sort((a, b) => a.etaMins - b.etaMins).map(f => (
            <div
              key={f.id}
              onClick={() => setSelectedFacility(f)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
                borderRadius: '10px', marginBottom: '6px', cursor: 'pointer',
                background: selectedFacility?.id === f.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: `1px solid ${selectedFacility?.id === f.id ? f.color + '55' : 'transparent'}`,
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '22px' }}>{f.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{f.name}</div>
                <div style={{ fontSize: '11px', color: '#888' }}>{f.label} · {f.distKm} km away</div>
              </div>
              <div style={{
                padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                background: f.etaMins <= 5 ? '#4caf5033' : f.etaMins <= 10 ? '#ff980033' : '#f4433633',
                color: f.etaMins <= 5 ? '#4caf50' : f.etaMins <= 10 ? '#ff9800' : '#f44336',
              }}>
                ~{f.etaMins} min
              </div>
            </div>
          ))
        )}
      </div>

      {/* Map */}
      {incidentLoc && (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={incidentLoc}
          zoom={14}
          options={{ styles: darkMapStyle, disableDefaultUI: true }}
          onLoad={onMapLoad}
        >
          {/* Incident Pin — use default red Google marker for reliability */}
          <Marker
            position={incidentLoc}
            icon={{
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52">' +
                '<ellipse cx="20" cy="49" rx="8" ry="3" fill="rgba(0,0,0,0.35)"/>' +
                '<path d="M20 0 C9 0 0 9 0 20 C0 35 20 52 20 52 C20 52 40 35 40 20 C40 9 31 0 20 0Z" fill="#f44336"/>' +
                '<circle cx="20" cy="19" r="8" fill="white" opacity="0.9"/>' +
                '<text x="20" y="24" text-anchor="middle" font-size="13" font-weight="bold" fill="#f44336">SOS</text>' +
                '</svg>'
              ),
              scaledSize: new window.google.maps.Size(40, 52),
              anchor: new window.google.maps.Point(20, 52),
            }}
          />

          {/* Facility Pins */}
          {facilities.map(f => {
            const letter = f.type === 'hospital' ? 'H' : f.type === 'police' ? 'P' : 'F';
            return (
              <Marker
                key={f.id}
                position={{ lat: f.lat, lng: f.lng }}
                icon={{
                  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">' +
                    '<ellipse cx="18" cy="45" rx="6" ry="2.5" fill="rgba(0,0,0,0.3)"/>' +
                    '<path d="M18 0 C8 0 0 8 0 18 C0 31 18 48 18 48 C18 48 36 31 36 18 C36 8 28 0 18 0Z" fill="' + f.color + '"/>' +
                    '<circle cx="18" cy="18" r="9" fill="white" opacity="0.9"/>' +
                    '<text x="18" y="23" text-anchor="middle" font-size="12" font-weight="bold" fill="' + f.color + '">' + letter + '</text>' +
                    '</svg>'
                  ),
                  scaledSize: new window.google.maps.Size(36, 48),
                  anchor: new window.google.maps.Point(18, 48),
                }}
                onClick={() => setSelectedFacility(f)}
              />
            );
          })}

          {/* Info Window for selected facility */}
          {selectedFacility && (
            <InfoWindow
              position={{ lat: selectedFacility.lat, lng: selectedFacility.lng }}
              onCloseClick={() => setSelectedFacility(null)}
            >
              <div style={{ fontFamily: 'Inter, sans-serif', padding: '6px', minWidth: '180px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
                  {selectedFacility.icon} {selectedFacility.name}
                </div>
                <div style={{ color: '#555', fontSize: '12px' }}>{selectedFacility.label}</div>
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>{selectedFacility.distKm} km away</span>
                  <span style={{
                    fontWeight: 700, fontSize: '12px',
                    color: selectedFacility.etaMins <= 5 ? '#4caf50' : selectedFacility.etaMins <= 10 ? '#ff9800' : '#f44336',
                  }}>
                    ETA: ~{selectedFacility.etaMins} min
                  </span>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      )}
    </div>
  );
}
