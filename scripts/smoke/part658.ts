// smoke パート658（BS18 緑の場面テスト：効果文だけから先に書いた期待値）
// 担当カードのデータは未実装の段階で書いたため、実装前は getCard で止まるのが正常。
// 新しく現れる個体（召喚）の写像は予測しづらいので、バーストで召喚するもの・手札から召喚するものは scenario でなく直接の assert で見る
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance } from "../../server/src/type"
import { scenario } from "./scenario"
import type { ScenarioCtx, InstanceSpec } from "./scenario"

const RK = "BS01-002" // ロクケラトプス
const BEE = "BS01-050" // ビートビートル
const SHOCK = "BS01-054" // ショックイーター
const BUG = "BS04-030" // 食蟲花バグ・レシア
const MATAN = "BS10-028" // マタンゴル
const HAMMER = "BS03-144" // マジックハンマー
const HIRAI = "BS15-078" // 飛雷震之計
const NIOUKABE = "BS14-101" // 仁王壁
const MAYPA = "BS06-029" // メイパロット
const RAGNA = "BS18-X06" // 混沌魔皇アザートゥース（シンボル2・【転召】なし・召喚時に相手のシンボル1つのスピリットを破壊）
const TARANDO = "BS16-025" // タランドーズ
const VALI = "BS14-038" // 弓機兵ヴァーリ
const MINK = "BS07-019" // スペアミンク
const FAROW = "BS03-091" // 戦闘獣バン・ファロー
const URBY = "BS11-022" // ウルビー
const DSTRIKE = "BS07-076" // ダイヤモンドストライク
const POWAURA = "BS01-135" // パワーオーラ
const STROD = "BS17-053" // 青玉の海竜シュトロドーム

const BUF = "BS18-020"
const MUKARI = "BS18-021"
const CHIRAUN = "BS18-022"
const BOORCHU = "BS18-023"
const BOROQUL = "BS18-024"
const RIOCK = "BS18-025"
const JAMUKA = "BS18-026"
const SPARUDA = "BS18-027"
const GEAR = "BS18-057"
const GRASSLAND = "BS18-065"
const ISLANDS = "BS18-066"
const BRUTO = "BS18-077"
const THUNDER = "BS18-078"
const KHAN = "BS18-X03"
const DOMINION = "X012E"

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [
        [RK, "ロクケラトプス"], [BEE, "ビートビートル"], [SHOCK, "ショックイーター"], [BUG, "食蟲花バグ・レシア"],
        [MATAN, "マタンゴル"], [HAMMER, "マジックハンマー"], [HIRAI, "飛雷震之計"], [NIOUKABE, "仁王壁"],
        [MAYPA, "メイパロット"], [RAGNA, "混沌魔皇アザートゥース"], [TARANDO, "タランドーズ"], [VALI, "弓機兵ヴァーリ"],
        [MINK, "スペアミンク"], [FAROW, "戦闘獣バン・ファロー"], [URBY, "ウルビー"], [DSTRIKE, "ダイヤモンドストライク"],
        [POWAURA, "パワーオーラ"], [STROD, "青玉の海竜シュトロドーム"],
        [BUF, "ブフモット"], ["BS18-014", "冥司書ダンタリアン"], [MUKARI, "駿将ムカリ"], [CHIRAUN, "駿将チラウン"], [BOORCHU, "駿将ボオルチュ"],
        [BOROQUL, "駿将ボロクル"], [RIOCK, "大怪虫リオック"], [JAMUKA, "大首長ジャムカ"], [SPARUDA, "翼の覇獣スパ・ルーダ"],
        [GEAR, "ギアゼル"], [GRASSLAND, "蒼き大草原"], [ISLANDS, "エメラルドの海に散らばる島々"], [BRUTO, "ブルトサリフ"],
        [THUNDER, "サンダーストーム"], [KHAN, "蒼穹の覇王カーン・ウルフ"], [DOMINION, "英雄皇ロード・ドラゴン・ドミニオン"],
    ]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(BUG).cost === 6 && getCard(BUG).type === "spirit", "BUGはコスト6のスピリット")
    assert(getCard(HAMMER).type === "magic" && getCard(HAMMER).cost === 4, "HAMMERはコスト4のマジック")
    assert(getCard(GEAR).type === "brave", "ギアゼルはブレイヴ")
    assert(getCard(GRASSLAND).type === "nexus" && getCard(ISLANDS).type === "nexus", "065・066はネクサス")
}

