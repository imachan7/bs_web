// smoke パート594（BS02-030 兵隊アントマン Lv2『このスピリットの破壊時』：手札の怪虫を好きなだけ、コストを支払って召喚。2026-10-15 ユーザー確認）
// 確定した規則：①まとめて選ぶ（複数選択）→ 合計コスト（祭壇があれば余分は1回）を1回で払う → 一括で召喚
// ②この効果で召喚したスピリットのシンボルは、同じ効果の別のスピリットの軽減に使えない（召喚の前からいたスピリットのシンボルだけで数える）
// ③合計を払えない組み合わせは選べない（選び直し）④この効果で召喚したスピリットの召喚時効果は発揮されない
//
// 盤面の前提（効果文からは決まらない。報告参照）：
// ・破壊されたアントマンのコア2個はリザーブに戻る（リザーブ＝初期値+2 から払う）。破壊時の時点でアントマンはフィールドにいないので、そのシンボルは軽減に数えない
// ・召喚で置くLv1のコア1個はリザーブから置く
import { act, assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const ANT = "BS02-030" // 兵隊アントマン（緑・コスト3・Lv2は2コア BP4000・シンボル緑）
const FLY = "BS03-029" // マッハフライ（緑・コスト3・軽減 緑2・シンボル緑・怪虫・効果なし）
const MAT = "BS01-056" // マッチュラ（緑・コスト3・軽減 緑1・シンボル緑・怪虫・召喚時：相手は手札1枚を破棄）
const SRC = "BS01-055" // エメアント（緑・コスト2・シンボル緑・怪虫）。フィールドにいて軽減のシンボルを出す側
const BOSS = "BS10-028" // マタンゴル（相手のアタッカー。Lv1 BP6000・コスト5・効果なし）
const ALTAR = "SD02-013" // 転召の祭壇（相手のネクサス）
const ROKU = "BS01-002" // ロクケラトプス（相手の手札。捨てられるかを見る）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ANT).name === "兵隊アントマン" && getCard(ANT).levels[1].cores === 2 && getCard(ANT).levels[1].bp === 4000, "ANTはLv2が2コア・BP4000")
    for (const c of [FLY, MAT, SRC]) assert(getCard(c).family.includes("怪虫") && getCard(c).symbol.join() === "green", `${c}は緑シンボルの怪虫`)
    assert(getCard(FLY).cost === 3 && getCard(FLY).reduction.join() === "green,green", "FLYはコスト3・軽減 緑2")
    assert(getCard(MAT).cost === 3 && getCard(MAT).reduction.join() === "green", "MATはコスト3・軽減 緑1")
    assert(getCard(SRC).name === "エメアント", "SRCはエメアント")
    assert(getCard(BOSS).name === "マタンゴル" && getCard(BOSS).levels[0].bp === 6000, "BOSSはBP6000")
    assert(getCard(ALTAR).name === "転召の祭壇", "ALTARは転召の祭壇")
}

// ブロックしてアントマンを破壊させ、破壊時の確認に「発動する」と答えるところまで
function destroyAndConfirm(t: ScenarioCtx): void {
    t.act("opp", { type: "attack", instanceId: t.id("マタンゴル") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("兵隊アントマン") })
    t.closeFlash()
    const pc = t.state.pendingChoice as any
    assert(pc?.pid === t.me && pc.confirm === true, "アントマンの破壊時の発動確認が出る")
    t.act("me", { type: "resolveChoice", option: pc.options[0] })
}

// 「まとめて選ぶ」の操作。複数選択の選択待ちの形（kind・応答の形）は未確定なので、ここ1か所に閉じ込める。
// 仮定：手札のカードを cardIndex で1枚ずつトグルし、最後に option:"決定" で確定する
function chooseMany(t: ScenarioCtx, handIndices: number[]): void {
    assert(t.state.pendingChoice?.pid === t.me, "手札から召喚するものをまとめて選ぶ待ちが出る")
    for (const i of handIndices) t.act("me", { type: "resolveChoice", cardIndex: i })
    t.act("me", { type: "resolveChoice", option: "決定" })
}

// 選んだ後の合計コストの支払い待ち（effectCostPay）があれば、paySources なし（リザーブ）で答える
function payFromReserve(t: ScenarioCtx): void {
    for (let i = 0; i < 5 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice as any
        t.act(pc.pid === t.me ? "me" : "opp", { type: "resolveChoice", option: pc.options?.[0] })
    }
}

