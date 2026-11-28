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
// 効果で配置するとき、リザーブが残っている（②がリザーブで埋まって始まる）
const lampResBoard = () => ({
  me: base({ reserve: 6, hand: [LAMP], deck: [NEXUS, GRIP, GRIP, GRIP], field: { spirits: spirits(2, 0, 3), nexuses: [] } }), opp: base(),
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
// 効果による配置も、手札からと同じ支払いの画面（②置くコア）で開く
async function lampToPay(c) {
  await lampToOpen(c)
  await press(c.A, "燃えさかる戦場（ネクサス）")
  await waitSel(c.A, "#choice-options .pay-sheet")
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
  { id: "fieldReq", name: "2e 場のコアも使えば出せる手札（＋バーストのマジック）", board: () => ({ me: base({ reserve: 1, hand: [GRIP, "BS14-092"], field: { spirits: spirits(3, 0, 4), nexuses: [] } }), opp: base() }), run: async () => {} },
  { id: "short", name: "2b コアが足りない手札を押した", board: () => ({ me: base({ reserve: 1, hand: [GRIP], field: { spirits: [], nexuses: [] } }), opp: base() }), run: async (c) => clickSel(c.A, "#hand .card") },
  { id: "spirit", name: "3 場のスピリットを押した", board: standby, run: async (c) => clickSel(c.A, "#my-spirits .card") },
  // 召喚の支払いは「①コスト → ②置くコア」の2段の画面（ui/payStages.ts）。リザーブが足りないので画面が開く
  { id: "lv", name: "4 召喚の支払い①（コスト）", board: lvBoard, run: async (c) => { await play(c, GRIP, "召喚"); await waitSel(c.A, "#choice-options .pay-sheet") } },
  { id: "lvres", name: "4b リザーブで足りる召喚（②から・置く数は取った数）", board: lvResBoard, run: async (c) => { await play(c, GRIP, "召喚"); await waitSel(c.A, "#choice-options .pay-sheet"); await press(c.A, "＋") } },
  { id: "pay", name: "5 召喚の支払い②（リザーブ＋場から→次へ）", board: lvBoard, run: async (c) => { await play(c, GRIP, "召喚"); await press(c.A, "＋"); c.A.querySelector("#my-spirits .card").click(); await sleep(300); await press(c.A, "次へ") } },
  { id: "lampStep", name: "6 効果配置の支払い（②置くコア）", board: lampBoard, run: lampToPay },
  { id: "lampPay", name: "7 6 で場から2個取った（置く数が増える）", board: lampBoard, run: async (c) => { await lampToPay(c); for (let i = 0; i < 2; i++) { c.A.querySelector("#my-spirits .card").click(); await sleep(300) } } },
  { id: "lampRes", name: "7b 効果配置でリザーブが残っている（＋で置く数が増える）", board: lampResBoard, run: async (c) => { await lampToPay(c); await press(c.A, "＋", 500) } },
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
  // 相手がマジックを使ってすぐアタックステップへ進む（AI のように速い）。マジックの通知は、場面が進んだら 1.5 秒で閉じる（8秒残らない）
  {
    id: "oppMagicThenAttack", name: "9b 相手のマジックのあとすぐアタックステップへ", turn: "opp",
    board: () => ({ me: base(), opp: base({ hand: ["BS04-111", GRIP] }) }),
    run: async (c) => {
      await clickSel(c.B, '#hand .card[data-card-id="BS04-111"]')
      await press(c.B, "使用")
      for (const t of ["メイン", "この支払いで確定"]) await pressOpt(c.B, t)
      await sleep(300)
      await press(c.B, "アタックステップへ")
    },
  },
  // 【烈神速】のコアの配分（ui/coreAllocSheet.ts。#740）。相手のアタック中に手札のセイリュービを押す。
  // たたんだまま場のスピリットへ2個置く（10b）／広げて、その1個を戻しリザーブへ2個（10c）
  {
    id: "resshinsoku", name: "10b 【烈神速】のコアの配分（たたんだまま場へ）", turn: "opp", phase: "attack",
    board: () => ({ me: base({ hand: ["BS16-X03", GRIP], trashCores: 7 }), opp: base() }),
    run: async (c) => {
      await clickSel(c.B, "#my-spirits .card.clickable", 1500)
      await play(c, "BS16-X03", "召喚")
      await waitSel(c.A, "#choice-options .core-alloc")
      for (let i = 0; i < 2; i++) await clickSel(c.A, "#my-spirits .card.targetable", 400)
    },
  },
  {
    id: "resshinsokuOpen", name: "10c 【烈神速】のコアの配分（広げて直す）", turn: "opp", phase: "attack",
    board: () => ({ me: base({ hand: ["BS16-X03", GRIP], trashCores: 7 }), opp: base() }),
    run: async (c) => {
      await clickSel(c.B, "#my-spirits .card.clickable", 1500)
      await play(c, "BS16-X03", "召喚")
      await waitSel(c.A, "#choice-options .core-alloc")
      for (let i = 0; i < 2; i++) await clickSel(c.A, "#my-spirits .card.targetable", 400)
      await clickSel(c.A, "#choice-options [data-alloc-toggle]", 400)
      await clickSel(c.A, '#choice-options [data-alloc]:not([data-alloc="reserve"])[data-delta="-1"]', 300)
      for (let i = 0; i < 2; i++) await clickSel(c.A, '#choice-options [data-alloc="reserve"][data-delta="1"]', 300)
    },
  },
  // コアの下限（#743）：相手のアタックで天守閣Lv2が誘発し、オープンした殻虫を召喚する支払い。リザーブ0で、緑のスピリット（コア1）は下限で取れず光らない。赤のスピリットとネクサスだけ光る
  {
    id: "coreFloor", name: "10d コアの下限（天守閣）で取れないスピリットは光らない", turn: "opp", phase: "attack",
    board: () => ({
      me: base({ reserve: 0, deck: Array.from({ length: 10 }, () => "BS01-050"), field: { spirits: [...Array.from({ length: 3 }, () => ({ cardId: "BS01-060", cores: 1 })), { cardId: "BS01-002", cores: 2 }], nexuses: [{ cardId: "BS12-065", cores: 3 }] } }),
      opp: base(),
    }),
    run: async (c) => {
      await clickSel(c.B, "#my-spirits .card.clickable", 1500)
      for (let i = 0; i < 6 && !c.A.querySelector("#choice-options .pay-sheet"); i++) {
        const b = [...c.A.querySelectorAll("#choice-options button, #btn-skip-choice")].find((e) => vis(e) && !/しない|選ばない|使わない/.test(e.textContent || ""))
        if (!b) break
        b.click(); await sleep(700)
      }
      await waitSel(c.A, "#choice-options .pay-sheet")
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
  // 相手のスピリットを対象に選ぶ（バインディングソーンのフラッシュ効果をメインで使う）。中央の帯の効果の通知は、相手の場に重ならないよう下へ伸びる
  {
    id: "target", name: "12 相手のスピリットを対象に選ぶ（効果の通知あり）",
    board: () => ({ me: base({ hand: [BURST, GRIP] }), opp: base() }),
    run: async (c) => {
      await play(c, BURST, "使用")
      for (const t of ["フラッシュ", "この支払いで確定"]) await pressOpt(c.A, t)
      await waitSel(c.A, "#opp-spirits .card.targetable")
    },
  },
  // 召喚時効果で相手のスピリットを選ぶ（ノデッポ：バーストをセットしていれば BP3000 以下の相手のスピリット1体を破壊）。効果の通知と案内の両方が帯に出る
  {
    id: "target2", name: "12b 召喚時効果で相手のスピリットを選ぶ（効果の通知＋案内）",
    board: () => ({ me: base({ burst: BURST, hand: ["BS16-001", GRIP] }), opp: base() }),
    run: async (c) => {
      await play(c, "BS16-001", "召喚")
      await pressOpt(c.A, "召喚")
      await waitSel(c.A, "#opp-spirits .card.targetable")
    },
  },
  // スピリットがいっぱいで縦スクロールのとき、見えない段のスピリットがアタックしたら、そこまでスクロールして見せる
  {
    id: "oppAtkHidden", name: "11b 相手の見えない段のスピリットがアタック", turn: "opp", phase: "attack",
    board: () => ({ me: base(), opp: base({ field: { spirits: spirits(14), nexuses: [] } }) }),
    run: async (c) => { // B の手前（DOM の先頭）のスピリットは、A の画面では相手の欄の上の方（見えない段）にいる
      await clickSel(c.B, "#my-spirits .card.clickable", 1500)
    },
  },
  {
    id: "myAtkHidden", name: "11c 自分の見えない段のスピリットでアタック", phase: "attack",
    board: () => ({ me: base({ field: { spirits: spirits(14), nexuses: [] } }), opp: base() }),
    run: async (c) => { // 自分の欄の一番下（見えない段）のスピリットを押してアタックする
      const cards = [...c.A.querySelectorAll("#my-spirits .card.clickable")]
      cards[cards.length - 1]?.click(); await sleep(1500)
    },
  },
  { id: "menu", name: "13 メニューを開いた", board: standby, run: async (c) => { if (isMobile(c)) await clickSel(c.A, "#btn-status-menu") } },
  { id: "settings", name: "13b ⚙ 表示を開いた", board: standby, run: async (c) => { if (isMobile(c)) await clickSel(c.A, "#btn-status-menu"); await clickSel(c.A, "#btn-display-settings") } },
  {
    id: "trash", name: "14 トラッシュを開いた",
    board: () => ({ me: base({ trashCards: [GRIP, GRIP, "SD06-001", LAMP] }), opp: base({ trashCards: [GRIP] }) }),
    run: async (c) => clickSel(c.A, isMobile(c) ? "#mat-trash-self" : "#btn-toggle-trash"),
  },
  // 相手のデッキを破棄する（マジックドリル：相手の手札1枚につき1枚）。破棄したカードの欄は、選ぶ場面の前後で動かず上に出たまま
  {
    id: "mill", name: "14b 相手のデッキを破棄した（マジックドリル）",
    board: () => ({ me: base({ hand: ["BS04-111", GRIP] }), opp: base() }),
    run: async (c) => {
      await play(c, "BS04-111", "使用")
      for (const t of ["メイン", "この支払いで確定"]) await pressOpt(c.A, t)
      await sleep(1500) // 1枚ずつ並べ終わるのを待つ（欄は position: fixed で vis() に掛からない）
    },
  },
  // スクショと同じ流れ：相手のアタックでライフが減り、賢者の樹の実（ライフが減ったときコア1個）の効果のあとに絶甲氷盾のバーストが発動する。
  // 賢者の樹の実の効果の通知に、バーストの発動と効果の行が入らないこと
  {
    id: "burstAfterEffect", name: "15c 効果のあとにバースト発動（賢者の樹の実→絶甲氷盾）", turn: "opp", phase: "attack",
    board: () => ({ me: base({ burst: "SD06-016", field: { spirits: spirits(3), nexuses: [{ cardId: "BS06-081", cores: 0 }] } }), opp: base() }),
    run: async (c) => {
      await clickSel(c.B, "#my-spirits .card.clickable", 1500)
      for (let i = 0; i < 12 && !(await pressOpt(c.A, "発動する", 300)); i++) {
        if (!(await pressOpt(c.A, "ライフで受ける", 300)) && !(await pressOpt(c.A, "パス", 300))) await pressOpt(c.B, "パス", 300)
      }
      await sleep(1000)
    },
  },
  { id: "burst", name: "15 バーストをセット", board: () => ({ me: base({ burst: BURST }), opp: base({ burst: BURST }) }), run: async () => {} },
  // 相手のアタックをブロックせずライフが減り、自分の伏せた烈光閃刃（【バースト：自分のライフ減少後】）が発動する。PC は左に大きくカードが出る
  {
    id: "burstFire", name: "15b バースト発動（相手のアタックでライフ減少）", turn: "opp", phase: "attack",
    board: () => ({ me: base({ burst: "BS14-092" }), opp: base() }),
    run: async (c) => {
      await clickSel(c.B, "#my-spirits .card.clickable", 1500)
      // 途中で出るボタン（フラッシュのパス・ライフで受ける・バーストの発動）を押せるものから押していく
      for (let i = 0; i < 12 && ![...c.A.querySelectorAll(".burst-reveal-big, .event-detail.event-burst")].some(vis); i++) {
        if (!(await pressOpt(c.A, "発動", 400)) && !(await pressOpt(c.A, "ライフで受ける", 400)) && !(await pressOpt(c.A, "パス", 400))) await pressOpt(c.B, "パス", 400)
      }
      await waitSel(c.A, ".event-detail.event-burst", 3000)
    },
  },
  {
    id: "brave", name: "16 ブレイヴ合体（1体／2体）",
    board: () => ({
      me: base({ field: { spirits: [
        { cardId: FILL[0], cores: 3, braves: [BRAVE1] }, { cardId: FILL[1], cores: 3, braves: [BRAVE1, BRAVE2] }, ...spirits(3),
      ], nexuses: [] } }), opp: base(),
    }),
    run: async () => {},
  },
  {
    id: "braveRow", name: "16c 合体スピリットが並ぶ（1枚／2枚・立ち／疲労）",
    board: () => {
      const side = () => base({ field: { spirits: [
        { cardId: FILL[0], cores: 3, braves: [BRAVE1] }, { cardId: FILL[1], cores: 3, braves: [BRAVE1, BRAVE2] },
        { cardId: FILL[2], cores: 3, braves: [BRAVE2] }, { cardId: FILL[3], cores: 3, braves: [BRAVE1, BRAVE2], isRested: true },
        { cardId: FILL[0], cores: 3, braves: [BRAVE1], isRested: true }, { cardId: FILL[1], cores: 3, braves: [BRAVE2] },
      ], nexuses: [] } })
      return { me: side(), opp: side() }
    },
    run: async () => {},
  },
  // 任意の召喚をやめる（#743）：相手のアタックで天守閣Lv2 → オープンした殻虫を召喚する置くコアの待ちに「召喚しない」が出る
  {
    id: "declineSummon", name: "17 任意の召喚の支払いで「召喚しない」（天守閣）", turn: "opp", phase: "attack",
    board: () => ({
      me: base({ reserve: 5, deck: Array.from({ length: 10 }, () => "BS01-050"), field: { spirits: spirits(3), nexuses: [{ cardId: "BS12-065", cores: 3 }] } }),
      opp: base(),
    }),
    run: async (c) => {
      await clickSel(c.B, "#my-spirits .card.clickable", 1500)
      for (let i = 0; i < 6 && !c.A.querySelector("#btn-skip-choice:not(.hidden)")?.textContent?.includes("召喚しない"); i++) {
        const b = [...c.A.querySelectorAll("#choice-options button")].find((e) => vis(e) && !/しない|選ばない|使わない/.test(e.textContent || ""))
        if (!b) break
        b.click(); await sleep(700)
      }
      await find(c.A, "召喚しない")
    },
  },
  {
    id: "braveRested", name: "16b 合体して疲労（1体／2体）・疲労4体",
    board: () => {
      const side = () => base({ field: { spirits: [
        { cardId: FILL[0], cores: 3, braves: [BRAVE1], isRested: true }, { cardId: FILL[1], cores: 3, braves: [BRAVE1, BRAVE2], isRested: true },
        { cardId: FILL[2], cores: 3, braves: [BRAVE1] }, ...spirits(6, 3),
      ], nexuses: [] } })
      return { me: side(), opp: side() }
    },
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
