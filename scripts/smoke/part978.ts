// smoke パート978（収録漏れ16枚の期待値テスト。効果文だけから書く。docs/design/MISSING_CARDS_SURVEY.md）
import { assert, effectiveBp } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const V = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・Lv1 BP1000／Lv2 2コア BP3000）
const BEAR = "BS03-083" // 熊男ベアード（青・コスト3・Lv1 BP3000）
const TROLL = "BS03-078" // 暴れトロル（青・コスト2・Lv1 BP3000）
const FLY = "BS03-029" // マッハフライ（緑・コスト3・Lv1 BP2000）
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・殻虫）
const BIG = "BS02-046" // ウィンガル（白・コスト6・Lv1 BP5000／Lv3 4コア BP9000）
const TIGER = "BS03-099" // 虎拳士タイガ（青・コスト7・Lv3 7コア BP10000）
const DUNS = "BS03-081" // 人馬巨兵ダンストン（青・コスト3・Lv1 2コア BP5000／Lv2 6コア BP8000）
const BRONZE = "SD10-005" // ブロンズ・ヴルム（赤・コスト3・全Lv【強化】・BP3000）
const MINOTA = "BS19-060" // ミノタ・コルス（青・コスト3・【連鎖：条件《赤シンボル》】持ち・BP3000）
const NEXUS = "BS02-085" // トパーズの流星（黄・コスト3）
const BURST = "BS15-076" // 妖華吸血爪（紫・コスト5）
const BEO = "BSC05-014"
const BICORN = "BSC05-016"
const HONJIN = "BSC05-018"
const JUSTICE = "X13-07"
const GALAXY = "X13-08"
const BOMBER = "X13-14"

const nm: Record<string, string> = {
    [V]: "ロクケラトプス", [BEAR]: "熊男ベアード", [DUNS]: "人馬巨兵ダンストン", [FLY]: "マッハフライ", [TROLL]: "暴れトロル", [BIG]: "ウィンガル",
}

// マジックを使った分：手札から出てトラッシュへ、コストのコアがトラッシュへ（軽減なし。脇役は軽減に効く色を避けて選んでいる）
const cast = (name: string, cost: number, reserveExtra = 0) => [
    `自分.手札: ${name} → なし`,
    `自分.トラッシュ: なし → ${name}`,
    `自分.リザーブ: 10 → ${10 - cost + reserveExtra}`,
    `自分.トラッシュのコア: 0 → ${cost}`,
]
const flash = (t: ScenarioCtx, target?: string) =>
    t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", ...(target ? { targetInstanceId: t.id(target) } : {}) })
const combine = (t: ScenarioCtx, b = "b", h = "h") =>
    t.act("me", { type: "combineBrave", braveInstanceId: t.id(b), hostInstanceId: t.id(h) })
// 合体そのものの盤面変化（ブレイヴのコア1個がホストに移り、ホストは Lv2 になる）
const COMB = (b: string, h: string, bBp = 2000): string[] => [`自分.${b}.BP: ${bBp} → なし`, `自分.${b}.コア: 1 → 0`, `自分.${b}.場所: フィールド → 合体`, `自分.${h}.Lv: 1 → 2`, `自分.${h}.コア: 1 → 2`]

// 選択待ちが出ている間、先頭の選択肢で答える。card 型（手札の破棄など）は何も選ばず終わる
function answerAll(t: ScenarioCtx): void {
    for (let i = 0; i < 8 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "option") t.act(side, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        else t.act(side, { type: "resolveChoice" })
    }
}

console.log("=== BSC05-021 グリムリーパー ===")
scenario({
    name: "grim-main-hit",
    start: { me: { hand: ["BSC05-021"] }, opp: { spirits: [{ card: V, label: "t", cores: 1, rested: true }] } },
    steps(t) { t.act("me", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: t.id("t") }) },
    expect: [...cast("グリムリーパー", 3), "相手.t.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "grim-main-miss-untapped",
    start: { me: { hand: ["BSC05-021"] }, opp: { spirits: [{ card: V, label: "t", cores: 1, rested: false }] } },
    steps(t) { t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: t.id("t") }) },
    expect: [],
})
scenario({
    name: "grim-main-miss-two-cores",
    start: { me: { hand: ["BSC05-021"] }, opp: { spirits: [{ card: V, label: "t", cores: 2, rested: true }] } },
    steps(t) { t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: t.id("t") }) },
    expect: [],
})
scenario({
    name: "grim-flash-bp",
    start: { me: { hand: ["BSC05-021"], spirits: [{ card: V, label: "a" }] } },
    steps(t) { t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("a") }) },
    expect: [...cast("グリムリーパー", 3), "自分.a.BP: 1000 → 3000"],
})

