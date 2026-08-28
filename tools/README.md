# 高铁车次批量生成工具

一个**独立的小工具**，不修改任何网站代码，只读写数据库文件 `server/data/db.json`。
用来批量生成"同样线路、同样票价、不同发车时间"的高铁车次（例如 G8001 / G8003 / G8005）。

## 用法

1. 把 `config.example.json` 复制成 `config.json`，按需修改：
   ```bash
   cp tools/config.example.json tools/config.json
   ```
2. 运行：
   ```bash
   node tools/gen-hs-trains.js
   ```
   也可以指定别的配置文件：`node tools/gen-hs-trains.js 路径/config.json`
3. 运行前会自动备份数据库到 `server/data/db.json.bak`。
4. 完成后重启后端让新数据生效：
   ```bash
   npm start
   ```

## 配置字段说明

| 字段 | 说明 |
| --- | --- |
| `trainNoStart` | 第一个车次号的数字部分，如 8001 → G8001 |
| `trainNoStep` | 车次号递增步长，2 → 8001, 8003, 8005 |
| `operator` | 担当企业（所有生成的车次共用） |
| `name` | 车次名称（可选，留空不填） |
| `count` | 要生成几个车次 |
| `departIntervalMin` | 相邻车次的发车间隔（分钟） |
| `stops` | 经停站，**按运行顺序**填写 |

### stops 里每个站的填法

- **首站**：只填 `depart`（发车时间）和 `price`；
- **末站**：只填 `arrive`（到达时间）和 `price`；
- **中间站**：填 `arrive`、`depart`、`price` 三个。

`price` 是该站「从始发站算的累计票价」（和网站高铁的计价一致：A→B 票价 = 到B的累计价 − 到A的累计价）。

所有 `station` 必须在网站后台「站点管理」里已经存在，否则工具会报错并退出。

## 示例

`config.example.json` 会生成：G8001（08:00）、G8003（09:00）、G8005（10:00）三趟车，
都走 璃月港 → 璃中 → 蒙德东，累计票价 0 / 60 / 280。
