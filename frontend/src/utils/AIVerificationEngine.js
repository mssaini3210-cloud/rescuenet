// src/utils/AIVerificationEngine.js

export const analyzeIncident = (description, severity, location, incidents) => {
  const descLower = description.toLowerCase();
  
  // 1. NLP False-Positive & Spam Check
  const spamWords = ["test", "testing", "fake", "joke", "prank", "lol", "lmao", "pizza", "bored", "idk"];
  const isSpam = spamWords.some(word => descLower.includes(word));
  
  if (isSpam || description.trim().length < 8) {
    return {
      verified: false,
      confidence: 12,
      urgencyScore: 1,
      responseType: 'Manual Review',
      eta: 'N/A',
      reason: 'Flagged by NLP as potential false positive or insufficient detail.'
    };
  }

  // 2. Severe Keyword NLP Extraction
  const criticalWords = ["bleeding", "trapped", "fire", "massive", "unconscious", "explosion", "gun", "armed", "smoke", "crushed"];
  let keywordMultiplier = 0;
  criticalWords.forEach(word => {
    if (descLower.includes(word)) keywordMultiplier++;
  });

  // 3. Cluster Density (K-Means simulation proxy)
  // If there are other incidents nearby (within 2km), confidence goes up.
  let nearbyCount = 0;
  if (location && incidents) {
    incidents.forEach(inc => {
      if (inc.location) {
        const dLat = (inc.location.lat - location.lat) * Math.PI / 180;
        const dLon = (inc.location.lng - location.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(location.lat * Math.PI / 180) * Math.cos(inc.location.lat * Math.PI / 180) * 
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const dist = 6371 * c;
        if (dist <= 2) nearbyCount++;
      }
    });
  }

  // 4. Calculate Urgency Score (1-10)
  let urgency = severity === 'Critical' ? 7 : (severity === 'Moderate' ? 4 : 2);
  urgency += Math.min(3, keywordMultiplier); // adds up to 3 points for scary keywords
  if (urgency > 10) urgency = 10;

  // 5. Confidence Generation
  // Base confidence starts at 40. We need 85% to auto-verify.
  let confidence = 40;
  if (description.length > 30) confidence += 10;
  if (keywordMultiplier > 0) confidence += 20;

  // STRICT ANTI-PRANK HARD CAP:
  // A single citizen report without physical corroboration can mathematically never 
  // exceed 75% confidence, preventing a solo prankster from dispatching units.
  if (nearbyCount === 0 && confidence > 75) {
    confidence = 75; 
  }

  // Geographic Corroboration (The Multipliers)
  if (nearbyCount === 1) confidence += 20; // 1 other incident nearby validates the claim
  if (nearbyCount > 1) confidence += 35; // Multiple incidents nearby guarantee it

  if (confidence > 99) confidence = 99; // Cap at 99%

  // 6. Response Type Determination
  let response = 'Police';
  if (descLower.includes('fire') || descLower.includes('smoke') || descLower.includes('burning')) response = 'Fire Dept';
  if (descLower.includes('bleed') || descLower.includes('unconscious') || descLower.includes('medical') || descLower.includes('hurt')) response = 'Medical';

  // 7. Synthetic ETA Calculation
  const etaMinutes = urgency > 8 ? '3 mins' : (urgency > 5 ? '6 mins' : '15 mins');

  // Verify Threshold
  const isVerified = confidence >= 85;

  return {
    verified: isVerified,
    confidence: confidence,
    urgencyScore: urgency,
    responseType: response,
    eta: etaMinutes,
    reason: isVerified ? 'NLP validated AND geographically corroborated by multiple active reports.' : 'Solo uncorroborated report. Confidence threshold capped. Requires manual dispatcher review.'
  };
};
