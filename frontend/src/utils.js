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

export const getMarkerIcon = (incidentType, incidentSeverity) => {
  let color = '#ef5350'; // default Critical
  if (incidentSeverity === 'Moderate') color = '#ffa726';
  if (incidentSeverity === 'Low') color = '#66bb6a';

  let path = '';
  switch(incidentType) {
    case 'Fire':
      path = 'M11.66 2.37c-.12-.19-.36-.28-.58-.19-.22.09-.37.31-.38.54C10.59 4.35 9.21 6.55 7.6 8.52c-2.14 2.61-3.6 5.56-3.6 8.48 0 4.42 3.58 8 8 8s8-3.58 8-8c0-3.32-2-6.53-4.88-9.01-.17-.15-.43-.16-.62-.03-.18.13-.26.35-.19.57.73 2.15.54 4.19-.55 5.57-.46.58-1.13.88-1.78.88-1.02 0-1.92-.68-2.33-1.68-.31-.76-.36-1.57-.14-2.34.1-.34.25-.69.45-1.03.11-.18.15-.39.11-.59l-.41-1.96z';
      break;
    case 'Medical':
      path = 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z';
      break;
    case 'Accident':
      path = 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z';
      break;
    case 'Hazard':
      path = 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z';
      break;
    default:
      path = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';
      break;
  }

  const svg = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" fill="${color}" stroke="#ffffff" stroke-width="2"/>
    <path fill="#ffffff" transform="translate(8, 8) scale(1)" d="${path}"/>
  </svg>`;

  return \`data:image/svg+xml;charset=UTF-8,\${encodeURIComponent(svg)}\`;
};

export const getSmartSuggestion = (inc) => {
  if (inc.status === 'resolved') return { text: "Incident resolved successfully.", urgent: false };
  if (inc.status === 'reported') return { text: "🧠 Smart Action: Verify incident credibility immediately.", urgent: inc.severity === 'Critical' };
  if (inc.status === 'verified') return { text: "🧠 Smart Action: Dispatch emergency responder to location.", urgent: inc.severity === 'Critical' };
  if (inc.status === 'assigned') return { text: "🧠 Smart Action: Monitor ground progress and add notes.", urgent: false };
  return { text: "🧠 Smart Action: Review incident.", urgent: false };
};

export const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "poi.park", elementType: "labels.text.stroke", stylers: [{ color: "#1b1b1b" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#4e4e4e" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] }
];
