import React, { useState } from 'react';
import { GoogleMap, Marker, InfoWindow } from "@react-google-maps/api";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useIncidents } from "../hooks/useIncidents";
import { useGeolocation } from "../hooks/useGeolocation";
import { useCrashDetection } from "../hooks/useCrashDetection";
import { getDistanceFromLatLonInKm, getMarkerIcon, darkMapStyle } from "../utils";
import { analyzeIncident } from "../utils/AIVerificationEngine";

const containerStyle = { width: "100%", height: "100vh" };
const center = { lat: 28.6139, lng: 77.2090 };

export default function CitizenView() {
  const incidents = useIncidents();
  const userLocation = useGeolocation();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reportStep, setReportStep] = useState(1);
  const [incidentType, setIncidentType] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('Critical');
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const [filterRadius, setFilterRadius] = useState(5);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Smart Form States
  const [tags, setTags] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [involvedCount, setInvolvedCount] = useState('1 person');
  const [isSafe, setIsSafe] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);

  const [selectedIncident, setSelectedIncident] = useState(null);

  const { isActive, requestPermissions, deactivate, crashDetected, setCrashDetected, simulateCrashWithPayload } = useCrashDetection();
  const [countdown, setCountdown] = useState(30);

  React.useEffect(() => {
    let timer;
    if (crashDetected) {
      setCountdown(30);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      // Play a loud alarm sound
      const audio = new Audio('/indigo.mp3'); // Fallback if no specific alarm sound
      audio.play().catch(e => console.log('Audio autoplay blocked', e));
    }
    return () => clearInterval(timer);
  }, [crashDetected]);

  React.useEffect(() => {
    if (countdown === 0 && crashDetected) {
      handleAutoSOS();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, crashDetected]);

  const handleAutoSOS = async () => {
    try {
      await addDoc(collection(db, "incidents"), {
        type: 'Accident',
        description: 'AUTO-DETECTED: High G-Force Impact. User unresponsive.',
        severity: 'Critical',
        location: userLocation || center,
        status: 'reported',
        timestamp: serverTimestamp(),
        notes: [{ text: `⚙️ [AI SYSTEM] Crash detected by TensorFlow.js model. User failed to cancel 30-second failsafe. Dispatch immediately.`, time: new Date().toISOString() }],
        aiScore: 10
      });
      alert("SOS SENT AUTOMATICALLY.");
    } catch (error) {
      console.error("SOS failed", error);
    } finally {
      setCrashDetected(false);
    }
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
    handleGetLocation();
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    stopCamera();
    setReportStep(1);
    setIncidentType('');
    setDescription('');
    setSeverity('Critical');
    setTags([]);
    setImageFile(null);
    setIsSafe(false);
    setLocation(null);
    setAddress('');
    setLocationStatus('');
  };

  const fetchAddress = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data && data.display_name) {
        setAddress(data.display_name);
      }
    } catch (e) {
      console.log('Reverse geocoding failed', e);
    }
  };

  const handleGetLocation = () => {
    setLocationStatus('Fetching location...');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          setLocationStatus('Location acquired successfully!');
          fetchAddress(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error(error);
          setLocation(center); 
          setLocationStatus('Failed to get location. Using default center.');
          fetchAddress(center.lat, center.lng);
        }
      );
    } else {
      setLocation(center); 
      setLocationStatus('Geolocation not supported. Using default center.');
      fetchAddress(center.lat, center.lng);
    }
  };

  const getDeviceContext = async () => {
    let batteryLevel = 'Unknown';
    if (navigator.getBattery) {
      try {
        const battery = await navigator.getBattery();
        batteryLevel = `${Math.round(battery.level * 100)}%`;
      } catch (e) {}
    }
    const network = navigator.connection ? navigator.connection.effectiveType : 'Unknown';
    return { battery: batteryLevel, network };
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setIsCameraOpen(true);
      // We need to wait for state update to render video element before assigning stream
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err) {
      console.error("Camera access denied or unavailable", err);
      alert("Could not access the camera. Please check your browser permissions.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setImageFile(file);
        stopCamera();
      }, 'image/jpeg');
    }
  };

  const startRecording = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    // eslint-disable-next-line no-undef
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setDescription(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onerror = (event) => {
      console.error(event.error);
      setIsRecording(false);
    };
    recognition.onend = () => setIsRecording(false);
    recognition.start();
  };

  const handleSubmitReport = async (e) => {
    e?.preventDefault();
    if (!location) {
      alert("Please wait for location to be acquired.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const audio = new Audio('/indigo.mp3');
      audio.play().catch(e => console.log('Audio autoplay blocked', e));

      let finalImageUrl = '';
      if (imageFile) {
        const imageRef = ref(storage, `incidents/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imageRef, imageFile);
        finalImageUrl = await getDownloadURL(imageRef);
      }

      const deviceContext = await getDeviceContext();
      const aiAnalysis = analyzeIncident({
        description,
        severity,
        location,
        tags,
        imageUrl: finalImageUrl,
        deviceContext
      }, incidents);
      const payloadStatus = aiAnalysis.verified ? 'verified' : 'reported';
      const initialNotes = [];
      
      if (aiAnalysis.verified) {
        initialNotes.push({
          text: `[AI SYSTEM] Auto-Verified (Confidence: ${aiAnalysis.confidence}%). Urgency: ${aiAnalysis.urgencyScore}/10. Priority dispatch requested for ${aiAnalysis.responseType}. Est. ETA: ${aiAnalysis.eta}`,
          time: new Date().toISOString()
        });
      }

      await addDoc(collection(db, "incidents"), {
        type: incidentType,
        description: description,
        severity: severity,
        location: location,
        address: address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
        tags: tags,
        involvedCount: involvedCount,
        isSafe: isSafe,
        imageUrl: finalImageUrl,
        battery: deviceContext.battery,
        network: deviceContext.network,
        status: payloadStatus,
        timestamp: serverTimestamp(),
        notes: initialNotes,
        aiScore: aiAnalysis.urgencyScore
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

  // Filter nearby incidents for the map (default 5km radius for view)
  const nearbyIncidents = incidents.filter(incident => {
    if (!incident.location) return false;
    const distance = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, incident.location.lat, incident.location.lng);
    return distance <= filterRadius;
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
          CRITICAL ALERT: Critical {nearbyCritical.type} incident reported within 2km of your location!
        </div>
      )}

      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        style={{
          position: 'absolute',
          top: '80px',
          left: isSidebarOpen ? '370px' : '20px',
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

      <div className={`citizen-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`}>
        <h2>Nearby Emergencies</h2>
        {nearbyIncidents.length === 0 ? (
          <p style={{color: '#666', fontSize: '14px'}}>No active incidents within a {filterRadius}km radius. Stay safe!</p>
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

      <GoogleMap mapContainerStyle={containerStyle} center={userLocation} zoom={12} options={{ styles: darkMapStyle, disableDefaultUI: true }}>
        {nearbyIncidents.map((incident) => (
          <Marker
            key={incident.id}
            position={{ lat: incident.location.lat, lng: incident.location.lng }}
            icon={getMarkerIcon(incident.type, incident.severity)}
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

      <div className="filter-panel" style={{ top: '80px' }}>
        <h4>Incident Proximity</h4>
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

      <div className="fab-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
        {!isActive ? (
          <button className="report-fab" style={{ backgroundColor: '#2196F3' }} onClick={requestPermissions}>
            <span>🛡️</span> Enable AI Crash Detection
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="report-fab" style={{ backgroundColor: '#f44336' }} onClick={simulateCrashWithPayload}>
              <span>💥</span> Simulate Crash
            </button>
            <button className="report-fab" style={{ backgroundColor: '#999', width: 'auto' }} onClick={deactivate}>
              <span>🛑</span> Turn Off AI
            </button>
          </div>
        )}
        <button className="report-fab" onClick={handleOpenModal}>
          <span>🚨</span> Report Incident
        </button>
      </div>

      {crashDetected && (
        <div className="crash-modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
          backgroundColor: 'rgba(255, 0, 0, 0.95)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          animation: 'flashRed 1s infinite alternate'
        }}>
          <h1 style={{ fontSize: '4rem', color: 'white', margin: 0 }}>CRASH DETECTED</h1>
          <h2 style={{ fontSize: '2rem', color: 'white', marginBottom: '40px' }}>CALLING AMBULANCE IN</h2>
          <div style={{ fontSize: '8rem', fontWeight: 'bold', color: 'white', marginBottom: '50px' }}>
            0:{countdown.toString().padStart(2, '0')}
          </div>
          
          <div style={{ display: 'flex', gap: '20px' }}>
            <button onClick={() => setCrashDetected(false)} style={{
              padding: '20px 40px', fontSize: '1.5rem', backgroundColor: '#4CAF50', 
              color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold'
            }}>
              I AM SAFE (CANCEL)
            </button>
            <button onClick={handleAutoSOS} style={{
              padding: '20px 40px', fontSize: '1.5rem', backgroundColor: '#000', 
              color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold'
            }}>
              SEND SOS NOW
            </button>
          </div>
          
          <style>
            {`
              @keyframes flashRed {
                0% { backgroundColor: rgba(220, 0, 0, 0.95); }
                100% { backgroundColor: rgba(255, 50, 50, 0.95); }
              }
            `}
          </style>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') handleCloseModal() }}>
          <div className="smart-modal-content">
            <div className="modal-header">
              <h2>Report Emergency</h2>
              <button className="close-btn" onClick={handleCloseModal}>&times;</button>
            </div>
            
            {reportStep === 1 && (
              <div className="step-container">
                <h3>What is the emergency?</h3>
                <div className="type-grid">
                  {['Accident', 'Fire', 'Medical', 'Hazard', 'Other'].map(type => (
                    <button 
                      key={type} 
                      className={`type-btn ${incidentType === type ? 'selected' : ''}`}
                      onClick={() => {
                        setIncidentType(type);
                        setReportStep(2);
                      }}
                    >
                      <div className="icon">
                        {type === 'Accident' ? '🚗' : type === 'Fire' ? '🔥' : type === 'Medical' ? '🩹' : type === 'Hazard' ? '⚠️' : '❓'}
                      </div>
                      <span>{type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {reportStep === 2 && (
              <div className="step-container">
                <h3>Severity & Context</h3>
                <div className="severity-grid">
                   <button className={`sev-btn critical ${severity === 'Critical' ? 'active' : ''}`} onClick={() => setSeverity('Critical')}>Critical</button>
                   <button className={`sev-btn moderate ${severity === 'Moderate' ? 'active' : ''}`} onClick={() => setSeverity('Moderate')}>Moderate</button>
                   <button className={`sev-btn low ${severity === 'Low' ? 'active' : ''}`} onClick={() => setSeverity('Low')}>Low</button>
                </div>
                
                {(incidentType === 'Accident' || incidentType === 'Medical') && (
                  <div style={{ marginTop: '20px' }}>
                    <h4>People Involved:</h4>
                    <div className="people-grid">
                      {['1 person', '2-3 people', 'Multiple people'].map(count => (
                        <button key={count} className={`count-btn ${involvedCount === count ? 'active' : ''}`} onClick={() => setInvolvedCount(count)}>
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between' }}>
                  <button className="nav-btn secondary" onClick={() => setReportStep(1)}>Back</button>
                  <button className="nav-btn primary" onClick={() => setReportStep(3)}>Next: Evidence</button>
                </div>
              </div>
            )}

            {reportStep === 3 && (
              <div className="step-container">
                <h3>Smart Evidence Collection</h3>
                <div className="evidence-section">
                  <button 
                    className={`mic-btn ${isRecording ? 'recording' : ''}`} 
                    onMouseDown={startRecording}
                  >
                    {isRecording ? 'Listening...' : '🎤 Tap to Speak Details'}
                  </button>
                  <textarea 
                    className="smart-textarea" 
                    placeholder="Or type details here..." 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                  />
                </div>

                <div className="tags-section">
                  <h4>Quick Tags (Tap to add):</h4>
                  <div className="tags-grid">
                    {['High speed impact', 'Vehicle rollover', 'Pedestrian hit', 'Unconscious', 'Bleeding heavily', 'Fire spreading'].map(tag => (
                      <button 
                        key={tag} 
                        className={`tag-chip ${tags.includes(tag) ? 'active' : ''}`}
                        onClick={() => {
                          if (tags.includes(tag)) setTags(tags.filter(t => t !== tag));
                          else setTags([...tags, tag]);
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="upload-section" style={{marginTop: '20px'}}>
                  {isCameraOpen ? (
                    <div className="camera-container" style={{position: 'relative', borderRadius: '12px', overflow: 'hidden', marginBottom: '10px', background: '#000'}}>
                      <video ref={videoRef} autoPlay playsInline style={{width: '100%', maxHeight: '300px', objectFit: 'cover'}}></video>
                      <button type="button" onClick={capturePhoto} style={{position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', padding: '15px 30px', borderRadius: '30px', border: 'none', background: '#ff4b2b', color: '#fff', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.5)'}}>
                        📸 SNAP
                      </button>
                      <button type="button" onClick={stopCamera} style={{position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        &times;
                      </button>
                    </div>
                  ) : (
                    <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                      <button type="button" onClick={startCamera} className="upload-btn" style={{flex: 1, textAlign: 'center'}}>
                        📸 Take Photo
                      </button>
                      <label className="upload-btn" style={{flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.05)', color: '#ccc', borderColor: 'rgba(255,255,255,0.2)'}}>
                        📁 Upload Photo
                        <input type="file" accept="image/*" style={{display: 'none'}} onChange={(e) => {
                          if (e.target.files[0]) setImageFile(e.target.files[0]);
                        }} />
                      </label>
                    </div>
                  )}
                  {imageFile && <div style={{width: '100%', marginTop: '10px', fontSize: '13px', color: '#81c784', textAlign: 'center', fontWeight: '500'}}>✓ Attached: {imageFile.name}</div>}
                </div>

                <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between' }}>
                  <button className="nav-btn secondary" onClick={() => setReportStep(2)}>Back</button>
                  <button className="nav-btn primary" onClick={() => setReportStep(4)}>Review</button>
                </div>
              </div>
            )}

            {reportStep === 4 && (
              <div className="step-container">
                <h3>Final Review</h3>
                <div className="review-card">
                  <p><strong>Type:</strong> {incidentType} ({severity})</p>
                  <p><strong>Involved:</strong> {involvedCount}</p>
                  <p><strong>Tags:</strong> {tags.length > 0 ? tags.join(', ') : 'None'}</p>
                  <p><strong>Description:</strong> {description || 'None'}</p>
                  <p><strong>Location:</strong> {address || locationStatus}</p>
                  
                  <div style={{marginTop: '15px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <input type="checkbox" id="safe-check" checked={isSafe} onChange={e => setIsSafe(e.target.checked)} style={{width: '20px', height: '20px'}}/>
                    <label htmlFor="safe-check" style={{fontSize: '16px', fontWeight: '500'}}>I am currently safe.</label>
                  </div>
                </div>

                <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between' }}>
                  <button className="nav-btn secondary" onClick={() => setReportStep(3)}>Back</button>
                  <button className="nav-btn submit" onClick={handleSubmitReport} disabled={isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'SEND SOS NOW'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