console.log("=== BSC05-023 グラストラップ ===")
scenario({
    name: "glass-hit",
    start: { me: { hand: ["BSC05-023"], spirits: [{ card: V, label: "a" }] }, opp: { spirits: [{ card: V, label: "t" }] } },
    steps(t) { flash(t, "t") },
    expect: [...cast("グラストラップ", 3), "相手.t.疲労: false → true"],
})
console.log("=== BSC05-024 ラピッドウィンド ===")
scenario({
    name: "rapid-two-of-family",
    start: {
        me: { hand: ["BSC05-024"], spirits: [{ card: V, label: "a", rested: true }, { card: V, label: "b", rested: true }, { card: BEETLE, label: "c", rested: true }] },
        opp: { spirits: [{ card: V, label: "o", rested: true }] },
    },
    steps(t) { flash(t) },
    expect: [...cast("ラピッドウィンド", 3), "自分.a.疲労: true → false", "自分.b.疲労: true → false"],
})

console.log("=== BSC05-025 マジックブースト ===")
scenario({
    name: "boost-combined",
    start: { me: { hand: ["BSC05-025"], spirits: [{ card: BIG, label: "h", rested: true }, { card: BOMBER, label: "b" }] } },
    steps(t) {
        combine(t)
        flash(t, "h")
    },
    expect: [...cast("マジックブースト", 2), ...COMB("b", "h"), "自分.h.疲労: true → false", "自分.h.BP: 5000 → 10000"],
})
scenario({
    name: "boost-no-combined",
    start: { me: { hand: ["BSC05-025"], spirits: [{ card: BIG, label: "h", rested: true }] } },
    steps(t) { t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("h") }) },
    expect: [],
})

