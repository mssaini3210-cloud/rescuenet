const { Jimp } = require("jimp");
const fs = require("fs");

async function run() {
  try {
    const imgPath = "../frontend/public/logo_final.png";
    const image = await Jimp.read(imgPath);
    
    image.crop({ x: 228, y: 0, w: 400, h: 400 });
    
    // Resize and save logo192.png
    const logo192 = image.clone();
    logo192.resize({ w: 192, h: 192 });
    await logo192.write("../frontend/public/logo192.png");
    
    // Resize and save logo512.png
    const logo512 = image.clone();
    logo512.resize({ w: 512, h: 512 });
    await logo512.write("../frontend/public/logo512.png");
    
    // Resize to 64x64 and save as favicon.ico using getBuffer
    const favicon = image.clone();
    favicon.resize({ w: 64, h: 64 });
    const buffer = await favicon.getBuffer("image/png");
    fs.writeFileSync("../frontend/public/favicon.ico", buffer);
    
    console.log("Images saved successfully.");
  } catch (err) {
    console.error(err);
  }
}

run();
