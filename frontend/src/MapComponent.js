import { GoogleMap, LoadScript, Marker, InfoWindow } from "@react-google-maps/api";
import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "./firebase";

const containerStyle = {
  width: "100%",
  height: "100vh"
};

const center = {
  lat: 28.6139,
  lng: 77.2090
};

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);
  var dLon = deg2rad(lon2-lon1);
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

function MapComponent() {
  const [incidents, setIncidents] = useState([]);
  
  // Phase 1: Report Incident Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [incidentType, setIncidentType] = useState('Accident');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('Critical');
  const [location, setLocation] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  
  // Phase 4 & 5 State
  const [filterRadius, setFilterRadius] = useState(5);
  const [userLocation, setUserLocation] = useState(null); 

  // Authority & Action State (Phases 6-10)
  const [isAuthorityMode, setIsAuthorityMode] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [responderNote, setResponderNote] = useState('');

  // REAL-TIME LISTENER
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "incidents"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setIncidents(data);
      // Update selected incident in real-time if it's open
      setSelectedIncident(prev => {
        if (!prev) return null;
        return data.find(i => i.id === prev.id) || null;
      });
    });

    return () => unsubscribe();
  }, []);

  // Fetch true user location for mapping center
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          console.warn("Failed automatic location fetch", err);
          setUserLocation(center); // fallback only if they deny
        }
      );
    } else {
      setUserLocation(center);
    }
  }, []);

  // Handlers
  const handleOpenModal = () => {
    setIsModalOpen(true);
    handleGetLocation();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIncidentType('Accident');
    setDescription('');
    setSeverity('Critical');
    setLocation(null);
    setLocationStatus('');
  };

  const handleGetLocation = () => {
    setLocationStatus('Fetching location...');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLocationStatus('Location acquired successfully!');
        },
        (error) => {
          console.error(error);
          setLocation({ lat: center.lat, lng: center.lng }); 
          setLocationStatus('Failed to get location. Using default center.');
        }
      );
    } else {
      setLocation({ lat: center.lat, lng: center.lng }); 
      setLocationStatus('Geolocation not supported. Using default center.');
    }
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!location) {
      alert("Please wait for location to be acquired.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const audio = new Audio('/indigo.mp3');
      audio.play().catch(e => console.log('Audio autoplay blocked', e));

      await addDoc(collection(db, "incidents"), {
        type: incidentType,
        description: description,
        severity: severity,
        location: location,
        status: "reported",
        timestamp: serverTimestamp(),
        notes: []
      });
      handleCloseModal();
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("Failed to report incident. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const docRef = doc(db, "incidents", id);
      await updateDoc(docRef, { status: newStatus });
    } catch (e) { console.error("Update failed", e); }
  };

  const handleAddNote = async (id) => {
    if (!responderNote.trim()) return;
    try {
      const docRef = doc(db, "incidents", id);
      await updateDoc(docRef, {
        notes: arrayUnion({ text: responderNote, time: new Date().toISOString() })
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
    } catch(e) { console.error("Dispatch Failed", e); }
  };

  const getMarkerIcon = (incidentSeverity) => {
    switch(incidentSeverity) {
      case 'Moderate': return 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
      case 'Low': return 'http://maps.google.com/mapfiles/ms/icons/green-dot.png';
      case 'Critical': 
      default: return 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';
    }
  };

  const getSmartSuggestion = (inc) => {
    if (inc.status === 'resolved') return { text: "Incident resolved successfully.", urgent: false };
    if (inc.status === 'reported') return { text: "🧠 Smart Action: Verify incident credibility immediately.", urgent: inc.severity === 'Critical' };
    if (inc.status === 'verified') return { text: "🧠 Smart Action: Dispatch emergency responder to location.", urgent: inc.severity === 'Critical' };
    if (inc.status === 'assigned') return { text: "🧠 Smart Action: Monitor ground progress and add notes.", urgent: false };
    return { text: "🧠 Smart Action: Review incident.", urgent: false };
  };

  const filteredIncidents = incidents.filter(incident => {
    if (!incident.location || !userLocation) return false;
    const distance = getDistanceFromLatLonInKm(
      userLocation.lat, userLocation.lng,
      incident.location.lat, incident.location.lng
    );
    const radiusLimit = Number(filterRadius) || 5; 
    
    // Check Authority Filters
    const matchesAuthFilter = isAuthorityMode 
      ? (activeFilter === 'All' || incident.status === activeFilter.toLowerCase()) &&
        (typeFilter === 'All' || incident.type === typeFilter) &&
        (severityFilter === 'All' || incident.severity === severityFilter)
      : true;

    return distance <= radiusLimit && matchesAuthFilter;
  });

  const nearbyCritical = incidents.find(inc => {
    if (!inc.location || !userLocation || inc.status === 'resolved' || inc.severity !== 'Critical') return false;
    const dist = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, inc.location.lat, inc.location.lng);
    return dist <= 2; // Critical within 2km logic
  });

  if (!userLocation) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Inter', backgroundColor: '#f5f7fa', color: '#555' }}>
        <h2>📍 Acquiring your location...</h2>
      </div>
    );
  }

  return (
    <>
      {/* 🚨 Proactive Alert Banner (Phase 10) */}
      {nearbyCritical && (
        <div className="critical-banner">
          🚨 DANGER: Critical {nearbyCritical.type} incident reported within 2km of your location!
        </div>
      )}

      {/* Authority Mode Toggle Header */}
      <div className="top-header" style={{ top: nearbyCritical ? '60px' : '20px' }}>
        <button 
          className={`auth-toggle ${isAuthorityMode ? 'active' : ''}`}
          onClick={() => setIsAuthorityMode(!isAuthorityMode)}
        >
          {isAuthorityMode ? '🛡️ Authority Mode Active' : '🧑‍💻 Switch to Authority'}
        </button>
      </div>

      {/* 🧑‍🚒 Authority Dashboard Sidebar (Phase 6) */}
      <div className={`authority-sidebar ${!isAuthorityMode ? 'hidden' : ''}`} style={{ top: nearbyCritical ? '44px' : '0' }}>
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
      </div>

      <LoadScript googleMapsApiKey="AIzaSyDHY9Jn_bwWnHZdn5f_fGjy9J9AKDqupPk">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={userLocation}
          zoom={12}
        >
          {/* MARKERS */}
          {filteredIncidents.map((incident) => {
            return (
              <Marker
                key={incident.id}
                position={{
                  lat: incident.location.lat,
                  lng: incident.location.lng
                }}
                icon={getMarkerIcon(incident.severity)}
                onClick={() => setSelectedIncident(incident)}
              />
            );
          })}
          
          {/* INFO WINDOW (Citizens Only - Click to open) */}
          {selectedIncident && !isAuthorityMode && (
            <InfoWindow
              position={{ lat: selectedIncident.location.lat, lng: selectedIncident.location.lng }}
              onCloseClick={() => setSelectedIncident(null)}
            >
              <div className="info-window">
                <h3>{selectedIncident.type} Incident</h3>
                <p style={{marginBottom: '5px'}}>{selectedIncident.description}</p>
                <div style={{ margin: '8px 0', fontSize: '12px', color: '#555', borderTop: '1px solid #eee', paddingTop: '5px' }}>
                  <strong>Severity:</strong> {selectedIncident.severity}<br/>
                  <strong>Reported:</strong> {selectedIncident.timestamp ? new Date(selectedIncident.timestamp.toDate()).toLocaleTimeString() : 'Just now'}
                </div>
                <span className={`badge badge-${selectedIncident.status || 'reported'}`}>
                  {selectedIncident.status || 'Reported'}
                </span>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </LoadScript>

      {/* FILTER CONTROL PANEL (Authority Only) */}
      {isAuthorityMode && (
        <div className="filter-panel" style={{ top: nearbyCritical ? '60px' : '20px' }}>
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
      )}

      {/* REPORT FAB */}
      <div className="fab-container">
        <button className="report-fab" onClick={handleOpenModal}>
          <span>🚨</span> Report Incident
        </button>
      </div>

      {/* REPORT INCIDENT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') handleCloseModal() }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2>Report Incident</h2>
              <button className="close-btn" onClick={handleCloseModal}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmitReport}>
              <div className="form-group">
                <label>Incident Type</label>
                <select className="form-control" value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
                  <option value="Accident">🚗 Accident</option>
                  <option value="Fire">🔥 Fire</option>
                  <option value="Medical">🏥 Medical Emergency</option>
                  <option value="Hazard">🚧 Road Hazard</option>
                  <option value="Other">⚠️ Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Severity</label>
                <select className="form-control" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  <option value="Critical">🔴 Critical</option>
                  <option value="Moderate">🟡 Moderate</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>

              <div className="form-group">
                <label>Location Status</label>
                <div style={{fontSize: '13px', color: locationStatus.includes('success') ? '#2e7d32' : '#d32f2f'}}>
                  {locationStatus}
                </div>
              </div>

              <button type="submit" className={`submit-btn theme-${incidentType.toLowerCase()}`} disabled={isSubmitting || !location}>
                {isSubmitting ? 'Reporting...' : 'Submit Report'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DETAILED ACTION MODAL (Phases 7,8,9) */}
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

            {/* Smart Suggestions (Phase 9) */}
            {isAuthorityMode && (
              <div className={`smart-suggestion ${getSmartSuggestion(selectedIncident).urgent ? 'urgent' : ''}`}>
                {getSmartSuggestion(selectedIncident).text}
              </div>
            )}

            {/* Lifecycle Buttons (Phase 7) */}
            {isAuthorityMode && selectedIncident.status !== 'resolved' && (
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

            {/* Emergency Dispatch Panel (Phase 11) */}
            {isAuthorityMode && selectedIncident.status !== 'resolved' && (
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

            {/* Responder Logs */}
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

            {isAuthorityMode && selectedIncident.status !== 'resolved' && (
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

export default MapComponent;