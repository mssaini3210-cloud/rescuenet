import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { darkMapStyle } from '../utils';

const containerStyle = { width: '100%', height: '100vh' };

const FACILITY_CONFIG = {
  hospital:     { label: 'Hospital',       icon: '🏥', color: '#ef5350', letter: 'H', etaSpeed: 40, fallbackPhone: '102' },
  police:       { label: 'Police Station', icon: '🚓', color: '#42a5f5', letter: 'P', etaSpeed: 60, fallbackPhone: '100' },
  fire_station: { label: 'Fire Station',   icon: '🚒', color: '#ff7043', letter: 'F', etaSpeed: 55, fallbackPhone: '101' },
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Deduplicate by proximity (within 200m) rather than by name to avoid dropping nearby facilities
function deduplicateByProximity(items, thresholdKm = 0.2) {
  const kept = [];
  for (const item of items) {
    const tooClose = kept.some(k =>
      haversineKm(k.lat, k.lng, item.lat, item.lng) < thresholdKm
    );
    if (!tooClose) kept.push(item);
  }
  return kept;
}

async function fetchNearbyFacilitiesOSM(lat, lng) {
  // Use 15km for hospitals (might be far), 8km for police/fire
  const query = `
    [out:json][timeout:30];
    (
      node[amenity=hospital](around:15000,${lat},${lng});
      way[amenity=hospital](around:15000,${lat},${lng});
      relation[amenity=hospital](around:15000,${lat},${lng});
      node[amenity=police](around:8000,${lat},${lng});
      way[amenity=police](around:8000,${lat},${lng});
      node[amenity=fire_station](around:8000,${lat},${lng});
      way[amenity=fire_station](around:8000,${lat},${lng});
    );
    out center tags;
  `;

  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
  });
  if (!resp.ok) throw new Error('Overpass API failed');
  const data = await resp.json();

  // Parse elements
  const raw = [];
  for (const el of data.elements) {
    const amenity = el.tags?.amenity;
    if (!amenity || !FACILITY_CONFIG[amenity]) continue;

    const name = el.tags?.name || el.tags?.['name:en'] || `Unnamed ${FACILITY_CONFIG[amenity].label}`;
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (!elLat || !elLng) continue;

    const cfg = FACILITY_CONFIG[amenity];
    const distKm = haversineKm(lat, lng, elLat, elLng);
    const etaMins = Math.max(1, Math.round((distKm / cfg.etaSpeed) * 60));

    // Extract phone from various OSM tags
    const phone = el.tags?.phone || el.tags?.['contact:phone'] || el.tags?.tel || null;

    raw.push({
      id: String(el.id),
      name,
      lat: elLat,
      lng: elLng,
      distKm,
      distKmDisplay: distKm.toFixed(1),
      etaMins,
      amenity,
      phone,
      ...cfg,
    });
  }

  // Group by amenity, sort each group by distance, deduplicate by proximity, take top 3
  const result = [];
  for (const amenity of Object.keys(FACILITY_CONFIG)) {
    const group = raw
      .filter(r => r.amenity === amenity)
      .sort((a, b) => a.distKm - b.distKm);
    const deduped = deduplicateByProximity(group);
    result.push(...deduped.slice(0, 3));
  }

  return result;
}

function makePinSvg(letter, color) {
  const enc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">' +
      '<ellipse cx="18" cy="45" rx="6" ry="2.5" fill="rgba(0,0,0,0.3)"/>' +
      '<path d="M18 0 C8 0 0 8 0 18 C0 31 18 48 18 48 C18 48 36 31 36 18 C36 8 28 0 18 0Z" fill="' + enc(color) + '"/>' +
      '<circle cx="18" cy="17" r="10" fill="white" opacity="0.95"/>' +
      '<text x="18" y="22" text-anchor="middle" font-size="11" font-weight="bold" font-family="Arial" fill="' + enc(color) + '">' + enc(letter) + '</text>' +
      '</svg>'
    )
  );
}

