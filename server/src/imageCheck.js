// 图片内容校验：检查文件真实魔数（magic bytes），
// 防止把伪装成 png/jpeg/gif/webp 的 HTML/脚本等上传到服务器。
const MAGIC = {
  'image/png': (b) =>
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) =>
    b.length >= 6 &&
    b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  'image/webp': (b) =>
    b.length >= 12 &&
    b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'
};

function isRealImage(mime, buffer) {
  const check = MAGIC[mime];
  return !!check && check(buffer);
}

module.exports = { isRealImage };
