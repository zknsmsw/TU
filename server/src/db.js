// 极简 JSON 文件存储 —— 零依赖，保证任何电脑都能跑起来。
// 数据保存在 server/data/db.json，之后可平滑替换为 SQLite / MySQL（接口不变）。
// 写入采用「临时文件 + 原子改名」，并保留上一版备份 db.json.bak，防止崩溃/断电损坏数据。
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const BAK_FILE = path.join(DATA_DIR, 'db.json.bak');

// 初始数据结构（后续模块会继续往这里加表）
function defaultData() {
  return {
    users: [],
    banners: [],
    stations: [],
    trainLines: [],
    trainLineStops: [],
    trainEdgeFares: [],
    hsTrains: [],
    hsStops: [],
    airports: [],
    flights: [],
    orders: [],
    orderItems: [],
    settings: {},
    site: { logo: null },
    seq: { users: 1, banners: 1, stations: 1, trainLines: 1, trainLineStops: 1, trainEdgeFares: 1, hsTrains: 1, hsStops: 1, airports: 1, flights: 1, orders: 1, orderItems: 1 }
  };
}

let cache = null;

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) {
    console.error('[数据] 读取 ' + file + ' 失败：' + e.message);
  }
  return null;
}

function load() {
  if (cache) return cache;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    cache = defaultData();
    save();
    return cache;
  }
  // 主文件损坏时自动回退到备份；备份也损坏才用空数据（会打印警告）
  cache = readJson(DATA_FILE) || readJson(BAK_FILE);
  if (!cache) {
    console.error('[数据] db.json 与 db.json.bak 均无法读取，将以空数据启动！');
    cache = defaultData();
  }
  // 老数据升级：补齐新增的默认字段，避免旧的 db.json 缺字段报错
  const def = defaultData();
  for (const key of Object.keys(def)) {
    if (cache[key] === undefined) cache[key] = def[key];
  }
  return cache;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf-8');
  // 保留上一版作为备份（rename 在同一分区内是原子操作）
  if (fs.existsSync(DATA_FILE)) {
    try {
      fs.renameSync(DATA_FILE, BAK_FILE);
    } catch (e) {
      /* 备份失败不阻断保存 */
    }
  }
  fs.renameSync(tmp, DATA_FILE);
}

// 自增 id
function nextId(name) {
  const d = load();
  const id = d.seq[name] || 1;
  d.seq[name] = id + 1;
  return id;
}

module.exports = { load, save, nextId, DATA_FILE };
