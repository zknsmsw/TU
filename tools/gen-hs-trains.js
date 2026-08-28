#!/usr/bin/env node
// 高铁车次批量生成工具（独立运行，不改网站代码，只写数据库）
// 用法：node tools/gen-hs-trains.js [配置文件路径]
// 默认读取 tools/config.json；不传参则用 tools/config.example.json 也可以。
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'server', 'data', 'db.json');

// 参数：可选 [配置文件路径] [--clear]
const args = process.argv.slice(2);
const CLEAR_FIRST = args.includes('--clear');
const configArg = args.find((a) => !a.startsWith('--'));
const CONFIG_PATH = configArg ? path.resolve(configArg) : path.join(__dirname, 'config.json');

function timeToMin(str) {
  const [h, m] = String(str || '').split(':').map(Number);
  if (h === undefined || isNaN(h)) return null;
  return h * 60 + (m || 0);
}

// 不取模 24，跨天时直接显示 25:15 这种写法
function minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function nextId(db, name) {
  const id = db.seq[name] || 1;
  db.seq[name] = id + 1;
  return id;
}

function main() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) {
    console.error('读取配置文件失败：' + e.message);
    console.error('用法：node tools/gen-hs-trains.js [配置文件路径] [--clear]');
    process.exit(1);
  }

  if (!Array.isArray(config.stops) || config.stops.length < 2) {
    console.error('配置错误：stops 至少需要两个站点。');
    process.exit(1);
  }
  if (!config.stops[0].depart) {
    console.error('配置错误：首站必须填写 depart 发车时间。');
    process.exit(1);
  }

  let db;
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {
    console.error('读取数据库失败：' + e.message);
    process.exit(1);
  }
  db.hsTrains = db.hsTrains || [];
  db.hsStops = db.hsStops || [];
  db.seq = db.seq || {};

  // --clear：先清空所有高铁车次和经停站，再重新生成
  if (CLEAR_FIRST) {
    const removed = db.hsTrains.length;
    db.hsTrains = [];
    db.hsStops = [];
    db.seq.hsTrains = 1;
    db.seq.hsStops = 1;
    console.log('已清空全部高铁车次（' + removed + ' 个）和经停站。');
  }

  // 解析站点（站点名必须在网站的站点管理里已存在）
  const nameToId = {};
  (db.stations || []).forEach((s) => {
    nameToId[s.name] = s.id;
  });
  const stopIds = config.stops.map((st, i) => {
    const id = nameToId[st.station];
    if (!id) {
      console.error('第 ' + (i + 1) + ' 个站点在数据库里不存在：' + st.station);
      console.error('请先在网站后台「站点管理」里添加该站点。');
      process.exit(1);
    }
    return id;
  });

  // 以首发站发车时间为基准，算出每站相对偏移分钟
  const originDepart = timeToMin(config.stops[0].depart);
  const stopOffsets = config.stops.map((st) => ({
    arriveMin: st.arrive ? timeToMin(st.arrive) - originDepart : null,
    departMin: st.depart ? timeToMin(st.depart) - originDepart : null,
    price: Number(st.price) || 0
  }));

  const noStart = Number(config.trainNoStart) || 8001;
  const noStep = Number(config.trainNoStep) || 2;
  const count = Number(config.count) || 1;
  const interval = Number(config.departIntervalMin) || 60;
  const operator = config.operator || '';
  const name = config.name || '';

  // 写之前先备份数据库
  try {
    fs.copyFileSync(DB_PATH, DB_PATH + '.bak');
    console.log('已备份数据库到 server/data/db.json.bak');
  } catch (e) {
    console.error('备份失败：' + e.message);
    process.exit(1);
  }

  let created = 0;
  for (let k = 0; k < count; k++) {
    const trainNo = 'G' + (noStart + k * noStep);
    if (db.hsTrains.some((t) => t.trainNo === trainNo)) {
      console.log('车次已存在，跳过：' + trainNo);
      continue;
    }
    const shift = k * interval;
    const train = {
      id: nextId(db, 'hsTrains'),
      trainNo,
      name,
      operator,
      createdAt: new Date().toISOString()
    };
    db.hsTrains.push(train);

    stopOffsets.forEach((off, i) => {
      db.hsStops.push({
        id: nextId(db, 'hsStops'),
        trainId: train.id,
        stationId: stopIds[i],
        seq: i + 1,
        arriveTime: off.arriveMin === null ? '' : minToTime(originDepart + off.arriveMin + shift),
        departTime: off.departMin === null ? '' : minToTime(originDepart + off.departMin + shift),
        priceFromOrigin: off.price
      });
    });
    created++;
    console.log(
      '已生成：' + trainNo + '  ' + config.stops[0].station + ' ' +
      minToTime(originDepart + shift) + ' 发车'
    );
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  console.log('完成：共生成 ' + created + ' 个车次。');
  console.log('提示：请重启后端（npm start）让新数据生效。');
}

main();
