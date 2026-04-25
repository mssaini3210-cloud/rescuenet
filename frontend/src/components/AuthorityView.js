import React, { useState, useMemo } from 'react';
import { GoogleMap, Marker, Circle } from "@react-google-maps/api";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import { useIncidents } from "../hooks/useIncidents";
import { useGeolocation } from "../hooks/useGeolocation";
import { getDistanceFromLatLonInKm, getMarkerIcon, getSmartSuggestion } from "../utils";

const containerStyle = { width: "100%", height: "100vh" };

function kMeans(data, k, maxIterations = 50) {
  if (data.length === 0) return [];
  if (data.length <= k) return data.map(p => ({ lat: p.lat, lng: p.lng, weight: 1 }));

  let centroids = data.slice(0, k).map(p => ({ lat: p.lat, lng: p.lng }));
  let clusters = [];

  for (let iter = 0; iter < maxIterations; iter++) {
    clusters = Array.from({length: k}, () => []);
    
    data.forEach(point => {
      let minDist = Infinity;
      let clusterIndex = 0;
      centroids.forEach((centroid, i) => {
        const dist = Math.sqrt(Math.pow(point.lat - centroid.lat, 2) + Math.pow(point.lng - centroid.lng, 2));
        if (dist < minDist) {
          minDist = dist;
          clusterIndex = i;
        }
      });
      clusters[clusterIndex].push(point);
    });
    
    let changed = false;
    clusters.forEach((cluster, i) => {
      if (cluster.length > 0) {
        const newLat = cluster.reduce((sum, p) => sum + p.lat, 0) / cluster.length;
        const newLng = cluster.reduce((sum, p) => sum + p.lng, 0) / cluster.length;
        if (Math.abs(centroids[i].lat - newLat) > 0.0001 || Math.abs(centroids[i].lng - newLng) > 0.0001) {
          changed = true;
        }
        centroids[i] = { lat: newLat, lng: newLng };
      }
    });
    
    if (!changed) break;
  }
  
  return centroids.map((c, i) => ({ ...c, weight: clusters[i].length })).filter(c => c.weight > 0);
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

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const docRef = doc(db, "incidents", id);
      await updateDoc(docRef, { status: newStatus });
      setSelectedIncident(prev => prev && prev.id === id ? { ...prev, status: newStatus } : prev);
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
    if (!isPredictiveMode || filteredIncidents.length === 0) return [];
    const points = filteredIncidents.filter(inc => inc.location).map(inc => inc.location);
    const optimalK = Math.min(5, Math.ceil(points.length / 3)); 
    return kMeans(points, optimalK);
  }, [isPredictiveMode, filteredIncidents]);

  if (!userLocation) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Inter', backgroundColor: '#f5f7fa', color: '#555' }}>
        <h2>📍 Acquiring your location...</h2>
      </div>
    );
  }

  return (
    <>
      <div className="authority-sidebar" style={{ top: '60px' }}>
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
            <span style={{fontSize: '16px'}}>🧠</span> Predictive Threat Map
          </button>
        </div>
      </div>

      <GoogleMap mapContainerStyle={containerStyle} center={userLocation} zoom={12}>
          {filteredIncidents.map((incident) => (
            <Marker
              key={incident.id}
              position={{ lat: incident.location.lat, lng: incident.location.lng }}
              icon={getMarkerIcon(incident.severity)}
              onClick={() => setSelectedIncident(incident)}
            />
          ))}
          
          {isPredictiveMode && clusterCentroids.map((cluster, i) => (
            <Circle
              key={`cluster-${i}`}
              center={{ lat: cluster.lat, lng: cluster.lng }}
              radius={(cluster.weight * 300) + 500} 
              options={{
                fillColor: "#ff4b2b",
                fillOpacity: 0.35,
                strokeColor: "#ff4b2b",
                strokeOpacity: 0.8,
                strokeWeight: 2,
              }}
            />
          ))}
        </GoogleMap>

      <div className="filter-panel" style={{ top: '80px' }}>
        <h4>📡 Local Incidents</h4>
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
          <div className="modal-content" style={{maxWidth: '500px'}}>
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
            </div>

            <p style={{fontSize: '15px'}}>{selectedIncident.description}</p>

            <div className={`smart-suggestion ${getSmartSuggestion(selectedIncident).urgent ? 'urgent' : ''}`}>
              {getSmartSuggestion(selectedIncident).text}
            </div>

            {selectedIncident.status !== 'resolved' && (
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
            )}

            {selectedIncident.status !== 'resolved' && (
              <div className="dispatch-panel">
                <h4>🚨 Emergency Dispatch Command</h4>
                <div className="dispatch-grid">
                  <button className="btn-dispatch bg-police" onClick={() => handleDispatch('Police')}>
                    <span>🚓</span> Police
                  </button>
                  <button className="btn-dispatch bg-ambulance" onClick={() => handleDispatch('Medical')}>
                    <span>🚑</span> Medical
                  </button>
                  <button className="btn-dispatch bg-fire" onClick={() => handleDispatch('Fire Dept')}>
                    <span>🚒</span> Fire
                  </button>
                </div>
              </div>
            )}

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

            {selectedIncident.status !== 'resolved' && (
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
            )}
          </div>
        </div>
      )}
    </>
  );
}
