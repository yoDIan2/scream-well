/* 《尖叫之井》M0-a · 手感对比原型（占位美术）
 *
 * 存在理由：B1（横向控制模型）无法靠文字拍板，必须能"玩"出来。
 * 三个 x 模型共用同一口井（同 seed、同堵层、同危险），只改玩家的横向自由度：
 *   ① 中线：x 锁死在井道中心，完全没有横向控制（策划文档 v0.1 的现状）
 *   ② 摆荡：x 自动在左右井壁间往返，点屏只管垂直
 *   ③ 踢移：每次点射给一个交替方向的横向冲量，长按 = 抖动式横移
 *
 * 已按审阅意见落地的补充项：RECOIL_VY 为赋值式 + 上升速度上限、固定物理步防穿透、
 * 成绩取"最深到达"而非累计过线、水线为全局绝对坐标且单调不回退、前 5 层为固定教学走廊、
 * 井壁几何用连续函数生成避免层间接缝、井内容按层独立 RNG 懒生成（可回到上层且不漂移）。
 *
 * 本版不含：三选一构筑、看天蛙、战报卡、localStorage。
 * 音频（M0.5）：只有两处声音——打籽"哒"，与受击/死亡时的低调尖叫（试玩反馈砍掉其余音效）。
 */
(function () {
  'use strict';

  /* ===================== CFG：策划 §5 数值表 ===================== */
  var CFG = {
    LOGICAL_W: 720,
    FLOOR_H: 1280,
    TOTAL_FLOORS: 99,

    GRAVITY: 2400,
    FALL_CAP_BASE: 900,
    FALL_CAP_PER_FLOOR: 4,
    RISE_CAP: 620,          // 补充：上升速度上限（赋值式后坐力的安全网）
    SEED_SPEED: 1100,
    RECOIL_VY: -430,        // 赋值式，不是叠加（叠加会无限上冲）
    FIRE_CD: 0.12,

    AMMO_START: 40,
    AMMO_MAX: 40,
    RELOAD_PER_FLOOR: 12,   // m4f 换层补给：子弹兼"杀敌+位移滞空"双开销，每往下进一层压入此数（仅下行，防上下蹦层刷弹）
    TIER_HP: [3, 2, 1],     // 血量档：1=3血(新手) 2=2血(标准) 3=1血(进阶)，血量即难度
    INVULN: 1.2,
    FLOOR_TIMEOUT: 30,
    WATER_SPEED: 130,

    WELL_W_TOP: 560,
    WELL_W_BOTTOM: 320,
    BLOCK_RATE_TOP: 0.15,
    BLOCK_RATE_BOTTOM: 0.45,
    BLOCK_HP_TOP: 2,
    BLOCK_HP_BOTTOM: 6,
    BLOCK_THICK: 46,
    PICKUP_RATE: 0.8,
    SPIKE_FROM: 25,
    SPIKE_RATE_TOP: 0.22,
    SPIKE_RATE_BOTTOM: 0.4,    // 壁刺率随深度线性上升（M4 第四刀回调：刺是标点不是主菜）
    /* m4g D1 联合排位旋钮 */
    SPIKE_Y_MIN: 320,          // 刺带 y0 在层内的取值窗口（层界附近留观察窗）
    SPIKE_Y_MAX: 760,
    SPIKE_Y_STEP: 40,
    SPIKE_BAND_H: 180,         // 带高（原硬编码 180）
    BAND_DAM_CLEAR: 70,        // 带与坝的最小垂直间距
    GUARD_H_SPIDER: 67,        // 受击竖直半径 + 人半径：46 + 26*0.8 = 66.8
    GUARD_H_BUG: 116,          // 72+34（全张光圈）+ 26*0.4
    DAM_Y_MIN: 420,
    DAM_Y_MAX: 1020,
    DAM_Y_STEP: 40,
    GUARD_BUG_OFF: 150,        // 虫咬着坝：钉在坝上方此距离
    GUARD_SPIDER_OFF_LO: 300,
    GUARD_SPIDER_OFF_HI: 500,
    TENANT_FLOOR_MIN: 200,     // 层顶下方此深度以下才允许生实体
    TENANT_Y_MIN: 260,
    TENANT_Y_MAX: 1020,
    TENANT_DAM_IN: 60,         // 住户不得生进坝体（含缓冲）
    TENANT_DAM_FALL: 450,      // 住户生在大坝下方时的最小反应距离
    SPIKE_LEN_MIN: 70,
    SPIKE_LEN_MAX: 140,
    SPIKE_GAP_HALF: 88,       // 刺门缺口半宽（玩家直径 52+余量）
    SPIKE_GAP_HALF_BOTTOM: 62, // 井底缺口半宽（更窄）
    SPIKE_GATE_FROM: 0.22,    // 深度比超过此值后开始出双刺门
    SPIKE_GATE_CHANCE: 0.65,  // 刺层中门的比例
    TENANT_FROM: 11,           // 前 10 层不出致命住户（即死规则的挫败对冲）
    TENANT_RATE_TOP: 0.3,      // m3x：11-24 层空窗修正，前段住户加密
    TENANT_RATE_BOTTOM: 0.45,  // 住户独立于坝的生成率（前段不再空走廊；第五刀：前段回调防早死）
    BUG_BODY_R: 22,            // 吊灯虫本体受击半径（子弹直接命中才掉血）
    FISH_SPEED: 190,
    FISH_RX: 46,
    FISH_RY: 22,

    /* 泄洪（§8：破坝后跟着水头掉得更快） */
    FLUSH_BOOST_MULT: 1.4,
    FLUSH_BOOST_TIME: 0.9,

    /* 吊灯虫（§7：光圈脉冲收缩，缩小时是穿过窗口） */
    BUG_RING_BASE: 72,
    BUG_RING_AMP: 34,
    BUG_RING_SPEED: 2.2,

    /* 手感修正（针对试玩反馈：捡不到 / 一直掉太容易 / 怪物没存在感） */
    COLLECT_R: 60,          // 拾取收集半径（原 46）
    MAGNET_R: 150,          // 磁吸触发半径
    MAGNET_PULL: 9,         // 磁吸强度（每秒）
    HARD_LAND_SPEED: 1050,  // 落地速度超过此值 = 扣血
    SOFT_LAND_SPEED: 650,   // 超过此值 = 大弹开（不扣血）
    T_MAGNET: true,
    T_HARDLAND: true,
    T_BIGFISH: true,

    LAT_MAX: 340,           // 手动横向速度上限
    LAT_ACCEL: 1800,        // 按住侧的横向加速度
    LAT_DAMP: 8.0,          // 松手横向阻尼（每秒衰减系数）

    PLAYER_R: 26,
    CAM_ANCHOR: 0.35,
    CAM_SMOOTH: 9,

    STEP: 1 / 120,          // 固定物理步：30FPS 下防穿透
    MAX_SUB: 10,
    BULLET_MAX: 36,
    PARTICLE_MAX: 80,

    BANDS: [
      { to: 25, idx: 0, wall: '#6b4f2a', bg: '#241b12', name: '草根层' },
      { to: 50, idx: 1, wall: '#585741', bg: '#1e1f16', name: '沉物层' },
      { to: 75, idx: 2, wall: '#2f4a63', bg: '#111d29', name: '滴水层' },
      { to: 99, idx: 3, wall: '#241f33', bg: '#0a0810', name: '暗河层' }
    ]
  };

  /* ===================== 工具 ===================== */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function bandOf(floor) {
    for (var i = 0; i < CFG.BANDS.length; i++) {
      if (floor <= CFG.BANDS[i].to) return CFG.BANDS[i];
    }
    return CFG.BANDS[CFG.BANDS.length - 1];
  }

  /* ===================== M2 构筑：改装池（§9 全 10 项）+ 遗物（§9 全 8 件） ===================== */
  var MODS = [
    { id: 'split',   name: '分裂壳', max: 2, line: 'volley', tier: 1, desc: '出膛一分为三',  desc2: '再分，共五份' },
    { id: 'bounce',  name: '跳弹簧', max: 2, line: 'volley', tier: 1, desc: '籽碰壁反弹一次', desc2: '反弹两次' },
    { id: 'rate',    name: '连发嗑', max: 2, line: 'volley', tier: 1, desc: '射速 +30%',     desc2: '射速再 +30%' },
    { id: 'hard',    name: '硬壳籽', max: 2, line: 'volley', tier: 1, desc: '籽伤害 +1',     desc2: '伤害再 +1' },
    { id: 'spring',  name: '弹簧托', max: 2, line: 'move',   tier: 1, desc: '后坐力 +25%',   desc2: '后坐力再 +25%' },
    { id: 'pouch',   name: '深颊囊', max: 2, line: 'econ',   tier: 1, desc: '弹上限+10 拾取更远', desc2: '再+10 再远 30%' },
    { id: 'blast',   name: '炸壳弹', max: 2, line: 'volley', tier: 2, desc: '命中处小范围炸开住户', desc2: '炸的范围 +50%' },
    { id: 'pierce',  name: '穿甲仁', max: 2, line: 'volley', tier: 1, desc: '籽可多穿 1 个目标', desc2: '再多穿 1 个' },
    { id: 'wind',    name: '追风籽', max: 1, line: 'volley', tier: 2, desc: '轻微追踪最近的住户' },
    { id: 'feather', name: '伞尾毛', max: 1, line: 'move',   tier: 1, desc: '下坠上限 -12%，更可控' },
    { id: 'gut',     name: '开膛钩', max: 1, line: 'aim',    tier: 2, desc: '命中弱点后，下一发伤害翻倍' },
    { id: 'gaze',    name: '凝视',   max: 1, line: 'aim',    tier: 1, desc: '命中弱点后 1 秒内，后坐力 +30%' },
    { id: 'eye',     name: '鹰眼',   max: 1, line: 'aim',    tier: 1, desc: '弱点窗口 +20%' },
    { id: 'hammer',  name: '重锤籽', max: 1, line: 'aim',    tier: 2, desc: '伤害 +1，但弹速 -25%' },
    { id: 'hold',    name: '屏息',   max: 1, line: 'volley', tier: 2, desc: '两发间隔超 0.5 秒时，伤害翻倍' },
    { id: 'fin',     name: '侧风鳍', max: 1, line: 'move',   tier: 2, desc: '横移 +30%，但下落上限 +8%' }
  ];

  var RELICS = [
    { id: 'amulet', name: '爷爷的护身符', line: 'econ',   tier: 1, desc: '受击后无敌时间翻倍' },
    { id: 'egg',    name: '双黄蛋',       line: 'econ',   tier: 1, desc: '捡到立刻补 1 颗心' },
    { id: 'ball',   name: '漏气的皮球',   line: 'move',   tier: 1, desc: '贴着井壁时缓缓下滑' },
    { id: 'map',    name: '村长假图纸',   line: 'econ',   tier: 2, desc: '通开关底免费送一次三选一' },
    { id: 'salt',   name: '咸瓜子',       line: 'econ',   tier: 1, desc: '串丝蛛撞你先被咸晕' },
    { id: 'echo',   name: '会回音的井段', line: 'volley', tier: 2, desc: '籽飞出屏幕底部会弹回来一次' },
    { id: 'seedbag',name: '向日葵籽袋',   line: 'econ',   tier: 1, desc: '每过 10 层颊囊回满' },
    { id: 'mega',   name: '尖叫扩音器',   line: 'volley', tier: 2, desc: '高速下坠时打籽伤害 +1' },
    { id: 'loan',   name: '淘井人贷款',   line: 'econ',   tier: 2, desc: '立刻 +15 弹，之后 2 层拾取减半' },
    { id: 'kit',    name: '应急包',       line: 'econ',   tier: 1, desc: '空手状态下拾取翻倍' },
    { id: 'shell',  name: '龟壳护身',     line: 'move',   tier: 3, desc: '免死一次，但之后 2 层水涨得更快' },
    { id: 'crate',  name: '遗弃的弹药箱', line: 'volley', tier: 3, desc: '立刻回满弹，本层补给全部消失' }
  ];

  /* 卡片图标：只用 Unicode ≤9 的 emoji（Android 8.1 出厂字库可渲染，不缺字） */
  var ICONS = {
    split: '\u{1F386}',  bounce: '\u{1F3C0}', rate: '\u{1F525}',  hard: '\u{1F95C}',
    spring: '\u2B06\uFE0F', pouch: '\u{1F45D}', blast: '\u{1F4A5}', pierce: '\u2694\uFE0F',
    wind: '\u{1F300}',   feather: '\u2602\uFE0F',
    amulet: '\u{1F4FF}', egg: '\u{1F95A}',   ball: '\u26BD',     map: '\u{1F4DC}',
    salt: '\u{1F330}',   echo: '\u{1F50A}',  seedbag: '\u{1F33B}', mega: '\u{1F4E3}',
    gut: '\u{1F52A}',    gaze: '\u{1F441}\uFE0F', eye: '\u{1F50D}',  hammer: '\u{1F528}',
    hold: '\u231B',      fin: '\u{1F42C}',   loan: '\u{1F4B3}',  kit: '\u{1F392}',
    shell: '\u{1F422}',  crate: '\u{1F4E6}'
  };

  function lvl(id) { return (P && P.mods && P.mods[id]) || 0; }
  function tierMaxHp() { return CFG.TIER_HP[gTier - 1] || 3; }
  var TIER_NAMES = ['简单', '标准', '困难'];
  function tierName(t) { return TIER_NAMES[t - 1] || '标准'; }
  function atkLevels() {
    return lvl('split') + lvl('rate') + lvl('hard') + lvl('blast') + lvl('pierce') + lvl('wind') + lvl('mega') + lvl('hammer');
  }
  /* ==== m4a 四系共鸣：2 张起每张 +6%，4 张质变+锁池（偏科契约） ==== */
  function lineCount(line) {
    var c = 0, i;
    for (i = 0; i < MODS.length; i++) if (MODS[i].line === line && lvl(MODS[i].id) > 0) c++;
    for (i = 0; i < RELICS.length; i++) if (RELICS[i].line === line && lvl(RELICS[i].id) > 0) c++;
    return c;
  }
  function lineBonus(line) { return 0.06 * Math.max(0, lineCount(line) - 1); }
  function linePerk(line) { return lineCount(line) >= 4; }
  function wallGrace() { return linePerk('move') && P.wallT >= 0.4; }
  function onWeakHit() {
    if (P.mods.gut) P.gutArmed = true;
    if (P.mods.gaze) P.gazeT = 1;
    if (linePerk('aim') && P.ammo < ammoCap()) P.ammo++;
  }
  function ammoCap() { return CFG.AMMO_MAX + 10 * lvl('pouch'); }

  /* ===================== DOM ===================== */
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var elResult = document.getElementById('result');
  var elResTitle = document.getElementById('result-title');
  var elResDepth = document.getElementById('result-depth');
  var elResMeta = document.getElementById('result-meta');
  var elHint = document.getElementById('result-hint');
  var barBtns = [document.getElementById('btn-x1'), document.getElementById('btn-x2'), document.getElementById('btn-x3')];
  var resBtns = [document.getElementById('rx1'), document.getElementById('rx2'), document.getElementById('rx3')];
  var togBtns = [document.getElementById('btn-t-magnet'), document.getElementById('btn-t-hard'), document.getElementById('btn-t-fish')];
  var elPick3 = document.getElementById('pick3');
  var elHome = document.getElementById('home');
  var htBtns = [document.getElementById('ht1'), document.getElementById('ht2'), document.getElementById('ht3')];
  var elHomeStat = document.getElementById('home-stat');
  var elMute = document.getElementById('btn-mute');
  var p3Btns = [document.getElementById('p3-0'), document.getElementById('p3-1'), document.getElementById('p3-2')];
  var elReportImg = document.getElementById('report-img');
  var elShareBtns = document.getElementById('share-btns');
  var elShareStatus = document.getElementById('share-status');

  var VIEW = { cw: 720, ch: 1280, scale: 1, h: 1280, dpr: 1 };

  function resize() {
    var rect = cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.max(1, Math.round(rect.width * dpr));
    var ch = Math.max(1, Math.round(rect.height * dpr));
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    VIEW.cw = cw; VIEW.ch = ch; VIEW.dpr = dpr;
    VIEW.scale = cw / CFG.LOGICAL_W;
    VIEW.h = ch / VIEW.scale;
  }

  /* ===================== 井几何（连续函数，无层间接缝） ===================== */
  function shaftCx(y) { return CFG.LOGICAL_W * 0.5 + Math.sin(y * 0.00107) * 78; }
  function shaftW(y) {
    var t = clamp(y / (CFG.FLOOR_H * CFG.TOTAL_FLOORS), 0, 1);
    return lerp(CFG.WELL_W_TOP, CFG.WELL_W_BOTTOM, t) + Math.sin(y * 0.00061 + 1.7) * 34;
  }
  function shaftL(y) { return shaftCx(y) - shaftW(y) * 0.5; }
  function shaftR(y) { return shaftCx(y) + shaftW(y) * 0.5; }
  /* 蛙嘴世界坐标：贴图嘴线实测在 ~43% 高度处，绘制起点 fg.y - 0.45*fh，压扁系数与 drawFrog 同式 */
  function frogMouthY(fy) {
    var fh = shaftW(fy) * 1.04 * (416 / 640) * 0.62;
    return fy - fh * 0.02;
  }

  /* ===================== 存档（jiao-fall-v1，尽力而为） ===================== */
  var SAVE_KEY = 'jiao-fall-v1';
  var gSave = null;

  function defaultSave() {
    return { deepest: 0, streak: 0, lastDate: '', todayBest: 0, todayFloor: 0, todayTries: 0, yesterdayFloor: 0, totalRuns: 0 };
  }

  function loadSave() {
    gSave = defaultSave();
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        if (typeof o.deepest === 'number') gSave.deepest = o.deepest;
        if (typeof o.streak === 'number') gSave.streak = o.streak;
        if (typeof o.lastDate === 'string') gSave.lastDate = o.lastDate;
        if (typeof o.todayBest === 'number') gSave.todayBest = o.todayBest;
        if (typeof o.todayFloor === 'number') gSave.todayFloor = o.todayFloor;
        if (typeof o.todayTries === 'number') gSave.todayTries = o.todayTries;
        if (typeof o.yesterdayFloor === 'number') gSave.yesterdayFloor = o.yesterdayFloor;
        if (typeof o.totalRuns === 'number') gSave.totalRuns = o.totalRuns;
      }
    } catch (e) {
      gSave = defaultSave();
    }
    if (gSave.lastDate !== todayKey()) {
      gSave.yesterdayFloor = gSave.todayFloor;
      gSave.todayBest = 0;
      gSave.todayFloor = 0;
      gSave.todayTries = 0;
    }
  }

  function saveSave() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(gSave));
    } catch (e) { /* 容器不保证持久，静默降级 */ }
  }

  function recordRun(deepest) {
    if (S.headless) return;
    gSave.totalRuns++;
    gSave.todayTries++;
    if (deepest > gSave.deepest) gSave.deepest = deepest;
    if (deepest > gSave.todayBest) gSave.todayBest = deepest;
    gSave.todayFloor = deepest;
    gSave.lastDate = todayKey();
    saveSave();
  }

  /* ===================== 状态 ===================== */
  var VER = 'm4k';
  var S = null;
  var P = null;
  var gTier = 3;   // 血量档：1=3血(新手) 2=2血(标准) 3=1血(进阶)；本版默认 1 血交付手感
  var gDebug = false;
  var gAttract = true;   // 首页期间：井画着但物理不推进（潭水钟也不走）
  var fps = 60, fpsAcc = 0, fpsN = 0;

  function todayKey() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + (m < 10 ? '0' : '') + m + (day < 10 ? '0' : '') + day;
  }

  function parseUrlOpts() {
    var params = (window.location.search || '');
    if (params.indexOf('debug=1') >= 0) gDebug = true;
    var mx = params.indexOf('x=');
    if (mx >= 0) {
      var v = parseInt(params.charAt(mx + 2), 10);
      if (v === 1 || v === 2 || v === 3) gTier = v;
    }
  }

  function newRun() {
    S = {
      seedKey: 'fall-' + todayKey(),
      floors: {},
      camY: 0,
      t: 0,
      runT: 0,
      over: false,
      win: false,
      cause: '',
      firing: false,
      waterY: 1e12,       // 逻辑水线（全局绝对坐标，单调不回退）
      waterTop: 1e12,     // 绘制水线（缓动）
      waterOn: false,
      shots: 0,
      brokeBlocks: 0,
      ammoOutT: -1,
      hitsTaken: 0,
      hitLog: [],
      acc: 0,
      waterDmg: 0,
      lastFloor: 1,
      flushT: 0,
      pick3: null,
      lastPick3Floor: 0,
      pickLog: [],
      finalDeepest: 0,
      reportData: null,
      replay: null,
      shake: 0,
      slowmo: 0,
      frogCorpse: null,
      frogText: null,
      floatTexts: [],
      lastShotT: -1, chargeNext: false, loanT: 0, shellT: 0, pickRound: 0, frogKills: 0,
      flashT: 0,
      animT: 0
    };

    P = {
      x: shaftCx(0), y: 260, vx: 0, vy: 0, r: CFG.PLAYER_R,
      hp: tierMaxHp(), ammo: CFG.AMMO_START, invuln: 0, fireCd: 0,
      gazeT: 0, wallT: 0, gutArmed: false, shellUsed: false,
      floor: 1, deepest: 1, dwell: 0, alive: true,
      mods: {}
    };

    S.bullets = [];
    for (var b = 0; b < CFG.BULLET_MAX; b++) {
      S.bullets.push({ live: false, x: 0, y: 0, vx: 0, dmg: 1, bounces: 0, bMax: 0, pierce: 0, dirY: 1, echoed: false });
    }
    S.particles = [];
    for (var p = 0; p < CFG.PARTICLE_MAX; p++) {
      S.particles.push({ live: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, ttl: 0, c: '#fff', s: 3 });
    }

    S.camY = P.y - VIEW.h * CFG.CAM_ANCHOR;
    elResult.className = 'hidden';
    syncTierBtns();
  }

  /* ===================== 井内容（按层独立 RNG，懒生成） ===================== */
  function mkPickup(y, rnd, kind) {
    var l = shaftL(y) + 40, r = shaftR(y) - 40;
    if (r < l) { var c = shaftCx(y); l = c - 20; r = c + 20; }
    return { x: lerp(l, r, rnd()), y: y, kind: kind, amt: kind === 'bag' ? 8 : 4, taken: false };
  }

  function mkSpider(y, rnd, t) {
    var hp = Math.round(lerp(3, 5, t));
    return {
      y: y, x: shaftCx(y), dir: rnd() < 0.5 ? -1 : 1,
      hp: hp, maxHp: hp, alive: true, hitT: -9,
      sp: Math.round(CFG.FISH_SPEED * lerp(1, 1.5, t))
    };
  }

  function mkBug(y, rnd, t) {
    var hp = Math.round(lerp(3, 5, t));
    return {
      y: y, x: shaftCx(y),
      hp: hp, maxHp: hp, alive: true, hitT: -9,
      ph: rnd() * 6.28, ringR: CFG.BUG_RING_BASE, rs: lerp(1, 1.4, t)
    };
  }

  /* ==== m4g D1：带 / 坝 / 守卫 联合排位 ====
     带必须在坝上方：破坝那一瞬玩家没有反应距离再过一道门。
     守卫与带必须垂直分离：串丝蛛全身巡游且身体半宽 ≥ 缺口可用余量，水平错开无效（见草案 §0）。
     两趟扫描 + 计数选取：生成期零数组分配，分布不塌向窗口顶端。 */
  function guardFits(by2, bc, need, guardTy, top) {
    var y, lo, hi;
    if (guardTy === 2) return Math.abs(by2 - CFG.GUARD_BUG_OFF - bc) >= need;
    lo = Math.max(top + CFG.TENANT_FLOOR_MIN, by2 - CFG.GUARD_SPIDER_OFF_HI);
    hi = by2 - CFG.GUARD_SPIDER_OFF_LO;
    for (y = lo; y <= hi; y += CFG.SPIKE_Y_STEP) if (Math.abs(y - bc) >= need) return true;
    return false;
  }

  function solveBandDam(top, byIn, guardTy, rnd) {
    var out = { y0: -1, by: byIn, gy: -1 };
    var hasDam = byIn > 0;
    var bandHalf = CFG.SPIKE_BAND_H * 0.5 + CFG.PLAYER_R;
    var need = guardTy ? bandHalf + (guardTy === 2 ? CFG.GUARD_H_BUG : CFG.GUARD_H_SPIDER) : 0;
    var y0, by2, bc, cntY = 0, cntB = 0, ky, kb;
    for (y0 = CFG.SPIKE_Y_MIN; y0 <= CFG.SPIKE_Y_MAX; y0 += CFG.SPIKE_Y_STEP) {
      if (!hasDam) { cntY++; continue; }
      bc = top + y0 + CFG.SPIKE_BAND_H * 0.5;
      for (by2 = top + CFG.DAM_Y_MIN; by2 <= top + CFG.DAM_Y_MAX; by2 += CFG.DAM_Y_STEP) {
        if (top + y0 + CFG.SPIKE_BAND_H + CFG.BAND_DAM_CLEAR > by2) continue;
        if (need > 0 && !guardFits(by2, bc, need, guardTy, top)) continue;
        cntB++;
      }
      if (cntB > 0) cntY++;
      cntB = 0;
    }
    if (!cntY) return out;
    ky = Math.floor(rnd() * cntY);
    for (y0 = CFG.SPIKE_Y_MIN; y0 <= CFG.SPIKE_Y_MAX; y0 += CFG.SPIKE_Y_STEP) {
      if (!hasDam) { if (ky-- === 0) break; continue; }
      bc = top + y0 + CFG.SPIKE_BAND_H * 0.5;
      for (by2 = top + CFG.DAM_Y_MIN; by2 <= top + CFG.DAM_Y_MAX; by2 += CFG.DAM_Y_STEP) {
        if (top + y0 + CFG.SPIKE_BAND_H + CFG.BAND_DAM_CLEAR > by2) continue;
        if (need > 0 && !guardFits(by2, bc, need, guardTy, top)) continue;
        cntB++;
      }
      if (cntB > 0) { if (ky-- === 0) break; }
      cntB = 0;
    }
    out.y0 = y0;
    if (!hasDam) return out;
    bc = top + y0 + CFG.SPIKE_BAND_H * 0.5;
    kb = Math.floor(rnd() * cntB);
    for (by2 = top + CFG.DAM_Y_MIN; by2 <= top + CFG.DAM_Y_MAX; by2 += CFG.DAM_Y_STEP) {
      if (top + y0 + CFG.SPIKE_BAND_H + CFG.BAND_DAM_CLEAR > by2) continue;
      if (need > 0 && !guardFits(by2, bc, need, guardTy, top)) continue;
      if (kb-- === 0) break;
    }
    out.by = by2;
    if (guardTy === 2) out.gy = by2 - CFG.GUARD_BUG_OFF;
    else if (guardTy === 1) {
      var lo = Math.max(top + CFG.TENANT_FLOOR_MIN, by2 - CFG.GUARD_SPIDER_OFF_HI);
      var hi = by2 - CFG.GUARD_SPIDER_OFF_LO, n2 = 0, y2;
      for (y2 = lo; y2 <= hi; y2 += CFG.SPIKE_Y_STEP) if (Math.abs(y2 - bc) >= need) n2++;
      ky = n2 ? Math.floor(rnd() * n2) : -1;
      for (y2 = lo; y2 <= hi; y2 += CFG.SPIKE_Y_STEP) {
        if (Math.abs(y2 - bc) < need) continue;
        if (ky-- === 0) { out.gy = y2; break; }
      }
      if (out.gy < 0) out.gy = Math.max(lo, Math.min(hi, bc - need));
    }
    return out;
  }

  function freeTenantFits(y, by, bc, need) {
    if (by > 0 && y > by - CFG.TENANT_DAM_IN && y < by + CFG.BLOCK_THICK + CFG.TENANT_DAM_FALL) return false;
    if (bc > 0 && Math.abs(y - bc) < need) return false;
    return true;
  }

  /* 籽只往下飞、坝是全宽实心闸 ⇒ 紧贴坝下方的住户从上方打不到，破坝后又正好满速撞脸 */
  function solveFreeTenant(top, by, bandY0, isSpider, rnd) {
    var lo = top + CFG.TENANT_Y_MIN, hi = top + CFG.TENANT_Y_MAX;
    var bc = bandY0 >= 0 ? top + bandY0 + CFG.SPIKE_BAND_H * 0.5 : -1;
    var need = bc > 0 ? CFG.SPIKE_BAND_H * 0.5 + CFG.PLAYER_R + (isSpider ? CFG.GUARD_H_SPIDER : CFG.GUARD_H_BUG) : 0;
    var y, cnt = 0;
    for (y = lo; y <= hi; y += CFG.SPIKE_Y_STEP) if (freeTenantFits(y, by, bc, need)) cnt++;
    if (!cnt) return -1;
    var k = Math.floor(rnd() * cnt);
    for (y = lo; y <= hi; y += CFG.SPIKE_Y_STEP) {
      if (!freeTenantFits(y, by, bc, need)) continue;
      if (k-- === 0) return y;
    }
    return -1;
  }

  function buildFloor(n) {
    var top = (n - 1) * CFG.FLOOR_H;
    var f = { n: n, top: top, block: null, spike: null, fish: null, bug: null, frog: null, stones: null, pickups: [] };
    var t = (n - 1) / (CFG.TOTAL_FLOORS - 1);

    /* 前 5 层：固定教学走廊（审阅补充项，冷流量前 10 秒定生死） */
    if (n <= 5) {
      if (n === 1) {
        f.pickups.push(mkPickup(top + 700, mulberry32(hashStr(S.seedKey + '#p1')), 'bag'));
      } else if (n === 2) {
        f.block = { y: top + 760, hp: 2, maxHp: 2, broken: false };
        f.pickups.push(mkPickup(top + 380, mulberry32(hashStr(S.seedKey + '#p2')), 'bag'));
      } else if (n === 3) {
        f.fish = { y: top + 620, x: shaftCx(top + 620), dir: 1, hp: 2, maxHp: 2, alive: true, hitT: -9 };
        f.pickups.push(mkPickup(top + 300, mulberry32(hashStr(S.seedKey + '#p3')), 'jar'));
      } else if (n === 4) {
        f.spike = { y0: top + 520, y1: top + 700, lenL: 150, lenR: 150 };   // 对称刺门教学：中间走过
        f.pickups.push(mkPickup(top + 900, mulberry32(hashStr(S.seedKey + '#p4')), 'jar'));
      } else if (n === 5) {
        f.block = { y: top + 700, hp: 4, maxHp: 4, broken: false };
        f.fish = { y: top + 400, x: shaftCx(top + 400), dir: -1, hp: 2, maxHp: 2, alive: true, hitT: -9 };
        f.pickups.push(mkPickup(top + 240, mulberry32(hashStr(S.seedKey + '#p5')), 'bag'));
      }
      return f;
    }

    var rnd = mulberry32(hashStr(S.seedKey + '#f' + n));

    /* 关底层（25/50/75）：看天蛙独占，血量随关递增 */
    if (n === 25 || n === 50 || n === 75) {
      var fhp = (n === 25 ? 9 : (n === 50 ? 15 : 22)) + Math.min(8, atkLevels() * 2);   // m4e：重定基+温和缩放，满弹匣必须打得死
      f.frog = { y: top + 640, hp: fhp, maxHp: fhp, alive: true, open: true, t: 0, openness: 1, mouthW: 170, hitT: -9 };
      f.stones = [];
      f.pickups.push(mkPickup(top + 300, rnd, 'jar'));
      return f;
    }

    /* --- m4g D1：先定"有没有"，再联合解 y；原实现四者各自独立 roll，同层撞车 51.8% --- */
    var wantBlock = rnd() < lerp(CFG.BLOCK_RATE_TOP, CFG.BLOCK_RATE_BOTTOM, t);
    var wantSpike = n >= CFG.SPIKE_FROM && rnd() < lerp(CFG.SPIKE_RATE_TOP, CFG.SPIKE_RATE_BOTTOM, t);
    var guardTy = 0, by = -1, bandY0 = -1, guardY = -1;
    if (wantBlock) {
      var gr = rnd();
      if (gr < 0.5) guardTy = 1; else if (gr < 0.85) guardTy = 2;
      by = top + CFG.DAM_Y_MIN + rnd() * (CFG.DAM_Y_MAX - CFG.DAM_Y_MIN);
    }
    if (wantSpike) {
      var sol = solveBandDam(top, by, guardTy, rnd);
      bandY0 = sol.y0;
      by = sol.by;
      guardY = sol.gy;
    }
    if (guardTy && guardY < 0) {
      guardY = guardTy === 2 ? by - CFG.GUARD_BUG_OFF
        : Math.max(top + CFG.TENANT_FLOOR_MIN, by - CFG.GUARD_SPIDER_OFF_LO - rnd() * (CFG.GUARD_SPIDER_OFF_HI - CFG.GUARD_SPIDER_OFF_LO));
    }

    if (by > 0) {
      var bhp = Math.round(lerp(CFG.BLOCK_HP_TOP, CFG.BLOCK_HP_BOTTOM, t * t));
      f.block = { y: by, hp: bhp, maxHp: bhp, broken: false };
    }

    /* B3 约束①：有坝必有补给——坝上方固定一个拾取；击杀成本↑后双份 30%→45%（m4a） */
    if (f.block) {
      f.pickups.push(mkPickup(f.block.y - 240, rnd, rnd() < 0.35 ? 'bag' : 'jar'));
      if (rnd() < 0.45) f.pickups.push(mkPickup(f.block.y - 430 - rnd() * 180, rnd, 'jar'));
    }
    /* B3 约束③：关底（25/50/75）前两层保证拾取 */
    if (n % 25 === 23 || n % 25 === 24) {
      f.pickups.push(mkPickup(top + 500 + rnd() * 400, rnd, 'bag'));
    }

    if (bandY0 >= 0) {
      var sy = top + bandY0;   // 只生在层中段：层界附近留安全窗，过界有喘息+观察时间
      var halfW = shaftW(sy) * 0.5;
      var rawLen = lerp(CFG.SPIKE_LEN_MIN, CFG.SPIKE_LEN_MAX, rnd());
      var maxLen = Math.max(36, halfW - 70);
      var sl3 = shaftCx(sy) - halfW, sr3 = shaftCx(sy) + halfW;
      var lenL = 0, lenR = 0;
      if (t > CFG.SPIKE_GATE_FROM && rnd() < CFG.SPIKE_GATE_CHANCE) {
        /* 对刺门：缺口偏出中线，走位=找缺口（全手动档下刺威胁的唯一来源） */
        var gapHalf = lerp(CFG.SPIKE_GAP_HALF, CFG.SPIKE_GAP_HALF_BOTTOM, t);
        var lo = sl3 + gapHalf + 40, hi = sr3 - gapHalf - 40;
        var gapCx = lo < hi ? lerp(lo, hi, rnd()) : shaftCx(sy);
        lenL = Math.round(gapCx - gapHalf - sl3);
        lenR = Math.round(sr3 - gapCx - gapHalf);
        if (lenL < 30) lenL = 0;
        if (lenR < 30) lenR = 0;
        if (!lenL && !lenR) lenL = Math.round(Math.min(rawLen, maxLen));
      } else {
        var len1 = Math.round(Math.min(rawLen, maxLen));
        if (rnd() < 0.5) lenL = len1; else lenR = len1;
      }
      f.spike = { y0: sy, y1: sy + CFG.SPIKE_BAND_H, lenL: lenL, lenR: lenR };
    }

    /* B3 约束②：住户绑定坝——一层至多一户，y 已由排位解出 */
    if (guardTy === 1) f.fish = mkSpider(guardY, rnd, t);
    else if (guardTy === 2) f.bug = mkBug(guardY, rnd, t);
    /* M4 统调：住户独立于坝生成（前段空走廊的根因是住户绑死在坝上） */
    if (!f.fish && !f.bug && n >= CFG.TENANT_FROM && rnd() < lerp(CFG.TENANT_RATE_TOP, CFG.TENANT_RATE_BOTTOM, t)) {
      var isSpider = rnd() < 0.6;
      var ty = solveFreeTenant(top, by, bandY0, isSpider, rnd);
      if (ty > 0) { if (isSpider) f.fish = mkSpider(ty, rnd, t); else f.bug = mkBug(ty, rnd, t); }
    }

    var cnt = (rnd() < 0.75 ? 1 : 0) + (rnd() < 0.15 ? 1 : 0);   // m4a：期望 0.8→0.9 个/层，补弱点收窄后的击杀成本
    for (var i = 0; i < cnt; i++) {
      f.pickups.push(mkPickup(top + 160 + rnd() * 960, rnd, rnd() < 0.35 ? 'bag' : 'jar'));
    }
    return f;
  }

  function floorAt(n) {
    if (n < 1) n = 1;
    if (n > CFG.TOTAL_FLOORS) n = CFG.TOTAL_FLOORS;
    var f = S.floors[n];
    if (!f) { f = buildFloor(n); S.floors[n] = f; }
    return f;
  }

  function floorOf(y) { return clamp(Math.floor(y / CFG.FLOOR_H) + 1, 1, CFG.TOTAL_FLOORS); }

  /* 横冲鱼体型：开启后随井宽缩放，成为真正拦路的"门"而非瞬时彩票 */
  function fishRx(fi) { return CFG.T_BIGFISH ? clamp(shaftW(fi.y) * 0.32, 40, 150) : CFG.FISH_RX; }
  function fishRy(fi) { return CFG.T_BIGFISH ? 46 : CFG.FISH_RY; }

  /* ===================== 对象池 ===================== */
  function spawnBullet(x, y, vx) {
    for (var i = 0; i < S.bullets.length; i++) {
      var b = S.bullets[i];
      if (!b.live) {
        b.live = true;
        b.x = x; b.y = y;
        b.vx = vx || 0;
        var dm = 1 + lvl('hard') + ((P.mods.mega && Math.abs(P.vy) >= 1200) ? 1 : 0) + lvl('hammer');
        if (S.chargeNext) dm *= 2;
        if (P.gutArmed) { dm *= 2; P.gutArmed = false; }
        b.dmg = dm;
        b.bMax = lvl('bounce');
        b.bounces = 0;
        b.pierce = lvl('pierce');
        b.dirY = 1;
        b.echoed = false;
        b.sp = (CFG.SEED_SPEED + Math.max(0, P.vy)) * (1 - 0.25 * lvl('hammer'));   // 继承下落速度：俯冲射出更快更密（m3r）
        return;
      }
    }
  }

  function burst(x, y, n, color, spread) {
    if (S.headless) return;
    var made = 0;
    for (var i = 0; i < S.particles.length && made < n; i++) {
      var p = S.particles[i];
      if (!p.live) {
        p.live = true; p.x = x; p.y = y;
        var a = Math.random() * Math.PI * 2;
        var sp = spread * (0.35 + Math.random() * 0.85);
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 60;
        p.t = 0; p.ttl = 0.32 + Math.random() * 0.3;
        p.c = color; p.s = 2 + Math.random() * 3;
        made++;
      }
    }
  }

  /* ===================== 开火 ===================== */
  function fire() {
    if (!P.alive || S.over) return;
    if (P.ammo <= 0 || P.fireCd > 0) return;
    var prevShotT = S.lastShotT;
    S.lastShotT = S.runT;
    S.chargeNext = !!(P.mods.hold && prevShotT >= 0 && S.runT - prevShotT > 0.5);
    P.ammo--;
    P.fireCd = CFG.FIRE_CD / (1 + 0.3 * lvl('rate') + (linePerk('volley') ? 0.2 : 0));
    S.shots++;
    if (P.ammo === 0 && S.ammoOutT < 0) S.ammoOutT = S.runT;
    var sp = lvl('split');
    if (linePerk('volley') && sp < 2) sp = 2;   // 弹幕大成：分裂视为满级
    var n = 1 + sp * 2;
    for (var i2 = 0; i2 < n; i2++) {
      spawnBullet(P.x, P.y + P.r + 4, (i2 - (n - 1) / 2) * 170);
    }
    P.vy = CFG.RECOIL_VY * (1 + 0.25 * lvl('spring') + (P.mods.gaze && P.gazeT > 0 ? 0.3 : 0));  // 赋值式
    if (P.vy < -CFG.RISE_CAP) P.vy = -CFG.RISE_CAP;
    burst(P.x, P.y + P.r + 8, 3, '#e8d9a8', 90);
    sfx('seed');
  }

  /* ===================== 横向：按住哪侧往哪侧（唯一手动档，m3q） ===================== */
  function applyXModel(dt) {
    var l = shaftL(P.y) + P.r + 3;
    var r = shaftR(P.y) - P.r - 3;
    if (r < l) { var c = shaftCx(P.y); l = c; r = c; }
    var want = (S.steerR ? 1 : 0) - (S.steerL ? 1 : 0);
    var amx = CFG.LAT_ACCEL * (1 + 0.3 * lvl('fin'));
    var vmx = CFG.LAT_MAX * (1 + lineBonus('move'));
    if (want !== 0) {
      P.vx += want * amx * dt;
      if (P.vx > vmx) P.vx = vmx;
      else if (P.vx < -vmx) P.vx = -vmx;
    } else {
      P.vx -= P.vx * Math.min(1, CFG.LAT_DAMP * dt);
    }
    P.x += P.vx * dt;
    if (P.x <= l) { P.x = l; P.vx = 0; }
    else if (P.x >= r) { P.x = r; P.vx = 0; }
    if (P.x <= l + 1 || P.x >= r - 1) P.wallT += dt; else P.wallT = 0;
  }

  /* 命中/弹开 飘字（纯视觉，无头模拟跳过） */
  function floatText(x, y, str, color) {
    if (S.headless) return;
    S.floatTexts.push({ x: x, y: y, str: str, color: color, t: 0 });
    if (S.floatTexts.length > 10) S.floatTexts.shift();
  }

  /* 细血条：受击后显示 1.5s 再淡出，白影=刚掉的那一格（m3w 改时间戳驱动，出屏也不再冻结） */
  function drawHpBar(cx, topY, ent, w, color) {
    if (!ent.maxHp) return;
    var age = S.animT - (ent.hitT === undefined ? -9 : ent.hitT);
    if (age > 1.5) return;
    var a = Math.min(1, (1.5 - age) / 0.4);
    var f = Math.max(0, ent.hp / ent.maxHp);
    var fs = Math.min(1, (ent.hp + 1) / ent.maxHp);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,12,16,0.35)';
    ctx.fillRect(cx - w / 2, topY, w, 3);
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(cx - w / 2, topY, w * fs, 3);
    ctx.fillStyle = color;
    ctx.fillRect(cx - w / 2, topY, w * f, 3);
    ctx.globalAlpha = 1;
  }

  /* ===================== 伤害 ===================== */
  function hurt(cause, pushUp) {
    if (S.godMode || P.invuln > 0 || S.over) return;
    P.hp--;
    P.invuln = CFG.INVULN * (P.mods.amulet ? 2 : 1);
    S.hitsTaken++;
    S.hitLog.push(cause);
    S.cause = cause;
    if (pushUp) P.vy = Math.min(P.vy, -260);
    burst(P.x, P.y, 10, '#d9534f', 210);
    if (P.hp > 0) screamCall('hurt');
    if (P.hp <= 0) {
      /* 龟壳：免死一次，代价=之后 2 层水钟减半 */
      if (P.mods.shell && !P.shellUsed) {
        P.shellUsed = true; P.hp = 1; P.invuln = 2; S.shellT = 2;
        burst(P.x, P.y, 12, '#f2ead8', 260);
        return;
      }
      P.alive = false; endRun(cause);
    }
  }

  function endRun(cause) {
    S.over = true;
    S.win = false;
    S.cause = cause;
    S.firing = false;
    S.finalDeepest = P.deepest;
    recordRun(P.deepest);
    screamCall('death');
    /* 死亡回放背景：水从脚下涌起，把叫叫往上冲（结算卡即时出现，漂浮在其后） */
    S.waterOn = true;
    S.waterY = P.y + P.r * 0.4;
    S.waterTop = S.waterY + 500;
    S.replay = { type: 'float', t: 0 };
    showResult();
  }

  /* ===================== 物理 ===================== */
  function stepOnce(dt) {
    if (S.over) return;
    S.t += dt;

    /* --- 玩家垂直 --- */
    P.vy += CFG.GRAVITY * dt;
    var cap = (CFG.FALL_CAP_BASE + CFG.FALL_CAP_PER_FLOOR * P.floor) * (1 + 0.08 * lvl('fin'));
    if (S.flushT > 0) { cap *= CFG.FLUSH_BOOST_MULT; S.flushT -= dt; }
    if (lvl('feather') > 0) cap *= 0.88;
    if (P.mods.ball && P.vy > 0) {
      /* 漏气的皮球：贴壁缓降 */
      if (P.x - shaftL(P.y) < 40 || shaftR(P.y) - P.x < 40) P.vy = Math.min(P.vy, cap * 0.55);
    }
    if (P.vy > cap) P.vy = cap;
    if (P.vy < -CFG.RISE_CAP) P.vy = -CFG.RISE_CAP;

    var prevBottom = P.y + P.r;
    P.y += P.vy * dt;
    applyXModel(dt);

    if (P.fireCd > 0) P.fireCd -= dt;
    if (P.invuln > 0) P.invuln -= dt;
    if (P.gazeT > 0) P.gazeT -= dt;
    if (S.firing) fire();

    /* --- 遍历可见层+玩家上下各一层（m3w：蛙战姿态就是悬在它头上一层，只按可见屏会漏激活） --- */
    var n0 = Math.min(floorOf(Math.max(0, S.camY - 80)), P.floor - 1);
    var n1 = Math.max(floorOf(S.camY + VIEW.h + 80), P.floor + 1);
    for (var fn = n0; fn <= n1; fn++) {
      var f = floorAt(fn);

      /* 堵层：实心，落在上面 / 从下面撞头 */
      if (f.block && !f.block.broken) {
        var bl = shaftL(f.block.y), br = shaftR(f.block.y);
        var withinX = P.x + P.r > bl && P.x - P.r < br;
        if (withinX) {
          if (P.vy >= 0 && prevBottom <= f.block.y + 2 && P.y + P.r >= f.block.y) {
            P.y = f.block.y - P.r;
            var impact = P.vy;
            if (CFG.T_HARDLAND && impact > CFG.HARD_LAND_SPEED) {
              hurt('硬着陆', false);
              P.vy = -impact * 0.22;
            } else if (impact > CFG.SOFT_LAND_SPEED) {
              P.vy = -impact * 0.45;
            } else {
              P.vy = 0;
            }
          } else if (P.vy < 0 && P.y - P.r <= f.block.y + CFG.BLOCK_THICK && P.y + P.r > f.block.y + CFG.BLOCK_THICK) {
            P.y = f.block.y + CFG.BLOCK_THICK + P.r; P.vy = 0;
          }
        }
      }

      /* 壁刺：不可破坏的地形（模型①下会暴露"不可躲避"问题，这是故意的） */
      if (f.spike && P.y + P.r > f.spike.y0 && P.y - P.r < f.spike.y1) {
        var sm2 = (f.spike.y0 + f.spike.y1) * 0.5;
        var hitSpike = (P.x - P.r < shaftL(sm2) + f.spike.lenL) ||
                       (P.x + P.r > shaftR(sm2) - f.spike.lenR);
        if (hitSpike) hurt('蹭壁刺', true);
      }

      /* 横冲鱼：水平往返 = 有时间窗，三个模型都躲得掉 */
      if (f.fish && f.fish.alive) {
        var frx = fishRx(f.fish), fry = fishRy(f.fish);
        var fl = shaftL(f.fish.y) + frx, fr = shaftR(f.fish.y) - frx;
        f.fish.x += f.fish.dir * (f.fish.sp || CFG.FISH_SPEED) * dt;
        if (f.fish.x <= fl) { f.fish.x = fl; f.fish.dir = 1; }
        else if (f.fish.x >= fr) { f.fish.x = fr; f.fish.dir = -1; }
        var dx = (P.x - f.fish.x) / (frx + P.r * 0.7);
        var dy = (P.y - f.fish.y) / (fry + P.r * 0.8);
        if (dx * dx + dy * dy < 1 && !wallGrace()) {
          if (P.mods.salt) {
            f.fish.alive = false;
            burst(f.fish.x, f.fish.y, 8, '#e8d9a8', 170);
            f.pickups.push({ x: f.fish.x, y: f.fish.y, kind: 'jar', amt: 2, taken: false });
          } else {
            hurt('撞串丝蛛', true);
          }
        }
      }

      /* 吊灯虫：挂在坝上方，光圈脉冲——圈缩小时是穿过的窗口 */
      if (f.bug && f.bug.alive) {
        f.bug.ph += dt * CFG.BUG_RING_SPEED * (f.bug.rs || 1);
        f.bug.ringR = CFG.BUG_RING_BASE + Math.sin(f.bug.ph) * CFG.BUG_RING_AMP;
        var gdx = P.x - f.bug.x, gdy = P.y - f.bug.y;
        var reach = f.bug.ringR + P.r * 0.4;
        if (gdx * gdx + gdy * gdy < reach * reach && !wallGrace()) hurt('触吊灯虫', true);
      }

      /* 看天蛙：横踞井道的关底——嘴开时全身可打，闭嘴瞬间悬在嘴位会被咬 */
      if (f.frog && f.frog.alive) {
        var fg = f.frog;
        fg.t += dt;
        if (fg.t > (fg.open ? 1 : 1.65)) {
          fg.t = 0;
          fg.open = !fg.open;
          /* 咬人只在合嘴瞬间：嘴的收拢动画就是预警 */
          if (!fg.open) {
            var inMouth = Math.abs(P.x - shaftCx(fg.y)) < fg.mouthW * 0.5;
            if (inMouth && P.y + P.r > fg.y - 34 && P.y < fg.y + 10 && !wallGrace()) hurt('被看天蛙闷了一口', true);
          } else {
            /* 张嘴喷石：朝玩家方向扇形 3 颗（m3v：追踪+炮口火花，修"喷了但看不见"） */
            var sx0 = shaftCx(fg.y);
            var lead = Math.max(-230, Math.min(230, (P.x - sx0) * 1.4));
            for (var sti = 0; sti < 3; sti++) {
              f.stones.push({
                x: sx0 + (sti - 1) * 26, y: fg.y - 34,
                vx: lead + (sti - 1) * 120, vy: -660 - Math.random() * 90
              });
            }
            burst(sx0, fg.y - 40, 5, '#e8b23a', 160);
          }
        }
        fg.openness += ((fg.open ? 1 : 0) - fg.openness) * Math.min(1, 9 * dt);
        /* m4e 防死锁：弹尽且蛙活着时，蛙上方掉一袋（换层救济在蛙层到不了手） */
        if (P.ammo <= 6 && !f.frogRescued) {
          f.frogRescued = true;
          f.pickups.push(mkPickup(fg.y - 520, mulberry32(hashStr(S.seedKey + '#fr' + f.n)), 'bag'));
        }
        /* 蛙背是平台 */
        if (P.vy >= 0 && prevBottom <= fg.y - 6 && P.y + P.r >= fg.y - 8) {
          P.y = fg.y - 8 - P.r;
          P.vy = 0;
        }
      }

      /* 蛙喷的石子：抛物线弹幕，碰玩家扣血（gameplay，无头模拟也跑） */
      if (f.stones && f.stones.length) {
        for (var sti2 = f.stones.length - 1; sti2 >= 0; sti2--) {
          var stn = f.stones[sti2];
          stn.vy += 800 * dt;
          stn.x += stn.vx * dt;
          stn.y += stn.vy * dt;
          var sdx = P.x - stn.x, sdy = P.y - stn.y;
          var srr = 10 + P.r * 0.55;
          if (sdx * sdx + sdy * sdy < srr * srr) {
            hurt('被蛙喷的石子砸中', true);
            f.stones.splice(sti2, 1);
            continue;
          }
          if (stn.y > f.top + CFG.FLOOR_H + 60 || stn.x < shaftL(stn.y) - 24 || stn.x > shaftR(stn.y) + 24) f.stones.splice(sti2, 1);
        }
      }

      /* 拾取：磁吸 + 更大收集半径（解决"捡不到"），深颊囊每级再远 30% */
      var magR = CFG.MAGNET_R * (1 + 0.3 * lvl('pouch'));
      var colR = CFG.COLLECT_R * (1 + 0.3 * lvl('pouch'));
      for (var i = 0; i < f.pickups.length; i++) {
        var pk = f.pickups[i];
        if (pk.taken) continue;
        var ddx = P.x - pk.x, ddy = P.y - pk.y;
        var d2 = ddx * ddx + ddy * ddy;
        if (CFG.T_MAGNET && d2 < magR * magR && d2 > 1) {
          var pull = Math.min(1, CFG.MAGNET_PULL * dt);
          pk.x += ddx * pull;
          pk.y += ddy * pull;
          ddx = P.x - pk.x; ddy = P.y - pk.y;
          d2 = ddx * ddx + ddy * ddy;
        }
        if (d2 < colR * colR) {
          pk.taken = true;
          var amtG = pk.amt;
          if (linePerk('econ') && pk.kind !== 'bag') amtG = 8;   // 经济大成：拾取全变袋
          if (P.mods.kit && P.ammo === 0) amtG *= 2;              // 应急包：空手翻倍
          if (S.loanT > 0) amtG = Math.ceil(amtG * 0.5);          // 贷款期：拾取减半
          P.ammo = Math.min(ammoCap(), P.ammo + amtG);
          if (S.ammoOutT >= 0 && P.ammo > 0) S.ammoOutT = -1;
          burst(pk.x, pk.y, 6, '#e8b23a', 130);
        }
      }
    }

    /* --- 子弹 --- */
    for (var bi = 0; bi < S.bullets.length; bi++) {
      var bu = S.bullets[bi];
      if (!bu.live) continue;
      bu.y += (bu.sp || CFG.SEED_SPEED) * bu.dirY * dt;
      /* 追风籽：下方 600px 内最近住户，轻微转向牵引 */
      if (lvl('wind') > 0) {
        var bestDy = 600, tgt = null;
        var nf2 = floorOf(bu.y);
        for (var sc = 0; sc < 2; sc++) {
          var sf2 = floorAt(Math.min(CFG.TOTAL_FLOORS, nf2 + sc));
          if (sf2.fish && sf2.fish.alive && sf2.fish.y > bu.y && sf2.fish.y - bu.y < bestDy) { bestDy = sf2.fish.y - bu.y; tgt = sf2.fish; }
          if (sf2.bug && sf2.bug.alive && sf2.bug.y > bu.y && sf2.bug.y - bu.y < bestDy) { bestDy = sf2.bug.y - bu.y; tgt = sf2.bug; }
        }
        if (tgt) {
          bu.vx = clamp((bu.vx || 0) + (tgt.x > bu.x ? 1 : -1) * 320 * dt, -240, 240);
        }
      }
      if (bu.vx) {
        bu.x += bu.vx * dt;
        var bwl = shaftL(bu.y) + 5, bwr = shaftR(bu.y) - 5;
        if (bu.x < bwl && bu.vx < 0) {
          if (bu.bounces < bu.bMax) { bu.bounces++; bu.vx = -bu.vx; bu.x = bwl; }
          else { bu.live = false; continue; }
        } else if (bu.x > bwr && bu.vx > 0) {
          if (bu.bounces < bu.bMax) { bu.bounces++; bu.vx = -bu.vx; bu.x = bwr; }
          else { bu.live = false; continue; }
        }
      }
      /* 会回音的井段：飞出屏幕底部弹回一次 */
      if (bu.dirY > 0 && bu.y > S.camY + VIEW.h + 260) {
        if (P.mods.echo && !bu.echoed) { bu.echoed = true; bu.dirY = -1; }
        else { bu.live = false; continue; }
      }
      if (bu.dirY < 0 && bu.y < S.camY - 80) { bu.live = false; continue; }
      var bn = floorOf(bu.y);
      var bf = floorAt(bn);
      if (bf.block && !bf.block.broken &&
          bu.y >= bf.block.y && bu.y <= bf.block.y + CFG.BLOCK_THICK) {
        bf.block.hp -= bu.dmg;
        burst(bu.x, bf.block.y, 4, '#c9a06a', 120);
        if (bf.block.hp <= 0) {
          bf.block.broken = true;
          S.brokeBlocks++;
          S.flushT = CFG.FLUSH_BOOST_TIME;
          S.shake = 0.22;
          S.flashT = 0.15;
          burst(bu.x, bf.block.y + 20, 14, '#a9814e', 260);
        }
        /* 炸壳弹：命中坝时炸同层半径内的住户 */
        if (lvl('blast') > 0) {
          var brad = 40 * (1 + 0.5 * (lvl('blast') - 1));
          var brad2 = brad * brad;
          if (bf.fish && bf.fish.alive) {
            var bax = bu.x - bf.fish.x, bay = bu.y - bf.fish.y;
            if (bax * bax + bay * bay < brad2) {
              bf.fish.alive = false;
              bf.pickups.push({ x: bf.fish.x, y: bf.fish.y, kind: 'jar', amt: 2, taken: false });
            }
          }
          if (bf.bug && bf.bug.alive) {
            var bbx = bu.x - bf.bug.x, bby = bu.y - bf.bug.y;
            if (bbx * bbx + bby * bby < brad2) bf.bug.hp -= bu.dmg;
            if (bf.bug.hp <= 0) {
              bf.bug.alive = false;
              bf.pickups.push({ x: bf.bug.x, y: bf.bug.y, kind: 'jar', amt: 4, taken: false });
            }
          }
        }
        if (bu.pierce > 0) { bu.pierce--; bu.y = bf.block.y + CFG.BLOCK_THICK + 2; }
        else bu.live = false;
        continue;
      }
      if (bf.bug && bf.bug.alive) {
        var wdx = bu.x - bf.bug.x, wdy = bu.y - bf.bug.y;
        var wd2 = wdx * wdx + wdy * wdy;
        var bodyR = CFG.BUG_BODY_R * (1 + 0.2 * lvl('eye') + lineBonus('aim'));
        if (wd2 < bodyR * bodyR) {
          bf.bug.hp -= bu.dmg;
          bf.bug.hitT = S.animT;
          floatText(bu.x, bu.y - 12, '-' + bu.dmg, '#e8b23a');
          onWeakHit();
          burst(bf.bug.x, bf.bug.y, 6, '#d8e86a', 160);
          if (bf.bug.hp <= 0) {
            bf.bug.alive = false;
            S.brokeBlocks++;
            if (bf.block && !bf.block.broken) {
              bf.block.broken = true;   // 震开它咬着的坝
              S.flushT = CFG.FLUSH_BOOST_TIME;
              S.shake = 0.22;
              S.flashT = 0.15;
              burst(bu.x, bf.block.y + 20, 14, '#a9814e', 260);
            }
            bf.pickups.push({ x: bf.bug.x, y: bf.bug.y, kind: 'jar', amt: 4, taken: false });
          }
          if (bu.pierce > 0) { bu.pierce--; } else { bu.live = false; }
          continue;
        }
        /* 光圈张开=盾：籽被弹开；收缩窗口才打得到本体（与穿圈同一时机，m3r 用户拍板） */
        if (bf.bug.ringR > CFG.BUG_RING_BASE && wd2 < bf.bug.ringR * bf.bug.ringR) {
          bu.live = false;
          burst(bu.x, bu.y, 3, '#d8e86a', 80);
          floatText(bu.x, bu.y - 12, '弹开', '#d8e86a');
          continue;
        }
      }
      if (bf.frog && bf.frog.alive && bf.frog.open && bf.frog.openness > 0.5) {
        var mcx = shaftCx(bf.frog.y);
        var mY = frogMouthY(bf.frog.y);
        if (Math.abs(bu.y - mY) < 34 && Math.abs(bu.x - mcx) < bf.frog.mouthW * 0.5 * (1 + 0.2 * lvl('eye') + lineBonus('aim'))) {   // m3y：弱点=嘴宽（m4a：鹰眼/共鸣放大）
          bu.live = false;
          bf.frog.hp--;
          bf.frog.hitT = S.animT;
          floatText(bu.x, mY - 24, '-' + bu.dmg, '#e8b23a');
          onWeakHit();
          burst(bu.x, mY - 10, 5, '#8fbf6a', 150);
          if (bf.frog.hp <= 0) {
            bf.frog.alive = false;
            S.frogKills++;
            S.flushT = CFG.FLUSH_BOOST_TIME;
            S.shake = 0.35;
            S.slowmo = 0.5;
            P.ammo = ammoCap();
            P.hp = Math.min(tierMaxHp(), P.hp + 1);
            var fw3 = shaftW(bf.frog.y) * 1.04;
            var fh3 = fw3 * 0.416 * 0.62;
            S.frogCorpse = { x: mcx, y: bf.frog.y, t: 0, w: fw3, h: fh3 };
            S.frogText = { x: mcx, y: bf.frog.y - 60, t: 0 };
            burst(mcx, bf.frog.y, 18, '#8fbf6a', 300);
            if (P.mods.map && !S.pick3) offerPick3(bn);
          }
          continue;
        }
      } else if (bf.frog && bf.frog.alive &&
          Math.abs(bu.y - frogMouthY(bf.frog.y)) < 34 &&
          Math.abs(bu.x - shaftCx(bf.frog.y)) < bf.frog.mouthW * 0.5) {
        /* m4e：闭嘴挡弹——浪费要看得见，才教得出节奏 */
        bu.live = false;
        burst(bu.x, bu.y, 2, '#cfd6e2', 70);
        floatText(bu.x, bu.y - 10, '闭嘴', '#cfd6e2');
        continue;
      }
      if (bf.fish && bf.fish.alive) {
        var fdx = bu.x - bf.fish.x, fdy = bu.y - bf.fish.y;
        if (Math.abs(fdx) < fishRx(bf.fish) && Math.abs(fdy) < fishRy(bf.fish) + 6) {
          /* 弱点=整个脑袋（躯体下半，m3t 用户拍板）：籽穿过躯体，扫到脑袋才掉血，
             否则首触边界就弹死、永远够不到深处的弱点（m3s 实测教训） */
          var inHeadX = Math.abs(fdx) < fishRx(bf.fish) * (0.35 + 0.2 * lvl('eye') + lineBonus('aim'));
          var inHeadY = fdy > -fishRy(bf.fish) * 0.1 && fdy < fishRy(bf.fish) + 6;
          if (inHeadX && inHeadY) {
            bf.fish.hp -= bu.dmg;
            bf.fish.hitT = S.animT;
            floatText(bu.x, bu.y - 12, '-' + bu.dmg, '#e8b23a');
            onWeakHit();
            if (bf.fish.hp <= 0) {
              bf.fish.alive = false;
              S.brokeBlocks++;
              burst(bf.fish.x, bf.fish.y, 10, '#8fb6c9', 200);
              bf.pickups.push({ x: bf.fish.x, y: bf.fish.y, kind: 'jar', amt: 4, taken: false });
            }
            if (bu.pierce > 0) { bu.pierce--; } else { bu.live = false; }
          } else {
            /* 擦过躯干：一粒火花，籽继续飞（能扫到下面的脑袋，也会削后面的坝） */
            burst(bu.x, bu.y, 1, '#cfd6e2', 50);
          }
        }
      }
    }

    /* --- 粒子（无头模拟跳过，纯视觉） --- */
        if (!S.headless) {
      for (var pi = 0; pi < S.particles.length; pi++) {
        var pa = S.particles[pi];
        if (!pa.live) continue;
        pa.t += dt;
        if (pa.t >= pa.ttl) { pa.live = false; continue; }
        pa.vy += 900 * dt;
        pa.x += pa.vx * dt;
        pa.y += pa.vy * dt;
      }
      for (var fi3 = S.floatTexts.length - 1; fi3 >= 0; fi3--) {
        S.floatTexts[fi3].t += dt;
        S.floatTexts[fi3].y -= 28 * dt;
        if (S.floatTexts[fi3].t > 0.5) S.floatTexts.splice(fi3, 1);
      }
    }

    /* --- 潭水：碰到即死（§8 坝上潭，漫过爪子就被送回井口） --- */
    if (!S.waterOn) {
      P.dwell += dt;
      if (P.dwell > CFG.FLOOR_TIMEOUT * (S.shellT > 0 ? 0.5 : 1)) triggerFlood();
    } else {
      S.waterY -= CFG.WATER_SPEED * dt;
      if (P.y + P.r > S.waterY && !S.godMode) {
        if (P.mods.shell && !P.shellUsed) {
          P.shellUsed = true; S.shellT = 2; S.waterY += 600; P.invuln = 2;
        } else endRun('被潭水漫过');
      }
    }

    /* --- 层数：成绩取"最深到达"，可回爬不重复计分 --- */
    var nf = floorOf(P.y);
    P.floor = nf;
    if (nf > P.deepest) P.deepest = nf;
    if (nf !== S.lastFloor) {
      var deeper = nf > S.lastFloor;
      S.lastFloor = nf;
      P.dwell = 0;
      if (S.loanT > 0) S.loanT--;
      if (S.shellT > 0) S.shellT--;
      /* m4f 换层补给：子弹兼"杀敌+位移滞空"双开销，每往下进一层压入一发量（上行不给，防蹦层刷弹） */
      if (deeper) P.ammo = Math.min(ammoCap(), P.ammo + CFG.RELOAD_PER_FLOOR);
      if (linePerk('econ') && nf % 25 === 0) P.ammo = ammoCap();   // 经济大成：每 25 层回满
      if (nf % 10 === 0 && P.mods.seedbag) P.ammo = ammoCap();
      if (!S.pick3 && nf > S.lastPick3Floor && nf % 10 === 0 && nf < CFG.TOTAL_FLOORS) {
        S.lastPick3Floor = nf;
        offerPick3(nf);
      }
    }

    /* --- 井底 --- */
    if (P.y >= CFG.FLOOR_H * CFG.TOTAL_FLOORS - 40) {
      S.over = true; S.win = true; S.firing = false;
      S.finalDeepest = P.deepest;
      recordRun(P.deepest);
      showResult();
    }
  }

  function triggerFlood() {
    S.waterOn = true;
    S.waterY = (P.floor) * CFG.FLOOR_H;      // 当前层底部
    S.waterTop = S.waterY + 260;
    S.waterDmg = 0;
  }

  function update(dtReal) {
    S.animT += dtReal;
    if (S.waterTop > S.waterY) {
      S.waterTop += (S.waterY - S.waterTop) * Math.min(1, 6 * dtReal);
      if (S.waterTop < S.waterY) S.waterTop = S.waterY;
    }
    if (S.replay) {
      /* 死亡回放：水加速上冲，叫叫骑在水面被往上送（结算卡背后持续播放） */
      var r = S.replay;
      r.t += dtReal;
      var rise = 200 + 1100 * Math.min(1, r.t * 0.8);
      S.waterY = Math.max(230, S.waterY - rise * dtReal);
      S.waterTop = S.waterY;   // 回放时水面贴合，不让缓动滞后把水画到叫叫下面
      P.y = S.waterY - P.r * 0.5 + Math.sin(S.animT * 7) * 4;
      P.x += (shaftCx(Math.max(80, P.y)) - P.x) * Math.min(1, 2 * dtReal);
      var camT = P.y - VIEW.h * 0.42;
      S.camY += (camT - S.camY) * Math.min(1, 4 * dtReal);
      return;
    }
    if (S.over) return;
    if (S.pick3) return;
    if (S.shake > 0) S.shake -= dtReal;
    if (S.flashT > 0) S.flashT -= dtReal;
    if (S.slowmo > 0) S.slowmo -= dtReal;
    if (S.frogCorpse) { S.frogCorpse.t += dtReal; if (S.frogCorpse.t > 1.4) S.frogCorpse = null; }
    if (S.frogText) { S.frogText.t += dtReal; if (S.frogText.t > 0.9) S.frogText = null; }
    var sdt = dtReal * (S.slowmo > 0 ? 0.3 : 1);
    S.runT += sdt;
    S.acc += sdt;
    var n = 0;
    while (S.acc >= CFG.STEP && n < CFG.MAX_SUB) { stepOnce(CFG.STEP); S.acc -= CFG.STEP; n++; }
    if (S.acc > CFG.STEP * CFG.MAX_SUB) S.acc = 0;
    var target = P.y - VIEW.h * CFG.CAM_ANCHOR;
    S.camY += (target - S.camY) * Math.min(1, CFG.CAM_SMOOTH * dtReal);
  }

  /* ===================== 渲染 ===================== */
  function render() {
    ctx.setTransform(VIEW.scale, 0, 0, VIEW.scale, 0, 0);
    var band = bandOf(P.floor);
    ctx.fillStyle = band.bg;
    ctx.fillRect(0, 0, CFG.LOGICAL_W, VIEW.h);

    ctx.save();
    ctx.translate(0, -S.camY);
    if (S.shake > 0) {
      ctx.translate((Math.random() * 2 - 1) * S.shake * 22, (Math.random() * 2 - 1) * S.shake * 22);
    }
    /* 泄洪：下冲水流竖线（加粗加浓，不可错过） */
    if (S.flushT > 0) {
      var fshW = shaftW(P.y);
      var fshL = shaftL(P.y);
      ctx.strokeStyle = 'rgba(190,220,240,0.5)';
      ctx.lineWidth = 5;
      for (var fs = 0; fs < 18; fs++) {
        var fx = fshL + 16 + ((fs * 173 + Math.floor(S.t * 1100)) % Math.max(1, fshW - 32));
        var fy2 = P.y - 800 + ((fs * 271 + Math.floor(S.t * 2600)) % 1600);
        ctx.beginPath();
        ctx.moveTo(fx, fy2);
        ctx.lineTo(fx, fy2 + 120);
        ctx.stroke();
      }
    }
    /* 关底蛙尸：旋转坠落淡出 */
    if (S.frogCorpse && IMG.frog) {
      var fc = S.frogCorpse;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - fc.t / 1.4);
      ctx.translate(fc.x, fc.y + fc.t * fc.t * 900);
      ctx.rotate(fc.t * 4);
      ctx.drawImage(IMG.frog, -fc.w * 0.5, -fc.h * 0.45, fc.w, fc.h);
      ctx.restore();
    }
    /* 呱——!! 大字 */
    if (S.frogText) {
      var ft = S.frogText;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - ft.t / 0.9);
      ctx.font = '900 ' + Math.round(56 + ft.t * 44) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#f2ead8';
      ctx.fillStyle = '#d9534f';
      var ty = ft.y - ft.t * 150;
      ctx.strokeText('呱——!!', ft.x, ty);
      ctx.fillText('呱——!!', ft.x, ty);
      ctx.restore();
    }
    /* 命中飘字：小而快（m3u，补上 m3r 漏掉的绘制） */
    for (var ftI = 0; ftI < S.floatTexts.length; ftI++) {
      var tf = S.floatTexts[ftI];
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - tf.t / 0.5);
      ctx.font = '700 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = tf.color;
      ctx.fillText(tf.str, tf.x, tf.y);
      ctx.restore();
    }

    var y0 = S.camY - 80, y1 = S.camY + VIEW.h + 80;
    var ROW = 64;
    var ry = Math.floor(y0 / ROW) * ROW;

    /* 井壁（按行分段取带色，实现 §6 四带视觉分区） */
    for (; ry < y1; ry += ROW) {
      var fb = bandOf(floorOf(ry));
      var pat = wallPat(fb.idx);
      ctx.fillStyle = pat || fb.wall;
      var la = shaftL(ry), lb = shaftL(ry + ROW);
      var ra = shaftR(ry), rb = shaftR(ry + ROW);
      ctx.beginPath();
      ctx.moveTo(la - 400, ry); ctx.lineTo(la, ry);
      ctx.lineTo(lb, ry + ROW); ctx.lineTo(lb - 400, ry + ROW);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ra + 400, ry); ctx.lineTo(ra, ry);
      ctx.lineTo(rb, ry + ROW); ctx.lineTo(rb + 400, ry + ROW);
      ctx.closePath(); ctx.fill();
      if (!pat) {
        /* 井壁纹理：横向凿痕（贴图缺失时的兜底） */
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(la - 26, ry + 18); ctx.lineTo(la - 4, ry + 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ra + 4, ry + 40); ctx.lineTo(ra + 26, ry + 40); ctx.stroke();
      }
    }

    /* 层线与层号 */
    var fn0 = floorOf(y0), fn1 = floorOf(y1);
    ctx.font = '600 22px sans-serif';
    ctx.textAlign = 'left';
    for (var n = fn0; n <= fn1; n++) {
      var ly = (n - 1) * CFG.FLOOR_H;
      if (ly < y0 || ly > y1) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(shaftL(ly), ly); ctx.lineTo(shaftR(ly), ly);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.fillText('B' + n, shaftL(ly) + 10, ly + 30);
    }

    /* 内容：只画可见层 */
    for (var k = fn0; k <= fn1; k++) {
      var f = floorAt(k);
      if (f.block && !f.block.broken) drawBlock(f.block);
      if (f.spike) drawSpike(f.spike);
      if (f.fish && f.fish.alive) drawSpider(f.fish);
      if (f.bug && f.bug.alive) drawBug(f.bug);
      if (f.frog && f.frog.alive) {
        drawFrog(f.frog);
        ctx.fillStyle = '#c9a06a';
        for (var sti3 = 0; sti3 < f.stones.length; sti3++) {
          ctx.beginPath();
          ctx.arc(f.stones[sti3].x, f.stones[sti3].y, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (var i = 0; i < f.pickups.length; i++) {
        if (!f.pickups[i].taken) drawPickup(f.pickups[i]);
      }
    }

    /* 子弹（葵花籽） */
    ctx.fillStyle = '#f0e2b6';
    for (var bi = 0; bi < S.bullets.length; bi++) {
      var bu = S.bullets[bi];
      if (!bu.live) continue;
      ctx.fillRect(bu.x - 4, bu.y - 13, 8, 22);
      ctx.fillStyle = 'rgba(240,226,182,0.28)';
      ctx.fillRect(bu.x - 2, bu.y - 46, 4, 34);
      ctx.fillStyle = '#f0e2b6';
    }

    /* 粒子 */
    for (var pi = 0; pi < S.particles.length; pi++) {
      var pa = S.particles[pi];
      if (!pa.live) continue;
      ctx.globalAlpha = Math.max(0, 1 - pa.t / pa.ttl);
      ctx.fillStyle = pa.c;
      ctx.fillRect(pa.x - pa.s * 0.5, pa.y - pa.s * 0.5, pa.s, pa.s);
    }
    ctx.globalAlpha = 1;

    drawPlayer();

    /* 山洪 */
    if (S.waterOn && S.waterTop < y1) {
      var wt = Math.max(S.waterTop, y0 - 40);
      ctx.fillStyle = 'rgba(58,132,180,0.52)';
      ctx.beginPath();
      ctx.moveTo(0, wt + 14);
      for (var wx = 0; wx <= CFG.LOGICAL_W; wx += 40) {
        ctx.lineTo(wx, wt + Math.sin(wx * 0.03 + S.t * 5) * 9);
      }
      ctx.lineTo(CFG.LOGICAL_W, y1 + 400);
      ctx.lineTo(0, y1 + 400);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();

    /* 高速速度线（恐惧感的一半靠这个） */
    var sp = Math.abs(P.vy);
    if (sp > 620) {
      var a = Math.min(0.4, (sp - 620) / 1400);
      ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.lineWidth = 2;
      for (var s = 0; s < 12; s++) {
        var sx = ((s * 137 + Math.floor(S.t * 900)) % CFG.LOGICAL_W);
        var sy = ((s * 311 + Math.floor(S.t * sp * 1.6)) % Math.max(1, VIEW.h));
        var len = 40 + sp * 0.09;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + len); ctx.stroke();
      }
    }

    /* 暗角 */
    var vg = ctx.createRadialGradient(CFG.LOGICAL_W * 0.5, VIEW.h * 0.5, VIEW.h * 0.28,
                                      CFG.LOGICAL_W * 0.5, VIEW.h * 0.5, VIEW.h * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CFG.LOGICAL_W, VIEW.h);

    if (!gAttract) drawHud();
    if (S.flashT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (S.flashT / 0.15 * 0.2).toFixed(3) + ')';
      ctx.fillRect(0, 0, CFG.LOGICAL_W, VIEW.h);
    }
    if (S.replay) {
      ctx.fillStyle = 'rgba(35,26,5,0.55)';
      ctx.fillRect(0, 92, CFG.LOGICAL_W, 72);
      ctx.fillStyle = '#f2ead8';
      ctx.font = '700 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('被冲回井口——', CFG.LOGICAL_W / 2, 140);
      ctx.textAlign = 'left';
    }
    if (gDebug) drawDebug();
  }

  function drawBlock(b) {
    var l = shaftL(b.y), r = shaftR(b.y);
    if (IMG.block) {
      ctx.drawImage(IMG.block, l - 12, b.y - 9, r - l + 24, CFG.BLOCK_THICK + 18);
      var dmg = 1 - b.hp / b.maxHp;
      if (dmg > 0.3) {
        ctx.strokeStyle = 'rgba(20,12,4,' + (0.35 + dmg * 0.4).toFixed(2) + ')';
        ctx.lineWidth = 3;
        var cn = Math.round(dmg * 4);
        for (var ci = 0; ci < cn; ci++) {
          var cx2 = l + (r - l) * ((ci + 0.5) / (cn + 1));
          ctx.beginPath();
          ctx.moveTo(cx2 - 8, b.y);
          ctx.lineTo(cx2 + 8, b.y + CFG.BLOCK_THICK);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.max(1, Math.ceil(b.hp))), (l + r) * 0.5, b.y + 31);
      ctx.textAlign = 'left';
      return;
    }
    ctx.fillStyle = '#7d5c36';
    ctx.fillRect(l, b.y, r - l, CFG.BLOCK_THICK);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(l, b.y + CFG.BLOCK_THICK - 10, r - l, 10);
    ctx.strokeStyle = 'rgba(255,240,200,0.35)';
    ctx.lineWidth = 2;
    var dmg = 1 - b.hp / b.maxHp;
    var cracks = Math.round(dmg * 6);
    for (var i = 0; i < cracks; i++) {
      var cx = l + (r - l) * ((i + 0.5) / 7);
      ctx.beginPath();
      ctx.moveTo(cx, b.y + 4);
      ctx.lineTo(cx + 9, b.y + CFG.BLOCK_THICK * 0.55);
      ctx.lineTo(cx - 5, b.y + CFG.BLOCK_THICK - 4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '700 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(b.hp), (l + r) * 0.5, b.y + 31);
    ctx.textAlign = 'left';
  }

  function drawSpike(sp) {
    var ym = (sp.y0 + sp.y1) * 0.5;
    if (IMG.spike) {
      var h = sp.y1 - sp.y0;
      if (sp.lenL > 0) ctx.drawImage(IMG.spike, shaftL(ym) - 6, sp.y0, sp.lenL * 1.3, h);
      if (sp.lenR > 0) {
        ctx.save();
        ctx.translate(shaftR(ym), 0);
        ctx.scale(-1, 1);
        ctx.drawImage(IMG.spike, -6, sp.y0, sp.lenR * 1.3, h);
        ctx.restore();
      }
      return;
    }
    var sides = [];
    if (sp.lenL > 0) sides.push([-1, sp.lenL]);
    if (sp.lenR > 0) sides.push([1, sp.lenR]);
    ctx.fillStyle = '#b9a88e';
    for (var si = 0; si < sides.length; si++) {
      var side = sides[si][0], len = sides[si][1];
      var wall = side < 0 ? shaftL(ym) : shaftR(ym);
      var tip = side < 0 ? wall + len : wall - len;
      var count = 4;
      for (var i = 0; i < count; i++) {
        var y = sp.y0 + (sp.y1 - sp.y0) * (i / count);
        var hh = (sp.y1 - sp.y0) / count;
        ctx.beginPath();
        ctx.moveTo(wall, y);
        ctx.lineTo(tip, y + hh * 0.5);
        ctx.lineTo(wall, y + hh);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /* 蛛：弱点=脑袋的呼吸光斑（三层同心圆零分配）+ 细血条（m3u 精致化） */
  function drawSpiderFx(fi, rx, ry) {
    var hy = fi.y + ry * 0.35;
    var a = 0.26 + Math.sin(S.animT * 3.2) * 0.1;
    ctx.fillStyle = 'rgba(232,178,58,' + (a * 0.35) + ')';
    ctx.beginPath();
    ctx.arc(fi.x, hy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,178,58,' + (a * 0.6) + ')';
    ctx.beginPath();
    ctx.arc(fi.x, hy, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(242,234,216,' + a + ')';
    ctx.beginPath();
    ctx.arc(fi.x, hy, 3, 0, Math.PI * 2);
    ctx.fill();
    drawHpBar(fi.x, fi.y - ry - 16, fi, 26, '#d9534f');
  }

  function drawSpider(fi) {
    var rx = fishRx(fi), ry = fishRy(fi);
    if (IMG.spider) {
      var w2 = Math.min(rx * 2.4, 320);
      var h2 = w2 * (IMG.spider.naturalHeight / IMG.spider.naturalWidth);
      /* 受击=时间戳驱动（m3w）：挤压+lighter 增亮，出更新区也不再卡在扁的状态 */
      var age = S.animT - (fi.hitT === undefined ? -9 : fi.hitT);
      var k = age < 0.12 ? 1 - age / 0.12 : 0;
      var sq = 0.88 + 0.12 * (1 - k);
      if (k > 0) {
        ctx.save();
        ctx.translate(fi.x, fi.y + ry);
        ctx.scale(2 - sq, sq);
        ctx.translate(-fi.x, -(fi.y + ry));
      }
      ctx.drawImage(IMG.spider, fi.x - w2 * 0.5, fi.y - h2 * 0.5, w2, h2);
      if (k > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k * 0.3;
        ctx.drawImage(IMG.spider, fi.x - w2 * 0.5, fi.y - h2 * 0.5, w2, h2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }
      drawSpiderFx(fi, rx, ry);
      return;
    }
    /* 占位：丝 + 圆蛛 + 六腿（绝对坐标） */
    ctx.strokeStyle = 'rgba(240,235,220,0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shaftL(fi.y) + 8, fi.y - ry);
    ctx.lineTo(shaftR(fi.y) - 8, fi.y - ry);
    ctx.stroke();
    ctx.fillStyle = '#4a4038';
    ctx.beginPath();
    ctx.ellipse(fi.x, fi.y, rx, ry * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fi.x + fi.dir * rx * 0.85, fi.y - ry * 0.2, ry * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a322b';
    ctx.lineWidth = Math.max(2, ry * 0.14);
    for (var i = 0; i < 6; i++) {
      var ox = (i - 2.5) / 2.5 * rx * 0.9;
      ctx.beginPath();
      ctx.moveTo(fi.x + ox * 0.35, fi.y - ry * 0.4);
      ctx.lineTo(fi.x + ox, fi.y - ry * 1.02);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8e2d4';
    ctx.beginPath();
    ctx.arc(fi.x + fi.dir * rx * 0.92, fi.y - ry * 0.3, Math.max(2.4, ry * 0.1), 0, Math.PI * 2);
    ctx.fill();
    drawSpiderFx(fi, rx, ry);
  }

  /* 虫：细血条（受击反馈走精灵增亮，m3u） */
  function drawBugFx(bg) {
    drawHpBar(bg.x, bg.y - 64, bg, 26, '#d8e86a');
  }

  function drawBug(bg) {
    ctx.save();
    ctx.translate(bg.x, bg.y);
    /* 光圈（脉冲收缩扩张） */
    var rr = bg.ringR || CFG.BUG_RING_BASE;
    ctx.fillStyle = 'rgba(216,232,106,0.08)';
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(216,232,106,0.42)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    /* 悬丝：垂向坝面 */
    ctx.strokeStyle = 'rgba(216,232,106,0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 150);
    ctx.stroke();
    if (IMG.bug) {
      var bw2 = 84;
      var bh2 = bw2 * (IMG.bug.naturalHeight / IMG.bug.naturalWidth);
      var ageb = S.animT - (bg.hitT === undefined ? -9 : bg.hitT);
      var kb = ageb < 0.12 ? 1 - ageb / 0.12 : 0;
      var sqb = 0.86 + 0.14 * (1 - kb);
      if (kb > 0) { ctx.translate(0, 30); ctx.scale(2 - sqb, sqb); ctx.translate(0, -30); }
      ctx.drawImage(IMG.bug, -bw2 * 0.5, -bh2 * 0.55, bw2, bh2);
      if (kb > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = kb * 0.3;
        ctx.drawImage(IMG.bug, -bw2 * 0.5, -bh2 * 0.55, bw2, bh2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      drawBugFx(bg);
      return;
    }
    /* 虫体：光晕 + 发光球 */
    ctx.fillStyle = 'rgba(216,232,106,0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8e86a';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a3a18';
    ctx.beginPath();
    ctx.arc(-4, -3, 2.4, 0, Math.PI * 2);
    ctx.arc(4, -3, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawBugFx(bg);
  }

  /* 蛙：细血条（受击反馈走精灵增亮+挤压，m3u） */
  function drawFrogFx(fg, cx) {
    drawHpBar(cx, fg.y - 84, fg, 60, '#d9534f');
  }

  function drawFrog(fg) {
    var l = shaftL(fg.y), r = shaftR(fg.y);
    var cx = (l + r) * 0.5;
    var mh = 6 + fg.openness * 30;
    ctx.save();
    if (IMG.frog) {
      var fw2 = (r - l) * 1.04;
      var fh2 = fw2 * (IMG.frog.naturalHeight / IMG.frog.naturalWidth) * 0.62;
      var my2 = fg.y - fh2 * 0.02;
      var agef = S.animT - (fg.hitT === undefined ? -9 : fg.hitT);
      var kf = agef < 0.12 ? 1 - agef / 0.12 : 0;
      var sqf = 0.9 + 0.1 * (1 - kf);
      if (kf > 0) { ctx.translate(cx, fg.y + fh2 * 0.55); ctx.scale(2 - sqf, sqf); ctx.translate(-cx, -(fg.y + fh2 * 0.55)); }
      ctx.drawImage(IMG.frog, cx - fw2 * 0.5, fg.y - fh2 * 0.45, fw2, fh2);
      if (kf > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = kf * 0.28;
        ctx.drawImage(IMG.frog, cx - fw2 * 0.5, fg.y - fh2 * 0.45, fw2, fh2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = fg.open ? 'rgba(217,83,79,0.9)' : 'rgba(60,50,40,0.7)';
      var mh2 = 4 + fg.openness * 14;
      var bw3 = fw2 * 0.48;
      ctx.fillRect(cx - bw3 * 0.5, my2 - mh2 * 0.5, bw3, mh2);
      ctx.restore();
      drawFrogFx(fg, cx);
      return;
    }
    /* 身体 */
    ctx.fillStyle = '#6f7f4a';
    ctx.fillRect(l, fg.y - 8, r - l, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(l, fg.y + 40, r - l, 16);
    /* 闭目两只 */
    ctx.fillStyle = '#8a9c5c';
    ctx.fillRect(l + 30, fg.y - 22, 34, 16);
    ctx.fillRect(r - 64, fg.y - 22, 34, 16);
    /* 嘴：顶部中线，开口即弱点 */
    var mw = fg.mouthW * 0.5;
    ctx.fillStyle = '#2c2418';
    ctx.fillRect(cx - mw, fg.y - 8 - mh * 0.5, mw * 2, mh + 8);
    ctx.fillStyle = fg.open ? '#d9534f' : '#5a4a3a';
    ctx.fillRect(cx - mw + 4, fg.y - 6 - mh * 0.5, mw * 2 - 8, Math.max(2, mh - 4));
    ctx.restore();
    drawFrogFx(fg, cx);
  }

  function drawPickup(pk) {
    if (pk.kind === 'bag') {
      ctx.fillStyle = '#c8a24a';
      ctx.fillRect(pk.x - 17, pk.y - 20, 34, 40);
      ctx.fillStyle = '#f0e2b6';
      ctx.fillRect(pk.x - 9, pk.y - 8, 7, 10);
      ctx.fillRect(pk.x + 2, pk.y + 2, 7, 10);
    } else {
      ctx.fillStyle = '#9fb4c4';
      ctx.fillRect(pk.x - 14, pk.y - 17, 28, 34);
      ctx.fillStyle = '#f0e2b6';
      ctx.fillRect(pk.x - 7, pk.y - 6, 14, 12);
    }
  }

  /* ===================== 素材 ===================== */
  var IMG = { jiao: null, big: null, spider: null, bug: null, frog: null, spike: null, block: null, wall: [null, null, null, null] };

  function loadImages() {
    var a = new Image();
    a.onload = function () { IMG.jiao = a; };
    a.src = './assets/jiao-game.png';
    var b = new Image();
    b.onload = function () { IMG.big = b; };
    b.src = './assets/jiao-big.png';
    var c = new Image();
    c.onload = function () { IMG.spider = c; };
    c.src = './assets/tenant-spider.png';
    var d = new Image();
    d.onload = function () { IMG.bug = d; };
    d.src = './assets/tenant-glowbug.png';
    var e = new Image();
    e.onload = function () { IMG.frog = e; };
    e.src = './assets/tenant-frog.png';
    var f = new Image();
    f.onload = function () { IMG.spike = f; };
    f.src = './assets/spike.png';
    var g = new Image();
    g.onload = function () { IMG.block = g; };
    g.src = './assets/block.png';
    for (var wi = 0; wi < 4; wi++) {
      (function (idx) {
        var im = new Image();
        im.onload = function () { IMG.wall[idx] = im; };
        im.src = './assets/wall-' + (idx + 1) + '.png';
      })(wi);
    }
  }

  /* 井壁 pattern 缓存（repeat，随世界坐标滚动） */
  var wallPats = {};
  function wallPat(bandIdx) {
    var im = IMG.wall[bandIdx];
    if (!im) return null;
    if (wallPats[bandIdx] === undefined) {
      try { wallPats[bandIdx] = ctx.createPattern(im, 'repeat'); }
      catch (e) { wallPats[bandIdx] = null; }
    }
    return wallPats[bandIdx];
  }

  function drawPlayer() {
    var blink = P.invuln > 0 && (Math.floor(S.t * 14) % 2 === 0);
    if (IMG.jiao) {
      ctx.save();
      ctx.translate(P.x, P.y);
      if (S.replay && S.replay.type === 'float') {
        ctx.rotate(Math.sin(S.animT * 6) * 0.12);
      }
      ctx.globalAlpha = blink ? 0.38 : 1;
      var sh = 78;
      var sw2 = sh * (IMG.jiao.naturalWidth / IMG.jiao.naturalHeight);
      ctx.drawImage(IMG.jiao, -sw2 * 0.5, -sh * 0.55, sw2, sh);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.globalAlpha = blink ? 0.38 : 1;
    /* 身体：方块 + 圆头（M0 占位） */
    ctx.fillStyle = '#efe2c8';
    ctx.fillRect(-19, -6, 38, 34);
    ctx.beginPath();
    ctx.arc(0, -10, 21, 0, Math.PI * 2);
    ctx.fill();
    /* 红围巾 = 角色识别锚点 */
    ctx.fillStyle = '#d9534f';
    ctx.fillRect(-22, 4, 44, 9);
    ctx.fillRect(12, 6, 11, 20);
    /* 眼 + 门牙 */
    ctx.fillStyle = '#1b1b1b';
    var mouthOpen = P.vy > 620;
    ctx.beginPath(); ctx.arc(-8, -13, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -13, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-3, mouthOpen ? -4 : -6, 6, mouthOpen ? 11 : 7);
    if (mouthOpen) {
      ctx.fillStyle = '#3a1f1f';
      ctx.beginPath(); ctx.arc(0, -1, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, -5, 6, 8);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    /* 心 */
    for (var i = 0; i < tierMaxHp(); i++) {
      ctx.fillStyle = i < P.hp ? '#d9534f' : 'rgba(255,255,255,0.16)';
      var hx = 18 + i * 30, hy = 22;
      ctx.beginPath();
      ctx.arc(hx, hy, 10, 0, Math.PI * 2);
      ctx.arc(hx + 12, hy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx - 10, hy + 4); ctx.lineTo(hx + 22, hy + 4); ctx.lineTo(hx + 6, hy + 24);
      ctx.closePath(); ctx.fill();
    }
    /* 层数 */
    ctx.fillStyle = '#f2ead8';
    ctx.font = '800 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('第 ' + P.floor + ' / ' + CFG.TOTAL_FLOORS + ' 层', CFG.LOGICAL_W * 0.5, 42);
    ctx.font = '600 14px sans-serif';
    ctx.fillStyle = 'rgba(242,234,216,0.55)';
    ctx.fillText(bandOf(P.floor).name + ' · 井宽 ' + Math.round(shaftW(P.y)) + 'px', CFG.LOGICAL_W * 0.5, 64);
    ctx.textAlign = 'left';

    /* 弹药：瓜子图标排一行，超过 20 颗降级为"图标 + 数字"（审阅漏洞 #9） */
    var ay = VIEW.h - 26;
    if (P.ammo <= 20) {
      for (var a = 0; a < P.ammo; a++) {
        ctx.fillStyle = '#f0e2b6';
        ctx.fillRect(16 + a * 17, ay - 11, 11, 17);
      }
    } else {
      for (var b = 0; b < 5; b++) {
        ctx.fillStyle = '#f0e2b6';
        ctx.fillRect(16 + b * 17, ay - 11, 11, 17);
      }
      ctx.fillStyle = '#f0e2b6';
      ctx.font = '800 24px sans-serif';
      ctx.fillText('× ' + P.ammo, 108, ay + 5);
    }
    if (P.ammo === 0) {
      ctx.fillStyle = '#d9534f';
      ctx.font = '800 22px sans-serif';
      ctx.fillText('颊囊空了！', CFG.LOGICAL_W - 150, ay + 4);
    }
  }

  function drawDebug() {
    var ents = 0;
    for (var i = 0; i < S.bullets.length; i++) if (S.bullets[i].live) ents++;
    var lines = [
      'FPS ' + fps.toFixed(0),
      'seed ' + S.seedKey,
      '血档 ' + gTier + (gTier === 1 ? ' 3血' : (gTier === 2 ? ' 2血' : ' 1血')),
      '实体 弹' + ents + ' 粒' + countLive(S.particles),
      'vy ' + P.vy.toFixed(0) + ' vx ' + P.vx.toFixed(0),
      'x ' + P.x.toFixed(0) + ' 层' + P.floor + ' 最深' + P.deepest,
      '弹' + P.ammo + '/' + CFG.AMMO_MAX + ' 射出' + S.shots,
      '水线 ' + (S.waterOn ? S.waterY.toFixed(0) : '未触发') + ' 停留' + P.dwell.toFixed(1) + 's',
      '音频 ' + (AU.on ? (AU.unlocked ? '开 ' + (AU.ctx ? AU.ctx.state : '') : '待触') : '静音')
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(CFG.LOGICAL_W - 268, 80, 260, lines.length * 19 + 12);
    ctx.fillStyle = '#9fe88a';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], CFG.LOGICAL_W - 258, 100 + j * 19);
    }
  }

  function countLive(arr) {
    var n = 0;
    for (var i = 0; i < arr.length; i++) if (arr[i].live) n++;
    return n;
  }

  /* ===================== 结算 ===================== */
  var CAUSE_TEXT = {
    '撞串丝蛛': '被收瓜子垫窝的串丝蛛撞了回来',
    '触吊灯虫': '被吊灯虫的黏光圈粘了一下，湿着回来了',
    '被看天蛙闷了一口': '打盹的看天蛙忽然闭了嘴——它只是先来的',
    '蹭壁刺': '蹭上壁刺，湿着被冲回井口',
    '硬着陆': '一头砸在堵层上，震得颊囊都散了',
    '被潭水漫过': '潭水漫过了它的爪子，把它送回了井口',
    '被蛙喷的石子砸中': '看天蛙喷的石子把它砸了回来'
  };
  /* 战报卡短版死因（m4d） */
  var CAUSE_SHORT = {
    '蹭壁刺': '壁刺', '撞串丝蛛': '蛛口', '触吊灯虫': '虫光',
    '被看天蛙闷了一口': '蛙口', '被蛙喷的石子砸中': '石雨',
    '硬着陆': '硬着陆', '被潭水漫过': '潭水'
  };
  var TIER_NAME = ['新手', '标准', '进阶'];

  /* ===================== 战报卡与分享（§11） ===================== */
  var MOD_SHORT = {
    split: '裂', bounce: '弹', rate: '连', hard: '硬', spring: '托', pouch: '囊',
    blast: '炸', pierce: '穿', wind: '风', feather: '伞',
    amulet: '符', egg: '蛋', ball: '球', map: '图', salt: '咸', echo: '音', seedbag: '袋', mega: '麦'
  };

  function buildReportCard() {
    var W = 1080, H = 1440;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    var deepest = S.finalDeepest || P.deepest;
    var tierHp = tierMaxHp();
    var i, k;

    /* 暖黄主色底 + 顶部深色带；通关加金框 */
    x.fillStyle = '#e8b23a';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#231a05';
    x.fillRect(0, 0, W, 160);
    if (S.win) {
      x.strokeStyle = '#f2ead8';
      x.lineWidth = 10;
      x.strokeRect(16, 16, W - 32, H - 32);
    }
    x.textAlign = 'center';
    x.fillStyle = '#e8b23a';
    x.font = '800 60px sans-serif';
    x.fillText('土拨鼠王国史 · 淘井日志', W / 2, 105);

    /* 井号 + 殓身层带 */
    x.fillStyle = '#f2ead8';
    x.font = '600 34px sans-serif';
    x.fillText('今日井 #' + S.seedKey.slice(-4) + ' · ' + bandOf(deepest).name, W / 2, 218);

    /* 超大数字 */
    x.fillStyle = '#231a05';
    x.font = '900 300px sans-serif';
    x.fillText(String(deepest), W / 2 - 80, 590);
    x.font = '800 60px sans-serif';
    x.fillText('层', W / 2 + 235, 590);

    /* 难度档徽章：心 + 档名（跨档成绩不可比，必须上卡） */
    var hearts = '';
    for (i = 0; i < tierHp; i++) hearts += '\u2665 ';
    x.font = '800 46px sans-serif';
    x.fillStyle = '#8c1f1c';
    x.fillText(hearts + ' ' + TIER_NAME[gTier - 1] + '档', W / 2, 668);

    /* 死因（短版）/ 通关 */
    x.fillStyle = '#231a05';
    x.font = '700 42px sans-serif';
    x.fillText(S.win ? '通到井底！被暗河的鱼喷了回来' : '殓于 ' + (CAUSE_SHORT[S.cause] || '不明'), W / 2, 736);

    /* 构筑图标序列 + 共鸣标签 */
    var seq = '';
    for (k = 0; k < S.pickLog.length && k < 14; k++) seq += (ICONS[S.pickLog[k].id] || '') + ' ';
    x.font = '40px sans-serif';
    x.fillStyle = '#231a05';
    x.fillText(seq || '未拾一物', W / 2, 800);
    var resTag = '';
    var lines = ['aim', 'volley', 'move', 'econ'];
    for (k = 0; k < lines.length; k++) {
      var lc2 = lineCount(lines[k]);
      if (lc2 >= 2) resTag += (resTag ? ' · ' : '') + LINE_NAME[lines[k]] + '\u00D7' + lc2 + (lc2 >= 4 ? ' 大成' : '');
    }
    x.font = '700 32px sans-serif';
    x.fillStyle = '#5a4210';
    x.fillText(resTag || '未成流派', W / 2, 850);

    /* 叫叫大特写（右下） */
    if (IMG.big) {
      var bh = 460, bw = bh * (IMG.big.naturalWidth / IMG.big.naturalHeight);
      x.drawImage(IMG.big, W - bw - 46, H - 660, bw, bh);
    }

    /* 坠落路线图（左：竖轴 + 构筑节点） */
    var ax = 120, top = 900, bot = 1250;
    x.strokeStyle = '#231a05';
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(ax, top);
    x.lineTo(ax, bot);
    x.stroke();
    var mk = Math.round(bot - (deepest / CFG.TOTAL_FLOORS) * (bot - top));
    x.fillStyle = '#d9534f';
    x.beginPath();
    x.arc(ax, mk, 16, 0, Math.PI * 2);
    x.fill();
    x.font = '700 30px sans-serif';
    x.fillStyle = '#231a05';
    x.textAlign = 'left';
    x.fillText('第 ' + deepest + ' 层', ax + 32, mk + 10);
    for (i = 0; i < S.pickLog.length; i++) {
      var pl = S.pickLog[i];
      var py = Math.round(top + ((pl.floor - 1) / (CFG.TOTAL_FLOORS - 1)) * (bot - top));
      x.fillStyle = '#231a05';
      x.beginPath();
      x.arc(ax, py, 9, 0, Math.PI * 2);
      x.fill();
      x.font = '600 26px sans-serif';
      x.fillText('B' + pl.floor + ' ' + (MOD_SHORT[pl.id] || pl.id), ax + 28, py + 9);
    }

    /* 战绩两行 */
    x.textAlign = 'center';
    x.font = '600 32px sans-serif';
    x.fillStyle = '#231a05';
    var mm = Math.floor(S.runT / 60), ss2 = Math.floor(S.runT % 60);
    x.fillText('用时 ' + mm + ':' + (ss2 < 10 ? '0' : '') + ss2 + ' · 破坝 ' + S.brokeBlocks + ' · 通蛙 ' + (S.frogKills || 0) + ' · 出籽 ' + S.shots, W / 2, 1310);
    var yd = gSave.yesterdayFloor > 0 ? ' · 比昨天深 ' + Math.max(0, deepest - gSave.yesterdayFloor) + ' 层' : '';
    x.font = '600 28px sans-serif';
    x.fillStyle = '#5a4210';
    x.fillText('今日第 ' + gSave.todayTries + ' 次 · 累计 ' + gSave.totalRuns + ' 局 · 纪录 ' + gSave.deepest + ' 层' + yd, W / 2, 1352);

    /* 底部 CTA 深色条 */
    x.fillStyle = '#231a05';
    x.fillRect(0, 1386, W, 54);
    x.textAlign = 'center';
    x.font = '700 30px sans-serif';
    x.fillStyle = '#e8b23a';
    x.fillText('同一天，同一口井 —— 你也来试试', W / 2, 1422);
    x.textAlign = 'right';
    x.font = '600 24px sans-serif';
    x.fillStyle = '#8a7440';
    x.fillText('王国史第二章', W - 30, 1422);

    /* 噪点 + 暗角 */
    x.fillStyle = 'rgba(35,26,5,0.06)';
    for (var n2 = 0; n2 < 500; n2++) {
      x.fillRect(Math.random() * W, Math.random() * H, 3, 3);
    }
    var vg = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(35,26,5,0.32)');
    x.fillStyle = vg;
    x.fillRect(0, 0, W, H);

    return c.toDataURL('image/jpeg', 0.86);
  }

  function setShareStatus(t) { elShareStatus.textContent = t; }

  function shareFallback() {
    if (!S.reportData) return;
    elReportImg.src = S.reportData;
    elReportImg.className = '';
    setShareStatus('长按图片可保存');
  }

  function shareAlbum() {
    var mt = window.xhs && window.xhs.miniTool;
    if (!mt || !S.reportData) return shareFallback();
    mt.writeTempFile({ data: S.reportData }).then(function (res) {
      return mt.saveImageToPhotosAlbum({ filePath: res.filePath });
    }).then(function () {
      setShareStatus('已存入相册');
    }).catch(function () {
      setShareStatus('保存失败');
      shareFallback();
    });
  }

  function shareNote() {
    var mt = window.xhs && window.xhs.miniTool;
    if (!mt || !S.reportData) return shareFallback();
    mt.postNote({
      title: '尖叫之井｜我通到了第 ' + S.finalDeepest + ' 层',
      content: '土拨鼠王国史·淘井日志：今天在井里通到第 ' + S.finalDeepest + ' 层，' + (S.win ? '通到井底被暗河的鱼喷了回来' : (CAUSE_TEXT[S.cause] || '被水冲回井口')) + '。掉井不是意外，是上班。',
      pageType: 'photo_publish',
      mediaInfo: { image_resources: [{ url: S.reportData }] }
    }).then(function () {
      setShareStatus('笔记走起');
    }).catch(function () {
      setShareStatus('笔记取消');
    });
  }

  function buildShareAssets() {
    if (!S.over) return;
    try {
      S.reportData = buildReportCard();
      var mt = window.xhs && window.xhs.miniTool;
      if (mt) {
        elShareBtns.className = '';
        setShareStatus('');
      } else {
        shareFallback();
      }
    } catch (e) { /* 战报失败不阻塞重开 */ }
  }

  function showResult() {
    var secs = S.runT;
    var mm = Math.floor(secs / 60), ss = Math.floor(secs % 60);
    elResTitle.textContent = S.win ? '落进暗河，被鱼喷出井口' : (CAUSE_TEXT[S.cause] || '被水冲回井口了');
    elResDepth.textContent = S.win ? '通到井底' : ('第 ' + P.deepest + ' 层');
    var meta = '用时 ' + mm + ':' + (ss < 10 ? '0' : '') + ss +
      ' · 射出 ' + S.shots + ' 颗籽' +
      ' · 破障 ' + S.brokeBlocks +
      ' · 挨 ' + S.hitsTaken + ' 下' +
      '\n' + tierName(gTier) + '（' + tierMaxHp() + ' 血）' +
      ' · 井宽在最深处 ' + Math.round(shaftW(P.deepest * CFG.FLOOR_H)) + 'px' +
      '\n纪录 ' + gSave.deepest + ' 层 · 今日第 ' + gSave.todayTries + ' 次 · 累计 ' + gSave.totalRuns + ' 局';
    elResMeta.textContent = meta;
    elHint.textContent = gTier === 1
      ? '简单档：能错三次，用来熟悉走位和缺口'
      : (gTier === 2
        ? '标准档：两下就没'
        : '困难档：碰到就没——走位就是命');
    syncTierBtns();
    elShareBtns.className = 'hidden';
    elReportImg.className = 'hidden';
    elShareStatus.textContent = '';
    elResult.className = '';
    setTimeout(buildShareAssets, 60);
  }

  function syncTierBtns() {
    for (var i = 0; i < 3; i++) {
      barBtns[i].className = 'xb' + (gTier === i + 1 ? ' on' : '');
      resBtns[i].className = 'xb' + (gTier === i + 1 ? ' on' : '');
      htBtns[i].className = 'ht' + (gTier === i + 1 ? ' on' : '');
    }
  }

  function syncToggleBtns() {
    togBtns[0].className = CFG.T_MAGNET ? 'on' : '';
    togBtns[1].className = CFG.T_HARDLAND ? 'on' : '';
    togBtns[2].className = CFG.T_BIGFISH ? 'on' : '';
  }

  function setTier(m) {
    gTier = m;
    syncTierBtns();
  }

  /* ===================== 输入（按住哪侧=往哪侧+开火，一根手指两用） ===================== */
  function pointerSide(e) {
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var rect = cv.getBoundingClientRect();
    var mid = rect.left + rect.width * 0.5;
    S.steerL = cx < mid;
    S.steerR = !S.steerL;
  }
  function down(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (S.over || S.pick3) return;
    pointerSide(e);
    S.firing = true;
    fire();
  }
  function steerMove(e) {
    if (!S.firing) return;
    pointerSide(e);
  }
  function up(e) {
    if (e && e.preventDefault) e.preventDefault();
    S.firing = false;
    S.steerL = false;
    S.steerR = false;
  }

  cv.addEventListener('touchstart', down, { passive: false });
  cv.addEventListener('touchend', up, { passive: false });
  cv.addEventListener('touchcancel', up, { passive: false });
  cv.addEventListener('touchmove', steerMove, { passive: true });
  cv.addEventListener('mousedown', down);
  cv.addEventListener('mousemove', steerMove);
  window.addEventListener('mouseup', up);

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); if (!S.over) { S.firing = true; fire(); } }
    else if (k === 'ArrowLeft') { S.steerL = true; S.steerR = false; }
    else if (k === 'ArrowRight') { S.steerL = false; S.steerR = true; }
    else if (k === '1') setTier(1);
    else if (k === '2') setTier(2);
    else if (k === '3') setTier(3);
    else if (k === 'r' || k === 'R') newRun();
    else if (k === 'd' || k === 'D') { gDebug = !gDebug; }
    else if (k === 'j' || k === 'J') jumpFloors(10);
    else if (k === 'f' || k === 'F') { if (!S.waterOn) triggerFlood(); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.key === ' ' || e.key === 'Spacebar') S.firing = false;
    else if (e.key === 'ArrowLeft') S.steerL = false;
    else if (e.key === 'ArrowRight') S.steerR = false;
  });

  function jumpFloors(n) {
    if (S.over) return;
    P.y += n * CFG.FLOOR_H;
    P.vy = 0;
    P.ammo = ammoCap();
    S.camY = P.y - VIEW.h * CFG.CAM_ANCHOR;
    P.dwell = 0;
  }

  barBtns[0].addEventListener('click', function () { setTier(1); });
  barBtns[1].addEventListener('click', function () { setTier(2); });
  barBtns[2].addEventListener('click', function () { setTier(3); });
  resBtns[0].addEventListener('click', function () { setTier(1); });
  resBtns[1].addEventListener('click', function () { setTier(2); });
  resBtns[2].addEventListener('click', function () { setTier(3); });
  document.getElementById('btn-restart').addEventListener('click', function () { newRun(); });
  document.getElementById('btn-again').addEventListener('click', function () { newRun(); });
  document.getElementById('btn-jump').addEventListener('click', function () { jumpFloors(10); });
  document.getElementById('btn-flood').addEventListener('click', function () { if (!S.waterOn) triggerFlood(); });
  document.getElementById('btn-debug').addEventListener('click', function () { gDebug = !gDebug; });
  function toggleAudio() {
    AU.on = !AU.on;
    if (!AU.on) {
      if (AU.master && AU.ctx) AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.02);
    } else {
      audioUnlock();
      if (AU.master && AU.ctx) AU.master.gain.setTargetAtTime(0.5, AU.ctx.currentTime, 0.02);
    }
    var lab = AU.on ? '音频:开' : '音频:静音';
    elMute.textContent = lab;
    document.getElementById('btn-audio').textContent = lab;
  }
  document.getElementById('btn-audio').addEventListener('click', toggleAudio);
  window.addEventListener('touchend', audioUnlock, true);
  window.addEventListener('mouseup', audioUnlock, true);
  togBtns[0].addEventListener('click', function () { CFG.T_MAGNET = !CFG.T_MAGNET; syncToggleBtns(); });
  togBtns[1].addEventListener('click', function () { CFG.T_HARDLAND = !CFG.T_HARDLAND; syncToggleBtns(); });
  togBtns[2].addEventListener('click', function () { CFG.T_BIGFISH = !CFG.T_BIGFISH; syncToggleBtns(); });
  p3Btns[0].addEventListener('click', function () { if (S.pick3) applyPick(S.pick3.offers[0].id); });
  p3Btns[1].addEventListener('click', function () { if (S.pick3) applyPick(S.pick3.offers[1].id); });
  p3Btns[2].addEventListener('click', function () { if (S.pick3) applyPick(S.pick3.offers[2].id); });
  document.getElementById('btn-album').addEventListener('click', shareAlbum);
  document.getElementById('btn-note').addEventListener('click', shareNote);

  /* ===================== 首页 ===================== */
  function fillHome() {
    var ctl = '一根手指按住左右侧：往那边走，籽自己往下掉';
    elHomeStat.textContent = (gSave && gSave.totalRuns)
      ? ctl + '\n今日井 第 ' + gSave.todayBest + ' 层 · 历史最深 第 ' + gSave.deepest + ' 层 · 累计下井 ' + gSave.totalRuns + ' 次'
      : ctl;
    document.getElementById('home-ver').textContent = 'v-' + VER;
  }
  for (var hi = 0; hi < 3; hi++) {
    (function (el, m) { el.addEventListener('click', function () { setTier(m); }); })(htBtns[hi], hi + 1);
  }
  document.getElementById('btn-start').addEventListener('click', function () {
    gAttract = false;
    elHome.className = 'hidden';
    newRun();
  });
  elMute.addEventListener('click', toggleAudio);

  window.addEventListener('resize', resize);

  var paused = false;
  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
    if (document.hidden) { S.firing = false; last = 0; }
  });

  /* ===================== 音频（M0.5，纯 WebAudio 合成） ===================== */
  var AU = { ctx: null, on: true, unlocked: false, master: null };

  function audioUnlock() {
    if (!AU.on) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!AU.ctx) {
      AU.ctx = new AC();
      AU.master = AU.ctx.createGain();
      AU.master.gain.value = 0.5;
      AU.master.connect(AU.ctx.destination);
    }
    if (AU.ctx.state === 'suspended' && AU.ctx.resume) AU.ctx.resume();
    AU.unlocked = true;
  }

  /* ===================== M2 三选一（m4a：九轮分段发牌 + 偏科契约） ===================== */
  var LINE_COLOR = { aim: '#e8b23a', volley: '#8fb6c9', move: '#8fbf6a', econ: '#c9a06a' };
  var LINE_NAME = { aim: '瞄准', volley: '弹幕', move: '机动', econ: '经济' };
  function lockedLine() {
    var lines = ['aim', 'volley', 'move', 'econ'];
    for (var i = 0; i < lines.length; i++) if (lineCount(lines[i]) >= 4) return lines[i];
    return '';
  }
  function dominantLine() {
    var best = '', bc = 0;
    var lines = ['aim', 'volley', 'move', 'econ'];
    for (var i = 0; i < lines.length; i++) {
      var c = lineCount(lines[i]);
      if (c > bc) { bc = c; best = lines[i]; }
    }
    return best;
  }

  function offerPick3(n) {
    if (!elPick3 || !p3Btns[0]) return;   // DOM 不在（如旧缓存页面）：放弃本次，绝不卡死
    S.pickRound++;
    var rnd = mulberry32(hashStr(S.seedKey + '#m' + n + '#' + S.pickRound));
    var phase = S.pickRound <= 3 ? 1 : (S.pickRound <= 6 ? 2 : 3);
    var lock = lockedLine();
    var noSurvival = gTier === 3;   // 1 血档：生存类遗物无意义
    var avail = [];
    var i, m;
    for (i = 0; i < MODS.length; i++) {
      m = MODS[i];
      if (lvl(m.id) >= m.max || m.tier > phase) continue;
      if (lock && m.line !== lock) continue;
      avail.push(m);
    }
    for (i = 0; i < RELICS.length; i++) {
      m = RELICS[i];
      if (lvl(m.id) || m.tier > phase) continue;
      if (lock && m.line !== lock) continue;
      if (noSurvival && (m.id === 'egg' || m.id === 'amulet' || m.id === 'salt')) continue;
      avail.push(m);
    }
    if (lock && avail.length < 3) {
      /* 锁系后池子枯竭：兜底放开全池，绝不空手 */
      avail = [];
      for (i = 0; i < MODS.length; i++) if (lvl(MODS[i].id) < MODS[i].max) avail.push(MODS[i]);
      for (i = 0; i < RELICS.length; i++) if (!lvl(RELICS[i].id)) avail.push(RELICS[i]);
    }
    for (var j = avail.length - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var tmp = avail[j]; avail[j] = avail[k]; avail[k] = tmp;
    }
    var offers = avail.slice(0, 3);
    if (!offers.length) return;
    /* 多样性保底：三张至少覆盖两个系（全同系=没有决策，m4c） */
    if (offers.length === 3 && offers[0].line === offers[1].line && offers[1].line === offers[2].line) {
      for (i = 3; i < avail.length; i++) {
        if (avail[i].line !== offers[0].line) { offers[2] = avail[i]; break; }
      }
    }
    /* 第 4 轮起：至少一张来自玩家主系（承诺有回报，但不锁死） */
    if (S.pickRound >= 4 && !lock) {
      var dom = dominantLine();
      var hasDom = false;
      for (i = 0; i < offers.length; i++) if (offers[i].line === dom) hasDom = true;
      if (!hasDom && dom) {
        for (i = 3; i < avail.length; i++) {
          if (avail[i].line === dom) { offers[offers.length - 1] = avail[i]; break; }
        }
      }
    }
    S.pick3 = { floor: n, offers: offers };
    S.firing = false;
    for (var c = 0; c < 3; c++) {
      m = offers[c];
      var btn = p3Btns[c];
      if (m) {
        btn.style.display = 'block';
        var cl = lvl(m.id);
        btn.textContent = '';
        var ic = document.createElement('span');
        ic.className = 'p3-ic';
        ic.textContent = ICONS[m.id] || '\u2B50';
        var t1 = document.createElement('span');
        var lc = lineCount(m.line);
        t1.textContent = m.max > 1 ? m.name + ' Lv' + (cl + 1) : m.name;
        var t2 = document.createElement('small');
        var dTxt = cl === 0 ? m.desc : (m.desc2 || m.desc);
        if (lc === 3) dTxt += ' \u2014 \u53D6\u4E0B\u5B83\uFF0C\u4F60\u53EA\u5269\u8FD9\u4E00\u7CFB';   /* 拿下它，你只剩这一系 */
        t2.textContent = dTxt;
        /* 系别胶囊常驻：色底+文字，不依赖圆点辨色（m4b 用户反馈"看不出系别"） */
        var tag = document.createElement('span');
        tag.className = 'p3-line';
        tag.textContent = LINE_NAME[m.line] + (lc > 0 ? '\u00D7' + lc : '');
        tag.style.backgroundColor = LINE_COLOR[m.line];
        btn.style.borderColor = LINE_COLOR[m.line];
        btn.appendChild(ic);
        btn.appendChild(tag);
        btn.appendChild(t1);
        btn.appendChild(t2);
      } else {
        btn.style.display = 'none';
      }
    }
    elPick3.className = '';
  }

  function applyPick(id) {
    if (!S.pick3) return;
    P.mods[id] = lvl(id) + 1;
    S.pickLog.push({ floor: S.pick3.floor, id: id });
    if (id === 'egg') P.hp = Math.min(tierMaxHp(), P.hp + 1);
    if (id === 'pouch' && P.ammo > ammoCap()) P.ammo = ammoCap();
    /* m4a 取舍卡落地即结算：贷款=先拿15发，弹药箱=回满但本层补给清空 */
    if (id === 'loan') { P.ammo = Math.min(ammoCap(), P.ammo + 15); S.loanT = 2; }
    if (id === 'crate') {
      P.ammo = ammoCap();
      var fcr = floorAt(P.floor);
      for (var cri = 0; cri < fcr.pickups.length; cri++) fcr.pickups[cri].taken = true;
    }
    S.pick3 = null;
    elPick3.className = 'hidden';
  }

  /* 事件触发式尖叫：只在受击（未死）与死亡时出声；低调、干声、轻微毛边 */
  function screamCall(kind) {
    if (!AU.ctx || !AU.unlocked || !AU.on || S.headless) return;
    var t = AU.ctx.currentTime;
    var dying = kind === 'death';
    var base = dying ? (430 + Math.random() * 70) : (470 + Math.random() * 90);
    var dur = dying ? 0.55 : 0.22;
    var o = AU.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 0.8, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.08, t + 0.03);
    o.frequency.setValueAtTime(base * 1.08, t + dur * 0.55);
    o.frequency.exponentialRampToValueAtTime(base * (dying ? 0.45 : 0.7), t + dur);
    var bp1 = AU.ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.value = 750;
    bp1.Q.value = 3.5;
    var bp2 = AU.ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 1080;
    bp2.Q.value = 3.5;
    var mix = AU.ctx.createGain();
    mix.gain.value = 0.6;
    o.connect(bp1);
    bp1.connect(mix);
    o.connect(bp2);
    bp2.connect(mix);
    var g = AU.ctx.createGain();
    var lvl = dying ? 0.15 : 0.11;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.02);
    g.gain.setValueAtTime(lvl, t + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mix.connect(g);
    /* 轻毛边：26-40Hz 振幅调制，一点动物感就够，深了发噪 */
    var raspGain = AU.ctx.createGain();
    raspGain.gain.value = 1;
    var rasp = AU.ctx.createOscillator();
    rasp.type = 'sine';
    rasp.frequency.value = 26 + Math.random() * 14;
    var raspDepth = AU.ctx.createGain();
    raspDepth.gain.value = 0.3;
    rasp.connect(raspDepth);
    raspDepth.connect(raspGain.gain);
    rasp.start(t);
    rasp.stop(t + dur + 0.03);
    g.connect(raspGain);
    raspGain.connect(AU.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function blip(type, f0, f1, dur, vol) {
    var t = AU.ctx.currentTime;
    var o = AU.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    var g = AU.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(AU.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function sfx(name) {
    if (!AU.ctx || !AU.unlocked || !AU.on || S.headless) return;
    if (name === 'seed') blip('square', 1400, 800, 0.05, 0.05);
  }

  /* ===================== 无头模拟（B3 可解性门禁 + B2 时间预算实测） =====================
   * 不依赖 requestAnimationFrame，页面隐藏也能跑；bot 为贪心策略：
   * 脚下 520px 内有未破堵层，或 260px 内有活蛛 → 开火；否则纯下落。
   */
  function simulate(maxSeconds, opts) {
    opts = opts || {};
    var tier = opts.tier || gTier;
    var startFloor = opts.startFloor || 1;
    var policy = opts.policy || 'greedy';
    var budget = Math.min(600, maxSeconds || 240);

    var prevTier = gTier;
    var prevFlags = { m: CFG.T_MAGNET, h: CFG.T_HARDLAND, b: CFG.T_BIGFISH };
    if (opts.flags) {
      if (typeof opts.flags.magnet === 'boolean') CFG.T_MAGNET = opts.flags.magnet;
      if (typeof opts.flags.hardland === 'boolean') CFG.T_HARDLAND = opts.flags.hardland;
      if (typeof opts.flags.bigfish === 'boolean') CFG.T_BIGFISH = opts.flags.bigfish;
    }
    gTier = tier;
    newRun();
    gTier = tier;
    if (opts.seed) { S.seedKey = String(opts.seed); S.floors = {}; }
    S.headless = true;
    var xMin = P.x, xMax = P.x;
    if (startFloor > 1) {
      P.y = (startFloor - 1) * CFG.FLOOR_H + 200;
      P.vy = 0;
      S.camY = P.y - VIEW.h * CFG.CAM_ANCHOR;
      P.floor = floorOf(P.y);
      P.deepest = P.floor;
      S.lastFloor = P.floor;
    }
    if (opts.god) { P.hp = 99; S.godMode = true; }

    var t = 0, lastT = 0, lastFloor = P.floor;
    var floorTimes = [];
    /* m4f 弹药遥测：子弹兼"杀敌+位移"双开销，量化进层结余/层内谷底/空仓时长（纯数字，循环内零分配） */
    var amTrans = 0, amEntrySum = 0, amEntryMin = 999, amValleySum = 0, amValleyMin = 999, amEmptySteps = 0, amValley = P.ammo;
    while (t < budget && !S.over) {
      var wantFire = false;
      if (policy === 'greedy' || policy === 'noPick') {
        var f = floorAt(P.floor);
        /* 贪婪 bot 有开火纪律：300px 内才打坝，省后坐力（noPick 保持 520 纯莽，作悲观下界） */
        var blockR = policy === 'greedy' ? 300 : 520;
        if (f.block && !f.block.broken && f.block.y > P.y && f.block.y - P.y < blockR) wantFire = true;
        if (!opts.god) {
          if (f.fish && f.fish.alive && f.fish.y > P.y && f.fish.y - P.y < (policy === 'greedy' ? 150 : 260)) wantFire = true;
          if (f.bug && f.bug.alive && f.bug.y > P.y && f.bug.y - P.y < (policy === 'greedy' ? 150 : 260)) wantFire = true;
        }
        /* god 只对几何障碍开火（坝/蛙嘴），不陪鱼虫耗弹药——可解性探针语义（m3y） */
        if (f.frog && f.frog.alive && f.frog.open && Math.abs(P.x - shaftCx(f.frog.y)) < 70) wantFire = true;   // m3y：对准嘴才开火，省弹药
      }
      /* m3y：参考 bot 走位——蛙在下方朝嘴心对齐；弹药紧张时朝最近拾取横移（仅模拟器） */
      S.steerL = false;
      S.steerR = false;
      var ff = floorAt(P.floor).frog;
      if (!ff || !ff.alive) ff = floorAt(P.floor + 1).frog;
      if (ff && ff.alive && ff.y > P.y) {
        var aimX = shaftCx(ff.y);
        S.steerL = P.x > aimX + 30;
        S.steerR = P.x < aimX - 30;
      } else if (P.ammo <= 8) {
        var bq = null, bd2 = 1e9;
        var arrQ = [floorAt(P.floor).pickups, floorAt(P.floor + 1).pickups];
        for (var q = 0; q < 2; q++) {
          var lst = arrQ[q];
          for (var qi = 0; qi < lst.length; qi++) {
            var pk2 = lst[qi];
            if (pk2.taken) continue;
            var dyq = pk2.y - P.y;
            if (dyq < -60 || dyq > 900) continue;
            var dxq = Math.abs(pk2.x - P.x);
            if (dxq < bd2) { bd2 = dxq; bq = pk2; }
          }
        }
        if (bq) { S.steerL = P.x > bq.x + 10; S.steerR = P.x < bq.x - 10; }
      }
      S.firing = wantFire;
      stepOnce(CFG.STEP);
      if (S.pick3) {
        if (policy === 'noPick') { S.pick3 = null; elPick3.className = 'hidden'; }
        else {
          var pickId = S.pick3.offers[0].id;
          if (opts.prefer) {
            for (var pf = 0; pf < S.pick3.offers.length; pf++) {
              if (opts.prefer.indexOf(S.pick3.offers[pf].id) >= 0) { pickId = S.pick3.offers[pf].id; break; }
            }
          }
          applyPick(pickId);
        }
      }
      if (opts.god && P.hp < 99) P.hp = 99;
      if (opts.god && P.ammo < 10) P.ammo = 10;   // god=几何可解性探针：弹药保底，不测理财（真人会捡）
      if (P.x < xMin) xMin = P.x;
      if (P.x > xMax) xMax = P.x;
      var target = P.y - VIEW.h * CFG.CAM_ANCHOR;
      S.camY += (target - S.camY) * Math.min(1, CFG.CAM_SMOOTH * CFG.STEP);
      t += CFG.STEP;
      if (P.ammo === 0) amEmptySteps++;
      if (P.ammo < amValley) amValley = P.ammo;
      if (P.floor !== lastFloor) {
        floorTimes.push(t - lastT);
        lastFloor = P.floor;
        lastT = t;
        amTrans++;
        amEntrySum += P.ammo;
        amValleySum += amValley;
        if (P.ammo < amEntryMin) amEntryMin = P.ammo;
        if (amValley < amValleyMin) amValleyMin = amValley;
        amValley = P.ammo;
      }
    }

    var sorted = floorTimes.slice(0).sort(function (a, b) { return a - b; });
    var res = {
      tier: tier,
      policy: policy,
      startFloor: startFloor,
      deepest: P.deepest,
      over: S.over,
      win: S.win,
      cause: S.cause,
      simSeconds: Math.round(t * 100) / 100,
      floorsCleared: floorTimes.length,
      avgSecPerFloor: floorTimes.length ? Math.round((t / floorTimes.length) * 1000) / 1000 : 0,
      medianSecPerFloor: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)] * 1000) / 1000 : 0,
      shots: S.shots,
      blocksBroken: S.brokeBlocks,
      hits: S.hitsTaken,
      ammoLeft: P.ammo,
      ammoStats: amTrans ? {
        floors: amTrans,
        avgEntry: Math.round(amEntrySum / amTrans * 10) / 10,
        minEntry: amEntryMin,
        avgValley: Math.round(amValleySum / amTrans * 10) / 10,
        minValley: amValleyMin,
        emptyPct: Math.round(amEmptySteps / (t / CFG.STEP) * 1000) / 10
      } : null,
      waterTriggered: S.waterOn,
      xTravel: Math.round(xMax - xMin),
      shaftWAtDeepest: Math.round(shaftW(P.deepest * CFG.FLOOR_H)),
      hitsByCause: countCauses(S.hitLog),
      mods: P.mods
    };

    gTier = prevTier;
    CFG.T_MAGNET = prevFlags.m;
    CFG.T_HARDLAND = prevFlags.h;
    CFG.T_BIGFISH = prevFlags.b;
    newRun();
    syncTierBtns();
    syncToggleBtns();
    return res;
  }

  function countCauses(log) {
    var m = {};
    for (var i = 0; i < log.length; i++) {
      var c = log[i];
      m[c] = (m[c] || 0) + 1;
    }
    return m;
  }

  /* 批量模拟：同一批种子跑多个血量档（bot 无走位，仅作崩溃/穿透回归，不作平衡读数） */
  function simBatch(runs, opts) {
    opts = opts || {};
    var tiers = opts.tiers || [1, 2, 3];
    var n = Math.min(60, runs || 12);
    var base = opts.baseSeed || 'batch';
    var out = [];
    for (var mi = 0; mi < tiers.length; mi++) {
      var m = tiers[mi];
      var agg = {
        tier: m, runs: 0, deepestSum: 0, spikeHits: 0, spiderHits: 0, waterHits: 0,
        deaths: {}, waterTriggers: 0, xTravelSum: 0, shotsSum: 0, timeSum: 0, floorsSum: 0,
        amEntrySum: 0, amValleySum: 0, amEmptySum: 0, ammoWorstValley: 999, ammoWorstEntry: 999
      };
      for (var r = 0; r < n; r++) {
        var res = simulate(opts.seconds || 200, {
          tier: m,
          startFloor: opts.startFloor || 1,
          seed: base + '-' + r,
          flags: opts.flags
        });
        agg.runs++;
        agg.deepestSum += res.deepest;
        agg.xTravelSum += res.xTravel;
        agg.shotsSum += res.shots;
        agg.timeSum += res.simSeconds;
        agg.floorsSum += res.floorsCleared;
        if (res.waterTriggered) agg.waterTriggers++;
        agg.spikeHits += res.hitsByCause['蹭壁刺'] || 0;
        agg.spiderHits += res.hitsByCause['撞串丝蛛'] || 0;
        agg.waterHits += res.hitsByCause['被潭水漫过'] || 0;
        var c = res.cause || '(未死)';
        agg.deaths[c] = (agg.deaths[c] || 0) + 1;
        if (res.ammoStats) {
          agg.amEntrySum += res.ammoStats.avgEntry;
          agg.amValleySum += res.ammoStats.avgValley;
          agg.amEmptySum += res.ammoStats.emptyPct;
          if (res.ammoStats.minValley < agg.ammoWorstValley) agg.ammoWorstValley = res.ammoStats.minValley;
          if (res.ammoStats.minEntry < agg.ammoWorstEntry) agg.ammoWorstEntry = res.ammoStats.minEntry;
        }
      }
      agg.avgDeepest = Math.round(agg.deepestSum / agg.runs * 10) / 10;
      agg.avgXTravel = Math.round(agg.xTravelSum / agg.runs);
      agg.avgShots = Math.round(agg.shotsSum / agg.runs);
      agg.avgSeconds = Math.round(agg.timeSum / agg.runs);
      agg.avgSecPerFloor = agg.floorsSum ? Math.round(agg.timeSum / agg.floorsSum * 100) / 100 : 0;
      agg.ammoEntryAvg = Math.round(agg.amEntrySum / agg.runs * 10) / 10;
      agg.ammoValleyAvg = Math.round(agg.amValleySum / agg.runs * 10) / 10;
      agg.ammoEmptyPct = Math.round(agg.amEmptySum / agg.runs * 10) / 10;
      delete agg.deepestSum;
      delete agg.xTravelSum;
      delete agg.shotsSum;
      delete agg.timeSum;
      delete agg.floorsSum;
      delete agg.amEntrySum;
      delete agg.amValleySum;
      delete agg.amEmptySum;
      out.push(agg);
    }
    return out;
  }

  /* ===================== 主循环 ===================== */
  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (paused) { last = 0; return; }
    if (!last) { last = now; return; }
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

    if (gAttract) { render(); return; }
    update(dt);
    render();
  }

  resize();
  parseUrlOpts();
  loadSave();
  loadImages();
  newRun();
  fillHome();
  syncTierBtns();
  document.getElementById('proto-tag').textContent = VER;
  /* 顶部原型条只在 ?debug=1 时出现（重开/下跳/山洪/三原型开关都是开发工具） */
  if (!gDebug) document.getElementById('proto-bar').className = 'hidden';
  else { gAttract = false; elHome.className = 'hidden'; }   // 调试档：刷新即下井，不停首页
  syncToggleBtns();
  requestAnimationFrame(frame);

  window.JIAO_FALL = {
    CFG: CFG,
    state: function () { return S; },
    player: function () { return P; },
    setTier: setTier,
    simulate: simulate,
    simBatch: simBatch,
    render: render,
    fire: fire,
    stepOnce: stepOnce,
    buildReport: buildReportCard,
    canvas: cv,
    IMG: IMG,
    VER: VER,
    floorAt: floorAt,
    shaftW: shaftW,
    pick3: offerPick3
  };
})();
