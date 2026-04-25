const { Jimp } = require("jimp");

async function run() {
  try {
    const imgPath = "../frontend/public/logo_final.png";
    console.log("Loading image from:", imgPath);
    const image = await Jimp.read(imgPath);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    console.log(`Dimensions: ${w}x${h}`);
    
    // We want to crop the top part. The hexagon should be a square at the top.
    // The width is w. If the hexagon is centered and takes up most of the width, it's roughly w x w.
    // But let's check the size and maybe auto-crop it to find the bounding box of non-transparent pixels first, then crop the top part.
    // Let's just output the dimensions first.
  } catch (err) {
    console.error(err);
  }
}

run();
