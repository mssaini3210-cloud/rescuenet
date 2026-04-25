import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import CitizenView from "./components/CitizenView";
import AuthorityView from "./components/AuthorityView";
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