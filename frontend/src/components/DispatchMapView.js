import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { darkMapStyle } from '../utils';

const containerStyle = { width: '100%', height: '100vh' };

const FACILITY_CONFIG = {
  hospital:      { label: 'Hospital',       icon: '🏥', color: '#ef5350', letter: 'H', etaSpeed: 40 },
  police:        { label: 'Police Station', icon: '🚓', color: '#42a5f5', letter: 'P', etaSpeed: 60 },
  fire_station:  { label: 'Fire Station',   icon: '🚒', color: '#ff7043', letter: 'F', etaSpeed: 55 },
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchNearbyFacilitiesOSM(lat, lng, radiusMeters = 10000) {
  const query = `
    [out:json][timeout:25];
    (
      node[amenity=hospital](around:${radiusMeters},${lat},${lng});
      way[amenity=hospital](around:${radiusMeters},${lat},${lng});
      node[amenity=police](around:${radiusMeters},${lat},${lng});
      way[amenity=police](around:${radiusMeters},${lat},${lng});
      node[amenity=fire_station](around:${radiusMeters},${lat},${lng});
      way[amenity=fire_station](around:${radiusMeters},${lat},${lng});
    );
    out center;
  `;

  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
  });

  if (!resp.ok) throw new Error('Overpass API request failed');
  const data = await resp.json();

  const results = [];
  const seen = new Set();

  for (const el of data.elements) {
    const amenity = el.tags?.amenity;
    if (!amenity || !FACILITY_CONFIG[amenity]) continue;

    const name = el.tags?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (!elLat || !elLng) continue;

    const cfg = FACILITY_CONFIG[amenity];
    const distKm = haversineKm(lat, lng, elLat, elLng);
    const etaMins = Math.max(1, Math.round((distKm / cfg.etaSpeed) * 60));

    results.push({
      id: String(el.id),
      name,
      lat: elLat,
      lng: elLng,
      distKm: distKm.toFixed(1),
      etaMins,
      amenity,
      ...cfg,
    });
  }

  // Sort by distance, keep top 2 of each type
  const byType = {};
  for (const r of results) {
    if (!byType[r.amenity]) byType[r.amenity] = [];
    byType[r.amenity].push(r);
  }
  const top = [];
  for (const amenity of Object.keys(FACILITY_CONFIG)) {
    const sorted = (byType[amenity] || []).sort((a, b) => parseFloat(a.distKm) - parseFloat(b.distKm));
    top.push(...sorted.slice(0, 2));
  }
  return top;
}

function makePinSvg(letter, color) {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">' +
      '<ellipse cx="18" cy="45" rx="6" ry="2.5" fill="rgba(0,0,0,0.3)"/>' +
      '<path d="M18 0 C8 0 0 8 0 18 C0 31 18 48 18 48 C18 48 36 31 36 18 C36 8 28 0 18 0Z" fill="' + color + '"/>' +
      '<circle cx="18" cy="17" r="9" fill="white" opacity="0.92"/>' +
      '<text x="18" y="22" text-anchor="middle" font-size="11" font-weight="bold" fill="' + color + '">' + letter + '</text>' +
      '</svg>'
    )
  );
}

function makeSosSvg() {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="42" height="54" viewBox="0 0 42 54">' +
      '<ellipse cx="21" cy="51" rx="9" ry="3" fill="rgba(0,0,0,0.35)"/>' +
      '<path d="M21 0 C9.4 0 0 9.4 0 21 C0 36.75 21 54 21 54 C21 54 42 36.75 42 21 C42 9.4 32.6 0 21 0Z" fill="#f44336"/>' +
      '<circle cx="21" cy="20" r="10" fill="white" opacity="0.92"/>' +
      '<text x="21" y="25" text-anchor="middle" font-size="10" font-weight="bold" fill="#c62828">SOS</text>' +
      '</svg>'
    )
  );
}