function makeSelectedPinSvg(letter, color) {
  const enc = (s) => s.replace(/&/g, '&amp;');
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="46" height="60" viewBox="0 0 46 60">' +
      '<ellipse cx="23" cy="57" rx="8" ry="3" fill="rgba(0,0,0,0.4)"/>' +
      '<path d="M23 0 C10 0 0 10 0 23 C0 40 23 60 23 60 C23 60 46 40 46 23 C46 10 36 0 23 0Z" fill="' + enc(color) + '"/>' +
      '<circle cx="23" cy="22" r="13" fill="white" opacity="0.95"/>' +
      '<text x="23" y="28" text-anchor="middle" font-size="14" font-weight="bold" font-family="Arial" fill="' + enc(color) + '">' + enc(letter) + '</text>' +
      '</svg>'
    )
  );
}

function makeSosSvg() {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">' +
      '<ellipse cx="22" cy="53" rx="9" ry="3.5" fill="rgba(0,0,0,0.4)"/>' +
      '<path d="M22 0 C9.8 0 0 9.8 0 22 C0 38.5 22 56 22 56 C22 56 44 38.5 44 22 C44 9.8 34.2 0 22 0Z" fill="#f44336"/>' +
      '<circle cx="22" cy="21" r="12" fill="white" opacity="0.95"/>' +
      '<text x="22" y="26" text-anchor="middle" font-size="10" font-weight="bold" font-family="Arial" fill="#c62828">SOS</text>' +
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
  const [dispatchTarget, setDispatchTarget] = useState(null); // facility chosen for dispatch
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchIncident = async () => {
      try {
        const snap = await getDoc(doc(db, 'incidents', incidentId));
        if (snap.exists()) setIncident({ id: snap.id, ...snap.data() });
      } catch (e) { console.error(e); }
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
        if (data.length === 0) setErrorMsg('No facilities found within range.');
      })
      .catch(err => {
        console.error(err);
        setErrorMsg('Could not load facilities. Check connection.');
      })
      .finally(() => setIsLoading(false));
  }, [incident]);

  const buildGoogleMapsLink = () => {
    if (!incident?.location) return '';
    const { lat, lng } = incident.location;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  const buildDispatchMessage = (facility) => {
    const mapsLink = buildGoogleMapsLink();
    const addr = incident?.address || `${incident?.location?.lat?.toFixed(5)}, ${incident?.location?.lng?.toFixed(5)}`;
    const type = incident?.type || 'Emergency';
    const sev = incident?.severity || '';
    return (
      `🚨 EMERGENCY DISPATCH REQUEST 🚨\n\n` +
      `Incident: ${sev} ${type}\n` +
      `Location: ${addr}\n` +
      `Google Maps: ${mapsLink}\n\n` +
      `Tags: ${(incident?.tags || []).join(', ') || 'N/A'}\n` +
      `Involved: ${incident?.involvedCount || 'Unknown'}\n` +
      `Description: ${incident?.description || 'N/A'}\n\n` +
      `Please respond immediately. This is an automated dispatch from RescueNet Command.`
    );
  };

  const handleDispatch = async (facility) => {
    setDispatchTarget(facility);
    // Log to Firestore
    try {
      const note = {
        text: `SYSTEM: ${facility.label} dispatched — ${facility.name} (${facility.distKmDisplay} km, ETA ~${facility.etaMins} min)`,
        time: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'incidents', incidentId), {
        status: 'assigned',
        assignedUnit: facility.name,
        assignedETA: facility.etaMins,
        notes: arrayUnion(note),
      });
    } catch (e) { console.error(e); }
  };

  const handleWhatsApp = (facility) => {
    const phone = (facility.phone || facility.fallbackPhone).replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(buildDispatchMessage(facility));
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  const handleSMS = (facility) => {
    const phone = (facility.phone || facility.fallbackPhone).replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(buildDispatchMessage(facility));
    window.open(`sms:${phone}?body=${msg}`, '_blank');
  };

  const handleCall = (facility) => {
    const phone = (facility.phone || facility.fallbackPhone).replace(/[^0-9]/g, '');
    window.open(`tel:${phone}`, '_blank');
  };

  const confColor = (s) => s >= 85 ? '#4caf50' : s >= 60 ? '#ff9800' : '#f44336';
  const incidentLoc = incident?.location;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', fontFamily: 'Inter, sans-serif' }}>

      {/* Back Button */}
      <button onClick={() => navigate('/authority')} style={{
        position: 'absolute', top: '80px', left: '20px', zIndex: 1000,
        background: 'rgba(10,10,10,0.9)', color: '#fff',
        border: '1px solid rgba(255,255,255,0.15)',
        padding: '10px 18px', borderRadius: '10px', cursor: 'pointer',
        fontWeight: 600, backdropFilter: 'blur(10px)', fontSize: '13px',
      }}>
        ← Command
      </button>

      {/* Header */}
      {incident && (
        <div style={{
          position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
          padding: '12px 24px', color: '#fff', textAlign: 'center', minWidth: '300px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '2px' }}>
            Dispatch Map — {incident.type} Incident
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>{incident.address || 'GPS Location'}</div>
          {incident.aiConfidence && (
            <div style={{
              display: 'inline-block', marginTop: '6px', padding: '3px 10px', borderRadius: '20px',
              background: confColor(incident.aiConfidence) + '22',
              border: `1px solid ${confColor(incident.aiConfidence)}`,
              color: confColor(incident.aiConfidence), fontSize: '11px', fontWeight: 700,
            }}>
              AI: {incident.aiConfidence}% Confidence
            </div>
          )}
        </div>
      )}

      {/* Facility Sidebar */}
      <div style={{
        position: 'absolute', top: '185px', right: '20px', zIndex: 1000,
        background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px',
        padding: '16px', color: '#fff', width: '300px',
        maxHeight: 'calc(100vh - 210px)', overflowY: 'auto',
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#555', marginBottom: '12px' }}>
          ⚡ Select & Dispatch
        </div>

        {isLoading && (
          <div style={{ color: '#ffb74d', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '26px', marginBottom: '8px' }}>⚡</div>
            NEXUS scanning area...
          </div>
        )}
        {!isLoading && errorMsg && (
          <div style={{ color: '#f44336', fontSize: '12px', textAlign: 'center', padding: '10px' }}>{errorMsg}</div>
        )}

        {/* Group facilities by type */}
        {!isLoading && Object.keys(FACILITY_CONFIG).map(amenity => {
          const group = facilities.filter(f => f.amenity === amenity);
          if (group.length === 0) return null;
          const cfg = FACILITY_CONFIG[amenity];
          return (
            <div key={amenity} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', color: cfg.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', paddingLeft: '4px' }}>
                {cfg.icon} {cfg.label}s
              </div>
              {group.map(f => {
                const isSelected = selectedFacility?.id === f.id;
                const isDispatched = dispatchTarget?.id === f.id;
                return (
                  <div key={f.id} style={{
                    borderRadius: '10px', marginBottom: '6px', cursor: 'pointer',
                    background: isDispatched ? cfg.color + '18' : isSelected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isDispatched ? cfg.color + '77' : isSelected ? cfg.color + '33' : 'rgba(255,255,255,0.06)'}`,
                    transition: 'all 0.2s', overflow: 'hidden',
                  }}>
                    {/* Facility row */}
                    <div onClick={() => setSelectedFacility(isSelected ? null : f)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                        background: cfg.color + '22', border: `2px solid ${cfg.color}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 900, color: cfg.color,
                      }}>{cfg.letter}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: '10px', color: '#666' }}>{f.distKmDisplay} km · ~{f.etaMins} min{f.phone ? ` · ${f.phone}` : ''}</div>
                      </div>
                      <div style={{
                        padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, flexShrink: 0,
                        background: f.etaMins <= 5 ? '#4caf5022' : f.etaMins <= 10 ? '#ff980022' : '#f4433622',
                        color: f.etaMins <= 5 ? '#4caf50' : f.etaMins <= 10 ? '#ff9800' : '#f44336',
                      }}>
                        {f.etaMins}m
                      </div>
                    </div>

                    {/* Dispatch Actions — show when selected */}
                    {isSelected && (
                      <div style={{ padding: '0 10px 10px 10px' }}>
                        {!isDispatched ? (
                          <>
                            <button onClick={() => handleDispatch(f)} style={{
                              width: '100%', padding: '8px', borderRadius: '8px', border: 'none',
                              background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`,
                              color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                              marginBottom: '6px', letterSpacing: '0.5px',
                            }}>
                              🚀 Dispatch {cfg.label}
                            </button>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                              <button onClick={() => handleCall(f)} style={{
                                padding: '7px 4px', borderRadius: '7px', border: `1px solid ${cfg.color}44`,
                                background: cfg.color + '11', color: cfg.color, fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                              }}>📞 Call</button>
                              <button onClick={() => handleWhatsApp(f)} style={{
                                padding: '7px 4px', borderRadius: '7px', border: '1px solid #25D36644',
                                background: '#25D36611', color: '#25D366', fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                              }}>💬 WA</button>
                              <button onClick={() => handleSMS(f)} style={{
                                padding: '7px 4px', borderRadius: '7px', border: '1px solid #888',
                                background: 'rgba(255,255,255,0.05)', color: '#ccc', fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                              }}>✉️ SMS</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ textAlign: 'center', color: cfg.color, fontWeight: 700, fontSize: '12px', marginBottom: '6px' }}>
                              ✅ Dispatched — Confirm Contact
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                              <button onClick={() => handleCall(f)} style={{
                                padding: '7px 4px', borderRadius: '7px', border: `1px solid ${cfg.color}44`,
                                background: cfg.color + '11', color: cfg.color, fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                              }}>📞 Call</button>
                              <button onClick={() => handleWhatsApp(f)} style={{
                                padding: '7px 4px', borderRadius: '7px', border: '1px solid #25D36644',
                                background: '#25D36611', color: '#25D366', fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                              }}>💬 WA</button>
                              <button onClick={() => handleSMS(f)} style={{
                                padding: '7px 4px', borderRadius: '7px', border: '1px solid #888',
                                background: 'rgba(255,255,255,0.05)', color: '#ccc', fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                              }}>✉️ SMS</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
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
              scaledSize: new window.google.maps.Size(44, 56),
              anchor: new window.google.maps.Point(22, 56),
            }}
            zIndex={100}
          />

          {/* Facility Pins */}
          {facilities.map(f => {
            const isSelected = selectedFacility?.id === f.id;
            return (
              <Marker
                key={f.id}
                position={{ lat: f.lat, lng: f.lng }}
                icon={{
                  url: isSelected ? makeSelectedPinSvg(f.letter, f.color) : makePinSvg(f.letter, f.color),
                  scaledSize: isSelected
                    ? new window.google.maps.Size(46, 60)
                    : new window.google.maps.Size(36, 48),
                  anchor: isSelected
                    ? new window.google.maps.Point(23, 60)
                    : new window.google.maps.Point(18, 48),
                }}
                zIndex={isSelected ? 50 : 10}
                onClick={() => setSelectedFacility(selectedFacility?.id === f.id ? null : f)}
              />
            );
          })}

          {/* Info Window on map pin click */}
          {selectedFacility && (
            <InfoWindow
              position={{ lat: selectedFacility.lat, lng: selectedFacility.lng }}
              onCloseClick={() => setSelectedFacility(null)}
            >
              <div style={{ fontFamily: 'Inter, sans-serif', padding: '4px', minWidth: '200px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>
                  {selectedFacility.icon} {selectedFacility.name}
                </div>
                <div style={{ color: '#666', fontSize: '11px', marginBottom: '8px' }}>
                  {selectedFacility.label} · {selectedFacility.distKmDisplay} km · ETA ~{selectedFacility.etaMins} min
                </div>
                {selectedFacility.phone && (
                  <div style={{ color: '#333', fontSize: '11px', marginBottom: '8px' }}>
                    📞 {selectedFacility.phone}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                  <button onClick={() => handleCall(selectedFacility)} style={{
                    padding: '6px 4px', borderRadius: '6px', border: `1px solid ${selectedFacility.color}44`,
                    background: selectedFacility.color + '11', color: selectedFacility.color,
                    fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                  }}>📞 Call</button>
                  <button onClick={() => handleWhatsApp(selectedFacility)} style={{
                    padding: '6px 4px', borderRadius: '6px', border: '1px solid #25D36644',
                    background: '#25D36611', color: '#1a9c48', fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                  }}>💬 WA</button>
                  <button onClick={() => handleSMS(selectedFacility)} style={{
                    padding: '6px 4px', borderRadius: '6px', border: '1px solid #aaa',
                    background: '#f5f5f5', color: '#333', fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                  }}>✉️ SMS</button>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      )}
    </div>
  );
}
