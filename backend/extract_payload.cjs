const fs = require('fs');
const { parse } = require('csv-parse');
const path = require('path');

const DATASET_PATH = path.join(__dirname, 'datasets', 'crash_dataset.csv');
const PAYLOAD_SAVE_PATH = path.join(__dirname, '../frontend/public/crashPayload.json');

async function extractPayload() {
  console.log('Extracting a real crash signature from the 97MB CSV dataset...');
  
  const parser = fs.createReadStream(DATASET_PATH).pipe(parse({
    columns: true,
    cast: true
  }));

  for await (const row of parser) {
    if (row.label === 1) {
      console.log('Found a verified crash! Extracting physics signature...');
      // Extract the 7 features
      const features = [
        row.accel_x, row.accel_y, row.accel_z,
        row.gyro_x, row.gyro_y, row.gyro_z,
        row.gps_speed
      ];
      
      // Save it into the frontend's public folder so React can fetch it for the simulation button
      fs.writeFileSync(PAYLOAD_SAVE_PATH, JSON.stringify(features, null, 2));
      console.log(`Saved crash payload to ${PAYLOAD_SAVE_PATH}`);
      console.log('You can now close this script!');
      break;
    }
  }
}

extractPayload().catch(console.error);
