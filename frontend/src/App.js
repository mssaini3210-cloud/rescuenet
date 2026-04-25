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

function App() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: "AIzaSyDHY9Jn_bwWnHZdn5f_fGjy9J9AKDqupPk"
  });

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Inter', backgroundColor: '#f5f7fa', color: '#555' }}>
        <h2>📍 Initializing Map Engine...</h2>
      </div>
    );
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