'use strict';
/* ================= 界面层 ================= */
const UI = { tab: null, sel: null, goods: null, eshop: null, offers: null, dirty: false, dlg: null, logN: 0, tick: 0 };
const PLAYER_TABS = [['bag', '🎒 背包'], ['skill', '✨ 技能'], ['quest', '📜 任务'], ['pet', '🐾 宠物'], ['sys', '⚙️ 系统']];
const WIN_TITLE = { bag: '角色 & 背包', skill: '技能', quest: '任务', pet: '宠物', sys: '系统', shop: '商店', eshop: '装备商店', smith: '装备强化', tele: '传送', guild: '冒险者公会' };

function uiDirty() { UI.dirty = true; }
function msg(s, col) {
  const el = document.createElement('div'); el.textContent = s; if (col) el.style.color = col;
  const log = $('#log'); log.appendChild(el);
  while (log.children.length > 7) log.removeChild(log.firstChild);
  setTimeout(() => el.classList.add('old'), 6000);
}
function banner(a, b) {
  const el = $('#banner'); el.innerHTML = `<b>${a}</b><span>${b || ''}</span>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

/* ---------- HUD ---------- */
const _cache = new Map();
function setT(sel, v) { if (_cache.get(sel) !== v) { _cache.set(sel, v); $(sel).textContent = v; } }
function setW(sel, k) { const v = (clamp(k, 0, 1) * 100).toFixed(1) + '%'; if (_cache.get(sel) !== v) { _cache.set(sel, v); $(sel).style.width = v; } }
function setH(sel, v) { if (_cache.get(sel) !== v) { _cache.set(sel, v); $(sel).innerHTML = v; } }

function uiStart() {
  const p = G.p, C = CLASSES[p.cls];
  _cache.clear(); $('#log').innerHTML = '';
  const a = $('#avatar').getContext('2d'); a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, 128, 128);
  a.translate(60, 156); a.scale(3, 3); drawChibi(a, { hair: C.hair, cloth: C.cloth, hat: C.hat }, 0, false, 0);
  $('#pname').textContent = `${p.name} · ${C.name}`;
  let h = `<div class="slot" data-k="j"><span class="ic">${C.icon}</span><i class="key">J</i></div>`;
  SKILLS[p.cls].forEach((sk, i) => { h += `<div class="slot" data-k="${i + 1}" title="${sk.name}：${sk.desc}"><span class="ic">${sk.icon}</span><i class="key">${i + 1}</i><u id="cd${i}"></u><em id="lk${i}">Lv${sk.lv}</em></div>`; });
  h += `<div class="gap"></div><div class="slot" data-k="q"><span class="ic">🍎</span><i class="key">Q</i><b id="nHp">0</b></div>
        <div class="slot" data-k="e"><span class="ic">🫐</span><i class="key">E</i><b id="nMp">0</b></div>
        <div class="slot" data-k="t"><span class="ic">📜</span><i class="key">T</i><b id="nSc">0</b></div>`;
  $('#bar').innerHTML = h;
  $('#btnAuto').classList.remove('on');
  closeWin(); closeDlg(); uiDirty();
}
function potCount(k) { let n = 0; for (let t = 1; t <= 4; t++) n += countItem(k + t); return n; }
function questState() {
  const p = G.p, q = QUESTS[p.q.i], b = p.bounty;
  if (b && b.type === 'collect') b.prog = Math.min(b.n, countItem(b.target));
  return { q, done: q && p.q.prog >= q.n, b, bdone: b && b.prog >= b.n };
}
function hudTick(dt) {
  const p = G.p, st = G.st, rt = G.rt;
  setW('#hpb', p.hp / st.maxHp); setT('#hpt', `${Math.ceil(p.hp)} / ${st.maxHp}`);
  setW('#mpb', p.mp / st.maxMp); setT('#mpt', `${Math.floor(p.mp)} / ${st.maxMp}`);
  const need = expNeed(p.lv);
  setW('#expb', p.lv >= MAXLV ? 1 : p.exp / need); setT('#expt', p.lv >= MAXLV ? '已满级' : `EXP ${p.exp} / ${need}（${(p.exp / need * 100).toFixed(1)}%）`);
  setT('#plv', 'Lv.' + p.lv); setT('#gold', '🪙 ' + p.gold);
  SKILLS[p.cls].forEach((sk, i) => {
    const cd = rt.cd[sk.id] || 0, v = (cd > 0 ? cd / sk.cd * 100 : 0).toFixed(0) + '%';
    if (_cache.get('cd' + i) !== v) { _cache.set('cd' + i, v); $('#cd' + i).style.height = v; }
    const lk = p.skills[sk.id] ? 'none' : 'flex';
    if (_cache.get('lk' + i) !== lk) { _cache.set('lk' + i, lk); $('#lk' + i).style.display = lk; }
  });
  UI.tick += dt;
  if (UI.tick > 0.15) {
    UI.tick = 0;
    setT('#nHp', potCount('hp')); setT('#nMp', potCount('mp')); setT('#nSc', countItem('scroll'));
    // 增益
    let bh = '';
    const BN = { w3: '📣', a3: '🍃', atkPot: '💪', expPot: '🌟' };
    for (const k in p.buffs) bh += `<span>${BN[k] || '✨'}${Math.ceil(p.buffs[k])}s</span>`;
    if (p.pet) bh += `<span>🐾${PETS[p.pet].desc}</span>`;
    setH('#buffs', bh);
    // 任务追踪
    const s = questState(); let th = '';
    if (s.q) th += `<div class="${s.done ? 'ok' : ''}"><b>【主线】${s.q.name}</b><br>${s.done ? '✅ 点此领取奖励' : `${MAPS[s.q.map].name}：${MONS[s.q.target].name} ${p.q.prog}/${s.q.n}`}</div>`;
    else th += '<div class="ok"><b>🎉 主线已全部完成</b></div>';
    if (s.b) th += `<div class="${s.bdone ? 'ok' : ''}"><b>【悬赏】</b>${s.bdone ? '✅ 点此领取奖励' : `${bountyName(s.b)} ${s.b.prog}/${s.b.n}`}</div>`;
    if (p.ap > 0 || p.sp > 0) th += `<div class="tip">💡 可用：${p.ap ? p.ap + ' 属性点 ' : ''}${p.sp ? p.sp + ' 技能点' : ''}</div>`;
    setH('#tracker', th);
    setT('#mapname', `${G.map.def.name}${G.map.def.safe ? '' : ` Lv.${G.map.def.lv[0]}-${G.map.def.lv[1]}`}`);
    const hint = G.nearNpc ? `按 <b>F</b> 与「${G.nearNpc.name}」对话` : '';
    setH('#hint', hint); $('#hint').style.display = hint ? 'block' : 'none';
    drawMini();
    if (UI.dirty) { UI.dirty = false; if (UI.tab) renderWin(); }
  }
}
function drawMini() {
  const m = G.map, mm = $('#mm'), c = mm.getContext('2d'), s = m.ms;
  if (mm.width !== m.mini.width || mm.height !== m.mini.height) { mm.width = m.mini.width; mm.height = m.mini.height; }
  c.drawImage(m.mini, 0, 0);
  const dot = (x, y, col, r) => { c.fillStyle = col; c.beginPath(); c.arc(x / TILE * s, y / TILE * s, r, 0, 7); c.fill(); };
  for (const mo of G.mons) if (!mo.dead) dot(mo.x, mo.y, mo.boss ? '#ff2a2a' : mo.elite ? '#ffb020' : '#e05050', mo.boss ? 4 : 1.6);
  for (const n of m.npcs) dot(n.x, n.y, '#ffe14a', 2.5);
  for (const po of m.portals) dot(po.x, po.y, '#7a5aff', 3.5);
  dot(G.p.x, G.p.y, '#fff', 3.6); dot(G.p.x, G.p.y, '#2a8aff', 2.6);
}

/* ---------- 窗口 ---------- */
function openWin(tab, opt) { UI.tab = tab; UI.sel = null; Object.assign(UI, opt || {}); closeDlg(); $('#win').classList.remove('hide'); renderWin(); }
function closeWin() { $('#win').classList.add('hide'); UI.tab = null; }
function toggleWin(tab) { if (UI.tab === tab) closeWin(); else openWin(tab); }
function renderWin() {
  if (!UI.tab) return;
  const fn = { bag: bagHTML, skill: skillHTML, quest: questHTML, pet: petHTML, sys: sysHTML, shop: shopHTML, eshop: eshopHTML, smith: smithHTML, tele: teleHTML, guild: guildHTML }[UI.tab];
  $('#wtitle').textContent = WIN_TITLE[UI.tab];
  const isP = PLAYER_TABS.some(t => t[0] === UI.tab);
  $('#wtabs').innerHTML = isP ? PLAYER_TABS.map(t => `<span class="${t[0] === UI.tab ? 'on' : ''}" data-act="tab" data-t="${t[0]}">${t[1]}</span>`).join('') : '';
  $('#wtabs').style.display = isP ? 'flex' : 'none';
  const body = $('#wbody'), sc = body.querySelector('.scroll'), top = sc ? sc.scrollTop : 0;
  body.innerHTML = fn();
  const sc2 = body.querySelector('.scroll'); if (sc2) sc2.scrollTop = top;
}
function getSel() {
  const s = UI.sel, p = G.p; if (!s) return null;
  if (s.src === 'inv') return p.inv[s.i];
  if (s.src === 'eq') return p.equip[s.i];
  if (s.src === 'shop') return UI.eshop && UI.eshop[s.i];
  return null;
}
function sellPrice(it) { return it.eq ? Math.max(1, Math.round(eqPrice(it) * 0.25)) : Math.max(1, Math.round(ITEMS[it.id].price * 0.25)); }
function cellHTML(it, src, i, extra) {
  const sel = UI.sel && UI.sel.src === src && String(UI.sel.i) === String(i) ? ' sel' : '';
  if (!it) return `<div class="cell${sel}" data-act="sel" data-src="${src}" data-i="${i}">${extra || ''}</div>`;
  let h = `<div class="cell r${it.eq ? it.rar : 'x'}${sel}" data-act="sel" data-src="${src}" data-i="${i}"><span class="ic">${it.eq ? it.icon : ITEMS[it.id].icon}</span>`;
  if (!it.eq && it.n > 1) h += `<i class="n">${it.n}</i>`;
  if (it.eq && it.plus) h += `<i class="pl">+${it.plus}</i>`;
  if (it.eq && src === 'inv' && canWear(it) && eqScore(it) > eqScore(G.p.equip[it.slot])) h += '<i class="up">▲</i>';
  return h + '</div>';
}
function canWear(e) { return G.p.lv >= e.lv && (!e.cls || e.cls === G.p.cls); }
function itemHTML(it, cmp) {
  if (!it) return '<div class="sub">点击物品查看详情<br>双击可快速使用 / 装备</div>';
  if (!it.eq) { const d = ITEMS[it.id]; return `<b class="iname">${d.icon} ${d.name}</b><div class="sub">数量 ${it.n || 1}</div><div>${d.desc}</div><div class="sub">出售单价 🪙${sellPrice(it)}</div>`; }
  const k = 1 + it.plus * 0.08;
  let h = `<b class="iname" style="color:${RAR[it.rar].c}">${it.icon} ${it.name}${it.plus ? ' +' + it.plus : ''}</b>
    <div class="sub">${RAR[it.rar].n} · ${SLOT_NAME[it.slot]} · <span style="color:${G.p.lv >= it.lv ? '' : '#e04040'}">需要Lv.${it.lv}</span>${it.cls ? ` · <span style="color:${it.cls === G.p.cls ? '' : '#e04040'}">${CLASSES[it.cls].name}专用</span>` : ''}</div>`;
  for (const key in it.base) h += `<div>${STAT_NAME[key]} +${Math.round(it.base[key] * k)}</div>`;
  for (const key in it.affix) h += `<div style="color:#2f9a4a">${STAT_NAME[key]} +${it.affix[key]}</div>`;
  const sc = eqScore(it);
  h += `<div class="sub">评分 ${sc}`;
  if (cmp) { const d = sc - eqScore(G.p.equip[it.slot]); h += d > 0 ? ` <span style="color:#2f9a4a">▲${d}</span>` : d < 0 ? ` <span style="color:#e04040">▼${-d}</span>` : ' ＝'; }
  return h + ` · 售价 🪙${sellPrice(it)}</div>`;
}
function gridHTML() { return `<div class="grid">${G.p.inv.map((it, i) => cellHTML(it, 'inv', i)).join('')}</div>`; }

/* ---------- 背包 / 角色 ---------- */
function bagHTML() {
  const p = G.p, st = G.st, it = getSel(), s = UI.sel;
  let h = '<div class="cols"><div class="col left scroll">';
  h += `<div class="eqs">${SLOTS.map(sl => cellHTML(p.equip[sl], 'eq', sl, `<span class="ph">${SLOT_NAME[sl]}</span>`)).join('')}</div>`;
  h += `<div class="stats"><span>⚔️ 攻击 <b>${st.atk}</b></span><span>🛡️ 防御 <b>${st.def}</b></span><span>❤️ 生命 <b>${st.maxHp}</b></span><span>💧 魔法 <b>${st.maxMp}</b></span><span>💥 暴击 <b>${st.crit}%</b></span><span>👟 移速 <b>${Math.round(st.spd)}</b></span></div>`;
  h += `<div class="sec">属性点：<b style="color:#e06a1c">${p.ap}</b>${p.ap ? ' <button data-act="autoAttr">推荐加点</button>' : ''}</div>`;
  for (const k in ATTR_NAME) h += `<div class="attr"><span><b>${ATTR_NAME[k]}</b> ${p.attr[k]}${st.attr[k] > p.attr[k] ? `<i style="color:#2f9a4a">+${st.attr[k] - p.attr[k]}</i>` : ''}</span><small>${ATTR_DESC[k]}</small>${p.ap ? `<button data-act="addAttr" data-k="${k}">＋</button>` : ''}</div>`;
  h += `</div><div class="col right"><div class="sec">背包 ${p.inv.filter(x => x).length}/${BAG} <span style="float:right">🪙 ${p.gold} <button data-act="sort">整理</button></span></div>${gridHTML()}`;
  h += `<div class="detail"><div class="info">${itemHTML(it, s && s.src === 'inv')}</div><div class="btns">`;
  if (it && s.src === 'inv') {
    if (it.eq) h += '<button data-act="equip">装备</button>'; else if (ITEMS[it.id].type !== 'mat') h += '<button data-act="use">使用</button>';
    h += '<button class="gray" data-act="drop">丢弃</button>';
  } else if (it && s.src === 'eq') h += '<button data-act="unequip">卸下</button>';
  return h + '</div></div></div></div>';
}
/* ---------- 技能 ---------- */
function skillHTML() {
  const p = G.p;
  let h = `<div class="sec">技能点：<b style="color:#e06a1c">${p.sp}</b>　每升一级获得 1 点，技能每级伤害 +12%</div><div class="scroll list">`;
  SKILLS[p.cls].forEach((sk, i) => {
    const lv = p.skills[sk.id] || 0;
    h += `<div class="mrow"><span class="big">${sk.icon}</span><div class="grow"><b>${sk.name}</b> <span class="sub">${lv ? 'Lv.' + lv + '/' + SKILL_MAX : '🔒 ' + sk.lv + '级学习'} · 按键 ${i + 1}</span>
      <div>${sk.desc}</div><div class="sub">消耗 ${sk.mp} 魔法 · 冷却 ${sk.cd}s${sk.mul ? ` · 伤害 ${Math.round(sk.mul * (1 + 0.12 * Math.max(0, lv - 1)) * 100)}%${sk.hits ? '×' + sk.hits : ''}` : ''}</div></div>
      ${lv && lv < SKILL_MAX ? `<button data-act="upSkill" data-id="${sk.id}" ${p.sp ? '' : 'disabled'}>升级</button>` : lv ? '<span class="sub">已满级</span>' : ''}</div>`;
  });
  return h + '</div>';
}
/* ---------- 任务 ---------- */
function rewardHTML(q) {
  let h = `经验 ${q.exp}　🪙 ${q.gold}`;
  (q.items || []).forEach(r => { h += r.eq ? `　<span style="color:${RAR[r.eq[2]].c}">${RAR[r.eq[2]].n}${SLOT_NAME[r.eq[0]]}</span>` : `　${ITEMS[r.id].icon}×${r.n}`; });
  return h;
}
function bountyName(b) { return b.type === 'kill' ? `讨伐 ${MONS[b.target].name}` : `收集 ${ITEMS[b.target].name}`; }
function questHTML() {
  const p = G.p, s = questState();
  let h = '<div class="scroll list">';
  if (s.q) {
    h += `<div class="mrow"><span class="big">📜</span><div class="grow"><b>【主线 ${p.q.i + 1}/${QUESTS.length}】${s.q.name}</b><div>${s.q.story}</div>
      <div>目标：前往 <b>${MAPS[s.q.map].name}</b> 击败 <b>${MONS[s.q.target].name}</b>（${p.q.prog}/${s.q.n}）</div><div class="sub">奖励：${rewardHTML(s.q)}</div></div>
      <button data-act="claimMain" ${s.done ? '' : 'disabled'}>${s.done ? '领取奖励' : '进行中'}</button></div>`;
  } else h += '<div class="mrow"><span class="big">🎉</span><div class="grow"><b>恭喜通关！</b><div>你已经完成了全部主线任务，萌萌大陆的英雄！</div></div></div>';
  if (s.b) {
    h += `<div class="mrow"><span class="big">📋</span><div class="grow"><b>【悬赏】${bountyName(s.b)}</b><div>进度：${s.b.prog}/${s.b.n}</div><div class="sub">奖励：经验 ${s.b.exp}　🪙 ${s.b.gold}　💎×${s.b.stone}</div></div>
      <button data-act="claimBounty" ${s.bdone ? '' : 'disabled'}>${s.bdone ? '领取奖励' : '进行中'}</button><button class="gray" data-act="dropBounty">放弃</button></div>`;
  } else h += '<div class="mrow"><span class="big">📋</span><div class="grow"><b>【悬赏】暂无</b><div class="sub">去萌萌村的「公会·阿布」处接取可重复的悬赏任务</div></div></div>';
  h += `<div class="mrow"><span class="big">🏅</span><div class="grow"><b>冒险统计</b><div class="sub">累计击杀 ${p.kills} · 已解锁地图 ${p.unlocked.length}/${MAPS.length} · 宠物 ${p.pets.length}/${Object.keys(PETS).length}</div></div></div>`;
  return h + '</div>';
}
/* ---------- 宠物 ---------- */
function petHTML() {
  const p = G.p;
  let h = '<div class="sec">宠物会跟随你一起战斗，并提供属性加成。宠物蛋可在宠物师处购买，或由首领掉落。</div><div class="scroll list">';
  for (const id in PETS) {
    const d = PETS[id], own = p.pets.includes(id);
    h += `<div class="mrow" style="${own ? '' : 'opacity:.5'}"><canvas class="petcv" data-pet="${id}" width="56" height="56"></canvas><div class="grow"><b>${d.name}</b><div>${d.desc}</div><div class="sub">${own ? '已拥有' : '未获得'}</div></div>
      ${own ? (p.pet === id ? '<button class="gray" data-act="setPet" data-id="">休息</button>' : `<button data-act="setPet" data-id="${id}">出战</button>`) : ''}</div>`;
  }
  setTimeout(() => document.querySelectorAll('.petcv').forEach(cv2 => {
    const c = cv2.getContext('2d'), d = PETS[cv2.dataset.pet]; c.clearRect(0, 0, 56, 56); c.save(); c.translate(28, 50); c.scale(0.95, 0.95); drawMon(c, d.shape, d.c, 1); c.restore();
  }), 0);
  return h + '</div>';
}
/* ---------- 系统 ---------- */
function sysHTML() {
  return `<div class="scroll list"><div class="mrow"><div class="grow"><b>操作说明</b>
    <div>键盘：WASD / 方向键移动　　J / 空格普攻（自动瞄准最近的怪）</div><div>鼠标：左键点地面走过去（按住一直跟随）　左键点怪物追击　左键点 NPC 对话　右键朝鼠标方向攻击</div><div>技能：1 2 3 4　　红药：Q　蓝药：E　回城卷：T</div>
    <div>对话：F　　背包：B　技能：K　任务：L　宠物：P　自动战斗：Z　　静音：M　音乐：N</div>
    <div class="sub">站在传送门上即可切换地图；死亡会损失 10% 金币并回村复活；游戏每 30 秒自动存档。</div></div></div>
    <div class="mrow"><div class="grow"><b>存档</b><div class="sub">存档保存在浏览器本地</div></div><button data-act="save">立即存档</button></div>
    <div class="mrow"><div class="grow"><b>背景音乐</b><div class="sub">♪ ${BGM.on ? bgmName() : '已关闭'}　·　${BGM.mode === 'one' ? '单曲循环' : '多曲循环'}　·　音量 ${Math.round(BGM.vol * 100)}%</div></div>
      <button data-act="bgmToggle">${BGM.on ? '🎵 关闭音乐' : '🔇 开启音乐'}</button><button data-act="bgmMode">${BGM.mode === 'one' ? '🔂 单曲' : '🔁 多曲'}</button><button data-act="bgmNext">⏭ 下一首</button><button data-act="bgmVol" data-d="-1">－</button><button data-act="bgmVol" data-d="1">＋</button></div>
    <div class="mrow"><div class="grow"><b>静音</b><div class="sub">一键关闭全部声音（音效 + 音乐），与页面右上角 🔊 按钮同步</div></div><button data-act="mute">${G.mute ? '🔇 取消静音' : '🔊 静音'}</button></div>
    <div class="mrow"><div class="grow"><b>返回标题</b><div class="sub">存档后回到标题画面，可创建新角色（会覆盖旧档）</div></div><button class="gray" data-act="toTitle">返回标题</button></div></div>`;
}
/* ---------- 商店 ---------- */
function sellSide() {
  const it = getSel(), s = UI.sel;
  let h = `<div class="col right"><div class="sec">我的背包　🪙 ${G.p.gold} <span style="float:right"><button class="gray" data-act="sellJunk">一键卖普通/优秀装备</button></span></div>${gridHTML()}<div class="detail"><div class="info">${itemHTML(it, s && s.src !== 'eq')}</div><div class="btns">`;
  if (it && s.src === 'inv') { h += '<button data-act="sell" data-n="1">出售</button>'; if (!it.eq && it.n > 1) h += '<button data-act="sell" data-n="all">全部出售</button>'; }
  if (it && s.src === 'shop') h += `<button data-act="buyEq">购买 🪙${eqPrice(it)}</button>`;
  return h + '</div></div></div>';
}
function shopHTML() {
  let h = '<div class="cols"><div class="col left scroll list">';
  UI.goods.forEach(id => {
    const d = ITEMS[id];
    h += `<div class="mrow sm"><span class="big">${d.icon}</span><div class="grow"><b>${d.name}</b><div class="sub">${d.desc}</div><div>🪙 ${d.price}</div></div>
      <button data-act="buy" data-id="${id}" data-n="1">买1</button>${d.type === 'egg' ? '' : `<button data-act="buy" data-id="${id}" data-n="10">买10</button>`}</div>`;
  });
  return h + '</div>' + sellSide() + '</div>';
}
function genEshop() {
  const p = G.p; let t = 0; TIERS.forEach((T, i) => { if (T.lv <= p.lv) t = i; });
  const out = [];
  for (const tt of (t > 0 ? [t - 1, t] : [0])) for (const s of SLOTS) { out.push(makeEquip(s, tt, 0, p.cls)); if (tt === t) out.push(makeEquip(s, tt, 1, p.cls)); }
  return out;
}
function eshopHTML() {
  let h = '<div class="cols"><div class="col left"><div class="sec">铁匠的货架（随等级更新）</div><div class="grid g5 scroll">';
  UI.eshop.forEach((it, i) => h += cellHTML(it, 'shop', i));
  return h + '</div></div>' + sellSide() + '</div>';
}
/* ---------- 强化 ---------- */
function smithHTML() {
  const p = G.p, it = getSel();
  let h = `<div class="cols"><div class="col left"><div class="sec">已穿戴</div><div class="eqs">${SLOTS.map(sl => cellHTML(p.equip[sl], 'eq', sl, `<span class="ph">${SLOT_NAME[sl]}</span>`)).join('')}</div>
    <div class="sec">背包中的装备</div><div class="grid g5 scroll">${p.inv.map((x, i) => x && x.eq ? cellHTML(x, 'inv', i) : '').join('')}</div></div><div class="col right"><div class="sec">强化　🪙 ${p.gold}　💎 ${countItem('stone')}</div><div class="detail tall"><div class="info">`;
  if (it && it.eq) {
    h += itemHTML(it);
    if (it.plus >= 12) h += '<div class="sec">已强化到最高等级 +12</div>';
    else {
      const c = enhCost(it);
      h += `<div class="sec">+${it.plus} ➜ <b style="color:#e06a1c">+${it.plus + 1}</b>（基础属性 +${(it.plus + 1) * 8}%）</div><div>成功率：<b>${ENH_RATE[it.plus]}%</b>（失败不会损坏装备）</div><div>消耗：🪙 ${c.gold}　💎 强化石 ×${c.stone}</div>`;
    }
    h += `</div><div class="btns">${it.plus < 12 ? '<button data-act="enhance">强化！</button>' : ''}`;
  } else h += '<div class="sub">选择一件装备进行强化。<br>强化石可由怪物掉落、任务奖励获得，也可在杂货商处购买。</div></div><div class="btns">';
  return h + '</div></div></div></div>';
}
/* ---------- 传送 ---------- */
function teleHTML() {
  const p = G.p; let h = '<div class="scroll list">';
  MAPS.forEach(m => {
    const ok = p.unlocked.includes(m.id);
    h += `<div class="mrow sm" style="${ok ? '' : 'opacity:.5'}"><span class="big">${m.safe ? '🏡' : '🗺️'}</span><div class="grow"><b>${m.name}</b> <span class="sub">${m.safe ? '安全区' : `Lv.${m.lv[0]}-${m.lv[1]} · 首领：${MONS[m.boss].name}`}</span></div>
      ${ok ? (m.id === p.mapId ? '<span class="sub">当前位置</span>' : `<button data-act="tele" data-id="${m.id}">传送</button>`) : '<span class="sub">🔒 未到达</span>'}</div>`;
  });
  return h + '</div>';
}
/* ---------- 公会悬赏 ---------- */
function genOffers() {
  const p = G.p;
  let maps = MAPS.filter(m => m.mons && p.unlocked.includes(m.id) && m.lv[0] <= p.lv + 2);
  if (!maps.length) maps = [MAPS[1]];
  maps = maps.slice(-2);
  UI.offers = [0, 1, 2].map(i => {
    const m = pick(maps), kill = i < 2, target = kill ? pick(m.mons) : m.mat, lv = MONS[m.mons[1]].lv, n = kill ? ri(10, 18) : ri(4, 8);
    return { type: kill ? 'kill' : 'collect', target, n, prog: 0, map: m.id, exp: Math.round(expNeed(lv) * 0.3 * n / 12 * (kill ? 1 : 2)), gold: Math.round((60 + lv * 25) * n / 12 * (kill ? 1 : 2)), stone: 1 + (m.id > 4 ? 1 : 0) };
  });
}
function guildHTML() {
  const p = G.p, s = questState(); let h = '<div class="scroll list">';
  if (s.b) {
    h += `<div class="mrow"><span class="big">📋</span><div class="grow"><b>进行中：${bountyName(s.b)}</b><div>${MAPS[s.b.map].name} · 进度 ${s.b.prog}/${s.b.n}</div><div class="sub">奖励：经验 ${s.b.exp}　🪙 ${s.b.gold}　💎×${s.b.stone}</div></div>
      <button data-act="claimBounty" ${s.bdone ? '' : 'disabled'}>${s.bdone ? '领取奖励' : '进行中'}</button><button class="gray" data-act="dropBounty">放弃</button></div>`;
  } else {
    if (!UI.offers) genOffers();
    UI.offers.forEach((b, i) => {
      h += `<div class="mrow"><span class="big">${b.type === 'kill' ? '⚔️' : '🎒'}</span><div class="grow"><b>${bountyName(b)} ×${b.n}</b><div>地点：${MAPS[b.map].name}</div><div class="sub">奖励：经验 ${b.exp}　🪙 ${b.gold}　💎×${b.stone}</div></div><button data-act="takeBounty" data-i="${i}">接取</button></div>`;
    });
    h += '<div class="mrow sm"><div class="grow sub">悬赏任务可无限重复，是获取强化石的好途径。</div><button class="gray" data-act="reroll">换一批</button></div>';
  }
  return h + '</div>';
}

/* ---------- 操作 ---------- */
function doEquip(i) {
  const p = G.p, e = p.inv[i]; if (!e || !e.eq) return;
  if (p.lv < e.lv) { msg(`等级不足，需要 Lv.${e.lv}`, '#ff8a8a'); return; }
  if (e.cls && e.cls !== p.cls) { msg(`这是${CLASSES[e.cls].name}专用武器`, '#ff8a8a'); return; }
  p.inv[i] = p.equip[e.slot]; p.equip[e.slot] = e; calcStats(); sfx('ok'); UI.sel = null;
}
function doUse(i) {
  const p = G.p, it = p.inv[i]; if (!it || it.eq) return;
  const d = ITEMS[it.id];
  if (d.type === 'potion') { usePotionId(it.id); return; }
  if (d.type === 'scroll') { closeWin(); useScroll(); return; }
  if (d.type === 'buff') { removeItem(it.id, 1); p.buffs[d.buff] = (p.buffs[d.buff] || 0) + d.dur; calcStats(); msg(`使用了${d.name}`, '#ffe14a'); sfx('ok'); }
  if (d.type === 'egg') {
    if (p.pets.includes(d.pet)) { msg('你已经拥有这只宠物了，可以把蛋卖掉', '#ff8a8a'); return; }
    removeItem(it.id, 1); p.pets.push(d.pet); if (!p.pet) p.pet = d.pet; calcStats();
    msg(`🐣 孵化成功！获得宠物「${PETS[d.pet].name}」`, '#ffe14a'); sfx('lvup');
  }
  if (!p.inv[i]) UI.sel = null;
}
function usePotionId(id) {
  const p = G.p, d = ITEMS[id], rt = G.rt;
  if (rt.potT > 0 || rt.dead) return;
  if (d.hp ? p.hp >= G.st.maxHp : p.mp >= G.st.maxMp) { msg('状态已满，不需要使用'); return; }
  removeItem(id, 1); rt.potT = 1.2; sfx('pick');
  if (d.hp) healP(d.hp); else p.mp = Math.min(G.st.maxMp, p.mp + d.mp);
}
function giveRewards(items) {
  (items || []).forEach(r => {
    const it = r.eq ? makeEquip(r.eq[0], r.eq[1], r.eq[2], G.p.cls) : { id: r.id, n: r.n };
    giveOrDrop(it); msg(`获得 ${itemName(it)}`, r.eq ? RAR[it.rar].c : '#fff');
  });
}
const ACT = {
  close: closeWin,
  tab: d => { UI.tab = d.t; UI.sel = null; },
  sel: d => {
    const same = UI.sel && UI.sel.src === d.src && String(UI.sel.i) === d.i;
    UI.sel = { src: d.src, i: d.src === 'eq' ? d.i : +d.i };
    if (same && UI.tab === 'bag') { if (d.src === 'inv') { const it = G.p.inv[+d.i]; if (it) it.eq ? doEquip(+d.i) : doUse(+d.i); } else ACT.unequip(); }
  },
  equip: () => doEquip(UI.sel.i),
  use: () => doUse(UI.sel.i),
  unequip: () => {
    const p = G.p, s = UI.sel; if (!s || s.src !== 'eq' || !p.equip[s.i]) return;
    const i = p.inv.indexOf(null); if (i < 0) { msg('背包满了', '#ff8a8a'); return; }
    p.inv[i] = p.equip[s.i]; p.equip[s.i] = null; calcStats(); UI.sel = null;
  },
  drop: () => { const it = getSel(); if (it && confirm(`确定丢弃「${itemName(it)}」吗？`)) { G.p.inv[UI.sel.i] = null; UI.sel = null; } },
  sort: () => {
    const key = it => it.eq ? [0, -it.lv, -it.rar, SLOTS.indexOf(it.slot)] : [1, Object.keys(ITEMS).indexOf(it.id), 0, 0];
    const a = G.p.inv.filter(x => x).sort((x, y) => { const kx = key(x), ky = key(y); for (let i = 0; i < 4; i++) if (kx[i] !== ky[i]) return kx[i] - ky[i]; return 0; });
    G.p.inv = a.concat(new Array(BAG - a.length).fill(null)); UI.sel = null;
  },
  addAttr: d => { const p = G.p; if (p.ap > 0) { p.attr[d.k]++; p.ap--; calcStats(); } },
  autoAttr: () => {
    const p = G.p, main = CLASSES[p.cls].main;
    while (p.ap > 0) { const k = p.ap % 5 === 0 || p.ap % 5 === 3 ? 'con' : main; p.attr[k]++; p.ap--; }
    calcStats(); sfx('ok');
  },
  upSkill: d => { const p = G.p; if (p.sp > 0 && p.skills[d.id] && p.skills[d.id] < SKILL_MAX) { p.skills[d.id]++; p.sp--; sfx('ok'); } },
  claimMain: () => {
    const p = G.p, q = QUESTS[p.q.i]; if (!q || p.q.prog < q.n) return;
    p.q.i++; p.q.prog = 0; p.gold += q.gold; msg(`📜 完成主线「${q.name}」！金币 +${q.gold}`, '#ffe14a');
    giveRewards(q.items); gainExp(q.exp); sfx('lvup');
    const nq = QUESTS[p.q.i]; if (nq) msg(`新任务：${nq.name}（${MAPS[nq.map].name}）`, '#8ad8ff');
  },
  claimBounty: () => {
    const p = G.p, b = p.bounty; if (!b) return;
    if (b.type === 'collect') { if (countItem(b.target) < b.n) return; removeItem(b.target, b.n); } else if (b.prog < b.n) return;
    p.bounty = null; p.gold += b.gold; giveOrDrop({ id: 'stone', n: b.stone }); msg(`📋 悬赏完成！金币 +${b.gold}，强化石 ×${b.stone}`, '#ffe14a'); gainExp(b.exp); sfx('ok'); UI.offers = null;
  },
  dropBounty: () => { if (confirm('确定放弃当前悬赏吗？')) G.p.bounty = null; },
  takeBounty: d => { G.p.bounty = UI.offers[+d.i]; UI.offers = null; msg(`接取悬赏：${bountyName(G.p.bounty)}`, '#8ad8ff'); sfx('ok'); },
  reroll: () => genOffers(),
  setPet: d => { G.p.pet = d.id || null; G.pet = null; calcStats(); },
  buy: d => {
    const p = G.p, it = ITEMS[d.id], n = +d.n, cost = it.price * n;
    if (p.gold < cost) { msg('金币不够啦', '#ff8a8a'); sfx('bad'); return; }
    if (!addItem({ id: d.id, n })) { msg('背包满了', '#ff8a8a'); return; }
    p.gold -= cost; sfx('pick');
  },
  buyEq: () => {
    const p = G.p, it = getSel(); if (!it) return; const cost = eqPrice(it);
    if (p.gold < cost) { msg('金币不够啦', '#ff8a8a'); sfx('bad'); return; }
    if (!addItem(JSON.parse(JSON.stringify(it)))) { msg('背包满了', '#ff8a8a'); return; }
    p.gold -= cost; sfx('pick'); msg(`购买了 ${it.name}`);
  },
  sell: d => {
    const p = G.p, s = UI.sel, it = getSel(); if (!it || s.src !== 'inv') return;
    const n = it.eq ? 1 : d.n === 'all' ? it.n : 1;
    p.gold += sellPrice(it) * n; sfx('pick');
    if (it.eq || it.n <= n) { p.inv[s.i] = null; UI.sel = null; } else it.n -= n;
  },
  sellJunk: () => {
    const p = G.p; let g = 0, c = 0;
    p.inv.forEach((it, i) => { if (it && it.eq && it.rar <= 1 && it.plus === 0) { g += sellPrice(it); c++; p.inv[i] = null; } });
    p.gold += g; UI.sel = null; msg(c ? `卖出 ${c} 件装备，获得 🪙${g}` : '没有可出售的普通/优秀装备'); if (c) sfx('pick');
  },
  enhance: () => {
    const p = G.p, e = getSel(); if (!e || !e.eq || e.plus >= 12) return;
    const c = enhCost(e);
    if (p.gold < c.gold) { msg('金币不够啦', '#ff8a8a'); sfx('bad'); return; }
    if (countItem('stone') < c.stone) { msg('强化石不足', '#ff8a8a'); sfx('bad'); return; }
    p.gold -= c.gold; removeItem('stone', c.stone);
    if (Math.random() * 100 < ENH_RATE[e.plus]) { e.plus++; msg(`✨ 强化成功！${e.name} +${e.plus}`, '#ffe14a'); sfx('lvup'); }
    else { msg('💦 强化失败……材料消失了', '#ff8a8a'); sfx('bad'); }
    calcStats();
  },
  tele: d => { closeWin(); changeMap(+d.id); sfx('ok'); },
  save: () => { save(); msg('💾 已存档'); },
  mute: () => { G.mute = !G.mute; },
  bgmToggle: () => bgmToggle(), bgmMode: () => bgmMode(), bgmNext: () => bgmNext(), bgmVol: d => bgmVol(+d.d),
  toTitle: () => { save(); closeWin(); G.state = 'title'; G.auto = false; $('#hud').classList.add('hide'); showTitle(); bgmSet('town'); },
};

/* ---------- NPC 对话 ---------- */
function showDlg(name, text, opts) {
  UI.dlg = opts.concat([['再见', null]]);
  $('#dlg').innerHTML = `<b>${name}</b><p>${text}</p><div>${UI.dlg.map((o, i) => `<button data-i="${i}">${o[0]}</button>`).join('')}</div>`;
  $('#dlg').classList.remove('hide');
}
function closeDlg() { $('#dlg').classList.add('hide'); UI.dlg = null; }
function openNpc(n) {
  const p = G.p; closeWin(); G.mouse.down = false;
  switch (n.id) {
    case 'chief': {
      const s = questState();
      const t = !s.q ? '孩子，你已经是萌萌大陆的大英雄了！爷爷为你骄傲。' : s.done ? `干得漂亮！「${s.q.name}」已经完成了，快来领取奖励吧！` : `${s.q.story}<br>现在的任务：去<b>${MAPS[s.q.map].name}</b>击败 ${s.q.n} 只<b>${MONS[s.q.target].name}</b>。`;
      showDlg(n.name, t, [['查看任务', () => openWin('quest')]]); break;
    }
    case 'shop': showDlg(n.name, '欢迎光临~ 药水零食、回城卷轴应有尽有！', [['买东西 / 卖东西', () => openWin('shop', { goods: SHOP_GOODS })]]); break;
    case 'smith': showDlg(n.name, '嘿！想要趁手的装备，还是把装备敲得更硬？', [['购买装备', () => openWin('eshop', { eshop: genEshop() })], ['强化装备', () => openWin('smith')]]); break;
    case 'pet': showDlg(n.name, '喵~ 每一只宠物都是最棒的伙伴！', [['购买宠物蛋', () => openWin('shop', { goods: PET_GOODS })], ['我的宠物', () => openWin('pet')]]); break;
    case 'guild': showDlg(n.name, '冒险者，公会有源源不断的悬赏等你来接！', [['悬赏任务', () => openWin('guild')]]); break;
    case 'tele': showDlg(n.name, '闪闪~ 去过的地方我都能把你送过去！', [['传送', () => openWin('tele')]]); break;
    case 'heal': p.hp = G.st.maxHp; p.mp = G.st.maxMp; sfx('ok'); showDlg(n.name, '呼呼~ 痛痛飞走啦！生命和魔法已经全部恢复。', []); break;
  }
}

/* ---------- 标题画面 ---------- */
let pickCls = 'warrior';
function showTitle() {
  const sv = loadSave();
  $('#title').classList.remove('hide');
  $('#clsList').innerHTML = Object.keys(CLASSES).map(k => { const c = CLASSES[k]; return `<div class="cls${k === pickCls ? ' on' : ''}" data-c="${k}"><canvas width="180" height="230" style="width:90px;height:115px" data-c="${k}"></canvas><b>${c.icon} ${c.name}</b><small>${c.desc}</small></div>`; }).join('');
  document.querySelectorAll('#clsList canvas').forEach(el => {
    const c = el.getContext('2d'), C = CLASSES[el.dataset.c]; c.translate(84, 222); c.scale(3.2, 3.2); drawChibi(c, { hair: C.hair, cloth: C.cloth, hat: C.hat, weapon: el.dataset.c }, 0, false, 0);
  });
  const bc = $('#btnCont');
  if (sv) { bc.style.display = ''; bc.textContent = `继续游戏（${sv.name} · Lv.${sv.lv} ${CLASSES[sv.cls].name}）`; } else bc.style.display = 'none';
}

/* ---------- 输入 & 启动 ---------- */
function init() {
  fit(); addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(FRAME);
  bgmInit(); bgmSet('town');
  addEventListener('keydown', e => {
    if (G.state !== 'play' || e.target.tagName === 'INPUT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;           // 浏览器/系统快捷键不当作游戏按键
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter'].includes(k)) e.preventDefault();
    // 鼠标点过的按钮会留着焦点，之后按 Enter/空格 会再次"点击"它（背包自己弹出来的原因）
    const ae = document.activeElement; if (ae && ae !== document.body && ae.tagName !== 'INPUT') ae.blur();
    if (e.repeat) return;
    G.keys[k] = true;
    if (k >= '1' && k <= '4') cast(+k - 1);
    else if (k === 'q') usePotion('hp'); else if (k === 'e') usePotion('mp'); else if (k === 't') useScroll();
    else if (k === 'b') toggleWin('bag'); else if (k === 'k') toggleWin('skill'); else if (k === 'l') toggleWin('quest'); else if (k === 'p') toggleWin('pet');
    else if (k === 'z') toggleAuto(); else if (k === 'm') msg(G.mute ? '🔇 已静音' : '🔊 声音开启');   // 切换由共享的 KIT.mountMute 完成，这里只提示
    else if (k === 'n') { bgmToggle(); msg(BGM.on ? `🎵 音乐开启：${bgmName()}` : '🔇 音乐关闭'); }
    else if (k === 'f' || k === 'enter') { if (UI.dlg) closeDlg(); else if (G.nearNpc) openNpc(G.nearNpc); }
    else if (k === 'escape') { if (UI.dlg) closeDlg(); else if (UI.tab) closeWin(); else openWin('sys'); }
  });
  addEventListener('keyup', e => { G.keys[e.key.toLowerCase()] = false; });
  // 点击按钮/快捷栏时不让它获得键盘焦点
  addEventListener('mousedown', e => { if (e.target.tagName !== 'INPUT' && e.target.closest('button,.slot,[data-act],[data-m]')) e.preventDefault(); });
  addEventListener('blur', () => { G.keys = {}; G.mouse.down = false; G.mouse.drag = false; });
  const pos = e => { const r = cv.getBoundingClientRect(); G.mouse.x = (e.clientX - r.left) * VW / r.width; G.mouse.y = (e.clientY - r.top) * VH / r.height; };
  cv.addEventListener('pointerdown', e => {            // 指针事件：鼠标与触屏共用（触屏点地面移动 / 按住跟随）
    if (G.state !== 'play' || G.rt.dead) return; pos(e);
    const wx = G.mouse.x + G.cam.x, wy = G.mouse.y + G.cam.y;
    if (e.button === 2) { mouseStop(); G.mouse.down = true; return; }      // 右键：原地朝鼠标方向攻击
    if (e.button !== 0) return;
    mouseStop();
    const n = G.map.npcs.find(n => Math.abs(wx - n.x) < 30 && wy < n.y + 10 && wy > n.y - 90);
    if (n) { if (G.nearNpc === n) openNpc(n); else G.mv = { x: n.x, y: n.y + 44, npc: n }; return; }   // 点 NPC：走过去对话
    const m = monAt(wx, wy);
    if (m) { G.tgt = m; G.fx.push({ type: 'ring', x: m.x, y: m.y, r: m.r + 14, t: 0, dur: 0.35, col: '255,90,90' }); return; }   // 点怪物：追上去打到死
    const s = snapFree(wx, wy); if (!s) return;
    G.mv = { x: s.x, y: s.y, npc: null }; G.mouse.drag = true;                // 点地面：走过去；按住则一直跟随
    G.fx.push({ type: 'ring', x: s.x, y: s.y, r: 22, t: 0, dur: 0.4, col: '255,255,255' });
  });
  addEventListener('pointermove', pos);
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { G.mouse.down = false; G.mouse.drag = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('beforeunload', () => { if (G.state === 'play') save(); });

  $('#win').addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    ACT[el.dataset.act](el.dataset); if (UI.tab) renderWin();
  });
  $('#dlg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const o = UI.dlg[+b.dataset.i]; closeDlg(); if (o && o[1]) o[1]();
  });
  $('#menu').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    if (b.dataset.m === 'auto') toggleAuto(); else toggleWin(b.dataset.m);
  });
  $('#tracker').addEventListener('click', () => openWin('quest'));
  $('#bar').addEventListener('pointerdown', e => {
    const s = e.target.closest('.slot'); if (!s) return; const k = s.dataset.k;
    if (k === 'j') tryAttack(); else if (k === 'q') usePotion('hp'); else if (k === 'e') usePotion('mp'); else if (k === 't') useScroll(); else cast(+k - 1);
  });
  $('#clsList').addEventListener('click', e => { const el = e.target.closest('[data-c]'); if (el) { pickCls = el.dataset.c; showTitle(); } });
  $('#btnNew').addEventListener('click', () => {
    if (loadSave() && !confirm('创建新角色会覆盖已有存档，确定吗？')) return;
    const name = ($('#nameIn').value.trim() || '小勇者').slice(0, 8);
    startGame(newPlayer(name, pickCls));
  });
  $('#btnCont').addEventListener('click', () => { const sv = loadSave(); if (sv) startGame(sv); });
  // ---- 站点外壳：全屏、静音、后台暂停、语言 ----
  const soft = () => { FRAME.classList.add('mm-fs'); document.body.classList.add('mm-fs-on'); };
  const isFs = () => document.fullscreenElement === FRAME || document.webkitFullscreenElement === FRAME || FRAME.classList.contains('mm-fs');
  $('#btnFs').addEventListener('click', () => {
    if (!isFs()) {
      const req = FRAME.requestFullscreen || FRAME.webkitRequestFullscreen;
      if (req) { try { const pr = req.call(FRAME); if (pr && pr.catch) pr.catch(soft); } catch (e) { soft(); } } else soft();
    } else if (FRAME.classList.contains('mm-fs')) { FRAME.classList.remove('mm-fs'); document.body.classList.remove('mm-fs-on'); }
    else { const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) ex.call(document); }
    setTimeout(fit, 120);
  });
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => setTimeout(fit, 60));
  window.__mmSyncMute = KIT.mountMute($('#btnMute'));
  // 切到后台：rAF 停转等于自动暂停，这里顺手存档、松开按键并停掉音乐，回来再接着放
  KIT.onHide(() => { G.keys = {}; G.mouse.down = false; G.mouse.drag = false; if (G.state === 'play') save(); if (BGM.el) BGM.el.pause(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && BGM.on && BGM.el && BGM.el.src) BGM.el.play().catch(() => {}); });
  KIT.boot(() => { $('#btnFs').title = KIT.T('fsTitle'); });
  showTitle();
  requestAnimationFrame(loop);
}
init();
