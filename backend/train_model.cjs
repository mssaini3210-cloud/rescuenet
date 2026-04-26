const tf = require('@tensorflow/tfjs');
// Ensure tfjs-node is required to build the C++ bindings and enable saving to disk natively
require('@tensorflow/tfjs-node');
const fs = require('fs');
const { parse } = require('csv-parse');
const path = require('path');

const DATASET_PATH = path.join(__dirname, 'datasets', 'crash_dataset.csv');
const MODEL_SAVE_DIR = path.join(__dirname, '../frontend/public/crash-model');
const PAYLOAD_SAVE_PATH = path.join(__dirname, '../frontend/src/crashPayload.json');

async function trainModel() {
  console.log('Loading dataset from CSV...');
  
  const xs = [];
  const ys = [];
  
  let crashExampleFound = false;

  const parser = fs.createReadStream(DATASET_PATH).pipe(parse({
    columns: true,
    cast: true
  }));

  let rowCount = 0;
  let crashCount = 0;
  let normalCount = 0;
  
  // We will balance the dataset so it trains quickly and correctly
  const MAX_SAMPLES_PER_CLASS = 5000;

  for await (const row of parser) {
    const label = row.label;
    
    // Feature array: [accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, gps_speed]
    const features = [
      row.accel_x, row.accel_y, row.accel_z,
      row.gyro_x, row.gyro_y, row.gyro_z,
      row.gps_speed
    ];

    // Save one crash payload to inject into the React App for the demo!
    if (label === 1 && !crashExampleFound) {
      console.log('Found a real crash! Extracting for UI simulation payload...');
      // We simulate a 3-second window (approx 50 samples) of crashing
      // For simplicity in the payload, we just save this row as the trigger
      fs.writeFileSync(PAYLOAD_SAVE_PATH, JSON.stringify(features, null, 2));
      crashExampleFound = true;
    }

    if (label === 1 && crashCount < MAX_SAMPLES_PER_CLASS) {
      xs.push(features);
      ys.push([1]);
      crashCount++;
    } else if (label === 0 && normalCount < MAX_SAMPLES_PER_CLASS) {
      xs.push(features);
      ys.push([0]);
      normalCount++;
    }

    rowCount++;
    if (crashCount >= MAX_SAMPLES_PER_CLASS && normalCount >= MAX_SAMPLES_PER_CLASS) {
      break; // We have enough balanced data for a PoC!
    }
  }

  console.log(`Finished reading. Balanced dataset: ${crashCount} crashes, ${normalCount} normal.`);

  // Convert to Tensors
  const xTensor = tf.tensor2d(xs);
  const yTensor = tf.tensor2d(ys);

  // Build a Simple Neural Network (Dense)
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [7] }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' })); // Output 0 to 1 probability

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy']
  });

  console.log('Training Model...');
  
  await model.fit(xTensor, yTensor, {
    epochs: 10,
    batchSize: 64,
    validationSplit: 0.2,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}, accuracy = ${(logs.acc * 100).toFixed(2)}%`);
      }
    }
  });

  console.log('Training Complete!');

  // Ensure export directory exists
  if (!fs.existsSync(MODEL_SAVE_DIR)) {
    fs.mkdirSync(MODEL_SAVE_DIR, { recursive: true });
  }

  // Save the model for the React frontend
  await model.save(`file://${MODEL_SAVE_DIR}`);
  console.log(`Model successfully exported to: ${MODEL_SAVE_DIR}`);
}

trainModel().catch(console.error);