console.log("=== BSC05-026 ミラージュコート ===")
scenario({
    name: "mirage-brave-unblockable",
    start: { me: { hand: ["BSC05-026"], spirits: [{ card: BOMBER, label: "b" }] }, opp: { spirits: [{ card: V, label: "o" }] } },
    steps(t) {
        flash(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("b") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("o") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [...cast("ミラージュコート", 5), "自分.b.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "mirage-normal-spirit-blockable",
    start: { me: { hand: ["BSC05-026"], spirits: [{ card: BEAR, label: "a" }] }, opp: { spirits: [{ card: V, label: "o" }] } },
    steps(t) {
        flash(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("a") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("o") })
        t.closeFlash()
    },
    expect: [...cast("ミラージュコート", 5), "自分.a.疲労: false → true", "相手.o.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})

console.log("=== BSC05-027 エレキトリック ===")
// 未対応（card-notes BSC05-027）：効果の途中の破壊はその場でトラッシュまで済むので、コアが残っていない。「効果の解決中に誘発した破壊時効果は効果の後」の一般則の PR でこの場面を戻す（Q26091・Q26092。2026-11-16 ユーザー決定）
const DESTROY_AFTER_EFFECT = false
if (DESTROY_AFTER_EFFECT) scenario({
    name: "electric-battling",
    start: { phase: "attack", me: { hand: ["BSC05-027"], spirits: [{ card: V, label: "a", cores: 2 }] }, opp: { spirits: [{ card: BEAR, label: "o" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("a") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("o") })
        t.act("opp", { type: "pass" })
        flash(t, "a")
    },
    // コスト3で 10→7。破壊された a の2コアのうち1個はライフへ、残り1個はリザーブへ
    expect: [
        ...cast("エレキトリック", 3, 1).filter((l) => !l.startsWith("自分.トラッシュ:")),
        "自分.トラッシュ: なし → エレキトリック、ロクケラトプス",
        "自分.a.場所: フィールド → なし",
        "自分.ライフ: 5 → 6", "相手.o.疲労: false → true"],
})
scenario({
    name: "electric-not-battling",
    start: { me: { hand: ["BSC05-027"], spirits: [{ card: V, label: "a", cores: 2 }] } },
    steps(t) { t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("a") }) },
    expect: [],
})

console.log("=== BSC05-028 サンダーブランチ ===")
scenario({
    name: "thunder-attack-step",
    start: { phase: "attack", me: { hand: ["BSC05-028"], spirits: [{ card: V, label: "a" }] }, opp: { spirits: [{ card: V, label: "t1" }, { card: BEAR, label: "t2" }, { card: DUNS, label: "t3", cores: 6 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("a") })
        t.act("opp", { type: "pass" })
        flash(t)
    },
    expect: [...cast("サンダーブランチ", 4), "自分.a.疲労: false → true", "相手.t1.BP: 1000 → 2000", "相手.t2.BP: 3000 → 2000", "相手.t3.BP: 8000 → 2000"],
})
scenario({
    name: "thunder-main-step-rejected",
    start: { me: { hand: ["BSC05-028"] }, opp: { spirits: [{ card: BEAR, label: "t" }] } },
    steps(t) { t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash" }) },
    expect: [],
})


console.log("=== BSC05-014 刃狼ベオ・ウルフ ===")
const beoStart = (blocker: boolean) => ({
    phase: "main" as const,
    me: { spirits: [{ card: BIG, label: "h" }, { card: BEO, label: "b" }] },
    opp: { spirits: blocker ? [{ card: V, label: "o" }] : [] },
})
scenario({
    name: "beo-only-spirit-destroyed",
    start: beoStart(true),
    steps(t) {
        combine(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("h") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("o") })
        t.closeFlash()
    },
    // ライフのコア2個が相手のリザーブへ（ライフ 5→3）、破壊されたロクケラトプスのコア1個もリザーブへ
    expect: [...COMB("b", "h", 3000), "自分.h.BP: 5000 → 9000", "自分.h.疲労: false → true", "相手.o.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 13"],
})
scenario({
    // 合体するとブレイヴのシンボルも加わり、ライフ2点を受ける（効果の2コアではない）
    name: "beo-no-block-no-effect",
    start: beoStart(false),
    steps(t) {
        combine(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("h") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [...COMB("b", "h", 3000), "自分.h.BP: 5000 → 9000", "自分.h.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
})
scenario({
    name: "beo-host-cost-too-low",
    start: { me: { spirits: [{ card: V, label: "h" }, { card: BEO, label: "b" }] } },
    steps(t) { t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("b"), hostInstanceId: t.id("h") }) },
    expect: [],
})


// 自分のターンを終えると相手のターンが始まる（ドローとリザーブ回復）
const OPP_TURN = ["相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11", "相手.手札: なし → ロクケラトプス"]
const attackCombined = (t: ScenarioCtx) => {
    combine(t)
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("h") })
    t.closeFlash()
}

console.log("=== BSC05-016 天角獣バイコーン ===")
scenario({
    name: "bicorn-weak-blocker-treated-unblocked",
    start: { me: { spirits: [{ card: BIG, label: "h" }, { card: BICORN, label: "b" }] }, opp: { spirits: [{ card: V, label: "o" }] } },
    steps(t) {
        attackCombined(t)
        t.act("opp", { type: "block", instanceId: t.id("o") })
        t.closeFlash()
    },
    // ブロックしたロクケラトプス（BP1000）は破壊されず、ライフ2点（シンボル2つ）を受ける
    expect: [...COMB("b", "h", 3000), "自分.h.BP: 5000 → 9000", "自分.h.疲労: false → true", "相手.o.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
})
scenario({
    name: "bicorn-strong-blocker-normal-battle",
    start: { me: { spirits: [{ card: TIGER, label: "h", cores: 7 }, { card: BICORN, label: "b" }] }, opp: { spirits: [{ card: BEAR, label: "o", cores: 8 }] } },
    steps(t) {
        attackCombined(t)
        t.act("opp", { type: "block", instanceId: t.id("o") })
        t.closeFlash()
    },
    // 合体の BP13000 対 ブロッカー Lv3 BP8000（6000超）。通常のBP比較でブロッカーだけが破壊される
    expect: [...COMB("b", "h", 3000).filter((l) => !l.includes(".h.")), "自分.h.コア: 7 → 8", "自分.h.BP: 10000 → 13000", "自分.h.疲労: false → true", "相手.o.場所: フィールド → なし", "相手.トラッシュ: なし → 熊男ベアード", "相手.リザーブ: 10 → 18"],
})

console.log("=== BSC05-018 動かざる山の本陣 ===")
scenario({
    name: "honjin-brave-spirit-summoned",
    start: { me: { hand: [BOMBER], nexuses: [{ card: HONJIN, label: "n", cores: 0 }] } },
    steps(t) { t.act("me", { type: "summon", handIndex: 0 }) },
    // コスト4＋維持コア1で 10→5、ボイドから1個で 6
    expect: ["自分.手札: ボンバーハンマー → なし", "自分.ボンバーハンマー.場所: なし → フィールド", "自分.ボンバーハンマー.疲労: なし → false", "自分.ボンバーハンマー.コア: なし → 1", "自分.ボンバーハンマー.Lv: なし → 1", "自分.ボンバーハンマー.BP: なし → 2000", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4"],
})
scenario({
    name: "honjin-direct-brave-no-core",
    start: { me: { hand: [BOMBER], spirits: [{ card: BIG, label: "h" }], nexuses: [{ card: HONJIN, label: "n", cores: 0 }] } },
    steps(t) { t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("h") }) },
    expect: ["自分.手札: ボンバーハンマー → なし", "自分.ボンバーハンマー.場所: なし → 合体", "自分.ボンバーハンマー.Lv: なし → 1", "自分.ボンバーハンマー.コア: なし → 0", "自分.ボンバーハンマー.疲労: なし → false", "自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 6", "自分.h.BP: 5000 → 7000"],
})
scenario({
    name: "honjin-lv2-end-step-recovers-combined",
    start: { me: { spirits: [{ card: BIG, label: "h", rested: true }, { card: BOMBER, label: "b" }, { card: V, label: "a", rested: true }], nexuses: [{ card: HONJIN, label: "n", cores: 2 }] } },
    steps(t) {
        combine(t)
        t.act("me", { type: "endTurn" })
    },
    expect: [...COMB("b", "h"), "自分.h.BP: 5000 → 8000", "自分.h.疲労: true → false", ...OPP_TURN],
})
scenario({
    name: "honjin-lv1-end-step-no-recover",
    start: { me: { spirits: [{ card: BIG, label: "h", rested: true }, { card: BOMBER, label: "b" }], nexuses: [{ card: HONJIN, label: "n", cores: 0 }] } },
    steps(t) {
        combine(t)
        t.act("me", { type: "endTurn" })
    },
    expect: [...COMB("b", "h"), "自分.h.BP: 5000 → 8000", ...OPP_TURN],
})


// 妖華吸血爪（バースト：ライフ減少後。2枚ドロー→任意で支払ってフラッシュ）を使って「自分のバースト発動後」を起こす。
// 相手が攻撃し、自分がライフで受ける。支払い（コスト5。紫シンボルがあれば4）後の破棄は選ばない
const burstLines = (cost: number) => [
    "自分.ライフ: 5 → 4",
    "自分.バースト: 妖華吸血爪 → なし",
    "自分.トラッシュ: なし → 妖華吸血爪",
    "自分.デッキ枚数: 40 → 38",
    "自分.手札: なし → ロクケラトプス、ロクケラトプス",
    `自分.リザーブ: 10 → ${11 - cost}`,
    `自分.トラッシュのコア: 0 → ${cost}`,
]
const takeAndBurst = (t: ScenarioCtx) => {
    t.act("opp", { type: "attack", instanceId: t.id("att") })
    t.closeFlash()
    t.act("me", { type: "takeLife" })
    answerAll(t)
}

console.log("=== EX024 吸血龍ロード・ドラゴン・ドラキュラ ===")
scenario({
    name: "dracula-destroyed-in-my-attack",
    start: { me: { spirits: [{ card: "EX024", label: "d" }] }, opp: { spirits: [{ card: DUNS, label: "o", cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("d") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("o") })
        t.closeFlash()
    },
    // BP3000対5000でドラキュラが破壊される → 相手のダンストンを破壊し、ドラキュラは手札に戻る
    expect: ["自分.d.場所: フィールド → なし", "自分.手札: なし → 吸血龍ロード・ドラゴン・ドラキュラ", "自分.リザーブ: 10 → 11", "相手.o.場所: フィールド → なし", "相手.トラッシュ: なし → 人馬巨兵ダンストン", "相手.リザーブ: 10 → 12"],
})
scenario({
    name: "dracula-destroyed-in-opp-attack-no-effect",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "EX024", label: "d" }] }, opp: { spirits: [{ card: DUNS, label: "att", cores: 2 }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("att") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("d") })
        t.closeFlash()
    },
    expect: ["自分.d.場所: フィールド → なし", "自分.トラッシュ: なし → 吸血龍ロード・ドラゴン・ドラキュラ", "自分.リザーブ: 10 → 11", "相手.att.疲労: false → true"],
})
scenario({
    name: "dracula-lv2-burst-removes-2-cores",
    start: { interactive: true, turn: "opp", phase: "attack", me: { burst: BURST, spirits: [{ card: "EX024", label: "d", cores: 2 }] }, opp: { spirits: [{ card: BEAR, label: "att", cores: 3 }] } },
    steps: takeAndBurst,
    expect: [...burstLines(4), "相手.att.疲労: false → true", "相手.att.コア: 3 → 1", "相手.リザーブ: 10 → 12"],
})
scenario({
    name: "dracula-lv1-burst-nothing",
    start: { interactive: true, turn: "opp", phase: "attack", me: { burst: BURST, spirits: [{ card: "EX024", label: "d", cores: 1 }] }, opp: { spirits: [{ card: BEAR, label: "att", cores: 3 }] } },
    steps: takeAndBurst,
    expect: [...burstLines(4), "相手.att.疲労: false → true"],
})

console.log("=== EX025 人狼龍ロード・ドラゴン・ワーウルフ ===")
scenario({
    name: "werewolf-shinsoku-summon-recovers",
    start: { turn: "opp", phase: "attack", me: { hand: ["EX025"], spirits: [{ card: V, label: "a", rested: true }] }, opp: { spirits: [{ card: BEAR, label: "att" }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("att") })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    // コスト6＋維持コア1で 10→3。召喚時に自分の疲労したスピリット1体を回復
    expect: ["自分.手札: 人狼龍ロード・ドラゴン・ワーウルフ → なし", "自分.人狼龍ロード・ドラゴン・ワーウルフ.場所: なし → フィールド", "自分.人狼龍ロード・ドラゴン・ワーウルフ.疲労: なし → false", "自分.人狼龍ロード・ドラゴン・ワーウルフ.コア: なし → 1", "自分.人狼龍ロード・ドラゴン・ワーウルフ.Lv: なし → 1", "自分.人狼龍ロード・ドラゴン・ワーウルフ.BP: なし → 4000", "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6", "自分.a.疲労: true → false", "相手.att.疲労: false → true"],
})
scenario({
    name: "werewolf-lv2-burst-rests-opp",
    start: { interactive: true, turn: "opp", phase: "attack", me: { burst: BURST, spirits: [{ card: "EX025", label: "w", cores: 3 }] }, opp: { spirits: [{ card: BEAR, label: "att" }, { card: V, label: "o" }] } },
    steps: takeAndBurst,
    expect: [...burstLines(5), "相手.att.疲労: false → true", "相手.o.疲労: false → true"],
})

console.log("=== EX026 人造龍ロード・ドラゴン・フランケン ===")
const frankenBp = (side: "me" | "opp", nexus: boolean, bp: number) => ({
    start: { turn: side, me: { spirits: [{ card: "EX026", label: "f" }], nexuses: nexus ? [{ card: NEXUS, label: "n", cores: 0 }] : [] } },
    steps(t: ScenarioCtx) { assert(effectiveBp(t.state, t.me, t.inst("f")) === bp, `フランケンのBPが${bp}（自分のターン=${side === "me"}・ネクサス=${nexus}）`) },
    expect: [] as string[],
})
scenario({ name: "franken-my-turn-with-nexus", ...frankenBp("me", true, 8000) })
scenario({ name: "franken-my-turn-no-nexus", ...frankenBp("me", false, 3000) })
scenario({ name: "franken-opp-turn-with-nexus", ...frankenBp("opp", true, 3000) })
scenario({
    name: "franken-lv2-burst-per-nexus",
    start: { interactive: true, turn: "opp", phase: "attack", me: { burst: BURST, spirits: [{ card: "EX026", label: "f", cores: 2 }], nexuses: [{ card: NEXUS, label: "n", cores: 0 }] }, opp: { spirits: [{ card: BEAR, label: "att" }, { card: BIG, label: "big" }] } },
    steps: takeAndBurst,
    // ネクサス1つ → コスト5以下の相手のスピリット1体（ベアード）。コスト6のウィンガルは対象外
    expect: [...burstLines(5), "相手.att.場所: フィールド → なし", "相手.トラッシュ: なし → 熊男ベアード", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "franken-lv2-burst-no-nexus",
    start: { interactive: true, turn: "opp", phase: "attack", me: { burst: BURST, spirits: [{ card: "EX026", label: "f", cores: 2 }] }, opp: { spirits: [{ card: BEAR, label: "att" }] } },
    steps: takeAndBurst,
    expect: [...burstLines(5), "相手.att.疲労: false → true"],
})


console.log("=== X13-07 正義の聖剣ジャスティスソード ===")
// draws＝破壊した体数ぶんドローして手札に入るロクケラトプスの数、cost＝実際に払うコスト（赤シンボルがあれば6）
const justiceLines = (cost: number, draws: number, extra: string[]) => [
    `自分.手札: 正義の聖剣ジャスティスソード → ${draws ? Array(draws).fill("ロクケラトプス").join("、") : "なし"}`,
    "自分.正義の聖剣ジャスティスソード.場所: なし → フィールド",
    "自分.正義の聖剣ジャスティスソード.疲労: なし → false",
    "自分.正義の聖剣ジャスティスソード.コア: なし → 1",
    "自分.正義の聖剣ジャスティスソード.Lv: なし → 1",
    "自分.正義の聖剣ジャスティスソード.BP: なし → 5000",
    `自分.リザーブ: 10 → ${9 - cost}`,
    `自分.トラッシュのコア: 0 → ${cost}`,
    ...(draws ? [`自分.デッキ枚数: 40 → ${40 - draws}`] : []),
    ...extra,
]
scenario({
    name: "justice-summon-destroys-5000-draws-per-spirit",
    start: { me: { hand: [JUSTICE] }, opp: { spirits: [{ card: BEAR, label: "p" }, { card: FLY, label: "q" }] } },
    steps(t) { t.act("me", { type: "summon", handIndex: 0 }) },
    expect: justiceLines(7, 2, ["相手.p.場所: フィールド → なし", "相手.q.場所: フィールド → なし", "相手.トラッシュ: なし → マッハフライ、熊男ベアード", "相手.リザーブ: 10 → 12"]),
})
scenario({
    name: "justice-summon-over-5000-destroys-none",
    start: { me: { hand: [JUSTICE] }, opp: { spirits: [{ card: DUNS, label: "p", cores: 6 }] } },
    steps(t) { t.act("me", { type: "summon", handIndex: 0 }) },
    expect: justiceLines(7, 0, []),
})
scenario({
    name: "justice-summon-with-kyouka-limit-6000",
    start: { me: { hand: [JUSTICE], spirits: [{ card: BRONZE, label: "v" }] }, opp: { spirits: [{ card: BEAR, label: "p" }, { card: TROLL, label: "q" }] } },
    steps(t) { t.act("me", { type: "summon", handIndex: 0 }) },
    expect: justiceLines(6, 2, ["相手.p.場所: フィールド → なし", "相手.q.場所: フィールド → なし", "相手.トラッシュ: なし → 暴れトロル、熊男ベアード", "相手.リザーブ: 10 → 12"]),
})
scenario({
    name: "justice-attack-step-kyouka-plus1000",
    start: { me: { spirits: [{ card: JUSTICE, label: "j" }, { card: BRONZE, label: "v" }, { card: V, label: "a" }] }, opp: { spirits: [{ card: BRONZE, label: "ov" }] } },
    steps(t) { t.act("me", { type: "nextPhase" }) },
    expect: ["自分.v.BP: 3000 → 4000"],
})
scenario({
    name: "kyouka-without-justice-no-bonus",
    start: { me: { spirits: [{ card: BRONZE, label: "v" }] } },
    steps(t) { t.act("me", { type: "nextPhase" }) },
    expect: [],
})
scenario({
    name: "justice-combined-attack-step-kyouka-plus1000",
    start: { me: { spirits: [{ card: BIG, label: "h" }, { card: JUSTICE, label: "b" }, { card: BRONZE, label: "v" }] } },
    steps(t) {
        combine(t)
        t.act("me", { type: "nextPhase" })
    },
    expect: [...COMB("b", "h", 5000), "自分.h.BP: 5000 → 11000", "自分.v.BP: 3000 → 4000"],
})

console.log("=== X13-08 銀河の星剣ギャラクシーソード ===")
scenario({
    name: "galaxy-attack-step-chain-plus1000",
    start: { me: { spirits: [{ card: GALAXY, label: "g" }, { card: MINOTA, label: "m" }, { card: V, label: "a" }] } },
    steps(t) { t.act("me", { type: "nextPhase" }) },
    expect: ["自分.m.BP: 3000 → 4000"],
})
scenario({
    name: "galaxy-main-step-no-bonus",
    start: { me: { spirits: [{ card: GALAXY, label: "g" }, { card: MINOTA, label: "m" }] } },
    steps(t) { assert(effectiveBp(t.state, t.me, t.inst("m")) === 3000, "メインステップではミノタ・コルスの BP は上がらない") },
    expect: [],
})
scenario({
    name: "galaxy-combined-attack-recover-by-nexus",
    start: { interactive: true, me: { spirits: [{ card: BIG, label: "h" }, { card: GALAXY, label: "b" }], nexuses: [{ card: NEXUS, label: "n", cores: 0 }] } },
    steps(t) {
        combine(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("h") })
        console.log("PC", JSON.stringify(t.state.pendingChoice?.prompt), JSON.stringify(t.state.pendingChoice?.options))
        answerAll(t)
    },
    // 合体アタックの強襲：ネクサス1つを疲労させ、アタックで疲労した自分を回復する
    expect: [...COMB("b", "h", 5000), "自分.h.BP: 5000 → 11000", "自分.n.疲労: false → true"],
})

console.log("=== X13-14 ボンバーハンマー ===")
const bomberAttack = (t: ScenarioCtx) => {
    combine(t)
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("h") })
}
scenario({
    name: "bomber-sacrifice-draws",
    start: { interactive: true, me: { spirits: [{ card: BIG, label: "h" }, { card: BOMBER, label: "b" }, { card: V, label: "a" }] } },
    steps(t) {
        bomberAttack(t)
        t.act("me", { type: "resolveChoice", option: "発動する" })
        t.act("me", { type: "resolveChoice", instanceId: t.id("a") })
    },
    expect: [...COMB("b", "h"), "自分.h.BP: 5000 → 8000", "自分.h.疲労: false → true", "自分.a.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11", "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"],
})
scenario({
    name: "bomber-uncombined-attack-no-effect",
    start: { interactive: true, me: { spirits: [{ card: BOMBER, label: "b" }, { card: V, label: "a" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("b") })
        assert(t.state.pendingChoice === null, "合体していないボンバーハンマーのアタックでは選択待ちが出ない")
    },
    expect: ["自分.b.疲労: false → true"],
})
scenario({
    name: "bomber-host-cost-too-low",
    start: { me: { spirits: [{ card: V, label: "h" }, { card: BOMBER, label: "b" }] } },
    steps(t) { t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("b"), hostInstanceId: t.id("h") }) },
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part978）")
