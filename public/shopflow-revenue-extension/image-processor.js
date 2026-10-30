// ShopFlow Image Anti-Duplicate & Frame Processor
// Uses HTML5 Canvas to modify pixel data, add professional e-commerce frames & badges,
// flip images, adjust brightness/contrast, and export clean, metadata-free images for Shopee.

(function () {
  'use strict';

  // Helper: Mini ZIP builder in pure JS (no external dependencies)
  function createZip(files) {
    // files: [{ name: 'img1.jpg', data: Uint8Array }]
    const parts = [];
    const cdEntries = [];
    let offset = 0;

    // CRC32 table
    const crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[i] = c;
    }

    function crc32(buf) {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }

    const enc = new TextEncoder();

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;

      // Local file header (30 bytes)
      const lh = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); // Local file header signature
      dv.setUint16(4, 20, true);         // Version needed to extract
      dv.setUint16(6, 0, true);          // General purpose bit flag
      dv.setUint16(8, 0, true);          // Compression method (0 = store)
      dv.setUint16(10, 0, true);         // Mod time
      dv.setUint16(12, 0, true);         // Mod date
      dv.setUint32(14, crc, true);       // CRC-32
      dv.setUint32(18, size, true);      // Compressed size
      dv.setUint32(22, size, true);      // Uncompressed size
      dv.setUint16(26, nameBytes.length, true); // File name length
      dv.setUint16(28, 0, true);         // Extra field length
      lh.set(nameBytes, 30);

      parts.push(lh, data);

      // Central directory header (46 bytes)
      const cdh = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(cdh.buffer);
      cdv.setUint32(0, 0x02014b50, true); // Central directory signature
      cdv.setUint16(4, 20, true);         // Version made by
      cdv.setUint16(6, 20, true);         // Version needed
      cdv.setUint16(8, 0, true);          // Flags
      cdv.setUint16(10, 0, true);         // Method (store)
      cdv.setUint16(12, 0, true);         // Mod time
      cdv.setUint16(14, 0, true);         // Mod date
      cdv.setUint32(16, crc, true);       // CRC
      cdv.setUint32(20, size, true);      // Comp size
      cdv.setUint32(24, size, true);      // Uncomp size
      cdv.setUint16(28, nameBytes.length, true); // Name len
      cdv.setUint16(30, 0, true);         // Extra len
      cdv.setUint16(32, 0, true);         // Comment len
      cdv.setUint16(34, 0, true);         // Disk start
      cdv.setUint16(36, 0, true);         // Internal attr
      cdv.setUint32(38, 0, true);         // External attr
      cdv.setUint32(42, offset, true);    // Offset of local header
      cdh.set(nameBytes, 46);

      cdEntries.push(cdh);
      offset += lh.length + data.length;
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const cdh of cdEntries) {
      parts.push(cdh);
      cdSize += cdh.length;
    }

    // End of central directory record (22 bytes)
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true); // EOCD signature
    edv.setUint16(4, 0, true);          // Disk number
    edv.setUint16(6, 0, true);          // Start disk
    edv.setUint16(8, files.length, true);  // Entries on disk
    edv.setUint16(10, files.length, true); // Total entries
    edv.setUint32(12, cdSize, true);       // Size of central dir
    edv.setUint32(16, cdOffset, true);     // Offset of CD
    edv.setUint16(20, 0, true);         // Comment length
    parts.push(eocd);

    return new Blob(parts, { type: 'application/zip' });
  }

  // Helper: Load image safely handling CORS via fetch blob
  async function loadImageElement(url) {
    try {
      const resp = await fetch(url, { mode: 'cors' });
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Không tải được ảnh: ' + url));
        };
        img.src = objectUrl;
      });
    } catch {
      // Fallback: direct src
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Lỗi tải ảnh'));
        img.src = url;
      });
    }
  }

  // Draw rounded rectangle helper
  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Main Canvas transformation
  async function processSingleImage(imageUrl, options = {}) {
    const {
      frame = 'orange', // 'orange' | 'red' | 'green' | 'gold' | 'none'
      flip = false,
      boost = true,
      size = 800
    } = options;

    const img = await loadImageElement(imageUrl);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 1. Clear background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // 2. Adjust filter (brightness +2%, contrast +3%)
    if (boost) {
      ctx.filter = 'brightness(1.02) contrast(1.03)';
    }

    // 3. Draw image (handle optional flip horizontal)
    ctx.save();
    if (flip) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }

    // Draw image centered and scaled to fill canvas with subtle 2% padding
    const padding = frame !== 'none' ? 24 : 8;
    const drawWidth = size - padding * 2;
    const drawHeight = size - padding * 2;
    ctx.drawImage(img, padding, padding, drawWidth, drawHeight);
    ctx.restore();

    // Reset filter for frame & badges
    ctx.filter = 'none';

    // 4. Draw Frames & Badges
    if (frame === 'orange') {
      // Shopee Bright Orange Frame
      ctx.strokeStyle = '#f94e2f';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, size - 14, size - 14);

      // Top-left badge: FREESHIP XTRA
      ctx.fillStyle = '#ee4d2d';
      roundRect(ctx, 20, 20, 190, 42, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('⚡ FREESHIP XTRA', 32, 48);

      // Top-right badge: 100% CHÍNH HÃNG
      ctx.fillStyle = '#b91c1c';
      roundRect(ctx, size - 210, 20, 190, 42, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('★ 100% CHÍNH HÃNG', size - 200, 48);

      // Bottom banner
      ctx.fillStyle = 'rgba(238, 77, 45, 0.95)';
      roundRect(ctx, 30, size - 64, size - 60, 44, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️ BẢO HÀNH 12 THÁNG · LỖI 1 ĐỔI 1', size / 2, size - 36);
      ctx.textAlign = 'left';

    } else if (frame === 'red') {
      // Crimson Red Quality Frame
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, size - 14, size - 14);

      // Top badge
      ctx.fillStyle = '#dc2626';
      roundRect(ctx, 22, 22, 210, 44, 8);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('👑 HÀNG CHUẨN LOẠI 1', 35, 51);

      // Bottom banner
      ctx.fillStyle = '#991b1b';
      roundRect(ctx, 25, size - 64, size - 50, 44, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✔ KIỂM TRA HÀNG TRƯỚC KHI THANH TOÁN', size / 2, size - 36);
      ctx.textAlign = 'left';

    } else if (frame === 'green') {
      // Forest Green ShopFlow Frame
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, size - 14, size - 14);

      // Top badge
      ctx.fillStyle = '#166534';
      roundRect(ctx, 22, 22, 210, 42, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('⭐ SHOP UY TÍN 100%', 36, 49);

      // Bottom banner
      ctx.fillStyle = '#15803d';
      roundRect(ctx, 25, size - 64, size - 50, 44, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ ĐÓNG GÓI CẨN THẬN · GIAO SIÊU TỐC', size / 2, size - 36);
      ctx.textAlign = 'left';

    } else if (frame === 'gold') {
      // Golden Luxury Frame
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, size - 14, size - 14);

      ctx.fillStyle = '#b45309';
      roundRect(ctx, 22, 22, 200, 42, 8);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('✨ BẢN CAO CẤP', 42, 49);
    }

    // Convert to high-quality JPEG (quality 0.94)
    return new Promise(resolve => {
      canvas.toBlob(blob => {
        resolve({
          blob,
          dataUrl: canvas.toDataURL('image/jpeg', 0.94)
        });
      }, 'image/jpeg', 0.94);
    });
  }

  // Batch process all images and package into a ZIP file
  async function processAllImagesToZip(imageUrls, options = {}, onProgress = () => {}) {
    const files = [];
    let idx = 1;

    for (const url of imageUrls) {
      onProgress(`Đang xử lý ảnh ${idx}/${imageUrls.length}...`);
      try {
        const { blob } = await processSingleImage(url, options);
        const arrayBuf = await blob.arrayBuffer();
        files.push({
          name: `anh-sp-${idx}.jpg`,
          data: new Uint8Array(arrayBuf)
        });
      } catch (e) {
        console.warn('Lỗi xử lý ảnh:', url, e);
      }
      idx++;
    }

    onProgress('Đang nén file ZIP...');
    const zipBlob = createZip(files);
    return {
      zipBlob,
      count: files.length
    };
  }

  // Trigger download helper
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Export to global namespace
  globalThis.ShopFlowImageProcessor = {
    processSingleImage,
    processAllImagesToZip,
    triggerDownload
  };
})();
