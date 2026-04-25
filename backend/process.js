const { Jimp } = require("jimp");
const fs = require("fs");

async function run() {
  try {
    const imgPath = "../frontend/public/logo_final.png";
    console.log("Loading image from:", imgPath);
    const image = await Jimp.read(imgPath);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    console.log(`Dimensions: ${w}x${h}`);
    
    // We assume the hexagon is at the top part of the image.
    // We'll crop it based on the dimensions. Typically it's the top half or so.
    // Since it's a hexagon, we want it to be a square crop.
    
    // Let's just output some color samples to figure out where the text starts.
    // Or simpler: let's save the cropped image to 3 files:
    // We'll try to find the bounding box of non-transparent/non-background pixels in the top half?
    // Let's first dump the dimensions.
  } catch (err) {
    console.error(err);
  }
}

run();