// ---- 場面テスト用の部品 ----
const sp = (card: string, label?: string, cores?: number, rested?: boolean): InstanceSpec => ({
    card,
    ...(label !== undefined && { label }),
    ...(cores !== undefined && { cores }),
    ...(rested !== undefined && { rested }),
})
const attackTake = (t: ScenarioCtx, label: string) => {
    t.act("me", { type: "attack", instanceId: t.id(label) })
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}
const attackBlocked = (t: ScenarioCtx, label: string, blocker: string) => {
    t.act("me", { type: "attack", instanceId: t.id(label) })
    t.closeFlash()
    t.act("opp", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}
const oppAttackBlocked = (t: ScenarioCtx, label: string, blocker: string) => {
    t.act("opp", { type: "attack", instanceId: t.id(label) })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}

type PC = { kind: string; pid: PlayerId; options?: string[]; candidates?: string[] }
// 選択待ちが続く間、確認は「発動する」側で答え、対象は prefer にあるものを優先して選ぶ
function settle(s: GameState, prefer: string[] = []): void {
    for (let i = 0; i < 12 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as unknown as PC
        let err: string | null
        if (pc.kind === "option") err = act(s, pc.pid, { type: "resolveChoice", option: (pc.options ?? []).find((o) => o.includes("発動する")) ?? pc.options?.[0] ?? "" })
        else if (pc.kind === "target") err = act(s, pc.pid, { type: "resolveChoice", instanceId: prefer.find((id) => (pc.candidates ?? []).includes(id)) ?? pc.candidates?.[0] ?? "" })
        else break
        if (err) throw new Error(`選択への応答に失敗: ${err}`)
    }
}

// ---- 直接 assert する場面の盤面 ----
interface Spec { life?: number; reserve?: number; hand?: string[]; trash?: string[]; spirits?: InstanceSpec[]; burst?: string }
function build(name: string, turn: PlayerId, p1: Spec, p2: Spec, opt: { phase?: "main" | "attack"; interactive?: boolean } = {}): GameState {
    const s = createGame(`p658-${name}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turn
    s.priorityPlayer = turn
    s.phase = opt.phase ?? "main"
    s.interactiveTargets = opt.interactive ?? false
    for (const [pid, spec] of [["p1", p1], ["p2", p2]] as const) {
        const p = s.players[pid]
        p.life = spec.life ?? 5
        p.reserve = spec.reserve ?? 10
        p.hand = [...(spec.hand ?? [])]
        p.deck = Array.from({ length: 40 }, () => RK)
        p.trashCards = [...(spec.trash ?? [])]
        p.field.spirits = (spec.spirits ?? []).map((x) => {
            const inst = createInstance(x.card, s.turn - 1, x.cores ?? 1)
            inst.isRested = x.rested ?? false
            return inst
        })
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = spec.burst ?? null
        p.burstSet = spec.burst !== undefined
    }
    refreshLevelAsOverrides(s)
    return s
}
const spirits = (s: GameState, pid: PlayerId) => s.players[pid].field.spirits
const find = (s: GameState, pid: PlayerId, card: string) => spirits(s, pid).find((x) => x.cardId === card)
const ok = (s: GameState, pid: PlayerId, action: Parameters<typeof act>[2], msg: string) => {
    const err = act(s, pid, action)
    assert(err === null, `${msg}${err === null ? "" : `（拒否: ${err}）`}`)
}
const closeFlash = (s: GameState) => {
    while (s.isFlashTiming && s.battle) {
        const err = act(s, s.priorityPlayer, { type: "pass" })
        if (err) throw new Error(`フラッシュを閉じられない: ${err}`)
    }
}

// ======================================================================
// BS18-019 トガリネズミン：効果文なし（場面なし）
// ======================================================================

// ======================================================================
// BS18-020 ブフモット：このスピリットの破壊時、BP4000以下の相手のスピリット2体を疲労させる
// ======================================================================
console.log("=== 020. 破壊されたら、BP4000以下の相手のスピリット2体（境界の4000を含む）を疲労させる ===")
scenario({
    name: "▼s20a",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [sp(BUF, "ブフモット")] },
        opp: { spirits: [sp(MATAN, "相手攻撃"), sp(SHOCK, "小1"), sp(SHOCK, "小2", 2), sp(MATAN, "大")] },
    },
    steps: (t) => oppAttackBlocked(t, "相手攻撃", "ブフモット"),
    expect: [
        "相手.相手攻撃.疲労: false → true", "相手.小1.疲労: false → true", "相手.小2.疲労: false → true",
        "自分.ブフモット.場所: フィールド → なし", "自分.トラッシュ: なし → ブフモット", "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== 020. 条件に合う相手が1体だけなら、その1体だけ疲労する ===")
scenario({
    name: "▼s20b",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [sp(BUF, "ブフモット")] },
        opp: { spirits: [sp(MATAN, "相手攻撃"), sp(SHOCK, "小1"), sp(MATAN, "大")] },
    },
    steps: (t) => oppAttackBlocked(t, "相手攻撃", "ブフモット"),
    expect: [
        "相手.相手攻撃.疲労: false → true", "相手.小1.疲労: false → true",
        "自分.ブフモット.場所: フィールド → なし", "自分.トラッシュ: なし → ブフモット", "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== 020. 相手のブフモットが破壊されたら、疲労するのは自分のスピリット ===")
scenario({
    name: "▼s20c",
    start: {
        phase: "attack",
        me: { spirits: [sp(MATAN, "攻撃"), sp(SHOCK, "小1"), sp(SHOCK, "小2"), sp(MATAN, "大")] },
        opp: { spirits: [sp(BUF, "ブフモット")] },
    },
    steps: (t) => attackBlocked(t, "攻撃", "ブフモット"),
    expect: [
        "自分.攻撃.疲労: false → true", "自分.小1.疲労: false → true", "自分.小2.疲労: false → true",
        "相手.ブフモット.場所: フィールド → なし", "相手.トラッシュ: なし → ブフモット", "相手.リザーブ: 10 → 11",
    ],
})

// ======================================================================
// BS18-021 駿将ムカリ：Lv2『自分のアタックステップ』雄将の自分のスピリットがアタックしたとき、ボイドからコア1個を自分のリザーブに置く
// ======================================================================
console.log("=== 021. Lv2：雄将（自身を含む）がアタックしたらリザーブ+1 ===")
scenario({
    name: "▼s21a",
    start: { phase: "attack", me: { spirits: [sp(MUKARI, "ムカリ", 2)] } },
    steps: (t) => attackTake(t, "ムカリ"),
    expect: ["自分.ムカリ.疲労: false → true", "自分.リザーブ: 10 → 11", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
console.log("=== 021. Lv2：別の雄将がアタックしても増える ===")
scenario({
    name: "▼s21d",
    start: { phase: "attack", me: { spirits: [sp(MUKARI, "ムカリ", 2), sp(BOORCHU, "ボオルチュ")] } },
    steps: (t) => attackTake(t, "ボオルチュ"),
    expect: ["自分.ボオルチュ.疲労: false → true", "自分.リザーブ: 10 → 11", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
console.log("=== 021. Lv1では増えない ===")
scenario({
    name: "▼s21b",
    start: { phase: "attack", me: { spirits: [sp(MUKARI, "ムカリ", 1)] } },
    steps: (t) => attackTake(t, "ムカリ"),
    expect: ["自分.ムカリ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
console.log("=== 021. 雄将でないスピリットのアタックでは増えない ===")
scenario({
    name: "▼s21c",
    start: { phase: "attack", me: { spirits: [sp(MUKARI, "ムカリ", 2), sp(SHOCK, "ショック")] } },
    steps: (t) => attackTake(t, "ショック"),
    expect: ["自分.ショック.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
console.log("=== 021. 相手の雄将のアタックでは増えない（自分のアタックステップ限定） ===")
scenario({
    name: "▼s21e",
    start: { turn: "opp", phase: "attack", me: { spirits: [sp(MUKARI, "ムカリ", 2)] }, opp: { spirits: [sp(BOORCHU, "相手ボオルチュ")] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("相手ボオルチュ") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.相手ボオルチュ.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

// ======================================================================
// BS18-022 駿将チラウン／BS18-023 駿将ボオルチュ：雄将のアタック中、相手は特定条件のバーストを発動できない
// ======================================================================
console.log("=== 022. 雄将のアタック中は【相手のスピリットのアタック後】のバーストを発動できない ===")
scenario({
    name: "▼s22a",
    start: {
        phase: "attack",
        me: { spirits: [sp(CHIRAUN, "チラウン")] },
        opp: { reserve: 0, spirits: [sp(RK, "R", 1, true)], burst: HIRAI },
    },
    steps: (t) => attackTake(t, "チラウン"),
    expect: ["自分.チラウン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 0 → 1"],
})
console.log("=== 022. 雄将でないスピリットのアタックなら発動できる（対照） ===")
scenario({
    name: "▼s22b",
    start: {
        phase: "attack",
        me: { spirits: [sp(CHIRAUN, "チラウン"), sp(SHOCK, "ショック")] },
        opp: { reserve: 0, spirits: [sp(RK, "R", 1, true)], burst: HIRAI },
    },
    steps: (t) => attackTake(t, "ショック"),
    expect: [
        "自分.ショック.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 0 → 1",
        "相手.R.疲労: true → false", "相手.バースト: 飛雷震之計 → なし", "相手.トラッシュ: なし → 飛雷震之計",
    ],
})
console.log("=== 023. 雄将のアタック中は【相手による自分のスピリット破壊後】のバーストを発動できない ===")
scenario({
    name: "▼s23a",
    start: {
        phase: "attack",
        me: { spirits: [sp(BOORCHU, "ボオルチュ")] },
        opp: { reserve: 0, spirits: [sp(BEE, "ブロッカー")], burst: NIOUKABE },
    },
    steps: (t) => attackBlocked(t, "ボオルチュ", "ブロッカー"),
    expect: ["自分.ボオルチュ.疲労: false → true", "相手.ブロッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ビートビートル", "相手.リザーブ: 0 → 1"],
})
console.log("=== 023. 雄将でないスピリットのアタックなら発動できる（対照） ===")
scenario({
    name: "▼s23b",
    start: {
        phase: "attack",
        me: { spirits: [sp(BOORCHU, "ボオルチュ"), sp(SHOCK, "ショック")] },
        opp: { reserve: 0, spirits: [sp(BEE, "ブロッカー")], burst: NIOUKABE },
    },
    steps: (t) => attackBlocked(t, "ショック", "ブロッカー"),
    expect: [
        "自分.ショック.疲労: false → true", "相手.ブロッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ビートビートル、仁王壁", "相手.リザーブ: 0 → 2", "相手.バースト: 仁王壁 → なし",
    ],
})

// ======================================================================
// BS18-024 駿将ボロクル：自分のアタックステップ、雄将の自分のスピリットすべてをBP+2000
// ======================================================================
console.log("=== 024. アタックステップに入ると、雄将（自身を含む）だけBP+2000。相手の雄将・雄将でない自分は変わらない ===")
scenario({
    name: "▼s24a",
    start: {
        me: { spirits: [sp(BOROQUL, "ボロクル"), sp(MUKARI, "ムカリ"), sp(SHOCK, "ショック")] },
        opp: { spirits: [sp(BOORCHU, "相手ボオルチュ")] },
    },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.ボロクル.BP: 2000 → 4000", "自分.ムカリ.BP: 2000 → 4000"],
})
console.log("=== 024. 相手のアタックステップでは効かない ===")
scenario({
    name: "▼s24b",
    start: { turn: "opp", me: { spirits: [sp(BOROQUL, "ボロクル"), sp(MUKARI, "ムカリ")] }, opp: { spirits: [sp(BOORCHU, "相手ボオルチュ")] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: [],
})

// ======================================================================
// BS18-025 大怪虫リオック：お互いのデッキは破棄されない／アタック時、ボイドからコア1個を自分のスピリットに置く
// ======================================================================
console.log("=== 025. 自分のマジックで相手のデッキを破棄しようとしても破棄されない ===")
scenario({
    name: "▼s25a",
    start: { me: { hand: [HAMMER], spirits: [sp(RIOCK, "リオック")] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }),
    expect: ["自分.手札: マジックハンマー → なし", "自分.トラッシュ: なし → マジックハンマー", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4"],
})
console.log("=== 025. 対照：リオックがいなければ5枚破棄される ===")
scenario({
    name: "▼s25b",
    start: { me: { hand: [HAMMER] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }),
    expect: [
        "自分.手札: マジックハンマー → なし", "自分.トラッシュ: なし → マジックハンマー", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4",
        "相手.デッキ枚数: 40 → 35", `相手.トラッシュ: なし → ${Array(5).fill("ロクケラトプス").join("、")}`,
    ],
})
console.log("=== 025. 相手のマジックで自分のデッキを破棄しようとしても破棄されない ===")
scenario({
    name: "▼s25c",
    start: { turn: "opp", me: { spirits: [sp(RIOCK, "リオック")] }, opp: { hand: [HAMMER] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" }),
    expect: ["相手.手札: マジックハンマー → なし", "相手.トラッシュ: なし → マジックハンマー", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4"],
})
console.log("=== 025. 相手がリオックを持っていても、自分のマジックによる相手のデッキの破棄は止まる（お互い） ===")
scenario({
    name: "▼s25d",
    start: { me: { hand: [HAMMER] }, opp: { spirits: [sp(RIOCK, "相手リオック")] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }),
    expect: ["自分.手札: マジックハンマー → なし", "自分.トラッシュ: なし → マジックハンマー", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4"],
})
console.log("=== 025. 【粉砕】（アタック時の破棄）も止まる ===")
scenario({
    name: "▼s25e",
    start: { phase: "attack", me: { spirits: [sp(RIOCK, "リオック"), sp(STROD, "シュトロドーム")] } },
    steps: (t) => attackTake(t, "シュトロドーム"),
    expect: ["自分.シュトロドーム.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
})
console.log("=== 025. 対照：リオックがいなければ【粉砕】でLvと同じ1枚破棄される ===")
scenario({
    name: "▼s25f",
    start: { phase: "attack", me: { spirits: [sp(STROD, "シュトロドーム")] } },
    steps: (t) => attackTake(t, "シュトロドーム"),
    expect: [
        "自分.シュトロドーム.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12",
        "相手.デッキ枚数: 40 → 39", "相手.トラッシュ: なし → ロクケラトプス",
    ],
})
const DANTALIAN = "BS18-014"
console.log("=== 025. デッキを破棄するコスト（冥司書ダンタリアンの疲労回避）は払えず、疲労する ===")
scenario({
    name: "▼s25h",
    start: {
        phase: "attack",
        me: { spirits: [sp(MATAN, "攻撃"), sp(DANTALIAN, "ダンタリアン"), sp(RIOCK, "リオック")] },
        opp: { spirits: [sp(BUF, "ブフモット")] },
    },
    steps: (t) => attackBlocked(t, "攻撃", "ブフモット"),
    expect: [
        "自分.攻撃.疲労: false → true", "自分.ダンタリアン.疲労: false → true", "自分.リオック.疲労: false → true",
        "相手.ブフモット.場所: フィールド → なし", "相手.トラッシュ: なし → ブフモット", "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 025. 対照：リオックがいなければデッキの上1枚を払って疲労を免れる ===")
scenario({
    name: "▼s25i",
    start: {
        phase: "attack",
        me: { spirits: [sp(MATAN, "攻撃"), sp(DANTALIAN, "ダンタリアン"), sp(SHOCK, "ショック")] },
        opp: { spirits: [sp(BUF, "ブフモット")] },
    },
    steps: (t) => attackBlocked(t, "攻撃", "ブフモット"),
    expect: [
        "自分.攻撃.疲労: false → true", "自分.ショック.疲労: false → true", "自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ロクケラトプス",
        "相手.ブフモット.場所: フィールド → なし", "相手.トラッシュ: なし → ブフモット", "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 025. アタック時、ボイドからコア1個を自分のスピリット（別のスピリットを選べる）に置く ===")
scenario({
    name: "▼s25g",
    start: { phase: "attack", interactive: true, me: { spirits: [sp(RIOCK, "リオック"), sp(SHOCK, "ショック")] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("リオック") })
        settle(t.state, [t.id("ショック")])
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リオック.疲労: false → true", "自分.ショック.コア: 1 → 2", "自分.ショック.Lv: 1 → 2", "自分.ショック.BP: 3000 → 4000",
        "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
    ],
})

// ======================================================================
// BS18-026 大首長ジャムカ
// ======================================================================
console.log("=== 026. Lv1：雄将がBPを比べ相手のスピリットだけを破壊したら回復する（アタッカー自身。別の疲労した雄将は回復しない） ===")
scenario({
    name: "▼s26a",
    start: {
        phase: "attack",
        me: { spirits: [sp(JAMUKA, "ジャムカ"), sp(MUKARI, "ムカリ", 1, true)] },
        opp: { spirits: [sp(BEE, "ブロッカー")] },
    },
    steps: (t) => attackBlocked(t, "ジャムカ", "ブロッカー"),
    expect: ["相手.ブロッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ビートビートル", "相手.リザーブ: 10 → 11"],
})
console.log("=== 026. 雄将でないスピリットが同じことをしても回復しない（対照） ===")
scenario({
    name: "▼s26b",
    start: {
        phase: "attack",
        me: { spirits: [sp(JAMUKA, "ジャムカ"), sp(SHOCK, "ショック")] },
        opp: { spirits: [sp(BEE, "ブロッカー")] },
    },
    steps: (t) => attackBlocked(t, "ショック", "ブロッカー"),
    expect: [
        "自分.ショック.疲労: false → true", "相手.ブロッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ビートビートル", "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 026. Lv2：ライフを減らしたとき、雄将1体につき相手のスピリット1体を疲労（自身を含む＝2体） ===")
scenario({
    name: "▼s26c",
    start: {
        phase: "attack",
        me: { spirits: [sp(JAMUKA, "ジャムカ", 3), sp(MUKARI, "ムカリ")] },
        opp: { spirits: [sp(SHOCK, "A"), sp(SHOCK, "B")] },
    },
    steps: (t) => attackTake(t, "ジャムカ"),
    expect: [
        "自分.ジャムカ.疲労: false → true", "相手.A.疲労: false → true", "相手.B.疲労: false → true",
        "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 026. Lv2：雄将が自身だけなら1体だけ疲労（選んだ方） ===")
scenario({
    name: "▼s26d",
    start: {
        phase: "attack", interactive: true,
        me: { spirits: [sp(JAMUKA, "ジャムカ", 3)] },
        opp: { spirits: [sp(SHOCK, "A"), sp(SHOCK, "B")] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ジャムカ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        settle(t.state, [t.id("B")])
    },
    expect: ["自分.ジャムカ.疲労: false → true", "相手.B.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
console.log("=== 026. Lv2：ブロックされてライフを減らせなければ疲労させない ===")
scenario({
    name: "▼s26e",
    start: {
        phase: "attack",
        me: { spirits: [sp(JAMUKA, "ジャムカ", 3)] },
        opp: { spirits: [sp(BEE, "ブロッカー"), sp(SHOCK, "A")] },
    },
    steps: (t) => attackBlocked(t, "ジャムカ", "ブロッカー"),
    expect: ["相手.ブロッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ビートビートル", "相手.リザーブ: 10 → 11"],
})
console.log("=== 026. Lv1はアタック時の疲労効果を持たない ===")
scenario({
    name: "▼s26f",
    start: { phase: "attack", me: { spirits: [sp(JAMUKA, "ジャムカ", 1)] }, opp: { spirits: [sp(SHOCK, "A"), sp(SHOCK, "B")] } },
    steps: (t) => attackTake(t, "ジャムカ"),
    expect: ["自分.ジャムカ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ======================================================================
// BS18-027 翼の覇獣スパ・ルーダ
// ======================================================================
console.log("=== 027. 相手の召喚時効果の発揮後、コスト5以上の緑/青の自分のスピリットをデッキの下に戻して召喚。相手のスピリット3体が疲労する ===")
{
    const s = build("27a", "p2", { burst: SPARUDA, spirits: [{ card: BUG }] }, { hand: [MAYPA], spirits: [{ card: RK }, { card: RK }] })
    ok(s, "p2", { type: "summon", handIndex: 0 }, "相手がメイパロットを召喚")
    settle(s)
    assert(find(s, "p1", SPARUDA) !== undefined, "スパ・ルーダが召喚された")
    assert(find(s, "p1", BUG) === undefined && s.players.p1.deck.includes(BUG) && s.players.p1.deck.length === 41, "バグ・レシアはデッキに戻った")
    assert(spirits(s, "p2").length === 3 && spirits(s, "p2").every((x) => x.isRested), "相手のスピリット3体（召喚されたメイパロットを含む）が疲労した")
    assert(s.players.p1.burst === null, "バーストエリアは空になった")
}
console.log("=== 027. 戻せる緑/青のコスト5以上がいなければ（コスト1の赤だけ）召喚できず、疲労効果も出ない ===")
{
    const s = build("27b", "p2", { burst: SPARUDA, spirits: [{ card: RK }] }, { hand: [MAYPA], spirits: [{ card: RK }, { card: RK }] })
    ok(s, "p2", { type: "summon", handIndex: 0 }, "相手がメイパロットを召喚")
    settle(s)
    assert(find(s, "p1", SPARUDA) === undefined, "スパ・ルーダは召喚されない")
    assert(find(s, "p1", RK) !== undefined && spirits(s, "p2").every((x) => !x.isRested), "自分のスピリットはそのまま・相手は疲労しない")
}
console.log("=== 027. 召喚時効果を持たない相手のスピリットが召喚されても発動しない ===")
{
    const s = build("27c", "p2", { burst: SPARUDA, spirits: [{ card: BUG }] }, { hand: [RK] })
    ok(s, "p2", { type: "summon", handIndex: 0 }, "相手がロクケラトプスを召喚")
    settle(s)
    assert(find(s, "p1", SPARUDA) === undefined && s.players.p1.burst === SPARUDA, "バーストは発動せずセットされたまま")
    assert(find(s, "p1", BUG) !== undefined, "バグ・レシアは戻らない")
}
console.log("=== 027. 手札から召喚したときは、召喚時の疲労効果は発揮されない ===")
{
    const s = build("27d", "p1", { hand: [SPARUDA], reserve: 20 }, { spirits: [{ card: RK }, { card: RK }, { card: RK }] })
    ok(s, "p1", { type: "summon", handIndex: 0 }, "スパ・ルーダを手札から召喚")
    settle(s)
    assert(find(s, "p1", SPARUDA) !== undefined, "スパ・ルーダが場に出た")
    assert(spirits(s, "p2").every((x) => !x.isRested), "相手のスピリットは疲労しない")
}
console.log("=== 027. この効果で疲労したスピリットは、このターンの間に回復しない ===")
{
    const s = build("27e", "p2", { burst: SPARUDA, spirits: [{ card: BUG }] }, { hand: [MAYPA, DSTRIKE], spirits: [{ card: VALI }, { card: RK }] })
    ok(s, "p2", { type: "summon", handIndex: 0 }, "相手がメイパロットを召喚")
    settle(s)
    const vali = find(s, "p2", VALI)!
    assert(vali.isRested, "ヴァーリは疲労した")
    ok(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: vali.instanceId }, "ダイヤモンドストライクで回復を試みる")
    closeFlash(s)
    assert(vali.isRested, "ヴァーリはこのターン回復しない")
}
console.log("=== 027. 対照：疲労させられていない武装スピリットはダイヤモンドストライクで回復する ===")
{
    const s = build("27f", "p2", {}, { hand: [DSTRIKE], spirits: [{ card: VALI, rested: true }] })
    const vali = find(s, "p2", VALI)!
    ok(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: vali.instanceId }, "ダイヤモンドストライクで回復")
    closeFlash(s)
    assert(!vali.isRested, "ヴァーリは回復する")
}

// ======================================================================
// BS18-057 ギアゼル
// ======================================================================
console.log("=== 057. 召喚時：手札のシンボル2つのスピリットを無償で召喚する。ただしその召喚時効果は発揮されない ===")
{
    const s = build("57a", "p1", { hand: [GEAR, RAGNA, SHOCK] }, { spirits: [{ card: RK }] })
    ok(s, "p1", { type: "summon", handIndex: 0 }, "ギアゼルを召喚")
    settle(s)
    assert(find(s, "p1", GEAR) !== undefined, "ギアゼルが場に出た")
    assert(find(s, "p1", RAGNA) !== undefined, "アザートゥースが無償で召喚された")
    assert(spirits(s, "p2").length === 1, "アザートゥースの召喚時効果（相手のシンボル1つのスピリットを破壊）は発揮されない")
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === SHOCK, "シンボル1つのショックイーターは手札に残る")
}
console.log("=== 057. シンボル2つのスピリットが手札になければ何も召喚されない ===")
{
    const s = build("57b", "p1", { hand: [GEAR, SHOCK] }, {})
    ok(s, "p1", { type: "summon", handIndex: 0 }, "ギアゼルを召喚")
    settle(s)
    assert(spirits(s, "p1").length === 1 && s.players.p1.hand.length === 1, "ギアゼルだけが場に出て、手札は変わらない")
}
console.log("=== 057. 「できる」：断ったら召喚しない ===")
{
    const s = build("57c", "p1", { hand: [GEAR, RAGNA] }, {}, { interactive: true })
    ok(s, "p1", { type: "summon", handIndex: 0 }, "ギアゼルを召喚")
    if (s.pendingChoice) ok(s, "p1", { type: "resolveChoice" }, "召喚を断る")
    assert(find(s, "p1", RAGNA) === undefined && s.players.p1.hand.includes(RAGNA), "アザートゥースは手札に残る")
}
console.log("=== 057. 合体条件（シンボル2つ以上）：2つ持つスピリットには合体でき、1つしか持たないスピリットには合体できない ===")
{
    const s = build("57d", "p1", { spirits: [{ card: GEAR }, { card: TARANDO }, { card: SHOCK }] }, {})
    const [gear, tarando, shock] = spirits(s, "p1") as [CardInstance, CardInstance, CardInstance]
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: gear.instanceId, hostInstanceId: shock.instanceId }) !== null, "シンボル1つのスピリットへは合体できない")
    ok(s, "p1", { type: "combineBrave", braveInstanceId: gear.instanceId, hostInstanceId: tarando.instanceId }, "シンボル2つのスピリットへは合体できる")
}
console.log("=== 057. 合体時：バトル時にコスト3以下の相手のスピリット1体を疲労させる（コスト4以上は対象外） ===")
{
    const s = build("57e", "p1", { spirits: [{ card: GEAR }, { card: TARANDO }] }, { spirits: [{ card: FAROW }, { card: BEE }, { card: URBY }] })
    const [gear, tarando] = spirits(s, "p1") as [CardInstance, CardInstance]
    ok(s, "p1", { type: "combineBrave", braveInstanceId: gear.instanceId, hostInstanceId: tarando.instanceId }, "合体")
    ok(s, "p1", { type: "nextPhase" }, "アタックステップへ")
    ok(s, "p1", { type: "attack", instanceId: tarando.instanceId }, "アタック")
    closeFlash(s)
    const farow = find(s, "p2", FAROW)!
    ok(s, "p2", { type: "block", instanceId: farow.instanceId }, "バン・ファローでブロック")
    closeFlash(s)
    assert(find(s, "p2", BEE)?.isRested === true, "コスト0のビートビートルが疲労した")
    assert(find(s, "p2", URBY)?.isRested === false, "コスト4のウルビーは疲労しない")
}

// ======================================================================
// BS18-065 蒼き大草原
// ======================================================================
console.log("=== 065. アタックステップに入ると、覇皇/雄将の自分のスピリットすべてBP+2000（どちらでもない自分・相手の雄将は変わらない） ===")
scenario({
    name: "▼s65a",
    start: {
        me: { nexuses: [sp(GRASSLAND, "大草原", 0)], spirits: [sp(KHAN, "カーン"), sp(MUKARI, "ムカリ"), sp(SHOCK, "ショック")] },
        opp: { spirits: [sp(BOORCHU, "相手ボオルチュ")] },
    },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.カーン.BP: 6000 → 8000", "自分.ムカリ.BP: 2000 → 4000"],
})
console.log("=== 065. お互いのアタックステップ：相手のアタックステップでも自分の覇皇/雄将はBP+2000 ===")
scenario({
    name: "▼s65b",
    start: { turn: "opp", me: { nexuses: [sp(GRASSLAND, "大草原", 0)], spirits: [sp(KHAN, "カーン"), sp(SHOCK, "ショック")] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: ["自分.カーン.BP: 6000 → 8000"],
})
console.log("=== 065. Lv2：BPを比べ相手のスピリットだけを破壊したら、相手のスピリット1体を疲労させる ===")
scenario({
    name: "▼s65c",
    start: {
        phase: "attack",
        me: { nexuses: [sp(GRASSLAND, "大草原", 1)], spirits: [sp(BUG, "攻撃", 3)] },
        opp: { spirits: [sp(BEE, "ブロッカー"), sp(SHOCK, "他")] },
    },
    steps: (t) => attackBlocked(t, "攻撃", "ブロッカー"),
    expect: [
        "自分.攻撃.疲労: false → true", "相手.ブロッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ビートビートル",
        "相手.リザーブ: 10 → 11", "相手.他.疲労: false → true",
    ],
})
console.log("=== 065. Lv1では疲労させない（対照） ===")
scenario({
    name: "▼s65d",
    start: {
        phase: "attack",
        me: { nexuses: [sp(GRASSLAND, "大草原", 0)], spirits: [sp(BUG, "攻撃", 3)] },
        opp: { spirits: [sp(BEE, "ブロッカー"), sp(SHOCK, "他")] },
    },
    steps: (t) => attackBlocked(t, "攻撃", "ブロッカー"),
    expect: [
        "自分.攻撃.疲労: false → true", "相手.ブロッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ビートビートル", "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 065. Lv2：相手のアタックステップに、自分のブロッカーが攻撃側だけを破壊しても疲労させる ===")
scenario({
    name: "▼s65e",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [sp(GRASSLAND, "大草原", 1)], spirits: [sp(BUG, "防", 3)] },
        opp: { spirits: [sp(SHOCK, "相手攻撃"), sp(SHOCK, "他")] },
    },
    steps: (t) => oppAttackBlocked(t, "相手攻撃", "防"),
    expect: [
        "自分.防.疲労: false → true", "相手.相手攻撃.場所: フィールド → なし", "相手.トラッシュ: なし → ショックイーター",
        "相手.リザーブ: 10 → 11", "相手.他.疲労: false → true",
    ],
})

// ======================================================================
// BS18-066 エメラルドの海に散らばる島々
// ======================================================================
console.log("=== 066. 相手のターン、相手のスピリットが回復したとき自分のスピリット1体を回復（リフレッシュの回復）。Lv2でもドローステップの手札増加では破棄させない ===")
scenario({
    name: "▼s66a",
    start: { me: { nexuses: [sp(ISLANDS, "島々", 2)], spirits: [sp(RK, "A", 1, true)] }, opp: { spirits: [sp(RK, "O", 1, true)] } },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: [
        "自分.A.疲労: true → false", "相手.O.疲労: true → false",
        "相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 066. 全員が回復済みなら回復したスピリットがいないので誘発しない ===")
scenario({
    name: "▼s66b",
    start: { me: { nexuses: [sp(ISLANDS, "島々", 2)], spirits: [sp(RK, "A", 1, true)] }, opp: { spirits: [sp(RK, "O")] } },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: ["相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11"],
})
console.log("=== 066. 相手のスピリットが2体回復しても誘発は1回：自分は1体だけ回復する ===")
scenario({
    name: "▼s66c",
    start: {
        interactive: true,
        me: { nexuses: [sp(ISLANDS, "島々", 2)], spirits: [sp(RK, "A", 1, true), sp(RK, "B", 1, true)] },
        opp: { spirits: [sp(RK, "O1", 1, true), sp(RK, "O2", 1, true)] },
    },
    steps: (t) => {
        t.act("me", { type: "endTurn" })
        settle(t.state, [t.id("A")])
    },
    expect: [
        "自分.A.疲労: true → false", "相手.O1.疲労: true → false", "相手.O2.疲労: true → false",
        "相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 066. Lv2：ドローステップ以外で相手の手札が増えたら、相手は手札1枚を破棄する ===")
scenario({
    name: "▼s66d",
    start: { turn: "opp", me: { nexuses: [sp(ISLANDS, "島々", 2)] }, opp: { hand: [POWAURA, RK] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" }),
    expect: [
        "相手.手札: パワーオーラ、ロクケラトプス → ロクケラトプス", "相手.トラッシュ: なし → パワーオーラ、ロクケラトプス",
        "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 7", "相手.トラッシュのコア: 0 → 3",
    ],
})
console.log("=== 066. Lv1では破棄させない（対照） ===")
scenario({
    name: "▼s66e",
    start: { turn: "opp", me: { nexuses: [sp(ISLANDS, "島々", 0)] }, opp: { hand: [POWAURA, RK] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" }),
    expect: [
        "相手.手札: パワーオーラ、ロクケラトプス → ロクケラトプス、ロクケラトプス", "相手.トラッシュ: なし → パワーオーラ",
        "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 7", "相手.トラッシュのコア: 0 → 3",
    ],
})

// ======================================================================
// BS18-077 ブルトサリフ
// ======================================================================
const OPP_TURN_LINES = ["相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11"]
console.log("=== 077. トラッシュで働く：自分のエンドステップに、トラッシュのブルトサリフ1枚が手札に戻る（このターンに使ったかは問わない） ===")
scenario({
    name: "▼s77a",
    start: { me: { trash: [BRUTO] } },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: ["自分.手札: なし → ブルトサリフ", "自分.トラッシュ: ブルトサリフ → なし", ...OPP_TURN_LINES],
})
console.log("=== 077. ターンに1回：トラッシュに2枚あっても戻るのは1枚だけ ===")
scenario({
    name: "▼s77b",
    start: { me: { trash: [BRUTO, BRUTO] } },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: ["自分.手札: なし → ブルトサリフ", "自分.トラッシュ: ブルトサリフ、ブルトサリフ → ブルトサリフ", ...OPP_TURN_LINES],
})
console.log("=== 077. トラッシュに無ければ何も起きない（手札のブルトサリフは対象外） ===")
scenario({
    name: "▼s77c",
    start: { me: { hand: [BRUTO] } },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: OPP_TURN_LINES,
})
console.log("=== 077. 相手のエンドステップでは戻らない（自分のエンドステップ限定） ===")
scenario({
    name: "▼s77d",
    start: { turn: "opp", me: { trash: [BRUTO] } },
    steps: (t) => t.act("opp", { type: "endTurn" }),
    expect: ["自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11"],
})
console.log("=== 077. バースト：自分のスピリット1体を回復。続くコストが払えなければフラッシュ効果は発揮しない ===")
{
    const s = build("77a", "p2", { reserve: 0, burst: BRUTO, spirits: [{ card: RK, rested: true }] }, { hand: [MAYPA], spirits: [{ card: RK }] })
    const r = spirits(s, "p1")[0]!
    ok(s, "p2", { type: "summon", handIndex: 0 }, "相手がメイパロットを召喚")
    settle(s)
    assert(!r.isRested, "疲労していた自分のスピリットが回復した")
    assert(effectiveBp(s, "p1", r) === 1000, "コストが払えないのでBP+2000は付かない")
    assert(s.players.p1.burst === null && s.players.p1.trashCards.includes(BRUTO), "ブルトサリフはトラッシュへ")
}
console.log("=== 077. バースト：コストを払えば、続けてフラッシュ効果（スピリット1体をBP+2000）も発揮する ===")
{
    const s = build("77b", "p2", { burst: BRUTO, spirits: [{ card: RK, rested: true }] }, { hand: [MAYPA], spirits: [{ card: RK }] }, { interactive: true })
    const r = spirits(s, "p1")[0]!
    ok(s, "p2", { type: "summon", handIndex: 0 }, "相手がメイパロットを召喚")
    settle(s, [r.instanceId])
    assert(!r.isRested, "自分のスピリットが回復した")
    assert(effectiveBp(s, "p1", r) === 3000, "選んだスピリットがBP+2000（1000→3000）")
    assert(s.players.p1.reserve === 8, "コスト2を払った")
}

// ======================================================================
// BS18-078 サンダーストーム
// ======================================================================
console.log("=== 078. 相手の手札1枚につきスピリット1体をBP+1000。相手の手札が6枚以上の間は相手のバーストが発揮されない ===")
scenario({
    name: "▼s78a",
    start: {
        me: { hand: [THUNDER], spirits: [sp(RK, "攻撃")] },
        opp: { reserve: 0, hand: Array(6).fill(RK), spirits: [sp(RK, "R", 1, true)], burst: HIRAI },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("攻撃") })
        t.act("me", { type: "nextPhase" })
        attackTake(t, "攻撃")
    },
    expect: [
        "自分.手札: サンダーストーム → なし", "自分.トラッシュ: なし → サンダーストーム", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3",
        "自分.攻撃.BP: 1000 → 7000", "自分.攻撃.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 0 → 1",
    ],
})
console.log("=== 078. 相手の手札が5枚なら+5000で、バーストは発動できる（対照） ===")
scenario({
    name: "▼s78b",
    start: {
        me: { hand: [THUNDER], spirits: [sp(RK, "攻撃")] },
        opp: { reserve: 0, hand: Array(5).fill(RK), spirits: [sp(RK, "R", 1, true)], burst: HIRAI },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("攻撃") })
        t.act("me", { type: "nextPhase" })
        attackTake(t, "攻撃")
    },
    expect: [
        "自分.手札: サンダーストーム → なし", "自分.トラッシュ: なし → サンダーストーム", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3",
        "自分.攻撃.BP: 1000 → 6000", "自分.攻撃.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 0 → 1",
        "相手.R.疲労: true → false", "相手.バースト: 飛雷震之計 → なし", "相手.トラッシュ: なし → 飛雷震之計",
    ],
})

// ======================================================================
// BS18-X03 蒼穹の覇王カーン・ウルフ
// ======================================================================
console.log("=== X03. バースト：ライフ3以下なら召喚。召喚時に剣獣の自分のスピリット1体を回復 ===")
{
    const s = build("x03a", "p2", { life: 3, burst: KHAN, spirits: [{ card: RK }, { card: MINK, rested: true }] }, { spirits: [{ card: MATAN }] }, { phase: "attack", interactive: true })
    const mink = find(s, "p1", MINK)!
    ok(s, "p2", { type: "attack", instanceId: find(s, "p2", MATAN)!.instanceId }, "相手がアタック")
    closeFlash(s)
    ok(s, "p1", { type: "block", instanceId: find(s, "p1", RK)!.instanceId }, "ロクケラトプスでブロック")
    closeFlash(s)
    settle(s, [mink.instanceId])
    assert(find(s, "p1", RK) === undefined, "ブロックしたスピリットは破壊された")
    assert(find(s, "p1", KHAN) !== undefined, "カーン・ウルフが召喚された")
    assert(!mink.isRested, "選んだ剣獣のスペアミンクが回復した")
}
console.log("=== X03. ライフ4なら召喚されない ===")
{
    const s = build("x03b", "p2", { life: 4, burst: KHAN, spirits: [{ card: RK }, { card: MINK, rested: true }] }, { spirits: [{ card: MATAN }] }, { phase: "attack", interactive: true })
    ok(s, "p2", { type: "attack", instanceId: find(s, "p2", MATAN)!.instanceId }, "相手がアタック")
    closeFlash(s)
    ok(s, "p1", { type: "block", instanceId: find(s, "p1", RK)!.instanceId }, "ロクケラトプスでブロック")
    closeFlash(s)
    settle(s)
    assert(find(s, "p1", KHAN) === undefined, "カーン・ウルフは召喚されない")
    assert(find(s, "p1", MINK)?.isRested === true, "スペアミンクは疲労したまま")
}
console.log("=== X03. Lv3：BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個をリザーブへ置き、自身が回復する ===")
scenario({
    name: "▼s03a",
    start: { phase: "attack", me: { spirits: [sp(KHAN, "カーン", 5)] }, opp: { spirits: [sp(BEE, "ブロッカー")] } },
    steps: (t) => attackBlocked(t, "カーン", "ブロッカー"),
    expect: ["相手.ブロッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ビートビートル", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 12"],
})
console.log("=== X03. Lv2では効果なし（回復もライフのコア移動もしない） ===")
scenario({
    name: "▼s03b",
    start: { phase: "attack", me: { spirits: [sp(KHAN, "カーン", 3)] }, opp: { spirits: [sp(BEE, "ブロッカー")] } },
    steps: (t) => attackBlocked(t, "カーン", "ブロッカー"),
    expect: ["自分.カーン.疲労: false → true", "相手.ブロッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ビートビートル", "相手.リザーブ: 10 → 11"],
})
console.log("=== X03. Lv3でもブロックされずライフを減らしただけなら効果なし ===")
scenario({
    name: "▼s03c",
    start: { phase: "attack", me: { spirits: [sp(KHAN, "カーン", 5)] } },
    steps: (t) => attackTake(t, "カーン"),
    expect: ["自分.カーン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ======================================================================
// X012E 英雄皇ロード・ドラゴン・ドミニオン（X012R の緑版）
// ======================================================================
console.log("=== X012E. バースト：自分のライフ減少後に召喚。召喚時、手札のバースト効果を持つカードをセットすることでドロー ===")
{
    const s = build("d12a", "p2", { burst: DOMINION, hand: [HIRAI] }, { spirits: [{ card: MATAN }] }, { phase: "attack", interactive: true })
    ok(s, "p2", { type: "attack", instanceId: find(s, "p2", MATAN)!.instanceId }, "相手がアタック")
    closeFlash(s)
    ok(s, "p1", { type: "takeLife" }, "ライフで受ける")
    settle(s)
    assert(s.players.p1.life === 4, "ライフが減った")
    assert(find(s, "p1", DOMINION) !== undefined, "ドミニオンが召喚された")
    assert(s.players.p1.burst === HIRAI && s.players.p1.hand.length === 1 && s.players.p1.deck.length === 39, "飛雷震之計をセットして1枚ドロー（手札は引いた1枚）")
}
console.log("=== X012E. 手札にバースト効果を持つカードがなければセットできず、ドローもしない ===")
{
    const s = build("d12b", "p2", { burst: DOMINION, hand: [RK] }, { spirits: [{ card: MATAN }] }, { phase: "attack", interactive: true })
    ok(s, "p2", { type: "attack", instanceId: find(s, "p2", MATAN)!.instanceId }, "相手がアタック")
    closeFlash(s)
    ok(s, "p1", { type: "takeLife" }, "ライフで受ける")
    settle(s)
    assert(find(s, "p1", DOMINION) !== undefined, "ドミニオンは召喚される")
    assert(s.players.p1.burst === null && s.players.p1.hand.length === 1 && s.players.p1.deck.length === 40, "セットもドローも起きない")
}
console.log("=== X012E. Lv3：自分のバーストをセットしている間、アタックステップでBP+3000 ===")
scenario({
    name: "▼s12c",
    start: { me: { burst: HIRAI, spirits: [sp(DOMINION, "ドミニオン", 5)] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.ドミニオン.BP: 10000 → 13000"],
})
console.log("=== X012E. 自分のバーストがなければ（相手がセットしていても）BPは変わらない ===")
scenario({
    name: "▼s12d",
    start: { me: { spirits: [sp(DOMINION, "ドミニオン", 5)] }, opp: { burst: HIRAI } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})
console.log("=== X012E. Lv2ではBPは変わらない ===")
scenario({
    name: "▼s12e",
    start: { me: { burst: HIRAI, spirits: [sp(DOMINION, "ドミニオン", 3)] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part658）")
