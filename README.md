# TANK / 1990 — 最后一道防线

Three.js 3D 俯视角「坦克大战」核心玩法原型。全部模型由程序化几何体组装，没有图片、模型下载或付费服务依赖。

## 启动

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

打开终端显示的本地地址（默认 http://localhost:5173），点击「开始战役」。

```bash
npm test       # 碰撞、地图和核心规则测试
npm run build # 输出 dist/
npm run preview
```

Vite 使用相对 base，可把 dist/ 部署到静态站点子目录。需支持 WebGL 2 的现代浏览器；不能通过双击 file:// 打开模块源码。

## 操作与规则

- WASD / 方向键：四向行进，90° 转向，转向时平滑对齐网格中心。
- 空格 / 鼠标左键：按住连续射击。
- 鼠标移动：炮塔独立瞄准；再次按方向键恢复朝移动方向射击。
- P / Esc：暂停或继续。R：立即重开。手机有方向键及射击按钮。
- 三条生命，每次入场有三秒保护。消灭 12 辆敌方坦克获胜；基地被任意炮弹击中，或生命耗尽则失败。
- 砖墙每个格子一击摧毁；钢墙吸收炮弹；水面允许炮弹经过，但坦克不能通过。
- 两颗炮弹碰撞相互抵消（不区分阵营）。己方坦克不挡己方炮弹，但基地会受到双方炮弹伤害。
- 轻型：1 HP，快速移动，100 分。重型：3 HP，低速，300 分。速射：1 HP，更短射击间隔，200 分。
- 普通敌人随机每 1.5–3 秒射击，速射型 0.7–1.05 秒。AI 在巡逻中概率偏向基地或玩家，碰壁选择可行方向。

## 结构

```
src/
  main.js                    入口及初始化失败处理
  core/GameManager.js        主循环、生成节奏、生命/胜负、UI 同步
  core/Input.js              键盘、鼠标、触屏、失焦清理
  core/config.js             网格、固定步长、兵种、带种子的随机数
  world/MapManager.js        26×26 网格、实例化砖块、地形、基地
  world/models.js            坦克/老鹰工厂、共享材质、资源释放
  entities/Tank.js           Tank 基类、PlayerTank、EnemyTank
  systems/CollisionSystem.js Grid/AABB 与连续线段扫掠
  systems/BulletManager.js   子弹生命周期、地形/坦克/子弹碰撞
  systems/Effects.js         Points 粒子、爆炸、残骸与烟雾
  systems/AudioSystem.js     用户交互解锁的 Web Audio 合成音效
  style.css                 响应式作战界面
```

模拟使用 1/60 秒固定时间步；每帧累积时间限制为 0.1 秒，最多 6 次 tick，避免切换标签页后的跳跃。更新顺序为输入/坦克 → AI → 子弹/碰撞 → 状态 → VFX → 渲染。高速炮弹使用扫掠 AABB，弹弹碰撞使用相对运动扫掠，无重型物理引擎。

正交相机以约 60° 俯角固定观察全图，单平行光开启 2048² 阴影，加中性环境光。DPR 上限 1.5；重复砖块使用 InstancedMesh，其他静态组件按材质合并。重开回收场景对象、几何体、实例缓冲与独立材质。

开发环境暴露 `window.__TANK_GAME__` 以支持规则验证和 `snapshot()` 诊断；生产打包通过 Vite 的 DEV 分支移除。浏览器检查脚本的 `CHROME_PATH` 可指向本机 Chromium/Chrome。

这是单关核心原型：没有联网对战、存档、道具升级或战役编辑器；音效为本地合成。技术参考：[Three.js 官方安装文档](https://threejs.org/manual/en/installation.html)。

浏览器回归：分别保持 `npm run dev`（5173）和 `npm run preview`（4173）运行，再执行 `npm run test:browser`。默认使用 macOS Chrome；其他路径使用 `CHROME_PATH=/path/to/chrome npm run test:browser`。验证详情及截图见 [artifacts/final-evidence.md](artifacts/final-evidence.md)。
