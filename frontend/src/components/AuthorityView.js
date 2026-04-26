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
              <span className={`badge badge-${inc.status || 'reported'}`}>{inc.status || 'reported'}</span>
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
            ) : (
              <>
                <div className="modal-header">
                  <h2>{selectedIncident.type} Incident</h2>
                  <button className="close-btn" onClick={() => setSelectedIncident(null)}>&times;</button>
                </div>

                <div style={{marginBottom: '20px'}}>
                  <span className={`badge badge-${selectedIncident.status || 'reported'}`} style={{marginRight: '10px'}}>
                    {selectedIncident.status || 'Reported'}
                  </span>
                  <span style={{fontSize: '13px', color: '#666', fontWeight: 600}}>
                    {selectedIncident.severity} Severity
                  </span>
                  {selectedIncident.aiScore && (
                    <span style={{fontSize: '13px', color: '#ff4b2b', fontWeight: 600, marginLeft: '10px'}}>
                      AI Confidence: {selectedIncident.aiScore * 10}%
                    </span>
                  )}
                </div>

                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#fff' }}><strong>Address:</strong> {selectedIncident.address || 'Location GPS Only'}</p>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                    {selectedIncident.tags && selectedIncident.tags.map(tag => (
                       <span key={tag} style={{ background: 'rgba(255, 75, 43, 0.2)', color: '#ff4b2b', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>{tag}</span>
                    ))}
                  </div>

                  <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#ccc' }}><strong>Involved:</strong> {selectedIncident.involvedCount || 'Unknown'} {selectedIncident.isSafe ? '(Reporter is safe)' : ''}</p>
                  <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#ccc' }}><strong>Description:</strong> {selectedIncident.description}</p>
                  
                  <div style={{ display: 'flex', gap: '15px', fontSize: '12px', color: '#888' }}>
                    <span>🔋 {selectedIncident.battery || 'Unknown'}</span>
                    <span>📶 {selectedIncident.network || 'Unknown'}</span>
                  </div>

                  {selectedIncident.imageUrl && (
                    <div style={{ marginTop: '15px' }}>
                      <strong style={{ fontSize: '13px', color: '#aaa', display: 'block', marginBottom: '5px' }}>Attached Evidence:</strong>
                      <img src={selectedIncident.imageUrl} alt="Incident Evidence" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                    </div>
                  )}
                </div>

                <div className={`smart-suggestion ${getSmartSuggestion(selectedIncident).urgent ? 'urgent' : ''}`}>
                  {getSmartSuggestion(selectedIncident).text}
                </div>

                <div className="action-buttons">
                  {selectedIncident.status === 'reported' && (
                    <button className="btn-action btn-verify" onClick={() => handleUpdateStatus(selectedIncident.id, 'verified')}>
                      Verify Incident
                    </button>
                  )}
                  {selectedIncident.status === 'verified' && (
                    <button className="btn-action btn-assign" onClick={() => handleUpdateStatus(selectedIncident.id, 'assigned')}>
                      Assign Responder
                    </button>
                  )}
                  {selectedIncident.status === 'assigned' && (
                    <button className="btn-action btn-resolve" onClick={() => handleUpdateStatus(selectedIncident.id, 'resolved')}>
                      Mark Resolved
                    </button>
                  )}
                </div>

                <div className="dispatch-panel">
                  <h4>Emergency Dispatch Command</h4>
                  <div className="dispatch-grid">
                    <button className="btn-dispatch bg-police" onClick={() => handleDispatch('Police')}>
                      Police
                    </button>
                    <button className="btn-dispatch bg-ambulance" onClick={() => handleDispatch('Medical')}>
                      Medical
                    </button>
                    <button className="btn-dispatch bg-fire" onClick={() => handleDispatch('Fire Dept')}>
                      Fire Dept
                    </button>
                  </div>
                </div>

                <h4 style={{marginTop: '25px', marginBottom: '10px', fontSize: '15px', color: '#333'}}>Responder Logs</h4>
                <div className="responder-logs">
                  {(!selectedIncident.notes || selectedIncident.notes.length === 0) ? (
                    <p style={{color: '#999', margin: 0, fontSize: '13px'}}>No updates yet.</p>
                  ) : (
                    selectedIncident.notes.map((n, i) => (
                      <div key={i} className="log-item">
                        <span style={{color: '#888', marginRight: '8px', fontSize: '11px'}}>
                          {new Date(n.time).toLocaleTimeString()}
                        </span>
                        {n.text}
                      </div>
                    ))
                  )}
                </div>

                <form 
                  className="log-input-group" 
                  onSubmit={(e) => { e.preventDefault(); handleAddNote(selectedIncident.id); }}
                >
                  <input 
                    type="text" 
                    placeholder="e.g., Ambulance dispatched..."
                    value={responderNote}
                    onChange={(e) => setResponderNote(e.target.value)}
                  />
                  <button type="submit">Update</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
