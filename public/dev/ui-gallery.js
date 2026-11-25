// UI 点検ページ：場面×画面の大きさを iframe で作って並べる（ビルド不要）
const SIZES = [
  { id: "pc", name: "PC 1280×800", w: 1280, h: 800, s: 0.3 },
  { id: "phone", name: "スマホ 375×667", w: 375, h: 667, s: 0.6 },
  { id: "se", name: "SE Safari 375×553", w: 375, h: 553, s: 0.6 },
  { id: "pro", name: "Pro Max 430×932", w: 430, h: 932, s: 0.6 },
  { id: "and", name: "Android 412×830", w: 412, h: 830, s: 0.6 },
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const vis = (el) => el && el.offsetParent !== null

// ---- 盤面の部品（カード ID は data/cards を python3 で照合済み） ----
const GRIP = "BS01-030" // グリプ・ハンズ spirit cost3
const NEXUS = "BS01-098" // 燃えさかる戦場 nexus cost3
const LAMP = "BS12-083" // マジックランプ magic cost3
const BRAVE1 = "BS17-057" // ギョクジーグ brave
const BRAVE2 = "BS21-055" // ゴルニック・イーグル brave
const BURST = "BS01-134" // バインディングソーン magic
const FILL = ["SD06-001", "BS17-010", "BS17-019", "BS17-046"] // 効果なしのスピリット（オードラン他）
const spirits = (n, rested = 0, cores = 2) =>
  Array.from({ length: n }, (_, i) => ({ cardId: FILL[i % FILL.length], cores, isRested: i < rested }))
const base = (o = {}) => ({
  reserve: 5, hand: [GRIP, GRIP, "SD06-001", "BS17-010", "BS17-019"],
  field: { spirits: spirits(6), nexuses: [{ cardId: NEXUS, cores: 0 }] }, ...o,
})
const standby = () => ({ me: base({ field: { spirits: spirits(9, 2), nexuses: [{ cardId: NEXUS, cores: 0 }] } }), opp: base() })
// 召喚の Lv 選択：リザーブ少なめ、場にコア
const lvBoard = () => ({ me: base({ reserve: 1, hand: [GRIP], field: { spirits: spirits(3, 0, 4), nexuses: [] } }), opp: base() })
// リザーブだけで払えて、置く数を選べる（自動のとき②から始まる）
const lvResBoard = () => ({ me: base({ reserve: 6, hand: [GRIP], field: { spirits: spirits(3, 0, 4), nexuses: [] } }), opp: base() })
const lampBoard = () => ({
  me: base({ reserve: 3, hand: [LAMP], deck: [NEXUS, GRIP, GRIP, GRIP], field: { spirits: spirits(2, 0, 3), nexuses: [] } }), opp: base(),
})

// ---- 操作の部品 ----
const isMobile = (c) => c.w <= 768
async function find(doc, text, sel = "button", ms = 2000) {
  const t0 = Date.now()
  for (;;) {
    const el = [...doc.querySelectorAll(sel)].find((e) => vis(e) && (e.textContent || "").includes(text))
    if (el) return el
    if (Date.now() - t0 > ms) throw new Error(`「${text}」が見つからない`)
    await sleep(150)
  }
}
async function waitSel(doc, sel, ms = 4000) {
  for (let t = 0; t < ms; t += 200) { if ([...doc.querySelectorAll(sel)].some(vis)) return; await sleep(200) }
  throw new Error(`${sel} が見つからない`)
}
async function press(doc, text, wait = 650) { (await find(doc, text)).click(); await sleep(wait) }
async function pressOpt(doc, text, wait = 650) { try { await press(doc, text, wait); return true } catch { return false } }
async function clickSel(doc, sel, wait = 650) {
  const el = [...doc.querySelectorAll(sel)].find(vis)
  if (!el) throw new Error(`${sel} が見つからない`)
  el.click(); await sleep(wait)
}
// 手札のカードを選んで使う。スマホは欄のボタン（label）、PC はカードを押すだけ
async function play(c, cardId, label) {
  await clickSel(c.A, `#hand .card[data-card-id="${cardId}"]`)
  if (isMobile(c)) await press(c.A, label)
}
// マジックランプ → メイン効果 → （開いた状態）
async function lampToOpen(c) {
  await play(c, LAMP, "使用")
  await pressOpt(c.A, "この支払いで確定")
  await press(c.A, "メイン効果を使う")
}
async function lampToStepper(c) {
  await lampToOpen(c)
  await press(c.A, "燃えさかる戦場（ネクサス）")
  await press(c.A, "＋", 500); await press(c.A, "＋", 500)
}

// ---- 場面（turn: 誰の番か／phase／ me・opp の盤面／ run: 操作。A=見る側、B=相手役） ----
const SCENES = [
  { id: "idle", name: "1 待機", board: standby, run: async () => {} },
  { id: "hand", name: "2 手札を押した", board: standby, run: async (c) => clickSel(c.A, "#hand .card") },
  { id: "many", name: "2d 場にいっぱい（スピリット15・ネクサス3・バースト）", board: () => {
    const side = () => base({ burst: "BS14-092", field: { spirits: spirits(15, 3), nexuses: [{ cardId: NEXUS, cores: 1 }, { cardId: NEXUS, cores: 0 }, { cardId: NEXUS, cores: 2 }] } })
    return { me: side(), opp: side() }
  }, run: async () => {} },
  { id: "burstHand", name: "2c コストが足りないバーストのマジック（セットはできる）", board: () => ({ me: base({ reserve: 0, hand: ["BS14-092", GRIP], field: { spirits: [], nexuses: [] } }), opp: base() }), run: async () => {} }, // 烈光閃刃（バーストを持つマジック・コスト4）
  { id: "short", name: "2b コアが足りない手札を押した", board: () => ({ me: base({ reserve: 1, hand: [GRIP], field: { spirits: [], nexuses: [] } }), opp: base() }), run: async (c) => clickSel(c.A, "#hand .card") },
  { id: "spirit", name: "3 場のスピリットを押した", board: standby, run: async (c) => clickSel(c.A, "#my-spirits .card") },
  // 召喚の支払いは「①コスト → ②置くコア」の2段の画面（ui/payStages.ts）。リザーブが足りないので画面が開く
  { id: "lv", name: "4 召喚の支払い①（コスト）", board: lvBoard, run: async (c) => { await play(c, GRIP, "召喚"); await waitSel(c.A, "#choice-options .pay-sheet") } },
  { id: "lvres", name: "4b リザーブで足りる召喚（②から・置く数は取った数）", board: lvResBoard, run: async (c) => { await play(c, GRIP, "召喚"); await waitSel(c.A, "#choice-options .pay-sheet"); await press(c.A, "＋") } },
  { id: "pay", name: "5 召喚の支払い②（リザーブ＋場から→次へ）", board: lvBoard, run: async (c) => { await play(c, GRIP, "召喚"); await press(c.A, "＋"); c.A.querySelector("#my-spirits .card").click(); await sleep(300); await press(c.A, "次へ") } },
  { id: "lampStep", name: "6 効果配置の置くコア数", board: lampBoard, run: lampToStepper },
  { id: "lampPay", name: "7 6 の「決定」後の支払い", board: lampBoard, run: async (c) => { await lampToStepper(c); await press(c.A, "決定") } },
  { id: "lampOpen", name: "8 自分のカードをオープン中", board: lampBoard, run: lampToOpen },
  {
    id: "oppOpen", name: "9 相手のカードをオープン中", turn: "opp",
    board: () => ({ me: base(), opp: base({ reserve: 3, hand: [LAMP], deck: [NEXUS, GRIP, GRIP, GRIP], field: { spirits: spirits(2, 0, 3), nexuses: [] } }) }),
    run: async (c) => { // B が打つ。B はスマホ幅なので手札を押して欄のボタン
      await clickSel(c.B, `#hand .card[data-card-id="${LAMP}"]`)
      await press(c.B, "使用"); await pressOpt(c.B, "この支払いで確定")
      await press(c.B, "メイン効果を使う"); await press(c.B, "燃えさかる戦場（ネクサス）")
      await pressOpt(c.B, "決定"); await pressOpt(c.B, "この支払いで確定"); await sleep(800)
    },
  },
  {
    id: "notice", name: "10 効果の通知（召喚直後）",
    board: () => ({ me: base({ reserve: 6, hand: [GRIP] }), opp: base() }),
    run: async (c) => {
      await play(c, GRIP, "召喚")
      await pressOpt(c.A, "コア", 400) // 「コアN個で召喚（Lv…）」が出たとき
      await pressOpt(c.A, "この支払いで確定", 300)
    },
  },
  {
    id: "oppAtk", name: "11 相手のアタック", turn: "opp", phase: "attack",
    board: () => ({ me: base(), opp: base() }),
    run: async (c) => { // アタックステップでは、アタックできるスピリットは .clickable で、押すとそのままアタックする（ボタンは出ない）
      await clickSel(c.B, "#my-spirits .card.clickable", 1500)
      await find(c.A, "パス")
    },
  },
  // 12 対象選択：メインで使える相手スピリット対象のマジックがデータに見つからず省略（報告参照）
  { id: "menu", name: "13 メニューを開いた", board: standby, run: async (c) => { if (isMobile(c)) await clickSel(c.A, "#btn-status-menu") } },
  { id: "settings", name: "13b ⚙ 表示を開いた", board: standby, run: async (c) => { if (isMobile(c)) await clickSel(c.A, "#btn-status-menu"); await clickSel(c.A, "#btn-display-settings") } },
  {
    id: "trash", name: "14 トラッシュを開いた",
    board: () => ({ me: base({ trashCards: [GRIP, GRIP, "SD06-001", LAMP] }), opp: base({ trashCards: [GRIP] }) }),
    run: async (c) => clickSel(c.A, isMobile(c) ? "#mat-trash-self" : "#btn-toggle-trash"),
  },
  { id: "burst", name: "15 バーストをセット", board: () => ({ me: base({ burst: BURST }), opp: base({ burst: BURST }) }), run: async () => {} },
  {
    id: "brave", name: "16 ブレイヴ合体（1体／2体）",
    board: () => ({
      me: base({ field: { spirits: [
        { cardId: FILL[0], cores: 3, braves: [BRAVE1] }, { cardId: FILL[1], cores: 3, braves: [BRAVE1, BRAVE2] }, ...spirits(3),
      ], nexuses: [] } }), opp: base(),
    }),
    run: async () => {},
  },
]

// ---- 1 場面×大きさを作る ----
const post = (roomId, board) =>
  fetch("/api/debug/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, board }) }).then((r) => r.json())

function mkFrame(w, h, left) {
  const f = document.createElement("iframe")
  f.width = w; f.height = h; f.src = `/?r=${Math.random().toString(36).slice(2)}`
  if (left !== undefined) f.style.cssText = `position:fixed;left:${left}px;top:0;`
  return f
}
async function join(frame, room) {
  const d = frame.contentDocument
  d.querySelector("#room-input").value = room
  d.querySelector("#join-btn").click()
}

// 崩れの自動点検。画面のはみ出し・ボタンの重なり・画面外のボタン・文字のはみ出し、スマホでは小さいボタンと上の方の操作ボタン（片手で届かない）を拾う
function audit(f) {
  const d = f.contentDocument, w = f.contentWindow
  if (!d || !d.getElementById("game")) return ["未読込"]
  const H = w.innerHeight, W = w.innerWidth, mob = W <= 768, out = []
  const de = d.documentElement
  if (de.scrollHeight > H + 1) out.push(`縦はみ出し ${de.scrollHeight - H}px`)
  if (de.scrollWidth > W + 1) out.push(`横はみ出し ${de.scrollWidth - W}px`)
  const rs = [...d.querySelectorAll("#game button, #card-dock button")]
    .filter((b) => b.offsetParent && getComputedStyle(b).visibility !== "hidden")
    .map((b) => ({ b, r: b.getBoundingClientRect(), t: b.textContent.trim().slice(0, 14) }))
    .filter((x) => x.r.width > 0)
  for (const x of rs) {
    if (x.r.bottom > H + 1 || x.r.right > W + 1 || x.r.top < -1) out.push(`画面外: ${x.t}`)
    if (x.b.scrollWidth > x.b.clientWidth + 2 && getComputedStyle(x.b).textOverflow !== "ellipsis") out.push(`文字はみ出し: ${x.t}`)
    if (mob && x.b.closest("#action-buttons, #card-dock-buttons, #choice-options")) {
      if (x.r.height < 36) out.push(`小さいボタン(${Math.round(x.r.height)}px): ${x.t}`)
      if (x.r.top < H * 0.35) out.push(`上の方のボタン(y${Math.round(x.r.top)}): ${x.t}`)
    }
  }
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    // 開いた欄（メニュー・選択肢・手元の欄・トラッシュ）が下のボタンに重なるのは作りどおりなので数えない
    const layer = (b) => b.closest("#status-menu, #card-dock, #trash-panel, #tegamoto-panel, #action-buttons-container:has(#choice-options:not(.hidden))")
    if (layer(rs[i].b) !== layer(rs[j].b)) continue
    if (overlap(rs[i].r, rs[j].r) && !rs[i].b.contains(rs[j].b) && !rs[j].b.contains(rs[i].b)) out.push(`重なり: ${rs[i].t} × ${rs[j].t}`)
  }
  // 盤面の区画どうしの重なり：区画（情報の行・バースト・ネクサス・スピリット・マット・中央の帯・手札）の中の末端の部品が、
  // 別の区画の部品と見えている所で重なっていたら出す（ネクサスのシンボルが名前の行にかかっていた。2026-11-25）。
  // はみ出しが親の overflow で切られて見えていない部品は数えない
  // 中央の帯は、入りきらない案内を場の上に重ねる作り（2026-11-24 決定）なので区画に入れない
  const BLOCKS = ["#opp-info", "#opp-burst", "#opp-nexuses", "#opp-spirits", "#my-info", "#my-burst", "#my-nexuses", "#my-spirits", "#hand",
    ...["life", "reserve", "deck", "trash", "tegamoto"].flatMap((k) => [`#mat-${k}-opp`, `#mat-${k}-self`])]
  const clipped = (el, x, y) => {
    for (let a = el.parentElement; a && a !== d.body; a = a.parentElement) {
      const cs = w.getComputedStyle(a)
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const r = a.getBoundingClientRect()
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) return true
      }
    }
    return false
  }
  const leaves = []
  for (const sel of BLOCKS) {
    const blk = d.querySelector(sel)
    if (!blk || !blk.offsetParent) continue
    for (const el of blk.querySelectorAll("*")) {
      if (el.children.length > 0 || w.getComputedStyle(el).visibility === "hidden") continue
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      if (!el.textContent.trim() && el.tagName !== "IMG" && !String(el.className).includes("icon")) continue
      leaves.push({ el, r, blk: sel })
    }
  }
  // 見切れ：部品の一部が、はみ出しを切る（overflow: hidden／clip）親の端で切られている。ネクサスのシンボルが欄の下端で欠けていた
  for (const l of leaves) {
    if (l.el.tagName === "IMG") continue // カードの絵は枠で切り抜いて見せる作り（合体ブレイヴの絵など）
    for (let a = l.el.parentElement; a && a !== d.body; a = a.parentElement) {
      const cs = w.getComputedStyle(a), r = a.getBoundingClientRect()
      const cutY = /hidden|clip/.test(cs.overflowY) && (l.r.top < r.top - 2 || l.r.bottom > r.bottom + 2) && l.r.bottom > r.top && l.r.top < r.bottom
      const cutX = /hidden|clip/.test(cs.overflowX) && (l.r.left < r.left - 2 || l.r.right > r.right + 2) && l.r.right > r.left && l.r.left < r.right
      if (cutY || cutX) { out.push(`見切れ: ${l.blk}の${(l.el.textContent.trim() || l.el.className || l.el.tagName).toString().slice(0, 12)}`); break }
    }
  }
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j]
    if (a.blk === b.blk || !overlap(a.r, b.r)) continue
    const x = (Math.max(a.r.left, b.r.left) + Math.min(a.r.right, b.r.right)) / 2, y = (Math.max(a.r.top, b.r.top) + Math.min(a.r.bottom, b.r.bottom)) / 2
    if (clipped(a.el, x, y) || clipped(b.el, x, y)) continue
    const name = (l) => `${l.blk}の${(l.el.textContent.trim() || l.el.className || l.el.tagName).toString().slice(0, 10)}`
    out.push(`区画の重なり: ${name(a)} × ${name(b)}`)
  }
  const sv = d.querySelector(".stepper-value")
  if (sv) for (const x of rs) if (overlap(x.r, sv.getBoundingClientRect())) out.push(`数とボタンが重なる: ${x.t}`)
  return [...new Set(out)]
}
const issues = []
function renderIssues() {
  const el = document.getElementById("issues")
  if (el) el.textContent = issues.length === 0 ? "崩れ：まだ見つかっていない" : "崩れ：\n" + issues.join("\n")
}

