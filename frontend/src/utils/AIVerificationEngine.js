// src/utils/AIVerificationEngine.js

export const analyzeIncident = (payload, incidents) => {
  const { description = '', severity = 'Moderate', location, tags = [], imageUrl = null } = payload;
  const descLower = description.toLowerCase();
  
  // 1. NLP False-Positive & Spam Check
  const spamWords = ["test", "testing", "fake", "joke", "prank", "lol", "lmao", "pizza", "bored", "idk"];
  const isSpam = spamWords.some(word => descLower.includes(word));
  
  if (isSpam || (description.trim().length < 8 && tags.length === 0 && !imageUrl)) {
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
  const criticalWords = ["bleeding", "trapped", "fire", "massive", "unconscious", "explosion", "gun", "armed", "smoke", "crushed", "accident", "crash", "emergency"];
  let keywordMultiplier = 0;
  criticalWords.forEach(word => {
    if (descLower.includes(word)) keywordMultiplier++;
  });
  tags.forEach(tag => {
    criticalWords.forEach(word => {
      if (tag.toLowerCase().includes(word)) keywordMultiplier++;
    });
  });

  // 3. Cluster Density (K-Means simulation proxy)
  let nearbyCount = 0;
  if (location && incidents) {
    incidents.forEach(inc => {
      if (inc.location && inc.id !== payload.id) {
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
  // Base confidence starts at 40. We need 90% to auto-verify now.
  let confidence = 40;
  if (description.length > 30) confidence += 10;
  if (keywordMultiplier > 0) confidence += 15;
  if (tags.length > 0) confidence += 10;
  if (imageUrl) confidence += 25; // Visual evidence is heavily weighted

  // STRICT ANTI-PRANK HARD CAP:
  // A single citizen report without physical corroboration or visual evidence can mathematically never exceed 75%
  if (nearbyCount === 0 && !imageUrl && confidence > 75) {
    confidence = 75; 
  }

  // Geographic Corroboration (The Multipliers)
  if (nearbyCount === 1) confidence += 15; 
  if (nearbyCount > 1) confidence += 30; 

  if (confidence > 99) confidence = 99; // Cap at 99%

  // 6. Response Type Determination
  let response = 'Police';
  const fullText = descLower + ' ' + tags.join(' ').toLowerCase();
  if (fullText.includes('fire') || fullText.includes('smoke') || fullText.includes('burning')) response = 'Fire Dept';
  if (fullText.includes('bleed') || fullText.includes('unconscious') || fullText.includes('medical') || fullText.includes('hurt')) response = 'Medical';

  // 7. Synthetic ETA Calculation
  const etaMinutes = urgency > 8 ? '3 mins' : (urgency > 5 ? '6 mins' : '15 mins');

  // Verify Threshold - Increased to 90
  const isVerified = confidence >= 90;

  return {
    verified: isVerified,
    confidence: confidence,
    urgencyScore: urgency,
    responseType: response,
    eta: etaMinutes,
    reason: isVerified ? 'High-fidelity data (Images/Tags) or geographic corroboration validated the incident.' : 'Insufficient corroborating evidence or media. Confidence threshold not met. Requires manual dispatcher review.'
  };
};
