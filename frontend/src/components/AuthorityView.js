import React, { useState, useMemo } from 'react';
import { GoogleMap, Marker, Circle } from "@react-google-maps/api";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import { useIncidents } from "../hooks/useIncidents";
import { useGeolocation } from "../hooks/useGeolocation";
import { getDistanceFromLatLonInKm, getMarkerIcon, getSmartSuggestion, darkMapStyle } from "../utils";

const containerStyle = { width: "100%", height: "100vh" };

function calculateDensityClusters(points, radiusKm = 2) {
  let clusters = [];

  for (let pIdx = 0; pIdx < points.length; pIdx++) {
    const p = points[pIdx];
    let added = false;
    for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
      const cluster = clusters[cIdx];
      const dist = getDistanceFromLatLonInKm(p.lat, p.lng, cluster.lat, cluster.lng);
      if (dist <= radiusKm) {
        cluster.points.push(p);
        cluster.lat = cluster.points.reduce((sum, cp) => sum + cp.lat, 0) / cluster.points.length;
        cluster.lng = cluster.points.reduce((sum, cp) => sum + cp.lng, 0) / cluster.points.length;
        added = true;
        break;
      }
    }
    if (!added) {
      clusters.push({ lat: p.lat, lng: p.lng, points: [p] });
    }
  }

  return clusters.map(c => ({
    lat: c.lat,
    lng: c.lng,
    weight: c.points.length
  }));
}

