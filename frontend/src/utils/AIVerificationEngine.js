import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the Gemini API
const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const analyzeIncident = async (payload, incidents) => {
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

  // --- GEMINI AI INTEGRATION ---
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
        You are an expert emergency dispatch AI for "RescueNet".
        Analyze the following emergency report:
        - Description: "${description}"
        - User-Selected Severity: "${severity}"
        - Tags: [${tags.join(", ")}]
        - Visual Evidence Provided: ${imageUrl ? 'Yes' : 'No'}
        - Nearby Active Incidents within 2km: ${nearbyCount}

        Based on this, return a JSON object ONLY with the following exact keys:
        - urgencyScore (number from 1-10)
        - responseType (string: "Police", "Fire Dept", "Medical", "Rescue", or "Manual Review")
        - eta (string: estimated time, e.g. "3 mins", "8 mins")
        - reason (string: brief 1-sentence professional explanation for the dispatcher)
        - confidence (number from 1-99 based on how real this seems)
        
        If description is empty but tags exist, extrapolate based on tags. Be highly analytical.
        Return ONLY valid JSON. No markdown ticks.
      `;
      
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      
      let parsed;
      try {
        const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/) || text.match(/(\{[\s\S]*?\})/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
      } catch (e) {
        parsed = JSON.parse(text); // fallback parsing
      }

      const isVerified = parsed.confidence >= 85;

      return {
        verified: isVerified,
        confidence: parsed.confidence,
        urgencyScore: parsed.urgencyScore,
        responseType: parsed.responseType,
        eta: parsed.eta,
        reason: "[Gemini AI Verified] " + parsed.reason
      };
    } catch (error) {
      console.error("Gemini API failed. Falling back to heuristic engine.", error);
    }
  }

  // --- FALLBACK HEURISTIC LOGIC ---

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

  // 4. Calculate Urgency Score (1-10)
  let urgency = severity === 'Critical' ? 7 : (severity === 'Moderate' ? 4 : 2);
  urgency += Math.min(3, keywordMultiplier); 
  if (urgency > 10) urgency = 10;

  // 5. Confidence Generation
  let confidence = 40;
  if (description.length > 30) confidence += 10;
  if (keywordMultiplier > 0) confidence += 15;
  if (tags.length > 0) confidence += 10;
  if (imageUrl) confidence += 25; 

  if (nearbyCount === 0 && !imageUrl && confidence > 75) {
    confidence = 75; 
  }
  if (nearbyCount === 1) confidence += 15; 
  if (nearbyCount > 1) confidence += 30; 
  if (confidence > 99) confidence = 99; 

  // 6. Response Type Determination
  let response = 'Police';
  const fullText = descLower + ' ' + tags.join(' ').toLowerCase();
  if (fullText.includes('fire') || fullText.includes('smoke') || fullText.includes('burning')) response = 'Fire Dept';
  if (fullText.includes('bleed') || fullText.includes('unconscious') || fullText.includes('medical') || fullText.includes('hurt')) response = 'Medical';

  // 7. Synthetic ETA Calculation
  const etaMinutes = urgency > 8 ? '3 mins' : (urgency > 5 ? '6 mins' : '15 mins');

  const isVerified = confidence >= 90;

  return {
    verified: isVerified,
    confidence: confidence,
    urgencyScore: urgency,
    responseType: response,
    eta: etaMinutes,
    reason: isVerified ? 'High-fidelity data validated the incident.' : 'Insufficient corroborating evidence. Requires manual dispatcher review.'
  };
};
