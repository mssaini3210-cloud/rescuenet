import { listenToIncidents, addIncident } from "./incidents.js";

// listen for live updates
listenToIncidents((data) => {
  console.log("LIVE INCIDENTS:", data);
});

// add new data after 3 seconds
setTimeout(async () => {
  await addIncident({
    type: "accident",
    severity: "high",
    description: "Real-time crash test",
    location: { lat: 30.7, lng: 76.7 },
    status: "active",
    timestamp: new Date()
  });

  console.log("New incident added");
}, 3000);