// 1枚ごとの上限。部屋に入れないまま止まると、後ろの場面が全部作られなかった
const CELL_LIMIT_MS = 90000
async function build(scene, size, cell, head) {
  let timer
  await Promise.race([
    buildInner(scene, size, cell, head),
    new Promise((r) => { timer = setTimeout(() => { head.textContent = `${scene.name} / ${size.name}：止まった：${CELL_LIMIT_MS / 1000}秒で終わらない`; head.className = "hd ng"; r() }, CELL_LIMIT_MS) }),
  ])
  clearTimeout(timer)
}
async function buildInner(scene, size, cell, head) {
  const log = (s, ok) => { head.textContent = `${scene.name} / ${size.name}：${s}`; head.className = "hd " + (ok === undefined ? "" : ok ? "ok" : "ng") }
  let B
  try {
    log("準備中")
    localStorage.removeItem("bs_player_ref")
    const A = mkFrame(size.w, size.h)
    A.style.transform = `scale(${size.s})`
    cell.appendChild(A)
    await sleep(2500)
    const room = "g" + Math.random().toString(36).slice(2, 8)
    await join(A, room); await sleep(1500)
    localStorage.removeItem("bs_player_ref")
    B = mkFrame(375, 667, -3000)
    document.body.appendChild(B)
    await sleep(2500)
    await join(B, room); await sleep(3000)
    // 2人そろって対戦が始まるまで待つ（重いときは ROOM が入るのが遅れ、盤面の差し替えが「roomId を指定してください」で落ちた）
    for (let t = 0; t < 15000 && !A.contentWindow.ROOM; t += 300) await sleep(300)
    const roomId = A.contentWindow.ROOM
    if (!roomId) throw new Error("対戦が始まらない（ROOM が入らない）")
    const { me, opp } = scene.board()
    const mk = (a, p) => ({ turn: 3, turnPlayer: a === "me" ? p.me : p.opp, phase: scene.phase || "main", players: { [p.me]: me, [p.opp]: opp } })
    // A が p1 か p2 かを調べる
    let r = await post(roomId, { turnPlayer: "p1", phase: "main" })
    if (!r.ok) throw new Error("setup 失敗 " + JSON.stringify(r))
    await sleep(800)
    const mineIsP1 = A.contentDocument.querySelector("#turn-info").textContent.includes("あなた")
    const p = mineIsP1 ? { me: "p1", opp: "p2" } : { me: "p2", opp: "p1" }
    r = await post(roomId, mk(scene.turn || "me", p))
    if (!r.ok) throw new Error("盤面の差し替え失敗 " + JSON.stringify(r))
    await sleep(1200)
    const c = { A: A.contentDocument, B: B.contentDocument, w: size.w, h: size.h }
    await scene.run(c)
    const found = audit(A)
    if (found.length > 0) { issues.push(`${scene.name} / ${size.name}：${found.join("、")}`); renderIssues() }
    log(found.length > 0 ? "最後まで進んだ／崩れ：" + found.join("、") : "最後まで進んだ", found.length === 0)
  } catch (e) {
    log("止まった：" + e.message, false)
  } finally {
    if (B) B.remove()
  }
}

