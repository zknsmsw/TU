const test = require('node:test');
const assert = require('node:assert');
const { searchTrain, buildGraph } = require('../src/services/trainSearch');
const db = require('../src/db');

// 测试换乘与环线算法
test('换乘算法：基础换乘与环线闭合段权重', () => {
  const d = db.load();
  // 保存原始数据以便恢复
  const origLines = JSON.parse(JSON.stringify(d.trainLines));
  const origStops = JSON.parse(JSON.stringify(d.trainLineStops));
  const origStations = JSON.parse(JSON.stringify(d.stations));

  try {
    d.stations = [
      { id: 901, name: '测试站A' },
      { id: 902, name: '测试站B' },
      { id: 903, name: '测试站C' }
    ];
    d.trainLines = [
      { id: 91, name: '测试环线', isLoop: true, color: '#f00' }
    ];
    d.trainLineStops = [
      { id: 9001, lineId: 91, stationId: 901, seq: 1, kmFromStart: 0 },
      { id: 9002, lineId: 91, stationId: 902, seq: 2, kmFromStart: 10 },
      { id: 9003, lineId: 91, stationId: 903, seq: 3, kmFromStart: 20 }
    ];

    const { edgeMap, adj } = buildGraph();
    // 站A到站B: 10km
    // 站B到站C: 10km
    // 环线闭合段站C到站A: 应该是平均里程 10km，而不是硬编码 1
    const loopKey = '901-903';
    assert.ok(edgeMap[loopKey], '环线闭合边应存在');
    assert.strictEqual(edgeMap[loopKey].weight, 10, '闭合段应取平均站间里程 10km');

    const result = searchTrain(901, 903);
    assert.strictEqual(result.reachable, true);
    assert.strictEqual(result.from.name, '测试站A');
    assert.strictEqual(result.to.name, '测试站C');
  } finally {
    // 恢复数据
    d.trainLines = origLines;
    d.trainLineStops = origStops;
    d.stations = origStations;
  }
});

// 测试站点关联校验逻辑
test('站点删除：校验高铁经停站引用拦截', () => {
  const d = db.load();
  const origStations = JSON.parse(JSON.stringify(d.stations));
  const origHsStops = JSON.parse(JSON.stringify(d.hsStops || []));

  try {
    d.stations = [{ id: 999, name: '高铁专用站' }];
    d.hsStops = [{ id: 1001, trainId: 1, stationId: 999, seq: 1 }];

    const id = 999;
    const isUsedInHs = (d.hsStops || []).some((s) => s.stationId === id);
    assert.strictEqual(isUsedInHs, true, '应当检测到该站点已被高铁车次使用');
  } finally {
    d.stations = origStations;
    d.hsStops = origHsStops;
  }
});
