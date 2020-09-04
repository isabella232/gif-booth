const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');

const chunkArray = (array, size) => {
  if (!array) return [];
  const firstChunk = array.slice(0, size);
  if (!firstChunk.length) return array;
  return [firstChunk].concat(chunkArray(array.slice(size, array.length), size));
};

const compositeInChunks = async (sharpImage, composites, size = 100) => {
  const chunked = chunkArray(composites, size);
  let composited = sharpImage;
  for (let i = 0; i < chunked.length; i++) {
    const buffer = await composited.toBuffer({ resolveWithObject: true });
    composited = await sharp(buffer.data, {
      raw: { ...buffer.info },
    }).composite(chunked[i]);
  }
  return composited;
};

const fetchImg = async (url) => {
  try {
    const res = await axios({
      url,
      responseType: 'arraybuffer',
    });
    return res;
  } catch (e) {
    return null;
  }
};

const fetchImgs = async (imgs) => {
  const fetched = await Promise.all(imgs.map(fetchImg));
  return fetched.filter((img) => img !== null);
};

const createImageLayout = (imgs) => {
  const aspectRatio = 1 + 1 / 3;

  const count = imgs.length;

  const idealGridWidth = 2000;
  const rowCellCount = Math.ceil(Math.sqrt(count));
  const colCellCount = Math.ceil(count / rowCellCount);

  const imgWidth = Math.round(idealGridWidth / rowCellCount); // these need to be an integer
  const imgHeight = Math.round(imgWidth / aspectRatio);

  const gridWidth = imgWidth * rowCellCount;
  const gridHeight = imgHeight * colCellCount;

  let top = 0;
  let left = 0;
  const _imgs = imgs.map((img) => {
    const specs = {
      data: img,
      top,
      left,
    };

    left = left + imgWidth;
    if (left >= gridWidth) {
      left = 0;
      top = top + imgHeight;
    }

    return specs;
  });

  return {
    imgs: _imgs,
    height: gridHeight,
    width: gridWidth,
    imgWidth,
    imgHeight,
  };
};

const createGroupPhoto = async (urls) => {
  const padding = 16;
  const brandingHeight = 80;
  const conferenceOutputPath = './temp/conference_logo.png';

  const imgs = await fetchImgs(urls);

  const layout = createImageLayout(imgs);

  await sharp('./uploads/CascadiaJSLong.png')
    .resize(null, brandingHeight)
    .toFile(conferenceOutputPath);
  const imgLogo = await sharp(conferenceOutputPath);
  const logoMetadata = await imgLogo.metadata();

  const totalWidth = layout.width + padding * 2;
  const totalHeight = layout.height + logoMetadata.height + padding * 3;

  const greetingsComposites = await Promise.all(
    layout.imgs.map(async (img) => {
      const loaded = await sharp(img.data.data).jpeg({ quality: 75 });
      const input = await loaded
        .resize(layout.imgWidth, layout.imgHeight)
        .raw()
        .toBuffer();

      return {
        input,
        raw: { width: layout.imgWidth, height: layout.imgHeight, channels: 4 },
        top: img.top + padding,
        left: img.left + padding,
      };
    }),
  );

  const background = await sharp({
    create: {
      height: totalHeight,
      width: totalWidth,
      channels: 3,
      background: 'white',
    },
  });

  const groupPhoto = await compositeInChunks(background, [
    {
      input: {
        create: {
          height: layout.height,
          width: layout.width,
          background: '#EDF2F7',
          channels: 3,
        },
      },
      top: padding,
      left: padding,
    },
    ...greetingsComposites,
    {
      input: conferenceOutputPath,
      top: layout.height + padding * 2,
      left: Math.floor(totalWidth / 2 - logoMetadata.width / 2),
    },
  ]);

  return groupPhoto;
};

const outputPath = './temp/group-photo.jpeg';

const createGroupPhotoStream = async (urls) => {
  try {
    const groupPhoto = await createGroupPhoto(urls);
    console.log('Group Photo Processed');
    const jpeg = await groupPhoto.jpeg({
      quality: 75,
    });
    await jpeg.toFile(outputPath);
    console.log(`Group Photo Output to ${outputPath}`);
    return fs.createReadStream(outputPath);
  } catch (e) {
    console.log(e);
  }
};

module.exports = { createGroupPhotoStream };
