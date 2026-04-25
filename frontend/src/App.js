import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import CitizenView from "./components/CitizenView";
import AuthorityView from "./components/AuthorityView";
import { useJsApiLoader } from "@react-google-maps/api";
import "./App.css";

function NavigationBar() {
  const location = useLocation();
  return (
    <div className="global-nav">
      <Link to="/" className={location.pathname === '/' ? 'active' : ''}>🧑‍💻 Citizen View</Link>
      <Link to="/authority" className={location.pathname === '/authority' ? 'active' : ''}>🛡️ Command Center</Link>
    </div>
  );
}

function SplashScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      height: '100vh', backgroundColor: '#0a0a0a', color: '#fff', fontFamily: 'Inter'
    }}>
      <img 
        src="/logo_final.png" 
        alt="RescueNet Logo" 
        style={{ width: '250px', marginBottom: '20px', animation: 'pulseLogo 2s infinite' }} 
      />
      <h3 style={{ fontWeight: 500, letterSpacing: '2px', color: '#888' }}>INITIALIZING COMMAND CENTER</h3>
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

function App() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: "AIzaSyDHY9Jn_bwWnHZdn5f_fGjy9J9AKDqupPk"
  });

  if (!isLoaded) {
    return <SplashScreen />;
  }

  return (
    <Router>
      <NavigationBar />
      <Routes>
        <Route path="/" element={<CitizenView />} />
        <Route path="/authority" element={<AuthorityView />} />
      </Routes>
    </Router>
  );
}

export default App;