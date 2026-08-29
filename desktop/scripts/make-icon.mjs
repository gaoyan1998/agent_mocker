// 从 docs/image/logo.png 生成 build/icon.png（1024×1024）。
//
// 完整 logo 是「图标 + 字标 + 标语」的横版组合，缩到 32px 当应用图标时字全糊了，
// 所以这里只裁出上半部分的机器人图形，再居中放到方形画布上。
// electron-builder 会用这张 png 自动派生 Windows 的 .ico 和 macOS 的 .icns。
//
// 只用 node:zlib，不额外引入图像库 —— 为了一张图标去装 sharp 不值当。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..');

const SOURCE = path.join(repoRoot, 'docs', 'image', 'logo.png');
const TARGET = path.join(desktopDir, 'build', 'icon.png');
const SIZE = 1024;
/** 机器人图形在 1039×806 原图里的包围盒，下方字标不要。 */
const CROP = { x: 200, y: 25, width: 600, height: 505 };
/** 图形占画布的比例，四周留白让它在 Dock / 任务栏里不顶边。 */
const CONTENT_RATIO = 0.84;

/* ---------- PNG 解码 ---------- */

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function readPng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 文件');

  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const chunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') transparency = Buffer.from(data);
    else if (type === 'IDAT') chunks.push(Buffer.from(data));
    else if (type === 'IEND') break;
    offset += 12 + length;
  }

  if (!header) throw new Error('PNG 缺少 IHDR');
  if (header.bitDepth !== 8) throw new Error(`只支持 8 位色深，当前为 ${header.bitDepth}`);
  if (header.interlace !== 0) throw new Error('不支持隔行扫描的 PNG');

  const channels = CHANNELS[header.colorType];
  if (!channels) throw new Error(`不支持的 colorType ${header.colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const pixels = unfilter(raw, header.width, header.height, channels);
  return { ...header, data: toRgba(pixels, header, channels, palette, transparency) };
}

/** 逐行还原 PNG 的五种行过滤器。 */
function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const target = y * stride;
    const previous = target - stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[target + x - channels] : 0;
      const up = y > 0 ? out[previous + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[previous + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`未知的行过滤器 ${filter}`);
      out[target + x] = value & 0xff;
    }
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function toRgba(pixels, header, channels, palette, transparency) {
  const { width, height, colorType } = header;
  const out = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i += 1) {
    const source = i * channels;
    const target = i * 4;
    let r;
    let g;
    let b;
    let a = 255;

    if (colorType === 0) r = g = b = pixels[source];
    else if (colorType === 4) {
      r = g = b = pixels[source];
      a = pixels[source + 1];
    } else if (colorType === 3) {
      const index = pixels[source];
      r = palette[index * 3];
      g = palette[index * 3 + 1];
      b = palette[index * 3 + 2];
      a = transparency && index < transparency.length ? transparency[index] : 255;
    } else {
      r = pixels[source];
      g = pixels[source + 1];
      b = pixels[source + 2];
      if (colorType === 6) a = pixels[source + 3];
    }

    out[target] = r;
    out[target + 1] = g;
    out[target + 2] = b;
    out[target + 3] = a;
  }
  return out;
}

/* ---------- 缩放与合成 ---------- */

/** 双线性缩放，缩小图形时比最近邻平滑很多。 */
function resize(source, sourceWidth, sourceHeight, width, height) {
  const out = Buffer.alloc(width * height * 4);
  const scaleX = sourceWidth / width;
  const scaleY = sourceHeight / height;

  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(sourceHeight - 1, (y + 0.5) * scaleY - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const wy = sy - y0;

    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(sourceWidth - 1, (x + 0.5) * scaleX - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const wx = sx - x0;

      for (let channel = 0; channel < 4; channel += 1) {
        const p00 = source[(y0 * sourceWidth + x0) * 4 + channel];
        const p01 = source[(y0 * sourceWidth + x1) * 4 + channel];
        const p10 = source[(y1 * sourceWidth + x0) * 4 + channel];
        const p11 = source[(y1 * sourceWidth + x1) * 4 + channel];
        const top = p00 + (p01 - p00) * wx;
        const bottom = p10 + (p11 - p10) * wx;
        out[(y * width + x) * 4 + channel] = Math.round(top + (bottom - top) * wy);
      }
    }
  }
  return out;
}

function crop(source, sourceWidth, sourceHeight, rect) {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const width = Math.min(rect.width, sourceWidth - x0);
  const height = Math.min(rect.height, sourceHeight - y0);
  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    source.copy(
      out,
      y * width * 4,
      ((y0 + y) * sourceWidth + x0) * 4,
      ((y0 + y) * sourceWidth + x0 + width) * 4,
    );
  }
  return { data: out, width, height };
}

/** 把图形按 alpha 混合到已填充背景色的方形画布中央。 */
function compose(canvasSize, background, layer, layerWidth, layerHeight) {
  const out = Buffer.alloc(canvasSize * canvasSize * 4);
  for (let i = 0; i < canvasSize * canvasSize; i += 1) {
    out[i * 4] = background[0];
    out[i * 4 + 1] = background[1];
    out[i * 4 + 2] = background[2];
    out[i * 4 + 3] = 255;
  }

  const offsetX = Math.round((canvasSize - layerWidth) / 2);
  const offsetY = Math.round((canvasSize - layerHeight) / 2);

  for (let y = 0; y < layerHeight; y += 1) {
    for (let x = 0; x < layerWidth; x += 1) {
      const source = (y * layerWidth + x) * 4;
      const target = ((offsetY + y) * canvasSize + offsetX + x) * 4;
      const alpha = layer[source + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        out[target + channel] = Math.round(
          layer[source + channel] * alpha + out[target + channel] * (1 - alpha),
        );
      }
    }
  }
  return out;
}

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function writePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bitDepth
  ihdr[9] = 6; // colorType: RGBA

  // 每行前面补一个 0（不使用过滤器），交给 deflate 压缩。
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 主流程 ---------- */

function main() {
  const source = readPng(fs.readFileSync(SOURCE));
  console.log(`[icon] 源图 ${source.width}×${source.height}`);

  const marked = crop(source.data, source.width, source.height, CROP);
  const maxSide = Math.round(SIZE * CONTENT_RATIO);
  const scale = maxSide / Math.max(marked.width, marked.height);
  const width = Math.round(marked.width * scale);
  const height = Math.round(marked.height * scale);
  const scaled = resize(marked.data, marked.width, marked.height, width, height);

  // 取原图左上角像素当背景色，保证和 logo 的底色一致。
  const background = [source.data[0], source.data[1], source.data[2]];
  const canvas = compose(SIZE, background, scaled, width, height);

  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, writePng(canvas, SIZE));
  console.log(
    `[icon] 已生成 ${path.relative(repoRoot, TARGET)}（${SIZE}×${SIZE}，图形 ${width}×${height}，` +
      `底色 rgb(${background.join(', ')})）`,
  );
}

main();