// ---- 画面 ----
const grid = document.getElementById("grid")
const cells = {}
const head = grid.insertRow()
head.appendChild(document.createElement("th"))
for (const z of SIZES) { const th = document.createElement("th"); th.textContent = z.name; head.appendChild(th) }
for (const sc of SCENES) {
  const tr = grid.insertRow()
  tr.insertCell().textContent = sc.name
  for (const z of SIZES) {
    const td = tr.insertCell()
    const hd = document.createElement("div"); hd.className = "hd"; hd.style.width = z.w * z.s + "px"
    const cell = document.createElement("div"); cell.className = "cell"; cell.style.cssText = `width:${z.w * z.s}px;height:${z.h * z.s}px`
    td.append(hd, cell); cells[sc.id + z.id] = { cell, hd }
  }
}
const box = (id, items) => {
  const el = document.getElementById(id)
  for (const it of items) el.insertAdjacentHTML("beforeend", `<label><input type="checkbox" checked value="${it.id}">${it.name}</label>`)
  return () => [...el.querySelectorAll("input:checked")].map((i) => i.value)
}
const pickScenes = box("scenes", SCENES), pickSizes = box("sizes", SIZES)
document.getElementById("run").onclick = async (ev) => {
  ev.target.disabled = true
  const ss = SCENES.filter((s) => pickScenes().includes(s.id)), zz = SIZES.filter((z) => pickSizes().includes(z.id))
  let n = 0
  for (const sc of ss) for (const z of zz) {
    const { cell, hd } = cells[sc.id + z.id]
    cell.replaceChildren()
    document.getElementById("prog").textContent = `${++n}/${ss.length * zz.length}：${sc.name} / ${z.name}`
    await build(sc, z, cell, hd) // 並列にしない（サーバー負荷）
  }
  document.getElementById("prog").textContent = `完了（${n} 件）`
  ev.target.disabled = false
}
