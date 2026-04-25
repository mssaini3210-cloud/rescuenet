const { Jimp } = require("jimp");

async function run() {
  try {
    const imgPath = "../frontend/public/logo_final.png";
    const image = await Jimp.read(imgPath);
    
    const bgStr = image.getPixelColor(0, 0).toString(16);
    console.log("Top left pixel color:", bgStr);
    
    // Scale down to 40x40 to print an ascii map
    image.resize({ w: 40, h: 40 });
    const bg = image.getPixelColor(0, 0);
    
    for (let y = 0; y < 40; y++) {
      let row = "";
      for (let x = 0; x < 40; x++) {
        const color = image.getPixelColor(x, y);
        // let's do a loose comparison to handle artifacts
        if (color !== bg) {
          row += "#";
        } else {
          row += ".";
        }
      }
      console.log(row);
    }
  } catch (err) {
    console.error(err);
  }
}

run();
