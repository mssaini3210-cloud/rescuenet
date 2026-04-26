// src/utils/AIVisionEngine.js
import * as cocossd from '@tensorflow-models/coco-ssd';
import * as mobilenet from '@tensorflow-models/mobilenet';

let cocoModel = null;
let mobilenetModel = null;

export const loadVisionModels = async () => {
  if (!cocoModel) {
    cocoModel = await cocossd.load({ base: 'lite_mobilenet_v2' });
  }
  if (!mobilenetModel) {
    mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 });
  }
  return { cocoModel, mobilenetModel };
};

export const compressAndAnalyzeImage = async (imageFile) => {
  await loadVisionModels();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = async () => {
        // Compress using Canvas (max width 600px)
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        let scaleSize = 1;
        if (img.width > MAX_WIDTH) {
          scaleSize = MAX_WIDTH / img.width;
        }
        canvas.width = img.width * scaleSize;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Base64 highly compressed JPEG (0.6 quality gives good visual retention but small size)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);

        // Analyze image (Wait a brief tick so browser doesn't lock up)
        await new Promise(r => setTimeout(r, 50));
        const cocoPredictions = await cocoModel.detect(img);
        const mobileNetPredictions = await mobilenetModel.classify(img);

        let vehicleCount = 0;
        let personCount = 0;
        const tags = [];
        let isFire = false;

        cocoPredictions.forEach(p => {
          if (p.score > 0.4) {
            if (['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(p.class)) vehicleCount++;
            if (p.class === 'person') personCount++;
          }
        });

        mobileNetPredictions.forEach(p => {
          const className = p.className.toLowerCase();
          if (p.probability > 0.25) {
             if (className.includes('fire') || className.includes('flame') || className.includes('smoke') || className.includes('volcano')) {
                isFire = true;
                tags.push('Fire detected');
             }
             if (className.includes('crash') || className.includes('accident') || className.includes('wreck') || className.includes('ambulance') || className.includes('police')) {
                tags.push('Emergency scene verified');
             }
             if (className.includes('blood') || className.includes('band') || className.includes('hospital')) {
                tags.push('Medical emergency potential');
             }
          }
        });

        if (vehicleCount > 1) tags.push('Multi-vehicle collision');
        else if (vehicleCount === 1) tags.push('Vehicle involved');
        
        if (personCount > 0) tags.push(`${personCount} people visible`);

        // Determine Severity
        let severity = 'Moderate'; // Default
        if (vehicleCount >= 2 || isFire || personCount >= 3) severity = 'Critical';
        else if (vehicleCount === 0 && personCount === 0 && !isFire) severity = 'Low';

        // Determine Involved Count
        let involvedCount = 'Unknown';
        if (personCount === 1) involvedCount = '1 person';
        else if (personCount > 1) involvedCount = 'Multiple people';
        
        // Determine Incident Type
        let type = 'Other';
        if (isFire) type = 'Fire';
        else if (vehicleCount > 0) type = 'Accident';
        else if (personCount > 0) type = 'Medical';

        resolve({
          compressedBase64,
          visionTags: tags,
          inferredSeverity: severity,
          inferredInvolvedCount: involvedCount,
          inferredType: type
        });
      };
      img.onerror = reject;
    };
    reader.readAsDataURL(imageFile);
  });
};