const fieldFor = (hand: string[], reserve: number, oppExtra: object = {}) => ({
    turn: "opp" as const,
    phase: "attack" as const,
    interactive: true,
    me: { reserve, hand, spirits: [{ card: ANT, cores: 2 }, { card: SRC, cores: 1 }] },
    opp: { spirits: [{ card: BOSS, cores: 1 }], ...oppExtra },
})
// 戦闘の結果。アントマンは破壊されてトラッシュへ、攻撃側のマタンゴルは疲労する（ブロックしたアントマンの疲労は破壊で消える）
const BATTLE = ["相手.マタンゴル.疲労: false → true", "自分.トラッシュ: なし → 兵隊アントマン", "自分.兵隊アントマン.場所: フィールド → なし"]
const arrives = (label: string) => [
    `自分.${label}.場所: なし → フィールド`,
    `自分.${label}.疲労: なし → false`,
    `自分.${label}.コア: なし → 1`,
    `自分.${label}.Lv: なし → 1`,
    `自分.${label}.BP: なし → 2000`,
]

console.log("=== 1. 怪虫2体を同時に召喚 → 1体目のシンボルは2体目の軽減に使えない（エメアントの緑1だけで数える） ===")
// 各コスト 3-1=2、合計4。1体目のシンボルを2体目の軽減に使うと 2+1=3 になってしまう。
// リザーブ 10+2(アントマンのコア)-4(合計コスト)-2(置くコア)=6、トラッシュのコア +4
scenario({
    name: "ant-two",
    mirror: false,
    start: fieldFor([FLY, FLY], 10),
    steps(t) {
        destroyAndConfirm(t)
        chooseMany(t, [0, 1])
        payFromReserve(t)
    },
    expect: [...BATTLE, ...arrives("マッハフライ"), ...arrives("マッハフライ#2"), "自分.手札: マッハフライ、マッハフライ → なし", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4"],
})

console.log("=== 2. 祭壇あり（コスト3以下の怪虫2体）→ 余分は合計で1回だけ ===")
scenario({
    name: "ant-altar",
    mirror: false,
    start: fieldFor([FLY, FLY], 10, { nexuses: [{ card: ALTAR, cores: 1 }] }),
    steps(t) {
        destroyAndConfirm(t)
        chooseMany(t, [0, 1])
        payFromReserve(t)
    },
    // 合計コスト4+余分1=5。リザーブ 10+2-5-2=5、トラッシュのコア +5
    expect: [...BATTLE, ...arrives("マッハフライ"), ...arrives("マッハフライ#2"), "自分.手札: マッハフライ、マッハフライ → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5"],
})

console.log("=== 3. 合計を払えない組み合わせは選べない → 選び直して1体だけなら召喚できる ===")
// リザーブ 1+2=3。2体は合計コスト4で払えない（コストだけで足りない）。1体ならコスト2＋置くコア1=3で払える
scenario({
    name: "ant-unaffordable",
    mirror: false,
    start: fieldFor([FLY, FLY], 1),
    steps(t) {
        destroyAndConfirm(t)
        assert(t.state.pendingChoice?.pid === t.me, "まとめて選ぶ待ちが出る")
        for (const i of [0, 1]) t.act("me", { type: "resolveChoice", cardIndex: i })
        const err = act(t.state, t.me, { type: "resolveChoice", option: "決定" })
        assert(err !== null || t.state.pendingChoice !== null, "払えない2体の確定は通らない（拒否、または選び直しの待ちが残る）")
        assert(t.state.players[t.me].hand.length === 2 && t.state.players[t.me].field.spirits.length === 1, "払えない組み合わせでは何も召喚されない")
        // 選び直し：2枚目を外して1体にして確定する（トグルで外す仮定。chooseMany と同じく形は未確定）
        if (t.state.pendingChoice) t.act("me", { type: "resolveChoice", cardIndex: 1 })
        if (t.state.pendingChoice) t.act("me", { type: "resolveChoice", option: "決定" })
        payFromReserve(t)
    },
    expect: [...BATTLE, ...arrives("マッハフライ"), "自分.手札: マッハフライ、マッハフライ → マッハフライ", "自分.リザーブ: 1 → 0", "自分.トラッシュのコア: 0 → 2"],
})

console.log("=== 4. 召喚されたスピリットの『召喚時』効果は発揮されない（マッチュラの手札破棄が起きない） ===")
scenario({
    name: "ant-no-onsummon",
    mirror: false,
    start: fieldFor([MAT], 10, {}),
    steps(t) {
        t.state.players[t.opp].hand = [ROKU]
        destroyAndConfirm(t)
        chooseMany(t, [0])
        payFromReserve(t)
    },
    // コスト 3-1=2。リザーブ 10+2-2-1=9。相手の手札は ROKU のまま（捨てられない）
    expect: [...BATTLE, ...arrives("マッチュラ"), "自分.手札: マッチュラ → なし", "自分.リザーブ: 10 → 9", "自分.トラッシュのコア: 0 → 2", "相手.手札: なし → ロクケラトプス"],
})

console.log("すべてのチェックに合格しました 🎉（part594）")
