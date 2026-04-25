export function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
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

export function deg2rad(deg) {
  return deg * (Math.PI/180);
}

export const getMarkerIcon = (incidentSeverity) => {
  switch(incidentSeverity) {
    case 'Moderate': return 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
    case 'Low': return 'http://maps.google.com/mapfiles/ms/icons/green-dot.png';
    case 'Critical': 
    default: return 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';
  }
};

export const getSmartSuggestion = (inc) => {
  if (inc.status === 'resolved') return { text: "Incident resolved successfully.", urgent: false };
  if (inc.status === 'reported') return { text: "🧠 Smart Action: Verify incident credibility immediately.", urgent: inc.severity === 'Critical' };
  if (inc.status === 'verified') return { text: "🧠 Smart Action: Dispatch emergency responder to location.", urgent: inc.severity === 'Critical' };
  if (inc.status === 'assigned') return { text: "🧠 Smart Action: Monitor ground progress and add notes.", urgent: false };
  return { text: "🧠 Smart Action: Review incident.", urgent: false };
};
