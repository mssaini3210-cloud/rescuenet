import React, { useState } from 'react';
import { GoogleMap, LoadScript, Marker, InfoWindow } from "@react-google-maps/api";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useIncidents } from "../hooks/useIncidents";
import { useGeolocation } from "../hooks/useGeolocation";
import { getDistanceFromLatLonInKm, getMarkerIcon } from "../utils";

const containerStyle = { width: "100%", height: "100vh" };
const center = { lat: 28.6139, lng: 77.2090 };

export default function CitizenView() {
  const incidents = useIncidents();
  const userLocation = useGeolocation();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [incidentType, setIncidentType] = useState('Accident');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('Critical');
  const [location, setLocation] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  
  const [selectedIncident, setSelectedIncident] = useState(null);

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
          setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          setLocationStatus('Location acquired successfully!');
        },
        (error) => {
          console.error(error);
          setLocation(center); 
          setLocationStatus('Failed to get location. Using default center.');
        }
      );
    } else {
      setLocation(center); 
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

  if (!userLocation) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Inter', backgroundColor: '#f5f7fa', color: '#555' }}>
        <h2>📍 Acquiring your location...</h2>
      </div>
    );
  }

  // Filter nearby incidents for the map (default 5km radius for view)
  const nearbyIncidents = incidents.filter(incident => {
    if (!incident.location) return false;
    const distance = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, incident.location.lat, incident.location.lng);
    return distance <= 5;
  });

  const nearbyCritical = incidents.find(inc => {
    if (!inc.location || inc.status === 'resolved' || inc.severity !== 'Critical') return false;
    const dist = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, inc.location.lat, inc.location.lng);
    return dist <= 2;
  });

  return (
    <>
      {nearbyCritical && (
        <div className="critical-banner" style={{ top: '60px' }}>
          🚨 DANGER: Critical {nearbyCritical.type} incident reported within 2km of your location!
        </div>
      )}

      <div className="citizen-sidebar">
        <h2>📍 Nearby Emergencies</h2>
        {nearbyIncidents.length === 0 ? (
          <p style={{color: '#666', fontSize: '14px'}}>No active incidents within a 5km radius. Stay safe!</p>
        ) : null}
        
        <div className="sidebar-list">
          {nearbyIncidents.map(inc => (
            <div key={inc.id} className={`incident-card sidebar-border-${inc.severity}`} onClick={() => setSelectedIncident(inc)}>
              <h4>{inc.type} Incident</h4>
              <p>{inc.description.substring(0, 40)}...</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`badge badge-${inc.status || 'reported'}`}>{inc.status || 'reported'}</span>
                <span style={{ fontSize: '12px', color: '#888', fontWeight: '500' }}>
                  {getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, inc.location.lat, inc.location.lng).toFixed(1)} km away
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <GoogleMap mapContainerStyle={containerStyle} center={userLocation} zoom={12}>
        {nearbyIncidents.map((incident) => (
          <Marker
            key={incident.id}
            position={{ lat: incident.location.lat, lng: incident.location.lng }}
            icon={getMarkerIcon(incident.severity)}
            onClick={() => setSelectedIncident(incident)}
          />
        ))}
        
        {selectedIncident && (
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

      <div className="fab-container">
        <button className="report-fab" onClick={handleOpenModal}>
          <span>🚨</span> Report Incident
        </button>
      </div>

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
    </>
  );
}
