// 火车换乘搜索：基于线路构建站点图，求最近距离最短路径，自动换乘（同名站交汇）
// 计价方式：站间票价（每段相邻两站一个票价），未单独设置时用默认票价
const db = require('../db');

// 构建图：节点=站点，边=同一线路相邻两站（双向），权重=里程（缺省按 1 计，用于选路）
function buildGraph() {
  const d = db.load();
  const edgeMap = {}; // key "小id-大id" -> { weight, lines: [] }
  const adj = {}; // stationId -> [{ to, weight }]

  const addEdge = (a, b, weight, lineId) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edgeMap[key]) edgeMap[key] = { weight, lines: [] };
    if (weight < edgeMap[key].weight) edgeMap[key].weight = weight;
    if (!edgeMap[key].lines.includes(lineId)) edgeMap[key].lines.push(lineId);

    const push = (from, to) => {
      if (!adj[from]) adj[from] = [];
      const ex = adj[from].find((e) => e.to === to);
      if (ex) {
        if (weight < ex.weight) ex.weight = weight;
      } else {
        adj[from].push({ to, weight });
      }
    };
    push(a, b);
    push(b, a);
  };

  for (const line of d.trainLines || []) {
    const stops = (d.trainLineStops || [])
      .filter((s) => s.lineId === line.id)
      .sort((x, y) => x.seq - y.seq);
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i].stationId;
      const b = stops[i + 1].stationId;
      if (a === b) continue;
      addEdge(a, b, distanceKm(stops[i], stops[i + 1]), line.id);
    }
    // 环线：末站连回首站（若各站已配置里程，取平均站间里程，避免硬编码 1 导致最短路失真）
    if (line.isLoop && stops.length >= 3) {
      const a = stops[stops.length - 1].stationId;
      const b = stops[0].stationId;
      if (a !== b) {
        let dist = 1;
        let kmSum = 0;
        let kmCount = 0;
        for (let i = 0; i < stops.length - 1; i++) {
          const dKm = distanceKm(stops[i], stops[i + 1]);
          kmSum += dKm;
          kmCount++;
        }
        if (kmCount > 0) {
          dist = Math.max(1, Math.round((kmSum / kmCount) * 10) / 10);
        }
        addEdge(a, b, dist, line.id);
      }
    }
  }
  return { edgeMap, adj };
}

function distanceKm(x, y) {
  // 里程缺失（null/空字符串/非数字）时按 1 计，即按"站数"选路。
  // 注意：不能只靠 isNaN(Number(...)) 判断，因为 Number(null) === 0 不会报错。
  const av = x.kmFromStart;
  const bv = y.kmFromStart;
  const na = Number(av);
  const nb = Number(bv);
  const hasA = av !== null && av !== undefined && av !== '' && !isNaN(na);
  const hasB = bv !== null && bv !== undefined && bv !== '' && !isNaN(nb);
  if (!hasA || !hasB) return 1;
  return Math.abs(na - nb);
}

// Dijkstra 最短路（图很小，O(V^2) 足够）
function dijkstra(adj, start, target) {
  const dist = {};
  const prev = {};
  const visited = new Set();
  dist[String(start)] = 0;
  while (true) {
    let u = null;
    let best = Infinity;
    for (const key of Object.keys(dist)) {
      if (!visited.has(key) && dist[key] < best) {
        best = dist[key];
        u = key;
      }
    }
    if (u === null) break;
    if (u === String(target)) break;
    visited.add(u);
    for (const e of adj[u] || []) {
      const to = String(e.to);
      const nd = dist[u] + e.weight;
      if (nd < (dist[to] === undefined ? Infinity : dist[to])) {
        dist[to] = nd;
        prev[to] = u;
      }
    }
  }
  return { dist, prev };
}

function reconstruct(prev, target) {
  const path = [];
  let cur = String(target);
  while (cur !== undefined) {
    path.unshift(Number(cur));
    cur = prev[cur];
  }
  return path;
}

// 站间票价：优先取线路+站对的具体票价，没有则用默认票价
function edgeFare(lineId, a, b, defaultFare) {
  const d = db.load();
  const keyA = a < b ? a : b;
  const keyB = a < b ? b : a;
  const rec = (d.trainEdgeFares || []).find(
    (f) => f.lineId === lineId && f.stationAId === keyA && f.stationBId === keyB
  );
  if (rec) return rec.fare;
  return defaultFare;
}