export default function DispatchMapView() {
  const { incidentId } = useParams();
  const navigate = useNavigate();

  const [incident, setIncident] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchIncident = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'incidents', incidentId));
        if (docSnap.exists()) setIncident({ id: docSnap.id, ...docSnap.data() });
      } catch (e) { console.error('Failed to fetch incident', e); }
    };
    fetchIncident();
  }, [incidentId]);

  useEffect(() => {
    if (!incident?.location) return;
    const { lat, lng } = incident.location;
    setIsLoading(true);
    setErrorMsg('');

    fetchNearbyFacilitiesOSM(lat, lng)
      .then(data => {
        setFacilities(data);
        if (data.length === 0) setErrorMsg('No nearby facilities found within 10km.');
      })
      .catch(err => {
        console.error('OSM fetch error', err);
        setErrorMsg('Could not load nearby facilities. Check internet connection.');
      })
      .finally(() => setIsLoading(false));
  }, [incident]);

  const getConfidenceColor = (score) =>
    score >= 85 ? '#4caf50' : score >= 60 ? '#ff9800' : '#f44336';

  const incidentLoc = incident?.location;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', fontFamily: 'Inter, sans-serif' }}>
      {/* Back Button */}
      <button
        onClick={() => navigate('/authority')}
        style={{
          position: 'absolute', top: '80px', left: '20px', zIndex: 1000,
          background: 'rgba(10,10,10,0.9)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '10px 18px', borderRadius: '10px', cursor: 'pointer',
          fontWeight: 600, backdropFilter: 'blur(10px)',
        }}
      >
        ← Back to Command
      </button>

      {/* Header */}
      {incident && (
        <div style={{
          position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
          padding: '14px 24px', color: '#fff', textAlign: 'center', minWidth: '320px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>
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

      {/* Sidebar Panel */}
      <div style={{
        position: 'absolute', top: '200px', right: '20px', zIndex: 1000,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
        padding: '16px', color: '#fff', minWidth: '290px', maxHeight: '60vh',
        overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#888', marginBottom: '14px' }}>
          ⚡ Nearest Responders
        </div>

        {isLoading && (
          <div style={{ color: '#ffb74d', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '22px', marginBottom: '8px' }}>⚡</div>
            NEXUS locating facilities...
          </div>
        )}

        {!isLoading && errorMsg && (
          <div style={{ color: '#f44336', fontSize: '12px', textAlign: 'center', padding: '10px' }}>{errorMsg}</div>
        )}

        {!isLoading && !errorMsg && facilities.length === 0 && (
          <div style={{ color: '#888', fontSize: '12px', textAlign: 'center', padding: '10px' }}>No facilities found nearby.</div>
        )}

        {!isLoading && facilities.sort((a, b) => parseFloat(a.distKm) - parseFloat(b.distKm)).map(f => (
          <div
            key={f.id}
            onClick={() => setSelectedFacility(f)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
              borderRadius: '10px', marginBottom: '6px', cursor: 'pointer',
              background: selectedFacility?.id === f.id ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${selectedFacility?.id === f.id ? f.color + '66' : 'rgba(255,255,255,0.06)'}`,
              transition: 'all 0.2s',
            }}
          >
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
              background: f.color + '22', border: `2px solid ${f.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', fontWeight: 900, color: f.color,
            }}>
              {f.letter}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div style={{ fontSize: '11px', color: '#777' }}>{f.label} · {f.distKm} km</div>
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, flexShrink: 0,
              background: f.etaMins <= 5 ? '#4caf5025' : f.etaMins <= 10 ? '#ff980025' : '#f4433625',
              color: f.etaMins <= 5 ? '#4caf50' : f.etaMins <= 10 ? '#ff9800' : '#f44336',
              border: `1px solid ${f.etaMins <= 5 ? '#4caf5055' : f.etaMins <= 10 ? '#ff980055' : '#f4433655'}`,
            }}>
              ~{f.etaMins}m
            </div>
          </div>
        ))}
      </div>

      {/* Map */}
      {incidentLoc && (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={incidentLoc}
          zoom={13}
          options={{ styles: darkMapStyle, disableDefaultUI: true }}
        >
          {/* SOS Pin */}
          <Marker
            position={incidentLoc}
            icon={{
              url: makeSosSvg(),
              scaledSize: new window.google.maps.Size(42, 54),
              anchor: new window.google.maps.Point(21, 54),
            }}
          />

          {/* Facility Pins */}
          {facilities.map(f => (
            <Marker
              key={f.id}
              position={{ lat: f.lat, lng: f.lng }}
              icon={{
                url: makePinSvg(f.letter, f.color),
                scaledSize: new window.google.maps.Size(36, 48),
                anchor: new window.google.maps.Point(18, 48),
              }}
              onClick={() => setSelectedFacility(f)}
            />
          ))}

          {/* Info Window */}
          {selectedFacility && (
            <InfoWindow
              position={{ lat: selectedFacility.lat, lng: selectedFacility.lng }}
              onCloseClick={() => setSelectedFacility(null)}
            >
              <div style={{ fontFamily: 'Inter, sans-serif', padding: '6px', minWidth: '190px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '3px' }}>
                  {selectedFacility.icon} {selectedFacility.name}
                </div>
                <div style={{ color: '#555', fontSize: '12px', marginBottom: '8px' }}>{selectedFacility.label}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>{selectedFacility.distKm} km away</span>
                  <span style={{
                    fontWeight: 700, fontSize: '12px', padding: '2px 8px', borderRadius: '12px',
                    background: selectedFacility.etaMins <= 5 ? '#e8f5e9' : selectedFacility.etaMins <= 10 ? '#fff3e0' : '#ffebee',
                    color: selectedFacility.etaMins <= 5 ? '#2e7d32' : selectedFacility.etaMins <= 10 ? '#e65100' : '#c62828',
                  }}>
                    ETA ~{selectedFacility.etaMins} min
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