export default function AuthorityView() {
  const incidents = useIncidents();
  const userLocation = useGeolocation();
  
  const [filterRadius, setFilterRadius] = useState(5);
  const [activeFilter, setActiveFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [responderNote, setResponderNote] = useState('');
  const [isPredictiveMode, setIsPredictiveMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const docRef = doc(db, "incidents", id);
      const timeStr = new Date().toISOString();
      const statusNote = { text: `SYSTEM: Status updated to ${newStatus}`, time: timeStr };

      await updateDoc(docRef, { 
        status: newStatus,
        notes: arrayUnion(statusNote)
      });
      setSelectedIncident(prev => {
        if (prev && prev.id === id) {
           const notes = prev.notes ? [...prev.notes] : [];
           notes.push(statusNote);
           return { ...prev, status: newStatus, notes };
        }
        return prev;
      });
    } catch (e) { console.error("Update failed", e); }
  };

  const handleAddNote = async (id) => {
    if (!responderNote.trim()) return;
    try {
      const timeStr = new Date().toISOString();
      const docRef = doc(db, "incidents", id);
      await updateDoc(docRef, {
        notes: arrayUnion({ text: responderNote, time: timeStr })
      });
      setSelectedIncident(prev => {
        if (prev && prev.id === id) {
           const notes = prev.notes ? [...prev.notes] : [];
           notes.push({ text: responderNote, time: timeStr });
           return { ...prev, notes };
        }
        return prev;
      });
      setResponderNote('');
    } catch (e) { console.error("Note failed", e); }
  };

  const handleDispatch = async (unit) => {
    if (!selectedIncident) return;
    const time = new Date().toLocaleTimeString();
    const noteObj = { text: `SYSTEM: ${unit} Dispatched at ${time}`, time: new Date().toISOString() };
    try {
      const docRef = doc(db, "incidents", selectedIncident.id);
      await updateDoc(docRef, {
        status: 'assigned',
        notes: arrayUnion(noteObj)
      });
      setSelectedIncident(prev => {
        if (prev && prev.id === selectedIncident.id) {
           const notes = prev.notes ? [...prev.notes] : [];
           notes.push(noteObj);
           return { ...prev, status: 'assigned', notes };
        }
        return prev;
      });
    } catch(e) { console.error("Dispatch Failed", e); }
  };

  const filteredIncidents = incidents.filter(incident => {
    if (!incident.location || !userLocation) return false;
    const distance = getDistanceFromLatLonInKm(
      userLocation.lat, userLocation.lng,
      incident.location.lat, incident.location.lng
    );
    const radiusLimit = Number(filterRadius) || 5; 
    
    const matchesAuthFilter = 
      (activeFilter === 'All' || incident.status === activeFilter.toLowerCase()) &&
      (typeFilter === 'All' || incident.type === typeFilter) &&
      (severityFilter === 'All' || incident.severity === severityFilter);

    return distance <= radiusLimit && matchesAuthFilter;
  });

  const clusterCentroids = useMemo(() => {
    if (filteredIncidents.length === 0) return [];
    const points = filteredIncidents.filter(inc => inc.location).map(inc => inc.location);
    return calculateDensityClusters(points, 2); // Dynamic 2km clustering radius
  }, [filteredIncidents]);

  if (!userLocation) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Inter', backgroundColor: '#0a0a0a', color: '#fff' }}>
        <img 
          src="/logo_final.png" 
          alt="RescueNet Logo" 
          style={{ width: '250px', marginBottom: '20px', animation: 'pulseLogo 2s infinite' }} 
        />
        <h2 style={{ color: '#aaa', fontWeight: 500, letterSpacing: '1px', fontSize: '18px' }}>SECURING GPS LINK...</h2>
        <style>
          {`
            @keyframes pulseLogo {
              0% { transform: scale(0.95); opacity: 0.8; }
              50% { transform: scale(1.05); opacity: 1; }
              100% { transform: scale(0.95); opacity: 0.8; }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <>
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        style={{
          position: 'absolute',
          top: '80px',
          left: isSidebarOpen ? '360px' : '20px',
          zIndex: 1000,
          background: 'rgba(20, 20, 20, 0.85)',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '10px 15px',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {isSidebarOpen ? '◀ Collapse' : '▶ Expand'}
      </button>

      <div className={`authority-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`} style={{ top: '60px' }}>
        <div className="sidebar-header">Operational Command</div>
        
        <div className="quick-filters">
          {['All', 'Reported', 'Verified', 'Assigned', 'Resolved'].map(filter => (
            <button 
              key={filter} 
              className={`filter-chip ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ flex: 1, padding: '5px', borderRadius: '5px', border: '1px solid #ddd' }}>
            <option value="All">All Types</option>
            <option value="Accident">Accident</option>
            <option value="Fire">Fire</option>
            <option value="Medical">Medical</option>
            <option value="Hazard">Hazard</option>
            <option value="Other">Other</option>
          </select>
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{ flex: 1, padding: '5px', borderRadius: '5px', border: '1px solid #ddd' }}>
            <option value="All">All Severity</option>
            <option value="Critical">Critical</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div className="sidebar-list">
          {filteredIncidents.length === 0 ? <p style={{color: '#666'}}>No incidents match criteria.</p> : null}
          {filteredIncidents.map(inc => (
            <div key={inc.id} className={`incident-card sidebar-border-${inc.severity}`} onClick={() => setSelectedIncident(inc)}>
              <h4>{inc.type} Incident</h4>
              <p>{inc.description.substring(0, 40)}...</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`badge badge-${inc.status || 'reported'}`}>{inc.status || 'reported'}</span>
                {inc.assignedUnit && (
                  <span style={{ fontSize: '11px', color: '#4caf50', fontWeight: 'bold' }}>
                    🚀 {inc.assignedETA}m
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '10px', marginBottom: '10px' }}>
          <button 
            style={{ 
              width: '100%', padding: '12px', background: isPredictiveMode ? '#9c27b0' : '#f3e5f5', 
              color: isPredictiveMode ? '#fff' : '#6a1b9a', border: '1px solid #9c27b0', 
              borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', 
              justifyContent: 'center', gap: '8px', alignItems: 'center', transition: 'all 0.3s' 
            }}
            onClick={() => setIsPredictiveMode(!isPredictiveMode)}
          >
            <span style={{fontSize: '16px'}}></span> Threat Analysis Map
          </button>
        </div>
      </div>

      <GoogleMap mapContainerStyle={containerStyle} center={userLocation} zoom={12} options={{ styles: darkMapStyle, disableDefaultUI: true }}>
          {filteredIncidents.map((incident) => (
            <Marker
              key={`marker-${incident.id}`}
              position={{ lat: incident.location.lat, lng: incident.location.lng }}
              icon={getMarkerIcon(incident.type, incident.severity)}
              onClick={() => setSelectedIncident(incident)}
              visible={!isPredictiveMode}
            />
          ))}
          
          {clusterCentroids.map((cluster, i) => (
            <Circle
              key={`cluster-${i}`}
              center={{ lat: cluster.lat, lng: cluster.lng }}
              radius={(cluster.weight * 100) + 300} 
              options={{
                fillColor: "#ff4b2b",
                fillOpacity: 0.12,
                strokeColor: "#ff4b2b",
                strokeOpacity: 0.4,
                strokeWeight: 1,
                visible: isPredictiveMode
              }}
            />
          ))}
        </GoogleMap>

      <div className="filter-panel" style={{ top: '80px' }}>
        <h4>Local Incidents</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
          <input 
            type="number" 
            min="1" max="50" 
            value={filterRadius} 
            onChange={(e) => {
              let val = parseInt(e.target.value);
              if (isNaN(val)) setFilterRadius('');
              else if (val > 50) setFilterRadius(50); 
              else setFilterRadius(val);
            }}
            className="form-control"
            style={{ width: '80px', padding: '8px', marginBottom: '0' }}
          />
          <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>
            km <i>(Max 50)</i>
          </span>
        </div>
      </div>

      {selectedIncident && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') setSelectedIncident(null) }}>
          <div className={`modal-content ${selectedIncident.status === 'resolved' ? `modal-resolved theme-bg-${selectedIncident.type.toLowerCase()}` : ''}`} style={{maxWidth: '550px', transition: 'background-color 0.3s ease'}}>
            {selectedIncident.status === 'resolved' ? (
              <div className="summary-box" style={{ color: selectedIncident.type === 'Other' ? '#fff' : '#000', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${selectedIncident.type === 'Other' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`, paddingBottom: '15px', marginBottom: '20px' }}>
                  <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>Incident Summary</h2>
                  <button onClick={() => setSelectedIncident(null)} style={{ background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: 'inherit' }}>&times;</button>
                </div>

                <div className="summary-item-block" style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '15px', textTransform: 'uppercase', opacity: 0.7 }}>1. Title of the Incident</h3>
                  <div style={{ fontSize: '18px', fontWeight: 700 }}>{selectedIncident.severity} {selectedIncident.type} Incident</div>
                </div>

                <div className="summary-item-block" style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '15px', textTransform: 'uppercase', opacity: 0.7 }}>2. Type and Category</h3>
                  <div style={{ fontSize: '16px', fontWeight: 600 }}>
                    Type: <span style={{ fontWeight: 400 }}>{selectedIncident.type}</span> <br/>
                    Category: <span style={{ fontWeight: 400 }}>{selectedIncident.severity} Severity</span>
                  </div>
                </div>

                <div className="summary-item-block" style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', textTransform: 'uppercase', opacity: 0.7 }}>3. All Timestamps</h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', lineHeight: '1.6' }}>
                    <li><strong>Reported at:</strong> {selectedIncident.timestamp ? new Date(selectedIncident.timestamp.toDate()).toLocaleString() : 'N/A'}</li>
                    {(selectedIncident.notes || []).map((note, idx) => {
                      let actionName = 'Log';
                      if (note.text.includes('Dispatched')) actionName = 'Dispatch';
                      else if (note.text.includes('Status updated to verified')) actionName = 'Verified';
                      else if (note.text.includes('Status updated to resolved')) actionName = 'Resolved';
                      else if (!note.text.startsWith('SYSTEM:')) actionName = 'Responder Note';
                      
                      return (
                        <li key={idx}><strong>{actionName} at:</strong> {new Date(note.time).toLocaleString()}</li>
                      );
                    })}
                  </ul>
                </div>

                <div className="summary-item-block" style={{ marginBottom: '10px' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', textTransform: 'uppercase', opacity: 0.7 }}>4. Names and Description of Personnel Involved</h3>
                  <div style={{ fontSize: '14px', backgroundColor: selectedIncident.type === 'Other' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.4)', padding: '15px', borderRadius: '8px' }}>
                    {(() => {
                      const personnel = [];
                      (selectedIncident.notes || []).forEach(n => {
                        if (n.text.includes('Dispatched')) {
                          personnel.push({ name: n.text.split(' ')[1] + ' Unit', desc: 'Dispatched to scene' });
                        } else if (!n.text.startsWith('SYSTEM:')) {
                          personnel.push({ name: 'Field Responder', desc: n.text });
                        }
                      });
                      
                      if (personnel.length === 0) return <span>No personnel dispatched or field logs recorded.</span>;
                      
                      return (
                        <ul style={{ margin: 0, paddingLeft: '15px' }}>
                          {personnel.map((p, i) => (
                            <li key={i} style={{ marginBottom: '5px' }}><strong>{p.name}:</strong> {p.desc}</li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                </div>

                <div className="summary-item-block" style={{ marginBottom: '10px' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', textTransform: 'uppercase', opacity: 0.7 }}>5. Response Time</h3>
                  <div style={{ fontSize: '16px', fontWeight: 600 }}>
                    {(() => {
                      if (!selectedIncident.timestamp) return 'N/A';
                      const reportedTime = selectedIncident.timestamp.toDate();
                      const resolutionNote = (selectedIncident.notes || []).find(n => n.text.includes('Status updated to resolved'));
                      if (!resolutionNote) return 'N/A';
                      
                      const diffMs = new Date(resolutionNote.time) - reportedTime;
                      const diffMins = Math.floor(diffMs / 60000);
                      const diffSecs = Math.floor((diffMs % 60000) / 1000);
                      
                      if (diffMins > 0) return `${diffMins} minutes and ${diffSecs} seconds`;
                      return `${diffSecs} seconds`;
                    })()}
                  </div>
                </div>
              </div>
            ) : (() => {
                const conf = selectedIncident.aiConfidence || 0;
                const confColor = conf >= 85 ? '#4caf50' : conf >= 60 ? '#ff9800' : '#f44336';
                const nearbyCount = incidents.filter(inc => {
                  if (!inc.location || inc.id === selectedIncident.id) return false;
                  const d = getDistanceFromLatLonInKm(inc.location.lat, inc.location.lng, selectedIncident.location.lat, selectedIncident.location.lng);
                  const twoHrsAgo = Date.now() - 2 * 60 * 60 * 1000;
                  const ts = inc.timestamp?.toDate?.()?.getTime?.() || 0;
                  return d <= 2 && ts >= twoHrsAgo;
                }).length;

                return (
                  <>
                    {/* HEADER */}
                    <div className="modal-header" style={{borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px', marginBottom: '16px'}}>
                      <div>
                        <div style={{fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px'}}>
                          ID: {selectedIncident.id?.slice(0, 8).toUpperCase()} · {selectedIncident.timestamp ? new Date(selectedIncident.timestamp.toDate()).toLocaleTimeString() : 'Unknown time'}
                        </div>
                        <h2 style={{margin: 0, fontSize: '20px'}}>{selectedIncident.type} Incident</h2>
                      </div>
                      <button className="close-btn" onClick={() => setSelectedIncident(null)}>&times;</button>
                    </div>

                    {/* AI CONFIDENCE + STATUS ROW */}
                    <div style={{display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px'}}>
                      <span className={`badge badge-${selectedIncident.status || 'reported'}`}>{selectedIncident.status || 'Reported'}</span>
                      <span style={{fontSize: '13px', color: '#888', fontWeight: 600}}>{selectedIncident.severity} Severity</span>
                      <span style={{
                        padding: '4px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 800,
                        background: confColor + '22', border: `1px solid ${confColor}`, color: confColor
                      }}>
                        AI: {conf}% Confidence
                      </span>
                      <span style={{fontSize: '12px', color: '#555'}}>Detected by TensorFlow.js + Geolocation</span>
                    </div>

                    {/* DISPATCH INFO */}
                    {selectedIncident.assignedUnit && (
                      <div style={{
                        background: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.3)',
                        borderRadius: '12px', padding: '12px', marginBottom: '16px', display: 'flex',
                        alignItems: 'center', justifyContent: 'space-between'
                      }}>
                        <div>
                          <div style={{fontSize: '11px', color: '#4caf50', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px'}}>🚀 Unit En Route</div>
                          <div style={{fontSize: '14px', fontWeight: 700, color: '#fff'}}>{selectedIncident.assignedUnit}</div>
                        </div>
                        <div style={{textAlign: 'right'}}>
                          <div style={{fontSize: '11px', color: '#888', fontWeight: 600, textTransform: 'uppercase'}}>ETA</div>
                          <div style={{fontSize: '18px', fontWeight: 800, color: '#4caf50'}}>~{selectedIncident.assignedETA}m</div>
                        </div>
                      </div>
                    )}

                    {/* NEXUS AI REMARKS */}
                    {selectedIncident.aiReason && (
                      <div style={{background: 'linear-gradient(135deg, rgba(255,75,43,0.08), rgba(255,75,43,0.02))', border: '1px solid rgba(255,75,43,0.25)', borderRadius: '12px', padding: '14px', marginBottom: '16px'}}>
                        <div style={{fontSize: '11px', color: '#ff4b2b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px'}}>⚡ NEXUS Engine Remark</div>
                        <div style={{fontSize: '13px', color: '#ddd', lineHeight: '1.6'}}>{selectedIncident.aiReason}</div>
                        {selectedIncident.aiResponseType && (
                          <div style={{marginTop: '8px', fontSize: '12px', color: '#ff9800', fontWeight: 600}}>
                            → Suggested Dispatch: {selectedIncident.aiResponseType}
                          </div>
                        )}
                      </div>
                    )}

                    {/* CONTEXT CARD */}
                    <div style={{background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '14px', marginBottom: '14px'}}>
                      <div style={{fontSize: '11px', color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px'}}>📍 Location & Context</div>
                      <p style={{margin: '0 0 8px 0', fontSize: '14px', color: '#fff'}}>{selectedIncident.address || `${selectedIncident.location?.lat?.toFixed(4)}°N, ${selectedIncident.location?.lng?.toFixed(4)}°E`}</p>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px'}}>
                        {(selectedIncident.tags || []).map(tag => (
                          <span key={tag} style={{background: 'rgba(255,75,43,0.18)', color: '#ff6b4a', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700}}>{tag}</span>
                        ))}
                      </div>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#bbb'}}>
                        <span>👥 {selectedIncident.involvedCount || 'Unknown'} involved</span>
                        <span>{selectedIncident.isSafe ? '✅ Reporter safe' : '⚠️ Safety unknown'}</span>
                        <span>🔋 {selectedIncident.battery || 'Unknown'}</span>
                        <span>📶 {selectedIncident.network || 'Unknown'}</span>
                      </div>
                    </div>

                    {/* VOICE TRANSCRIPT */}
                    {selectedIncident.voiceTranscript && (
                      <div style={{background: 'rgba(66,165,245,0.06)', border: '1px solid rgba(66,165,245,0.2)', borderRadius: '12px', padding: '12px', marginBottom: '14px'}}>
                        <div style={{fontSize: '11px', color: '#42a5f5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px'}}>🎙️ Voice Transcript</div>
                        <p style={{margin: 0, fontSize: '13px', color: '#ccc', fontStyle: 'italic', lineHeight: '1.6'}}>"{selectedIncident.voiceTranscript}"</p>
                      </div>
                    )}

                    {/* EVIDENCE IMAGE */}
                    {selectedIncident.imageUrl && (
                      <div style={{marginBottom: '14px'}}>
                        <div style={{fontSize: '11px', color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px'}}>📷 NEXUS Vision Evidence</div>
                        <img src={selectedIncident.imageUrl} alt="Evidence" style={{width: '100%', maxHeight: '220px', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)'}} />
                      </div>
                    )}

                    {/* NEARBY RISK */}
                    {nearbyCount > 0 && (
                      <div style={{background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.25)', borderRadius: '12px', padding: '12px', marginBottom: '14px'}}>
                        <div style={{fontSize: '11px', color: '#ff9800', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px'}}>⚠️ Nearby Risk Alert</div>
                        <div style={{fontSize: '13px', color: '#ffd180'}}>{nearbyCount} other incident{nearbyCount > 1 ? 's' : ''} reported within 2km in the last 2 hours — potential hotzone.</div>
                      </div>
                    )}

                    {/* SMART VERIFICATION */}
                    {selectedIncident.status === 'reported' && (
                      <div style={{background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '14px', marginBottom: '14px'}}>
                        <div style={{fontSize: '11px', color: '#aaa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px'}}>🔍 Smart Verification</div>
                        <div style={{fontSize: '12px', color: '#888', marginBottom: '10px'}}>
                          {conf >= 85 ? '✅ AI high-confidence — likely genuine.' : conf >= 60 ? '🟡 Moderate confidence — review evidence before verifying.' : '🔴 Low confidence — manual review strongly recommended.'}
                          {nearbyCount > 0 && ` ${nearbyCount} corroborating report(s) in area.`}
                        </div>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px'}}>
                          <button onClick={() => handleUpdateStatus(selectedIncident.id, 'verified')} style={{padding: '10px 6px', borderRadius: '8px', border: 'none', background: '#4caf5022', color: '#4caf50', fontWeight: 700, fontSize: '12px', cursor: 'pointer', border: '1px solid #4caf5044'}}>✅ Mark Credible</button>
                          <button onClick={() => handleUpdateStatus(selectedIncident.id, 'resolved')} style={{padding: '10px 6px', borderRadius: '8px', border: 'none', background: '#f4433622', color: '#f44336', fontWeight: 700, fontSize: '12px', cursor: 'pointer', border: '1px solid #f4433644'}}>❌ False Alarm</button>
                          <button onClick={() => { const n = { text: 'SYSTEM: More information requested from reporter.', time: new Date().toISOString() }; handleAddNote(selectedIncident.id); }} style={{padding: '10px 6px', borderRadius: '8px', border: 'none', background: '#ff980022', color: '#ff9800', fontWeight: 700, fontSize: '12px', cursor: 'pointer', border: '1px solid #ff980044'}}>🔄 Needs Info</button>
                        </div>
                      </div>
                    )}

                    {selectedIncident.status === 'verified' && (
                      <button className="btn-action btn-assign" onClick={() => handleUpdateStatus(selectedIncident.id, 'assigned')} style={{width: '100%', marginBottom: '14px'}}>Assign Responder</button>
                    )}
                    {selectedIncident.status === 'assigned' && (
                      <button className="btn-action btn-resolve" onClick={() => handleUpdateStatus(selectedIncident.id, 'resolved')} style={{width: '100%', marginBottom: '14px'}}>Mark Resolved</button>
                    )}



                    {/* DISPATCH MAP BUTTON */}
                    <a href={`/dispatch/${selectedIncident.id}`} target="_blank" rel="noopener noreferrer" style={{
                      display: 'block', textAlign: 'center', marginTop: '12px', marginBottom: '14px',
                      padding: '12px', borderRadius: '10px', background: 'linear-gradient(135deg, #1a237e, #283593)',
                      color: '#fff', fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                      border: '1px solid rgba(92,107,192,0.5)', letterSpacing: '0.5px',
                    }}>
                      🗺️ Open Dispatch Map — Nearest Hospitals & Units
                    </a>

                    {/* TIMELINE LOGS */}
                    <div style={{fontSize: '11px', color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px'}}>📋 Activity Timeline</div>
                    <div style={{position: 'relative', paddingLeft: '24px', marginBottom: '14px'}}>
                      <div style={{position: 'absolute', left: '8px', top: 0, bottom: 0, width: '2px', background: 'rgba(255,255,255,0.08)'}}></div>
                      {[
                        {icon: '📍', text: `Incident reported — ${selectedIncident.severity} ${selectedIncident.type}`, time: selectedIncident.timestamp ? new Date(selectedIncident.timestamp.toDate()).toLocaleTimeString() : ''},
                        ...(selectedIncident.notes || []).map(n => ({
                          icon: n.text.includes('Dispatched') ? '🚀' : n.text.includes('verified') ? '✅' : n.text.includes('resolved') ? '🏁' : n.text.startsWith('[AI') ? '⚡' : '📝',
                          text: n.text.replace('[AI SYSTEM] ', ''),
                          time: new Date(n.time).toLocaleTimeString()
                        }))
                      ].map((entry, i) => (
                        <div key={i} style={{display: 'flex', gap: '10px', marginBottom: '10px', position: 'relative'}}>
                          <div style={{position: 'absolute', left: '-20px', top: '0px', width: '16px', height: '16px', borderRadius: '50%', background: '#1a1a1a', border: '2px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px'}}>{entry.icon}</div>
                          <div>
                            <div style={{fontSize: '12px', color: '#ddd', lineHeight: '1.4'}}>{entry.text}</div>
                            <div style={{fontSize: '10px', color: '#555', marginTop: '2px'}}>{entry.time}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ADD NOTE */}
                    <form className="log-input-group" onSubmit={(e) => { e.preventDefault(); handleAddNote(selectedIncident.id); }}>
                      <input type="text" placeholder="Add responder note..." value={responderNote} onChange={(e) => setResponderNote(e.target.value)} />
                      <button type="submit">Update</button>
                    </form>
                  </>
                );
              })()
            }

          </div>
        </div>
      )}
    </>
  );
}