// 把站点路径切成乘坐段（最少换乘），同时累计每段里程与票价
function segmentPath(path, edgeMap, defaultFare) {
  const m = path.length - 1;
  const edgeInfos = [];
  let totalKm = 0;
  for (let i = 0; i < m; i++) {
    const a = path[i];
    const b = path[i + 1];
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const info = edgeMap[key];
    edgeInfos.push(info);
    totalKm += info.weight;
  }
  totalKm = Math.round(totalKm * 10) / 10;

  // DP：每条边可走若干线路，切换线路记 1 次换乘，求最少换乘
  const INF = 1e9;
  let dp = {};
  const prevChoice = new Array(m);
  for (const ln of edgeInfos[0].lines) dp[ln] = 0;
  prevChoice[0] = {};
  for (let i = 1; i < m; i++) {
    const ndp = {};
    const nprev = {};
    for (const ln of edgeInfos[i].lines) {
      let best = INF;
      let bestPrev = null;
      for (const pln of Object.keys(dp)) {
        const cost = dp[pln] + (Number(pln) === Number(ln) ? 0 : 1);
        if (cost < best) {
          best = cost;
          bestPrev = pln;
        }
      }
      ndp[ln] = best;
      nprev[ln] = bestPrev;
    }
    dp = ndp;
    prevChoice[i] = nprev;
  }

  let bestLine = null;
  let bestCost = INF;
  for (const ln of Object.keys(dp)) {
    if (dp[ln] < bestCost) {
      bestCost = dp[ln];
      bestLine = ln;
    }
  }

  const lineChoices = new Array(m);
  let curLine = bestLine;
  for (let i = m - 1; i >= 0; i--) {
    lineChoices[i] = Number(curLine);
    curLine = prevChoice[i] && prevChoice[i][curLine];
  }

  // 切成段并累计票价
  const segments = [];
  let seg = {
    lineId: lineChoices[0],
    from: path[0],
    to: path[1],
    km: edgeInfos[0].weight,
    fare: edgeFare(lineChoices[0], path[0], path[1], defaultFare)
  };
  let totalFare = seg.fare;
  for (let i = 1; i < m; i++) {
    const f = edgeFare(lineChoices[i], path[i], path[i + 1], defaultFare);
    if (lineChoices[i] === seg.lineId) {
      seg.to = path[i + 1];
      seg.km += edgeInfos[i].weight;
      seg.fare += f;
    } else {
      segments.push(seg);
      seg = {
        lineId: lineChoices[i],
        from: path[i],
        to: path[i + 1],
        km: edgeInfos[i].weight,
        fare: f
      };
    }
    totalFare += f;
  }
  segments.push(seg);

  const round = (n) => Math.round(n * 10) / 10;
  segments.forEach((s) => {
    s.km = round(s.km);
    s.fare = round(s.fare);
  });
  return { segments, transfers: segments.length - 1, totalKm, totalFare: round(totalFare) };
}

function searchTrain(from, to) {
  const d = db.load();
  const stationById = (id) => d.stations.find((s) => s.id === id);
  const fromStation = stationById(from);
  const toStation = stationById(to);
  if (!fromStation || !toStation) return { error: '站点不存在' };
  if (from === to) return { error: '出发站与到达站相同' };

  const defaultFare = Number(((d.settings || {}).train || {}).defaultFare) || 0;

  const { edgeMap, adj } = buildGraph();
  if (!adj[from] || !adj[to]) return { reachable: false };
  const { dist, prev } = dijkstra(adj, from, to);
  if (dist[String(to)] === undefined) return { reachable: false };

  const path = reconstruct(prev, to);
  const { segments, transfers, totalKm, totalFare } = segmentPath(path, edgeMap, defaultFare);

  return {
    reachable: true,
    from: { id: fromStation.id, name: fromStation.name },
    to: { id: toStation.id, name: toStation.name },
    totalKm,
    fare: totalFare,
    transfers,
    segments: segments.map((sg) => {
      const line = d.trainLines.find((l) => l.id === sg.lineId);
      const fs = stationById(sg.from);
      const ts = stationById(sg.to);
      return {
        line: line ? { id: line.id, name: line.name, color: line.color, operator: line.operator || '', isLoop: !!line.isLoop } : { id: sg.lineId, name: '未知线路', color: '#888', operator: '', isLoop: false },
        from: fs ? fs.name : String(sg.from),
        to: ts ? ts.name : String(sg.to),
        km: sg.km,
        fare: sg.fare
      };
    })
  };
}

module.exports = { searchTrain, buildGraph };
