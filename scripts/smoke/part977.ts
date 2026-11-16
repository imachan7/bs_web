// smoke パート977（スターターの収録漏れ16枚。期待値役が効果文だけから書いた場面テスト）
// BS01-078/080/085/095/103/110/145、BSC05-002/003/004/005/006/008/010/012/013
import { assert, effectiveBp, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const MARNI = "BS01-078" // 姫械マーニ（白・コスト2）
const FENRIR = "BS01-080" // フェンリルキャノン（白・コスト3。Lv1＝BP3000／Lv2＝コア3でBP5000）
const ELEPHANT = "BS01-085" // エレファンタイト（白・コスト4。Lv1＝BP4000／Lv2＝コア4でBP7000）
const BEAR = "BS01-095" // 鎧装獣ベア・ゲルミル（白・コスト8。Lv1＝BP7000／Lv2＝コア2でBP9000）
const SWAMP = "BS01-103" // 命を吸う沼（紫ネクサス・コスト5。Lv2＝コア3）
const ICEFIELD = "BS01-110" // 時止まりの氷原（白ネクサス・コスト3。Lv2＝コア2）
const DEFAURA = "BS01-145" // ディフェンシブオーラ（白マジック・コスト4・フラッシュ）
const NAGA = "BSC05-002" // 魔術師ドラゴナーガ（紫・コスト4。Lv3＝コア5でBP6000）
const MALVA = "BSC05-003" // 冥獅士マルバレオン（紫・コスト5。Lv2＝コア3／Lv3＝コア4でBP8000）
const SECCO = "BSC05-004" // 森林のセッコーキジ（緑・赤としても扱う）
const MONKEY = "BSC05-005" // 火縄ザル（緑・コスト4。Lv2＝コア3でBP5000）
const SHINGEN = "BSC05-006" // 武神獣タイガード・シンゲン（緑・コスト5。Lv2＝コア3でBP8000）
const GRIP = "BSC05-008" // 移動砲獣グリプドン（白・コスト4。Lv2＝コア2／Lv3＝コア4）
const EEZNA = "BSC05-010" // イーズナ（黄・赤としても扱う）
const RIJUL = "BSC05-012" // 雷の獣ライジュール（黄・コスト5。Lv3＝コア4でBP7000）
const CROW = "BSC05-013" // 黒翼竜バーン・クロウ（紫ブレイヴ・コスト5。合体条件コスト5以上・BP2000）
const RED = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1BP1000／Lv2＝コア2でBP3000／Lv3＝コア3でBP4000）
const IBARN = "BS01-005" // アイバーン（赤・コスト2・Lv1BP2000／Lv2＝コア4でBP6000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・Lv1BP3000）
const GREEN = "BS01-051" // フライングミラージュ（緑・コスト1・Lv1BP2000）
const WHITE = "BS01-074" // バーサーカー・ガン（白・コスト1・Lv1BP1000）
const DINO = "BS02-003" // ディノハウンド（赤・コスト2・Lv1＝コア2でBP4000／Lv2＝コア4）
const MELT = "BS03-009" // 火吹きメルト（赤・コスト5・Lv1BP4000／Lv3＝コア5でBP8000）
const SPIDER = "BS03-013" // ヘルスコルピオ（紫・コスト1・Lv1BP1000）
const TEN = "BS07-054" // 神凰兵フェニックス・ゴレム（青・コスト10・Lv1BP7000。Lv1に常時効果なし）
const POISON = "BS01-129" // ポイズンシュート（紫マジック・コスト5・フラッシュ：スピリット1体の上のコア1個を持ち主のリザーブへ）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[MARNI, "姫械マーニ"], [FENRIR, "フェンリルキャノン"], [ELEPHANT, "エレファンタイト"], [BEAR, "鎧装獣ベア・ゲルミル"],
        [SWAMP, "命を吸う沼"], [ICEFIELD, "時止まりの氷原"], [DEFAURA, "ディフェンシブオーラ"], [NAGA, "魔術師ドラゴナーガ"], [MALVA, "冥獅士マルバレオン"],
        [SECCO, "森林のセッコーキジ"], [MONKEY, "火縄ザル"], [SHINGEN, "武神獣タイガード・シンゲン"], [GRIP, "移動砲獣グリプドン"], [EEZNA, "イーズナ"],
        [RIJUL, "雷の獣ライジュール"], [CROW, "黒翼竜バーン・クロウ"], [RED, "ロクケラトプス"], [IBARN, "アイバーン"], [METAL, "メタルバーン"],
        [GREEN, "フライングミラージュ"], [WHITE, "バーサーカー・ガン"], [DINO, "ディノハウンド"], [MELT, "火吹きメルト"], [SPIDER, "ヘルスコルピオ"],
        [TEN, "神凰兵フェニックス・ゴレム"], [POISON, "ポイズンシュート"]]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id}は${name}`)
    assert(getCard(TEN).cost === 10 && getCard(METAL).cost === 3 && getCard(IBARN).cost === 2 && getCard(RED).cost === 1, "コストの確認")
}

// ── 共通の操作 ──
const other = (side: Side): Side => (side === "me" ? "opp" : "me")
// 開始盤面の一部とみなすコア（トラッシュのコア）。開始時の値との差だけが写像に出る
const setTrashCores = (t: ScenarioCtx, side: Side, n: number) => {
    t.state.players[side === "me" ? t.me : t.opp].trashCores = n
}
const bpOf = (t: ScenarioCtx, side: Side, label: string) => effectiveBp(t.state, side === "me" ? t.me : t.opp, t.inst(label))
const toAttack = (t: ScenarioCtx, side: Side) => t.act(side, { type: "nextPhase" })
const declare = (t: ScenarioCtx, side: Side, label: string, target?: string) =>
    t.act(side, { type: "attack", instanceId: t.id(label), ...(target ? { targetSpiritInstanceId: t.id(target) } : {}) })
// ブロックもライフ受けも選ばずにフラッシュを閉じ、ライフで受ける
const unblocked = (t: ScenarioCtx, attacker: Side) => {
    t.closeFlash()
    t.act(other(attacker), { type: "takeLife" })
    t.closeFlash()
}
const attackUnblocked = (t: ScenarioCtx, side: Side, label: string) => {
    toAttack(t, side)
    declare(t, side, label)
    unblocked(t, side)
}
// アタック → ブロック。buffed があればバトル中のそのスピリットの BP を assert
const attackAndBlock = (t: ScenarioCtx, attacker: Side, atk: string, blk: string, buffed?: [string, number]) => {
    const defender = other(attacker)
    toAttack(t, attacker)
    declare(t, attacker, atk)
    t.closeFlash()
    t.act(defender, { type: "block", instanceId: t.id(blk) })
    if (buffed) assert(bpOf(t, buffed[0].startsWith("自分") ? "me" : "opp", buffed[0].replace(/^(自分|相手)\./, "")) === buffed[1], `バトル中の${buffed[0]}のBPは${buffed[1]}`)
    t.closeFlash()
}
// side がフラッシュで動けるよう、優先権が相手にあれば相手にパスさせる
const giveFlash = (t: ScenarioCtx, side: Side) => {
    if (t.state.priorityPlayer !== (side === "me" ? t.me : t.opp)) t.act(other(side), { type: "pass" })
}
const confirm = (t: ScenarioCtx, side: Side, yes: boolean) => {
    const pc = t.state.pendingChoice
    if (!pc || pc.kind !== "option" || !pc.options) return
    const hit = pc.options.find((o) => (yes ? /はい|する|払|発動/ : /いいえ|しない|しません/).test(o) && (yes ? !/しない|しません/.test(o) : true))
    t.act(side, { type: "resolveChoice", option: hit ?? pc.options[0] ?? "" })
}
const answer = (t: ScenarioCtx, side: Side, label: string) => t.act(side, { type: "resolveChoice", instanceId: t.id(label) })
// 自分がエンドしたあと、相手のターン開始で起きる変化（ドロー1枚・コアステップ）。逆向きは myStart
const oppStart = (reserve = 10) => [`相手.リザーブ: ${reserve} → ${reserve + 1}`, "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス"]
const myStart = (reserve = 10) => [`自分.リザーブ: ${reserve} → ${reserve + 1}`, "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"]
// 召喚で場に出たスピリットの写像（疲労なし）
const appear = (prefix: string, cores: number, lv: number, bp: number) => [`${prefix}.場所: なし → フィールド`, `${prefix}.疲労: なし → false`,
    `${prefix}.コア: なし → ${cores}`, `${prefix}.Lv: なし → ${lv}`, `${prefix}.BP: なし → ${bp}`]
// 破壊されて場から離れた側（コア n 個がリザーブへ、カードがトラッシュへ）
const lifeHit = ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]

// ============================================================
console.log("=== BS01-078 姫械マーニ ===")
// Lv1･2･3『アタック時』：自分のトラッシュのコア1個を自分のリザーブへ
scenario({
    name: "marni-アタックするとトラッシュのコア1個がリザーブへ",
    start: { me: { spirits: [{ card: MARNI, label: "マーニ" }] } },
    steps(t) {
        setTrashCores(t, "me", 2)
        attackUnblocked(t, "me", "マーニ")
    },
    expect: ["自分.マーニ.疲労: false → true", "自分.リザーブ: 10 → 11", "自分.トラッシュのコア: 0 → 1", ...lifeHit],
})
scenario({
    name: "marni-トラッシュにコアが無ければ何も動かない",
    start: { me: { spirits: [{ card: MARNI, label: "マーニ" }] } },
    steps: (t) => attackUnblocked(t, "me", "マーニ"),
    expect: ["自分.マーニ.疲労: false → true", ...lifeHit],
})
scenario({
    name: "marni-ソウルコアがリザーブにあってもトラッシュのコアだけが動く",
    start: { me: { reserve: 4, soulCore: "リザーブ", spirits: [{ card: MARNI, label: "マーニ" }] } },
    steps(t) {
        setTrashCores(t, "me", 1)
        attackUnblocked(t, "me", "マーニ")
    },
    expect: ["自分.マーニ.疲労: false → true", "自分.リザーブ: 4 → 5", ...lifeHit],
})
scenario({
    name: "marni-相手のマーニがアタックしても自分のトラッシュは動かない",
    start: { turn: "opp", opp: { spirits: [{ card: MARNI, label: "マーニ" }] } },
    steps(t) {
        setTrashCores(t, "me", 2)
        attackUnblocked(t, "opp", "マーニ")
    },
    expect: ["相手.マーニ.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "自分.トラッシュのコア: 0 → 2"],
})

// ============================================================
console.log("=== BS01-080 フェンリルキャノン ===")
// Lv1･2『ブロック時』：このスピリットを BP+1000
scenario({
    name: "fenrir-Lv1ブロックでBP4000になり、BP4000の相手と相打ち",
    start: { turn: "opp", me: { spirits: [{ card: FENRIR, label: "砲" }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => attackAndBlock(t, "opp", "赤", "砲", ["自分.砲", 4000]),
    expect: ["自分.砲.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → フェンリルキャノン",
        "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 13", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "fenrir-Lv2ブロックでBP6000になり、BP4000の相手に勝つ",
    start: { turn: "opp", me: { spirits: [{ card: FENRIR, label: "砲", cores: 3 }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => attackAndBlock(t, "opp", "赤", "砲", ["自分.砲", 6000]),
    expect: ["自分.砲.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 13", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "fenrir-自分がアタックしてブロックされてもBP+1000は付かない",
    start: { me: { spirits: [{ card: FENRIR, label: "砲" }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => attackAndBlock(t, "me", "砲", "赤", ["自分.砲", 3000]),
    expect: ["自分.砲.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → フェンリルキャノン", "相手.赤.疲労: false → true"],
})

// ============================================================
console.log("=== BS01-085 エレファンタイト ===")
// Lv1･2『ブロック時』：このスピリットを BP+2000
scenario({
    name: "elephant-Lv1ブロックでBP6000になり、BP6000の相手と相打ち",
    start: { turn: "opp", me: { spirits: [{ card: ELEPHANT, label: "象" }] }, opp: { spirits: [{ card: IBARN, label: "ア", cores: 4 }] } },
    steps: (t) => attackAndBlock(t, "opp", "ア", "象", ["自分.象", 6000]),
    expect: ["自分.象.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → エレファンタイト",
        "相手.ア.場所: フィールド → なし", "相手.リザーブ: 10 → 14", "相手.トラッシュ: なし → アイバーン"],
})
scenario({
    name: "elephant-Lv2ブロックでBP9000になり、BP6000の相手に勝つ",
    start: { turn: "opp", me: { spirits: [{ card: ELEPHANT, label: "象", cores: 4 }] }, opp: { spirits: [{ card: IBARN, label: "ア", cores: 4 }] } },
    steps: (t) => attackAndBlock(t, "opp", "ア", "象", ["自分.象", 9000]),
    expect: ["自分.象.疲労: false → true", "相手.ア.場所: フィールド → なし", "相手.リザーブ: 10 → 14", "相手.トラッシュ: なし → アイバーン"],
})
scenario({
    name: "elephant-アタックしてブロックされてもBP+2000は付かない",
    start: { me: { spirits: [{ card: ELEPHANT, label: "象" }] }, opp: { spirits: [{ card: IBARN, label: "ア", cores: 4 }] } },
    steps: (t) => attackAndBlock(t, "me", "象", "ア", ["自分.象", 4000]),
    expect: ["自分.象.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → エレファンタイト", "相手.ア.疲労: false → true"],
})

// ============================================================
console.log("=== BS01-095 鎧装獣ベア・ゲルミル ===")
// 節1（Lv1･Lv2）：相手のフィールドに赤のスピリットがいない間、アタックできない（ブロックはできる。Q1690）
// 節2（Lv2）：自分の緑のスピリットすべて BP+1000（常時。Q1691）
scenario({
    name: "bear-相手に赤がいなければアタックできない",
    start: { me: { spirits: [{ card: BEAR, label: "ベア" }] }, opp: { spirits: [{ card: GREEN, label: "緑" }] } },
    steps(t) {
        toAttack(t, "me")
        t.actRejected("me", { type: "attack", instanceId: t.id("ベア") })
    },
    expect: [],
})
scenario({
    name: "bear-相手に赤がいればアタックできる（ブロックされなければライフを削る）",
    start: { me: { spirits: [{ card: BEAR, label: "ベア" }] }, opp: { spirits: [{ card: RED, label: "赤", rested: true }] } },
    steps: (t) => attackUnblocked(t, "me", "ベア"),
    expect: ["自分.ベア.疲労: false → true", ...lifeHit],
})
scenario({
    name: "bear-赤を持つのが自分のスピリットだけではアタックできない",
    start: { me: { spirits: [{ card: BEAR, label: "ベア" }, { card: RED, label: "赤" }] }, opp: { spirits: [{ card: GREEN, label: "緑" }] } },
    steps(t) {
        toAttack(t, "me")
        t.actRejected("me", { type: "attack", instanceId: t.id("ベア") })
    },
    expect: [],
})
scenario({
    name: "bear-Lv2でも相手に赤がいなければアタックできない",
    start: { me: { spirits: [{ card: BEAR, label: "ベア", cores: 2 }] }, opp: { spirits: [{ card: GREEN, label: "緑" }] } },
    steps(t) {
        toAttack(t, "me")
        t.actRejected("me", { type: "attack", instanceId: t.id("ベア") })
    },
    expect: [],
})
scenario({
    name: "bear-相手に赤がいなくても相手のアタックをブロックできる",
    start: { turn: "opp", me: { spirits: [{ card: BEAR, label: "ベア" }] }, opp: { spirits: [{ card: GREEN, label: "緑" }] } },
    steps: (t) => attackAndBlock(t, "opp", "緑", "ベア"),
    expect: ["自分.ベア.疲労: false → true", "相手.緑.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → フライングミラージュ"],
})
scenario({
    name: "bear-色を赤としても扱うセッコーキジが相手にいれば赤のスピリットがいるのでアタックできる",
    start: { me: { spirits: [{ card: BEAR, label: "ベア" }] }, opp: { spirits: [{ card: SECCO, label: "キジ", rested: true }] } },
    steps: (t) => attackUnblocked(t, "me", "ベア"),
    expect: ["自分.ベア.疲労: false → true", ...lifeHit],
})
scenario({
    name: "bear-イーズナ（赤としても扱う）が相手にいてもアタックできる",
    start: { me: { spirits: [{ card: BEAR, label: "ベア" }] }, opp: { spirits: [{ card: EEZNA, label: "イーズナ", rested: true }] } },
    steps: (t) => attackUnblocked(t, "me", "ベア"),
    expect: ["自分.ベア.疲労: false → true", ...lifeHit],
})
scenario({
    name: "bear-Lv2は自分の緑のスピリットすべてBP+1000（赤・相手の緑・Lv1には効かない）",
    start: { me: { spirits: [{ card: BEAR, label: "ベア", cores: 2 }, { card: GREEN, label: "緑" }, { card: RED, label: "赤" }] }, opp: { spirits: [{ card: GREEN, label: "敵緑" }] } },
    steps(t) {
        assert(bpOf(t, "me", "緑") === 3000, "自分の緑は2000+1000")
        assert(bpOf(t, "me", "赤") === 1000, "自分の赤はそのまま")
        assert(bpOf(t, "opp", "敵緑") === 2000, "相手の緑はそのまま")
        assert(bpOf(t, "me", "ベア") === 9000, "ベア自身はそのまま")
    },
    expect: [],
})
scenario({
    name: "bear-Lv1では緑のBPは上がらない",
    start: { me: { spirits: [{ card: BEAR, label: "ベア" }, { card: GREEN, label: "緑" }] } },
    steps: (t) => assert(bpOf(t, "me", "緑") === 2000, "Lv1のベアは緑にBPを足さない"),
    expect: [],
})
scenario({
    name: "bear-Lv2の緑BP+1000はアタックしていないときも常時効いている（相手に赤がいなくても）",
    start: { me: { spirits: [{ card: BEAR, label: "ベア", cores: 2 }, { card: GREEN, label: "緑" }] }, opp: {} },
    steps(t) {
        assert(bpOf(t, "me", "緑") === 3000, "相手に赤がいなくても緑は3000")
        toAttack(t, "me")
        assert(bpOf(t, "me", "緑") === 3000, "アタックステップでも3000")
    },
    expect: [],
})

// ============================================================
console.log("=== BS01-103 命を吸う沼 ===")
// Lv1･2『自分のスタートステップ』：相手のリザーブのコアすべてをトラッシュへ。Lv2：相手のスピリット1体を疲労させる
const swampTurn = (t: ScenarioCtx) => {
    t.act("opp", { type: "endTurn" })
}
scenario({
    name: "swamp-Lv1：自分のスタートステップに相手のリザーブのコアすべてがトラッシュへ（疲労はしない）",
    start: { turn: "opp", me: { nexuses: [{ card: SWAMP, cores: 0 }] }, opp: { reserve: 6, spirits: [{ card: RED, label: "赤" }] } },
    steps: swampTurn,
    expect: ["相手.リザーブ: 6 → 0", "相手.トラッシュのコア: 0 → 6", ...myStart()],
})
scenario({
    name: "swamp-Lv2：リザーブのコアをトラッシュへ送り、相手のスピリット1体を疲労させる",
    start: { turn: "opp", me: { nexuses: [{ card: SWAMP, cores: 3 }] }, opp: { reserve: 6, spirits: [{ card: RED, label: "赤" }] } },
    steps: swampTurn,
    expect: ["相手.リザーブ: 6 → 0", "相手.トラッシュのコア: 0 → 6", "相手.赤.疲労: false → true", ...myStart()],
})
scenario({
    name: "swamp-Lv2：相手のスピリットが2体なら選んだ1体だけ疲労する",
    start: { turn: "opp", interactive: true, me: { nexuses: [{ card: SWAMP, cores: 3 }] }, opp: { reserve: 2, spirits: [{ card: RED, label: "赤" }, { card: GREEN, label: "緑" }] } },
    steps(t) {
        swampTurn(t)
        answer(t, "me", "緑")
    },
    expect: ["相手.リザーブ: 2 → 0", "相手.トラッシュのコア: 0 → 2", "相手.緑.疲労: false → true", ...myStart()],
})
scenario({
    name: "swamp-相手のリザーブが空なら何も動かない（Lv1）",
    start: { turn: "opp", me: { nexuses: [{ card: SWAMP, cores: 0 }] }, opp: { reserve: 0 } },
    steps: swampTurn,
    expect: [...myStart()],
})
scenario({
    name: "swamp-自分のリザーブは取られない・相手のターンのスタートステップでは何も起きない",
    start: { me: { reserve: 7, nexuses: [{ card: SWAMP, cores: 3 }] }, opp: { reserve: 6, spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: ["相手.リザーブ: 6 → 7", "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス"],
})
scenario({
    name: "swamp-相手の沼は自分のスタートステップには効かない",
    start: { turn: "opp", me: { reserve: 7 }, opp: { reserve: 6, nexuses: [{ card: SWAMP, cores: 3 }], spirits: [{ card: RED, label: "赤" }] } },
    steps: swampTurn,
    expect: ["自分.リザーブ: 7 → 8", "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"],
})

// ============================================================
console.log("=== BS01-110 時止まりの氷原 ===")
// 節1（Lv1･2）『相手のアタックステップ』：ブロックしている自分のスピリットすべて BP+1000
// 節2（Lv2）『相手のスタートステップ』：相手のスピリット1体を指定。そのターンに必ずアタックする
scenario({
    name: "ice-相手のアタックをブロックした自分のスピリットはBP+1000で相打ちでなく勝つ（非ブロックの自分には付かない）",
    start: { turn: "opp", me: { spirits: [{ card: WHITE, label: "白" }, { card: GREEN, label: "緑" }], nexuses: [{ card: ICEFIELD, cores: 0 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        attackAndBlock(t, "opp", "赤", "白", ["自分.白", 2000])
        assert(bpOf(t, "me", "緑") === 2000, "ブロックしていない緑はそのまま")
    },
    expect: ["自分.白.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "ice-自分のアタックステップには効かない（自分がアタックして相手の赤に止められても白は1000のまま）",
    start: { me: { spirits: [{ card: WHITE, label: "白" }], nexuses: [{ card: ICEFIELD, cores: 0 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackAndBlock(t, "me", "白", "赤", ["自分.白", 1000]),
    expect: ["自分.白.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン",
        "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "ice-相手の氷原は、自分のアタックを止めた相手のスピリットをBP+1000する",
    start: { me: { spirits: [{ card: WHITE, label: "白" }] }, opp: { spirits: [{ card: RED, label: "赤" }], nexuses: [{ card: ICEFIELD, cores: 0 }] } },
    steps: (t) => attackAndBlock(t, "me", "白", "赤", ["相手.赤", 2000]),
    expect: ["自分.白.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン", "相手.赤.疲労: false → true"],
})
scenario({
    name: "ice-Lv2：相手のスタートステップに指定された相手のスピリットは、アタックするまでターンを終えられない",
    start: { me: { nexuses: [{ card: ICEFIELD, cores: 2 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.actRejected("opp", { type: "endTurn" })
    },
    expect: [...oppStart()],
})
scenario({
    name: "ice-Lv2：指定されたスピリットがアタックすればターンを終えられる",
    start: { me: { nexuses: [{ card: ICEFIELD, cores: 2 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        attackUnblockedOpp(t)
        t.act("opp", { type: "endTurn" })
    },
    expect: ["相手.赤.疲労: false → true", "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
        "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 12", "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"],
})
scenario({
    name: "ice-Lv2：指定されたスピリットだけが強制で、ほかの相手のスピリットはアタックしなくてよい",
    start: { interactive: true, me: { nexuses: [{ card: ICEFIELD, cores: 2 }] }, opp: { spirits: [{ card: RED, label: "赤" }, { card: GREEN, label: "緑" }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        answer(t, "me", "赤")
        attackUnblockedOpp(t, "赤")
        t.act("opp", { type: "endTurn" })
    },
    expect: ["相手.赤.疲労: false → true", "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
        "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 12", "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"],
})
scenario({
    name: "ice-Lv2：指定されなかった側がアタックするだけでは、指定されたスピリットの義務は果たされない",
    start: { interactive: true, me: { nexuses: [{ card: ICEFIELD, cores: 2 }] }, opp: { spirits: [{ card: RED, label: "赤" }, { card: GREEN, label: "緑" }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        answer(t, "me", "赤")
        attackUnblockedOpp(t, "緑")
        t.actRejected("opp", { type: "endTurn" })
    },
    expect: ["相手.緑.疲労: false → true", "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
        "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "ice-Lv1は指定しないのでアタックせずにターンを終えられる",
    start: { me: { nexuses: [{ card: ICEFIELD, cores: 0 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "endTurn" })
    },
    expect: [...oppStart(), ...myStart()],
})
// 相手のアタックステップの操作（自分はブロックしない）
function attackUnblockedOpp(t: ScenarioCtx, label = "赤") {
    t.act("opp", { type: "nextPhase" })
    declare(t, "opp", label)
    unblocked(t, "opp")
}

// ============================================================
console.log("=== BS01-145 ディフェンシブオーラ ===")
// フラッシュ：このターン中、ブロックしている自分のスピリットすべて BP+3000（あとからブロックしたスピリットにも効く）
// 白のシンボルを持つ自分のスピリットがいるので軽減1（コスト3）。白のスピリットが破壊されるとコア1個がリザーブへ戻る
const auraPaid = ["自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 3", "自分.手札: ディフェンシブオーラ → なし", "自分.トラッシュ: なし → ディフェンシブオーラ、バーサーカー・ガン"]
scenario({
    name: "aura-ブロックしたあとに使うと、ブロックしているスピリットがBP+3000で相手のBP4000と相打ち",
    start: { turn: "opp", me: { hand: [DEFAURA], spirits: [{ card: WHITE, label: "白" }, { card: GREEN, label: "緑" }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps(t) {
        toAttack(t, "opp")
        declare(t, "opp", "赤")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("白") })
        giveFlash(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        assert(bpOf(t, "me", "白") === 4000, "ブロック中の白はBP4000")
        assert(bpOf(t, "me", "緑") === 2000, "ブロックしていない緑はそのまま")
        t.closeFlash()
    },
    expect: [...auraPaid, "自分.白.場所: フィールド → なし",
        "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 13", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "aura-ブロックの前に使っても、このターンあとからブロックしたスピリットがBP+3000",
    start: { turn: "opp", me: { hand: [DEFAURA], spirits: [{ card: WHITE, label: "白" }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps(t) {
        toAttack(t, "opp")
        declare(t, "opp", "赤")
        giveFlash(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("白") })
        assert(bpOf(t, "me", "白") === 4000, "あとからブロックした白はBP4000")
        t.closeFlash()
    },
    expect: [...auraPaid, "自分.白.場所: フィールド → なし",
        "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 13", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "aura-相手のブロックしているスピリットには効かない（自分のアタックを相手の赤が止める）",
    start: { me: { hand: [DEFAURA], spirits: [{ card: WHITE, label: "白" }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "白")
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("赤") })
        giveFlash(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        assert(bpOf(t, "opp", "赤") === 1000, "相手のブロッカーはBP1000のまま")
        t.closeFlash()
    },
    expect: [...auraPaid, "自分.白.場所: フィールド → なし",
        "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})

// ============================================================
console.log("=== BSC05-002 魔術師ドラゴナーガ ===")
// 節1（Lv1-3）『召喚時』：デッキから1枚ドロー
// 節2（Lv3）『アタック時』：相手のスピリットのコア1個を相手のリザーブへ
scenario({
    name: "naga-召喚すると1枚ドロー",
    start: { me: { hand: [NAGA] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: ["自分.デッキ枚数: 40 → 39", "自分.手札: 魔術師ドラゴナーガ → ロクケラトプス", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4",
        ...appear("自分.魔術師ドラゴナーガ", 1, 1, 2000)],
})
scenario({
    name: "naga-Lv3のアタック時に相手のスピリットのコア1個が相手のリザーブへ",
    start: { me: { spirits: [{ card: NAGA, label: "蛇", cores: 5 }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => attackUnblocked(t, "me", "蛇"),
    expect: ["自分.蛇.疲労: false → true", "相手.赤.コア: 3 → 2", "相手.赤.Lv: 3 → 2", "相手.赤.BP: 4000 → 3000", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"],
})
scenario({
    name: "naga-Lv3：コア1個の相手のスピリットなら消滅する",
    start: { me: { spirits: [{ card: NAGA, label: "蛇", cores: 5 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackUnblocked(t, "me", "蛇"),
    expect: ["自分.蛇.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"],
})
scenario({
    name: "naga-Lv3：相手のスピリットが2体なら選んだ1体だけ",
    start: { me: { spirits: [{ card: NAGA, label: "蛇", cores: 5 }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }, { card: GREEN, label: "緑", cores: 2 }] }, interactive: true },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "蛇")
        answer(t, "me", "緑")
        unblocked(t, "me")
    },
    expect: ["自分.蛇.疲労: false → true", "相手.緑.コア: 2 → 1", "相手.緑.Lv: 2 → 1", "相手.緑.BP: 3000 → 2000", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"],
})
scenario({
    name: "naga-Lv2のアタックではコアは動かない",
    start: { me: { spirits: [{ card: NAGA, label: "蛇", cores: 2 }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => attackUnblocked(t, "me", "蛇"),
    expect: ["自分.蛇.疲労: false → true", ...lifeHit],
})
scenario({
    name: "naga-Lv3でも自分のスピリットのコアは取られない（相手のスピリットがいなければ何も動かない）",
    start: { me: { spirits: [{ card: NAGA, label: "蛇", cores: 5 }, { card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => attackUnblocked(t, "me", "蛇"),
    expect: ["自分.蛇.疲労: false → true", ...lifeHit],
})

// ============================================================
console.log("=== BSC05-003 冥獅士マルバレオン ===")
// 節1（Lv1-3）『召喚時』：相手のスピリット2体の上のコアを、それぞれ1個だけになるように相手のリザーブへ（Lv1に必要な数を割れば Lv0 で破壊。Q2789）
// 節2（Lv3）『自分のアタックステップ』：最初にアタックする自分のスピリット1体は、疲労状態の相手のスピリット1体を指定してアタックできる（他のスピリットでも可。Q2790）
const malvaCast = ["自分.手札: 冥獅士マルバレオン → なし", "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 5"]
scenario({
    name: "malva-召喚すると相手のスピリット2体のコアがそれぞれ1個になる",
    start: { me: { hand: [MALVA] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }, { card: GREEN, label: "緑", cores: 2 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...malvaCast, ...appear("自分.冥獅士マルバレオン", 1, 1, 3000), "相手.赤.コア: 3 → 1", "相手.赤.Lv: 3 → 1", "相手.赤.BP: 4000 → 1000",
        "相手.緑.コア: 2 → 1", "相手.緑.Lv: 2 → 1", "相手.緑.BP: 3000 → 2000", "相手.リザーブ: 10 → 13"],
})
scenario({
    name: "malva-相手のスピリットが1体ならその1体だけ",
    start: { me: { hand: [MALVA] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...malvaCast, ...appear("自分.冥獅士マルバレオン", 1, 1, 3000), "相手.赤.コア: 3 → 1", "相手.赤.Lv: 3 → 1", "相手.赤.BP: 4000 → 1000", "相手.リザーブ: 10 → 12"],
})
scenario({
    name: "malva-コアがすでに1個のスピリットは動かない",
    start: { me: { hand: [MALVA] }, opp: { spirits: [{ card: RED, label: "赤" }, { card: GREEN, label: "緑", cores: 2 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...malvaCast, ...appear("自分.冥獅士マルバレオン", 1, 1, 3000), "相手.緑.コア: 2 → 1", "相手.緑.Lv: 2 → 1", "相手.緑.BP: 3000 → 2000", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "malva-コアを1個にするとLv1に必要なコア（2個）を割るスピリットはLv0で破壊される（Q2789）",
    start: { me: { hand: [MALVA] }, opp: { spirits: [{ card: DINO, label: "犬", cores: 4 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...malvaCast, ...appear("自分.冥獅士マルバレオン", 1, 1, 3000), "相手.犬.場所: フィールド → なし", "相手.トラッシュ: なし → ディノハウンド", "相手.リザーブ: 10 → 14"],
})
scenario({
    name: "malva-相手のスピリットが3体なら選んだ2体だけ",
    start: { interactive: true, me: { hand: [MALVA] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }, { card: GREEN, label: "緑", cores: 2 }, { card: IBARN, label: "ア", cores: 4 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answer(t, "me", "赤")
        answer(t, "me", "ア")
    },
    expect: [...malvaCast, ...appear("自分.冥獅士マルバレオン", 1, 1, 3000), "相手.赤.コア: 3 → 1", "相手.赤.Lv: 3 → 1", "相手.赤.BP: 4000 → 1000",
        "相手.ア.コア: 4 → 1", "相手.ア.Lv: 2 → 1", "相手.ア.BP: 6000 → 2000", "相手.リザーブ: 10 → 15"],
})
const MALVA3 = { card: MALVA, label: "獅", cores: 4 }
scenario({
    name: "malva-Lv3：最初にアタックする他の自分のスピリットが、疲労状態の相手のスピリットを指定してアタックできる",
    start: { me: { spirits: [MALVA3, { card: IBARN, label: "ア", cores: 4 }] }, opp: { spirits: [{ card: RED, label: "赤", rested: true }, { card: GREEN, label: "緑" }] } },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "ア", "赤")
        t.closeFlash()
    },
    expect: ["自分.ア.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "malva-Lv3：マルバレオン自身が最初にアタックして指定してもよい",
    start: { me: { spirits: [MALVA3] }, opp: { spirits: [{ card: RED, label: "赤", rested: true }, { card: GREEN, label: "緑" }] } },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "獅", "赤")
        t.closeFlash()
    },
    expect: ["自分.獅.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "malva-Lv3：疲労していない相手のスピリットは指定できない",
    start: { me: { spirits: [MALVA3, { card: IBARN, label: "ア", cores: 4 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        toAttack(t, "me")
        t.actRejected("me", { type: "attack", instanceId: t.id("ア"), targetSpiritInstanceId: t.id("赤") })
    },
    expect: [],
})
scenario({
    name: "malva-Lv3：最初のアタックではない2体目は指定できない",
    start: { me: { spirits: [MALVA3, { card: IBARN, label: "ア", cores: 4 }] }, opp: { spirits: [{ card: RED, label: "赤", rested: true }] } },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "ア")
        unblocked(t, "me")
        t.actRejected("me", { type: "attack", instanceId: t.id("獅"), targetSpiritInstanceId: t.id("赤") })
    },
    expect: ["自分.ア.疲労: false → true", ...lifeHit],
})
scenario({
    name: "malva-Lv2では指定してアタックできない",
    start: { me: { spirits: [{ card: MALVA, label: "獅", cores: 3 }, { card: IBARN, label: "ア", cores: 4 }] }, opp: { spirits: [{ card: RED, label: "赤", rested: true }] } },
    steps(t) {
        toAttack(t, "me")
        t.actRejected("me", { type: "attack", instanceId: t.id("ア"), targetSpiritInstanceId: t.id("赤") })
    },
    expect: [],
})
scenario({
    name: "malva-相手のマルバレオンは自分のスピリットの指定アタックを許さない（相手のアタックステップではない）",
    start: { me: { spirits: [{ card: IBARN, label: "ア", cores: 4 }] }, opp: { spirits: [{ card: MALVA, label: "獅", cores: 4 }, { card: RED, label: "赤", rested: true }] } },
    steps(t) {
        toAttack(t, "me")
        t.actRejected("me", { type: "attack", instanceId: t.id("ア"), targetSpiritInstanceId: t.id("赤") })
    },
    expect: [],
})

// ============================================================
console.log("=== BSC05-004 森林のセッコーキジ・BSC05-010 イーズナ ===")
// 色とシンボルも赤として扱う。シンボルはコスト軽減に効く（赤1個の軽減を持つメタルバーン コスト3）
for (const [id, label, ownLabel] of [[SECCO, "キジ", "森林のセッコーキジ"], [EEZNA, "イーズナ", "イーズナ"]] as const) {
    scenario({
        name: `${label}-赤のシンボルとしても数えられ、赤の軽減のあるメタルバーンが1安く召喚できる`,
        start: { me: { hand: [METAL], spirits: [{ card: id, label }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: ["自分.手札: メタルバーン → なし", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2", ...appear("自分.メタルバーン", 1, 1, 3000)],
    })
    scenario({
        name: `${label}-いなければ軽減なし（コスト3）`,
        start: { me: { hand: [METAL] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: ["自分.手札: メタルバーン → なし", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", ...appear("自分.メタルバーン", 1, 1, 3000)],
    })
    void ownLabel
}

// ============================================================
console.log("=== BSC05-005 火縄ザル ===")
// 節1（Lv1･2）『召喚時』：ボイドからコア1個を自分のスピリットに置く
// 節2（Lv2）『バトル時』：BPを比べ相手のスピリットだけを破壊したとき、このスピリットは回復する
scenario({
    name: "monkey-召喚時にボイドのコア1個が自分のスピリット（自分自身）に置かれる",
    start: { me: { hand: [MONKEY] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: ["自分.手札: 火縄ザル → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", ...appear("自分.火縄ザル", 2, 1, 3000)],
})
scenario({
    name: "monkey-召喚時に選んだ他の自分のスピリットにコアが1個増える（相手のスピリットは選べない）",
    start: { interactive: true, me: { hand: [MONKEY], spirits: [{ card: WHITE, label: "白" }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.actRejected("me", { type: "resolveChoice", instanceId: t.id("赤") })
        answer(t, "me", "白")
    },
    expect: ["自分.手札: 火縄ザル → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", ...appear("自分.火縄ザル", 1, 1, 3000),
        "自分.白.コア: 1 → 2", "自分.白.Lv: 1 → 2", "自分.白.BP: 1000 → 3000"],
})
scenario({
    name: "monkey-Lv2：ブロックされて相手のスピリットだけを破壊すると回復する",
    start: { me: { spirits: [{ card: MONKEY, label: "猿", cores: 3 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackAndBlock(t, "me", "猿", "赤"),
    expect: ["相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "monkey-Lv2：ブロックして相手のアタッカーだけを破壊しても回復する",
    start: { turn: "opp", me: { spirits: [{ card: MONKEY, label: "猿", cores: 3 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackAndBlock(t, "opp", "赤", "猿"),
    expect: ["相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "monkey-Lv2：ブロックされなければバトルしないので回復しない",
    start: { me: { spirits: [{ card: MONKEY, label: "猿", cores: 3 }] } },
    steps: (t) => attackUnblocked(t, "me", "猿"),
    expect: ["自分.猿.疲労: false → true", ...lifeHit],
})
scenario({
    name: "monkey-Lv1：相手のスピリットだけを破壊しても回復しない",
    start: { me: { spirits: [{ card: MONKEY, label: "猿" }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackAndBlock(t, "me", "猿", "赤"),
    expect: ["自分.猿.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "monkey-Lv2：自分も破壊される（相打ち）ときは回復の対象がいない",
    start: { me: { spirits: [{ card: MONKEY, label: "猿", cores: 3 }] }, opp: { spirits: [{ card: IBARN, label: "ア", cores: 4 }, { card: GREEN, label: "緑" }] } },
    steps(t) {
        // 猿BP5000 vs アイバーンBP6000：猿だけが破壊される
        attackAndBlock(t, "me", "猿", "ア")
    },
    expect: ["自分.猿.場所: フィールド → なし", "自分.リザーブ: 10 → 13", "自分.トラッシュ: なし → 火縄ザル", "相手.ア.疲労: false → true"],
})

// ============================================================
console.log("=== BSC05-006 武神獣タイガード・シンゲン ===")
// 節1（Lv1･2）『アタック時』：お互い、バトルしているスピリット上のコアは取り除けない（アタックしている間ずっと。2026-11-16の裁定）
// 節2（Lv2）『アタック時』：相手のライフを減らしたとき、シンゲン以外の自分のスピリット1体を回復
const poisonPaidBase = ["自分.手札: ポイズンシュート → なし", "自分.トラッシュ: なし → ポイズンシュート", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5"]
const poisonPaid = poisonPaidBase
const castPoison = (t: ScenarioCtx, target: string) => {
    toAttack(t, "me")
    declare(t, "me", "神")
    t.closeFlash()
    t.act("opp", { type: "block", instanceId: t.id("赤") })
    giveFlash(t, "me")
    t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(target) })
    t.closeFlash()
}
scenario({
    name: "shingen-バトル中の相手のブロッカーのコアはマジックの効果で取り除けない",
    start: { me: { hand: [POISON], spirits: [{ card: SHINGEN, label: "神", cores: 3 }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => castPoison(t, "赤"),
    expect: [...poisonPaid, "自分.神.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 13", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "shingen-バトルしていないスピリットのコアは効果で取り除ける",
    start: { me: { hand: [POISON], spirits: [{ card: SHINGEN, label: "神", cores: 3 }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }, { card: GREEN, label: "緑", cores: 2 }] } },
    steps: (t) => castPoison(t, "緑"),
    expect: [...poisonPaid, "自分.神.疲労: false → true", "相手.緑.コア: 2 → 1", "相手.緑.Lv: 2 → 1", "相手.緑.BP: 3000 → 2000",
        "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 14", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "shingen-バトル中のシンゲン自身のコアも自分のマジックの効果で取り除けない",
    start: { me: { hand: [POISON], spirits: [{ card: SHINGEN, label: "神", cores: 3 }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => castPoison(t, "神"),
    expect: [...poisonPaid, "自分.神.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 13", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "shingen-バトル中のシンゲンのコアは自分のマジックのコストとしても取り除けない",
    start: { me: { hand: [DEFAURA], reserve: 0, spirits: [{ card: SHINGEN, label: "神", cores: 5 }] }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "神")
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("赤") })
        giveFlash(t, "me")
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash", paySources: [{ instanceId: t.id("神"), count: 4 }] })
    },
    expect: ["自分.神.疲労: false → true", "相手.赤.疲労: false → true"],
})
scenario({
    name: "shingen-アタックしていない間（相手のアタック中）はコアを取り除ける",
    start: { turn: "opp", me: { hand: [POISON], spirits: [{ card: SHINGEN, label: "神", cores: 3 }, { card: WHITE, label: "白", cores: 2 }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        toAttack(t, "opp")
        declare(t, "opp", "赤")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("白") })
        giveFlash(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("神") })
        t.closeFlash()
    },
    expect: [...poisonPaid.filter((l) => !l.startsWith("自分.リザーブ")), "自分.リザーブ: 10 → 6", "自分.神.コア: 3 → 2", "自分.神.Lv: 2 → 1", "自分.神.BP: 8000 → 4000", "自分.白.疲労: false → true",
        "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "shingen-Lv2：ライフを減らしたとき、シンゲン以外の疲労した自分のスピリット1体を回復する",
    start: { interactive: true, me: { spirits: [{ card: SHINGEN, label: "神", cores: 3 }, { card: GREEN, label: "緑", rested: true }, { card: WHITE, label: "白", rested: true }] } },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "神")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        answer(t, "me", "白")
        t.closeFlash()
    },
    expect: ["自分.神.疲労: false → true", "自分.白.疲労: true → false", ...lifeHit],
})
scenario({
    name: "shingen-Lv2：ブロックされてライフが減らなければ回復しない",
    start: { me: { spirits: [{ card: SHINGEN, label: "神", cores: 3 }, { card: WHITE, label: "白", rested: true }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackAndBlock(t, "me", "神", "赤"),
    expect: ["自分.神.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "shingen-Lv1ではライフを減らしても回復しない",
    start: { me: { spirits: [{ card: SHINGEN, label: "神" }, { card: WHITE, label: "白", rested: true }] } },
    steps: (t) => attackUnblocked(t, "me", "神"),
    expect: ["自分.神.疲労: false → true", ...lifeHit],
})
scenario({
    name: "shingen-Lv2：シンゲン自身は回復の対象にならない（ほかに疲労したスピリットがいなければ何も起きない）",
    start: { me: { spirits: [{ card: SHINGEN, label: "神", cores: 3 }] } },
    steps: (t) => attackUnblocked(t, "me", "神"),
    expect: ["自分.神.疲労: false → true", ...lifeHit],
})

// ============================================================
console.log("=== BSC05-008 移動砲獣グリプドン ===")
// 節1（Lv1-3）：コスト2以下のスピリットのアタックでは、お互いのライフは減らされない
// 節2（Lv2･3）【装甲：白/青】：相手の白/青のスピリット/ネクサス/マジックの効果を受けない
scenario({
    name: "grip-相手のコスト2以下（コスト1）のアタックでは自分のライフは減らない",
    start: { turn: "opp", me: { spirits: [{ card: GRIP, label: "砲" }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackUnblocked(t, "opp", "赤"),
    expect: ["相手.赤.疲労: false → true"],
})
scenario({
    name: "grip-自分のコスト2のスピリットのアタックでも相手のライフは減らない（お互い）",
    start: { me: { spirits: [{ card: GRIP, label: "砲" }, { card: IBARN, label: "ア" }] } },
    steps: (t) => attackUnblocked(t, "me", "ア"),
    expect: ["自分.ア.疲労: false → true"],
})
scenario({
    name: "grip-コスト3のアタックなら相手のライフは減る",
    start: { me: { spirits: [{ card: GRIP, label: "砲" }, { card: METAL, label: "メ" }] } },
    steps: (t) => attackUnblocked(t, "me", "メ"),
    expect: ["自分.メ.疲労: false → true", ...lifeHit],
})
scenario({
    name: "grip-コスト4のグリプドン自身のアタックではライフが減る",
    start: { me: { spirits: [{ card: GRIP, label: "砲" }] } },
    steps: (t) => attackUnblocked(t, "me", "砲"),
    expect: ["自分.砲.疲労: false → true", ...lifeHit],
})
scenario({
    name: "grip-相手のグリプドンがいると自分のコスト2のアタックでも相手のライフは減らない",
    start: { me: { spirits: [{ card: IBARN, label: "ア" }] }, opp: { spirits: [{ card: GRIP, label: "砲" }] } },
    steps: (t) => attackUnblocked(t, "me", "ア"),
    expect: ["自分.ア.疲労: false → true"],
})
scenario({
    name: "grip-Lv2は相手の白マジックの効果を受けない（ドリームリボンで手札に戻されない）",
    start: { turn: "opp", me: { spirits: [{ card: GRIP, label: "砲", cores: 2 }] }, opp: { hand: ["BS01-146"], spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        toAttack(t, "opp")
        declare(t, "opp", "赤")
        giveFlash(t, "opp")
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("砲") })
    },
    expect: ["相手.赤.疲労: false → true"],
})
scenario({
    name: "grip-Lv1は装甲がなく相手の白マジックで手札に戻される",
    start: { turn: "opp", me: { spirits: [{ card: GRIP, label: "砲" }] }, opp: { hand: ["BS01-146"], spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        toAttack(t, "opp")
        declare(t, "opp", "赤")
        giveFlash(t, "opp")
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("砲") })
        t.closeFlash()
    },
    expect: ["相手.手札: ドリームリボン → なし", "相手.トラッシュ: なし → ドリームリボン", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4", "相手.赤.疲労: false → true",
        "自分.砲.場所: フィールド → なし", "自分.手札: なし → 移動砲獣グリプドン", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "grip-Lv3：白以外（紫）の相手のマジックの効果は受ける",
    start: { turn: "opp", me: { spirits: [{ card: GRIP, label: "砲", cores: 4 }] }, opp: { hand: [POISON], spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        toAttack(t, "opp")
        declare(t, "opp", "赤")
        giveFlash(t, "opp")
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("砲") })
        t.closeFlash()
    },
    expect: ["相手.手札: ポイズンシュート → なし", "相手.トラッシュ: なし → ポイズンシュート", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 5", "相手.赤.疲労: false → true",
        "自分.砲.コア: 4 → 3", "自分.砲.Lv: 3 → 2", "自分.砲.BP: 7000 → 5000", "自分.リザーブ: 10 → 11"],
})

// ============================================================
console.log("=== BSC05-012 雷の獣ライジュール ===")
// 節1（Lv1-3）【聖命】『アタック時』：このスピリットのアタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフへ
// 節2（Lv3）『自分のアタックステップ』：自分のコスト10のスピリットすべては、効果の記述を持つ相手のスピリットからブロックされない
scenario({
    name: "rijul-アタックで相手のライフを減らすと、ボイドのコア1個が自分のライフへ",
    start: { me: { spirits: [{ card: RIJUL, label: "雷" }] } },
    steps: (t) => attackUnblocked(t, "me", "雷"),
    expect: ["自分.雷.疲労: false → true", "自分.ライフ: 5 → 6", ...lifeHit],
})
scenario({
    name: "rijul-ブロックされてライフを減らさなければ自分のライフは増えない",
    start: { me: { spirits: [{ card: RIJUL, label: "雷" }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackAndBlock(t, "me", "雷", "赤"),
    expect: ["自分.雷.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "rijul-ほかのスピリットのアタックでは自分のライフは増えない",
    start: { me: { spirits: [{ card: RIJUL, label: "雷" }, { card: RED, label: "赤" }] } },
    steps: (t) => attackUnblocked(t, "me", "赤"),
    expect: ["自分.赤.疲労: false → true", ...lifeHit],
})
scenario({
    name: "rijul-Lv3：自分のコスト10のスピリットは効果を持つ相手のスピリットにブロックされない",
    start: { me: { spirits: [{ card: RIJUL, label: "雷", cores: 4 }, { card: TEN, label: "十" }] }, opp: { spirits: [{ card: FENRIR, label: "砲" }] } },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "十")
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("砲") })
    },
    expect: ["自分.十.疲労: false → true"],
})
scenario({
    name: "rijul-Lv3：効果の記述を持たない相手のスピリットなら、コスト10のスピリットをブロックできる",
    start: { me: { spirits: [{ card: RIJUL, label: "雷", cores: 4 }, { card: TEN, label: "十" }] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackAndBlock(t, "me", "十", "赤"),
    expect: ["自分.十.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "rijul-Lv3：コスト10でない自分のスピリットは、効果を持つ相手のスピリットにブロックされる",
    start: { me: { spirits: [{ card: RIJUL, label: "雷", cores: 4 }, { card: GREEN, label: "緑" }] }, opp: { spirits: [{ card: FENRIR, label: "砲" }] } },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "緑")
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("砲") })
        t.closeFlash()
    },
    expect: ["自分.緑.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → フライングミラージュ", "相手.砲.疲労: false → true"],
})
scenario({
    name: "rijul-Lv2ではコスト10のスピリットも効果を持つ相手のスピリットにブロックされる",
    start: { me: { spirits: [{ card: RIJUL, label: "雷", cores: 2 }, { card: TEN, label: "十" }] }, opp: { spirits: [{ card: FENRIR, label: "砲" }] } },
    steps(t) {
        toAttack(t, "me")
        declare(t, "me", "十")
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("砲") })
        t.closeFlash()
    },
    expect: ["自分.十.疲労: false → true", "相手.砲.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → フェンリルキャノン"],
})
scenario({
    name: "rijul-相手のライジュールは自分のスピリットへの制限にならない（相手のコスト10は自分のスピリットにブロックされる）",
    start: { turn: "opp", me: { spirits: [{ card: FENRIR, label: "砲" }] }, opp: { spirits: [{ card: RIJUL, label: "雷", cores: 4 }, { card: TEN, label: "十" }] } },
    steps(t) {
        toAttack(t, "opp")
        declare(t, "opp", "十")
        t.closeFlash()
        t.actRejected("me", { type: "block", instanceId: t.id("砲") })
    },
    expect: ["相手.十.疲労: false → true"],
})

// ============================================================
console.log("=== BSC05-013 黒翼竜バーン・クロウ ===")
// 【合体時】『バトル時』：BPを比べ相手のスピリットに破壊されたとき、相手のライフのコア1個を相手のリザーブへ。その後、ブレイヴを残してスピリットだけを手札へ戻す
// 合体するとブレイヴ上のコアはホストへ移る。ブレイヴの疲労状態は破壊時のまま
const combine = (t: ScenarioCtx) => t.act("me", { type: "combineBrave", braveInstanceId: t.id("鴉"), hostInstanceId: t.id("メ") })
const crowHost = { card: MELT, label: "メ" }
const crow = { card: CROW, label: "鴉" }
scenario({
    name: "crow-合体条件はコスト5以上（コスト4のスピリットとは合体できない）",
    start: { me: { spirits: [crow, { card: NAGA, label: "蛇" }] } },
    steps: (t) => t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("鴉"), hostInstanceId: t.id("蛇") }),
    expect: [],
})
scenario({
    name: "crow-合体した状態でアタックして相手のスピリットにBP比べで破壊されると、相手のライフのコア1個がリザーブへ。ブレイヴだけが残りスピリットは手札へ",
    start: { me: { spirits: [crowHost, crow] }, opp: { spirits: [{ card: MELT, label: "敵", cores: 5 }] } },
    steps(t) {
        combine(t)
        toAttack(t, "me")
        declare(t, "me", "メ")
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("敵") })
        t.closeFlash()
        confirm(t, "me", true)
    },
    expect: ["自分.メ.場所: フィールド → なし", "自分.手札: なし → 火吹きメルト", "自分.鴉.疲労: false → true", "自分.リザーブ: 10 → 11", "相手.敵.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "crow-合体した状態でブロックして相手のスピリットに破壊されたときも同じ",
    start: { me: { spirits: [crowHost, crow] }, opp: { spirits: [{ card: MELT, label: "敵", cores: 5 }] } },
    steps(t) {
        combine(t)
        t.act("me", { type: "endTurn" })
        attackAndBlock(t, "opp", "敵", "メ")
        confirm(t, "me", true)
    },
    expect: ["自分.メ.場所: フィールド → なし", "自分.手札: なし → 火吹きメルト", "自分.鴉.疲労: false → true", "自分.リザーブ: 10 → 11", "相手.敵.疲労: false → true",
        "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 12", "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス"],
})
scenario({
    name: "crow-バトルに勝てば何も起きない（ライフのコアは動かない）",
    start: { me: { spirits: [crowHost, crow] }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps(t) {
        combine(t)
        attackAndBlock(t, "me", "メ", "赤")
    },
    expect: ["自分.メ.疲労: false → true", "自分.メ.BP: 4000 → 6000", "自分.メ.コア: 1 → 2", "自分.鴉.BP: 2000 → なし", "自分.鴉.コア: 1 → 0", "自分.鴉.場所: フィールド → 合体", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
console.log("すべてのチェックに合格しました 🎉（part977）")
