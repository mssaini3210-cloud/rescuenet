import { GoogleMap, LoadScript, Marker, InfoWindow } from "@react-google-maps/api";
import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
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
  const [userLocation, setUserLocation] = useState(null); // start null to prevent New Delhi flash
  
  // Hovered Incident state
  const [hoveredIncident, setHoveredIncident] = useState(null);

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

  // Modal & Location Handlers
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
          setLocation({ lat: center.lat, lng: center.lng }); // fallback to center
          setLocationStatus('Failed to get location. Using default center.');
        }
      );
    } else {
      setLocation({ lat: center.lat, lng: center.lng }); // fallback
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
      // Play Easter Egg Audio
      const audio = new Audio('/indigo.mp3');
      audio.play().catch(e => console.log('Audio autoplay blocked', e));

      await addDoc(collection(db, "incidents"), {
        type: incidentType,
        description: description,
        severity: severity,
        location: location,
        status: "reported",
        timestamp: serverTimestamp()
      });
      handleCloseModal();
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("Failed to report incident. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMarkerIcon = (incidentSeverity) => {
    switch(incidentSeverity) {
      case 'Moderate': return 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
      case 'Low': return 'http://maps.google.com/mapfiles/ms/icons/green-dot.png';
      case 'Critical': 
      default: return 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';
    }
  };

  const filteredIncidents = incidents.filter(incident => {
    if (!incident.location || !userLocation) return false;
    const distance = getDistanceFromLatLonInKm(
      userLocation.lat, userLocation.lng,
      incident.location.lat, incident.location.lng
    );
    const radiusLimit = Number(filterRadius) || 5; // Fallback if input is cleared
    return distance <= radiusLimit;
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
                onMouseOver={() => setHoveredIncident(incident)}
                onMouseOut={() => setHoveredIncident(null)}
              />
            );
          })}
          
          {/* HOVER INFO WINDOW */}
          {hoveredIncident && (
            <InfoWindow
              position={{
                lat: hoveredIncident.location.lat,
                lng: hoveredIncident.location.lng
              }}
              options={{ disableAutoPan: true }}
            >
              <div className="info-window" onMouseOver={() => setHoveredIncident(hoveredIncident)} onMouseOut={() => setHoveredIncident(null)}>
                <h3>
                  {hoveredIncident.type === 'Fire' ? '🔥' : 
                   hoveredIncident.type === 'Accident' ? '🚗' : 
                   hoveredIncident.type === 'Medical' ? '🏥' : 
                   hoveredIncident.type === 'Hazard' ? '🚧' : '⚠️'} {hoveredIncident.type}
                </h3>
                <p>{hoveredIncident.description}</p>
                <span className={`badge badge-${hoveredIncident.status || 'reported'}`}>
                  {hoveredIncident.status || 'Reported'}
                </span>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </LoadScript>

      {/* FILTER CONTROL PANEL */}
      <div className="filter-panel">
        <h4>📡 Local Incidents</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
          <input 
            type="number" 
            min="1" max="50" 
            value={filterRadius} 
            onChange={(e) => {
              let val = parseInt(e.target.value);
              if (isNaN(val)) setFilterRadius('');
              else if (val > 50) setFilterRadius(50); // Performance boundary
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

      {/* FAB */}
      <div className="fab-container">
        <button className="report-fab" onClick={handleOpenModal}>
          <span>🚨</span> Report Incident
        </button>
      </div>

      {/* Modal */}
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
                <select 
                  className="form-control" 
                  value={incidentType} 
                  onChange={(e) => setIncidentType(e.target.value)}
                >
                  <option value="Accident">🚗 Accident</option>
                  <option value="Fire">🔥 Fire</option>
                  <option value="Medical">🏥 Medical Emergency</option>
                  <option value="Hazard">🚧 Road Hazard</option>
                  <option value="Other">⚠️ Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Severity</label>
                <select 
                  className="form-control" 
                  value={severity} 
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="Critical">🔴 Critical</option>
                  <option value="Moderate">🟡 Moderate</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea 
                  className="form-control" 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the situation briefly..."
                  required
                />
              </div>

              <div className="form-group">
                <label>Location Update</label>
                <div className={`location-status ${locationStatus.includes('success') ? 'success' : locationStatus.includes('Fetching') ? '' : 'error'}`}>
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

export default MapComponent;