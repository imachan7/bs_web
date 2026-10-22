// smoke パート621（BS17 黄15枚の場面テスト。期待値役が効果文だけから先に書いたもの。実装役は変更せずに通す）
import { act, assert, getCard } from "./helpers"
import type { GameAction } from "./helpers"
import { scenario as scenarioBase } from "./scenario"
import type { ScenarioCtx, ScenarioSpec, Side, SideSpec } from "./scenario"

// 「〜できる」の確認や対象選択に答える場面は interactive（既定は非対話＝エンジンが自動で決める）
const scenario = (spec: ScenarioSpec): void => scenarioBase(spec)
const scenarioI = (spec: ScenarioSpec): void => scenarioBase({ ...spec, start: { ...spec.start, interactive: true } })

const KAPIPPA = "BS17-037"
const SEGU = "BS17-043"
const CAT = "BS17-038"
const IRAS = "BS17-039"
const RIO = "BS17-040"
const GREIEL = "BS17-041"
const GIRL = "BS17-042"
const QUEEN = "BS17-044"
const FERN = "BS17-045"
const HORUS = "BS17-059"
const TOMB = "BS17-069"
const JUNGLE = "BS17-070"
const NEFER = "BS17-081"
const SPARK = "BS17-082"
const CLEO = "BS17-X05"

const R = "BS01-002" // ロクケラトプス（赤・バニラ・Lv1 1000 / 2コア3000 / 3コア4000）
const G = "BS01-050" // ビートビートル（緑・バニラ・Lv1 1000 / Lv2 2000・系統 殻虫）
const METAL = "BS01-008" // メタルバーン（赤・8コアで8000）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・5コアで8000）
const PERI = "BS01-052" // ペリリィフ（緑・Lv2 4000。自分のリザーブにコアがある間+2000）
const DD = "BS01-117" // ダブルドロー（赤・コスト4・メイン:2枚ドロー／フラッシュ:スピリット1体BP+2000）
const HAMMER = "BS03-144" // マジックハンマー（青・コスト4）
const COFFIN = "BS01-131" // ダークコフィン（紫・コスト7・メイン:疲労スピリット1体破壊）
const BIND = "BS01-134" // バインディングソーン（緑・コスト2・フラッシュ:相手スピリット1体疲労）
const BURST1 = "SD06-013" // 双翼乱舞（バースト持ちマジック）
const BURST2 = "SD06-016" // 絶甲氷盾（バースト持ちマジック）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [KAPIPPA]: "カピッパ", [CAT]: "カルミオン・キャット", [IRAS]: "イラス・バード", [RIO]: "呪術士リオ",
        [GREIEL]: "天使グレイエル", [SEGU]: "神獣セグー", [GIRL]: "アマゾネス・ガール", [QUEEN]: "アマゾネス・クィーン", [FERN]: "黄玉の女王フェルネイト",
        [HORUS]: "ホルス・ジェッター", [TOMB]: "輝く三連王墓", [JUNGLE]: "密林の秘境都市", [NEFER]: "ネフェルウアーブ",
        [SPARK]: "リバーシブルスパーク", [CLEO]: "魅惑の覇王クレオパトラス",
        [R]: "ロクケラトプス", [G]: "ビートビートル", [METAL]: "メタルバーン", [HERA]: "ヘラクレス・ジオ", [PERI]: "ペリリィフ",
        [DD]: "ダブルドロー", [HAMMER]: "マジックハンマー", [COFFIN]: "ダークコフィン", [BIND]: "バインディングソーン",
        [BURST1]: "双翼乱舞", [BURST2]: "絶甲氷盾",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
}

// ---- 道具 ----
const OPP_DRAW = ["相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11", "相手.手札: なし → ロクケラトプス"] // 自分のエンド後、相手のターン開始
const DD_COST = ["自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 6"] // 赤コスト4（自分の場に赤シンボルなし）
const DD_MAIN = [
    "自分.手札: ダブルドロー → ロクケラトプス、ロクケラトプス", "自分.デッキ枚数: 40 → 38", "自分.トラッシュ: なし → ダブルドロー", ...DD_COST,
]
// 相手の場の赤スピリット（敵R）の赤シンボル1つで軽減1：コスト4→3（リザーブ 10-3+ライフダメージ分1＝8、トラッシュのコア3）
const DD_OPP_FLASH_REDUCED = ["相手.手札: ダブルドロー → なし", "相手.トラッシュ: なし → ダブルドロー", "相手.トラッシュのコア: 0 → 3"]
const DD_OPP_FLASH = ["相手.手札: ダブルドロー → なし", "相手.トラッシュ: なし → ダブルドロー", "相手.トラッシュのコア: 0 → 4", "相手.リザーブ: 10 → 6"]

const pidOf = (t: ScenarioCtx, side: Side) => (side === "me" ? t.me : t.opp)

function need(t: ScenarioCtx, side: Side) {
    const pc = t.state.pendingChoice
    if (!pc || pc.pid !== pidOf(t, side)) throw new Error(`${side} の選択待ちが立っていない`)
    return pc
}
function yes(t: ScenarioCtx, side: Side): void {
    const option = need(t, side).options?.[0]
    if (option === undefined) throw new Error("確認の選択肢が無い")
    t.act(side, { type: "resolveChoice", option })
}
function skip(t: ScenarioCtx, side: Side): void {
    need(t, side)
    t.act(side, { type: "resolveChoice" })
}
function chooseOption(t: ScenarioCtx, side: Side, includes: string): void {
    const o = need(t, side).options?.find((x) => x.includes(includes))
    if (o === undefined) throw new Error(`選択肢に ${includes} が無い`)
    t.act(side, { type: "resolveChoice", option: o })
}
function chooseTrash(t: ScenarioCtx, side: Side, cardId: string): void {
    need(t, side)
    const cardIndex = t.state.players[pidOf(t, side)].trashCards.indexOf(cardId)
    assert(cardIndex >= 0, `トラッシュに ${cardId} がある`)
    t.act(side, { type: "resolveChoice", cardIndex })
}
function chooseRevealed(t: ScenarioCtx, side: Side, cardId: string): void {
    need(t, side)
    const cardIndex = (t.state.revealedCards?.cardIds ?? []).indexOf(cardId)
    assert(cardIndex >= 0, `公開中に ${cardId} がある`)
    t.act(side, { type: "resolveChoice", cardIndex })
}
// 優先権が side に無ければ、相手が1回パスして回す
function giveFlash(t: ScenarioCtx, side: Side): void {
    if (t.state.priorityPlayer !== pidOf(t, side)) t.act(side === "me" ? "opp" : "me", { type: "pass" })
}
const castFlashOnG = (t: ScenarioCtx): void => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") })
// 自分のアタック → 相手がパス → flash（任意）→ フラッシュを閉じる
function myAttack(t: ScenarioCtx, label: string, flash?: () => void): void {
    t.act("me", { type: "attack", instanceId: t.id(label) })
    t.act("opp", { type: "pass" })
    flash?.()
    t.closeFlash()
}
// 相手のアタック → 自分がパス → フラッシュを閉じる
function oppAttack(t: ScenarioCtx, label: string): void {
    t.act("opp", { type: "attack", instanceId: t.id(label) })
    t.act("me", { type: "pass" })
    t.closeFlash()
}
function tryAct(t: ScenarioCtx, side: Side, action: GameAction): void {
    act(t.state, pidOf(t, side), action) // 拒否されても通ってもよい（どちらでも盤面が変わらないことを expect が見る）
}
function abilityId(cardId: string): string {
    const e = getCard(cardId).effects?.find((x) => x.kind === "activated")
    if (!e) throw new Error(`${cardId} に起動効果が無い`)
    return e.id
}
const manyG = (n: number) => Array.from({ length: n }, () => G)
void manyG

// ================= BS17-037 カピッパ =================
// 相手R(2コア3000)が攻撃 → カピッパ(1000)がブロックして破壊される
function kapippa(name: string, mine: SideSpec, oppExtra: { card: string; label?: string; rested?: boolean; cores?: number }[], expect: string[]): void {
    scenario({
        name: `037 ${name}`,
        start: { turn: "opp", phase: "attack", me: mine, opp: { spirits: [{ card: R, label: "攻撃者", cores: 2 }, ...oppExtra] } },
        steps: (t) => {
            oppAttack(t, "攻撃者")
            t.act("me", { type: "block", instanceId: t.id("カピッパ") })
            t.closeFlash()
        },
        expect: ["相手.攻撃者.疲労: false → true", "自分.カピッパ.場所: フィールド → なし", "自分.トラッシュ: なし → カピッパ", ...expect],
    })
}
kapippa("破壊時：光芒持ちを回復", { spirits: [{ card: KAPIPPA }, { card: FERN, label: "F", rested: true }] }, [], ["自分.リザーブ: 10 → 11", "自分.F.疲労: true → false"])
kapippa("光芒を持たない疲労スピリットは回復しない", { spirits: [{ card: KAPIPPA }, { card: G, rested: true }] }, [], ["自分.リザーブ: 10 → 11"])
kapippa("相手の光芒持ちは回復しない", { spirits: [{ card: KAPIPPA }] }, [{ card: FERN, label: "敵F", rested: true }], ["自分.リザーブ: 10 → 11"])
kapippa("Lv2・魔光芒(X05 Lv2)も回復", { spirits: [{ card: KAPIPPA, cores: 2 }, { card: CLEO, label: "X", cores: 2, rested: true }] }, [], ["自分.リザーブ: 10 → 12", "自分.X.疲労: true → false"])
kapippa("X05 Lv1は魔光芒を持たないので回復しない", { spirits: [{ card: KAPIPPA }, { card: CLEO, label: "X", rested: true }] }, [], ["自分.リザーブ: 10 → 11"])

// ================= BS17-038 カルミオン・キャット =================
function cat(name: string, cores: number, bp: string | null): void {
    scenario({
        name: `038 ${name}`,
        start: { me: { hand: [DD], spirits: [{ card: CAT, cores }] } },
        steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
        expect: [...DD_MAIN, ...(bp ? [`自分.カルミオン・キャット.BP: ${bp}`] : [])],
    })
}
cat("Lv2：マジック使用後にBP+2000", 2, "3000 → 5000")
cat("Lv3：マジック使用後にBP+2000", 3, "4000 → 6000")
cat("Lv1は発揮しない", 1, null)
scenario({
    name: "038 相手のマジックでは発揮しない",
    start: { turn: "opp", me: { spirits: [{ card: CAT, cores: 2 }] }, opp: { hand: [DD] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0 }),
    expect: ["相手.手札: ダブルドロー → ロクケラトプス、ロクケラトプス", "相手.デッキ枚数: 40 → 38", "相手.トラッシュ: なし → ダブルドロー", "相手.トラッシュのコア: 0 → 4", "相手.リザーブ: 10 → 6"],
})

// ================= 光芒（039・041・042・045）と各カードのアタック時効果 =================
// 自分のアタック中にフラッシュでDDを使う。光芒持ちなら戦闘後にDDは手札へ戻り、手札・トラッシュは差し引き0
const ATK_BASE = (who: string, symbols: number) => [`自分.${who}.疲労: false → true`, `相手.ライフ: 5 → ${5 - symbols}`, `相手.リザーブ: 10 → ${10 + symbols}`]
const G_BUFF = "自分.ビートビートル.BP: 1000 → 3000"
const RETURNED = [G_BUFF, ...DD_COST]
const STAYED = [G_BUFF, ...DD_COST, "自分.手札: ダブルドロー → なし", "自分.トラッシュ: なし → ダブルドロー"]
function flashAttack(name: string, card: string, cores: number, who: string, symbols: number, expectExtra: string[], opts?: { oppR?: boolean; label?: string }): void {
    scenario({
        name,
        start: { phase: "attack", me: { hand: [DD], spirits: [{ card, cores }, { card: G }] }, opp: { spirits: opts?.oppR ? [{ card: R, label: "敵R" }] : [] } },
        steps: (t) => {
            myAttack(t, who, () => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") }))
            t.act("opp", { type: "takeLife" })
        },
        expect: [...ATK_BASE(who, symbols), ...expectExtra],
    })
}

// 039 イラス・バード
flashAttack("039 光芒：アタック中に使ったマジックは戦闘後に手札へ（Lv1はマジック使用で疲労させない）", IRAS, 1, "イラス・バード", 1, RETURNED, { oppR: true })
flashAttack("039 Lv2：アタック中にマジックを使うと相手スピリットを疲労", IRAS, 2, "イラス・バード", 1, [...RETURNED, "相手.敵R.疲労: false → true"], { oppR: true })
scenario({
    name: "039 アタック前（メイン）に使ったマジックは戻らず、疲労もさせない",
    start: { me: { hand: [DD], spirits: [{ card: IRAS, cores: 2 }] }, opp: { spirits: [{ card: R, label: "敵R" }] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "nextPhase" })
        myAttack(t, "イラス・バード")
        t.act("opp", { type: "takeLife" })
    },
    expect: [...DD_MAIN, ...ATK_BASE("イラス・バード", 1)],
})
scenario({
    name: "039 相手のマジックでは疲労させず、相手のマジックは戻らない",
    start: { phase: "attack", me: { spirits: [{ card: IRAS, cores: 2 }] }, opp: { hand: [DD], spirits: [{ card: R, label: "敵R" }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("イラス・バード") })
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("敵R") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [...ATK_BASE("イラス・バード", 1).map((l) => l.replace("相手.リザーブ: 10 → 11", "相手.リザーブ: 10 → 8")), ...DD_OPP_FLASH_REDUCED, "相手.敵R.BP: 1000 → 3000"],
})

// 045 フェルネイト（光芒のみ・シンボル2）
flashAttack("045 光芒：アタック中に使ったマジックは戦闘後に手札へ", FERN, 1, "黄玉の女王フェルネイト", 2, RETURNED)

// 042 アマゾネス・ガール
flashAttack("042 Lv1：光芒で戻る・回復はしない", GIRL, 1, "アマゾネス・ガール", 1, RETURNED)
scenario({
    name: "042 Lv2：アタック中にマジックを使うと回復する",
    start: { phase: "attack", me: { hand: [DD], spirits: [{ card: GIRL, cores: 2 }, { card: G }] } },
    steps: (t) => {
        myAttack(t, "アマゾネス・ガール", () => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") }))
        t.act("opp", { type: "takeLife" })
    },
    expect: [`相手.ライフ: 5 → 4`, `相手.リザーブ: 10 → 11`, ...RETURNED], // ガールの疲労は 回復で false のまま＝差分なし
})
scenario({
    name: "042 ターンに1回：2回目のマジックでは回復しない",
    start: { phase: "attack", me: { hand: [DD, DD], spirits: [{ card: GIRL, cores: 2 }, { card: G }] }, opp: { hand: [BIND], spirits: [{ card: R, label: "敵R" }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("アマゾネス・ガール") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") }) // 1回目：回復
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("アマゾネス・ガール") }) // 疲労させられる
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") }) // 2回目：回復しない
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.アマゾネス・ガール.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 9", "自分.リザーブ: 10 → 2", "自分.トラッシュのコア: 0 → 8",
        "自分.ビートビートル.BP: 1000 → 5000", "相手.トラッシュのコア: 0 → 2", "相手.手札: バインディングソーン → なし", "相手.トラッシュ: なし → バインディングソーン",
    ],
})
scenario({
    name: "042 相手のマジックでは回復しない",
    start: { phase: "attack", me: { spirits: [{ card: GIRL, cores: 2 }] }, opp: { hand: [DD], spirits: [{ card: R, label: "敵R" }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("アマゾネス・ガール") })
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("敵R") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.アマゾネス・ガール.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 8", "相手.敵R.BP: 1000 → 3000", ...DD_OPP_FLASH_REDUCED],
})

// 041 天使グレイエル
flashAttack("041 Lv3：光芒でアタック中のマジックが戻る", GREIEL, 3, "天使グレイエル", 1, RETURNED)
flashAttack("041 Lv2は光芒を持たず戻らない", GREIEL, 2, "天使グレイエル", 1, STAYED)

function greiel(name: string, spirits: { card: string; label?: string; cores?: number }[], deck: string[], steps: (t: ScenarioCtx) => void, expect: string[], interactive = true): void {
    ;(interactive ? scenarioI : scenario)({
        name: `041 ${name}`,
        start: { me: { spirits, deck: [...deck, ...Array.from({ length: 40 - deck.length }, () => R)] } },
        steps: (t) => {
            t.act("me", { type: "endTurn" })
            steps(t)
        },
        expect: [...OPP_DRAW, ...expect],
    })
}
greiel("エンド：光芒1体で1枚オープンしマジックを手札へ", [{ card: GREIEL }, { card: FERN }], [DD], (t) => yes(t, "me"), ["自分.手札: なし → ダブルドロー", "自分.デッキ枚数: 40 → 39"])
greiel("エンド：魔光芒も数える（2体で2枚。残りは破棄）", [{ card: GREIEL }, { card: FERN }, { card: CLEO, cores: 2 }], [R, DD], (t) => yes(t, "me"),
    ["自分.手札: なし → ダブルドロー", "自分.デッキ枚数: 40 → 38", "自分.トラッシュ: なし → ロクケラトプス"])
greiel("エンド：マジックが2枚あれば1枚を選び、残りは破棄", [{ card: GREIEL }, { card: FERN }, { card: CLEO, cores: 2 }], [DD, HAMMER],
    (t) => { yes(t, "me"); chooseRevealed(t, "me", HAMMER) }, ["自分.手札: なし → マジックハンマー", "自分.デッキ枚数: 40 → 38", "自分.トラッシュ: なし → ダブルドロー"])
greiel("エンド：断ると何も起きない", [{ card: GREIEL }, { card: FERN }], [DD], (t) => skip(t, "me"), [])
greiel("エンド：マジックが無ければ開いたカードは全部破棄", [{ card: GREIEL }, { card: FERN }], [], (t) => yes(t, "me"), ["自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ロクケラトプス"])
greiel("エンド：光芒持ちがいなければ何も開かない", [{ card: GREIEL }], [DD], () => undefined, [], false)
greiel("エンド：Lv3のグレイエル自身も光芒として数える", [{ card: GREIEL, cores: 3 }], [DD], (t) => yes(t, "me"), ["自分.手札: なし → ダブルドロー", "自分.デッキ枚数: 40 → 39"])

// ================= BS17-044 アマゾネス・クィーン =================
const Q_APPEAR = (n: string, bp: number) => [`自分.${n}.場所: なし → フィールド`, `自分.${n}.疲労: なし → false`, `自分.${n}.コア: なし → 1`, `自分.${n}.Lv: なし → 1`, `自分.${n}.BP: なし → ${bp}`]
const COFFIN_OPP = ["相手.リザーブ: 10 → 3", "相手.トラッシュのコア: 0 → 7", "相手.手札: ダークコフィン → なし", "相手.トラッシュ: なし → ダークコフィン"]
function queenBurst(name: string, steps: (t: ScenarioCtx) => void, expect: string[], trash: string[] = [FERN]): void {
    scenarioI({
        name: `044 ${name}`,
        start: { turn: "opp", me: { burst: QUEEN, trash, spirits: [{ card: G, rested: true }] }, opp: { hand: [COFFIN] } },
        steps: (t) => {
            t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") })
            steps(t)
        },
        expect: [...COFFIN_OPP, "自分.ビートビートル.場所: フィールド → なし", ...expect],
    })
}
queenBurst("バースト：相手に破壊されたらコスト無しで召喚し、召喚時に光芒持ちをトラッシュから無償召喚", (t) => {
    yes(t, "me") // バースト発動
    yes(t, "me") // 召喚時の確認
    chooseTrash(t, "me", FERN)
}, ["自分.バースト: アマゾネス・クィーン → なし", "自分.トラッシュ: 黄玉の女王フェルネイト → ビートビートル", "自分.リザーブ: 10 → 9",
    ...Q_APPEAR("アマゾネス・クィーン", 4000), ...Q_APPEAR("黄玉の女王フェルネイト", 4000)])
queenBurst("バーストを発動しない選択", (t) => skip(t, "me"), ["自分.トラッシュ: なし → ビートビートル、黄玉の女王フェルネイト".replace("なし → ", "黄玉の女王フェルネイト → "), "自分.リザーブ: 10 → 11"])
scenario({
    name: "044 自分の効果での破壊ではバーストしない",
    start: { me: { burst: QUEEN, hand: [COFFIN], spirits: [{ card: G, rested: true }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") }),
    expect: ["自分.手札: ダークコフィン → なし", "自分.トラッシュ: なし → ダークコフィン、ビートビートル", "自分.トラッシュのコア: 0 → 7", "自分.リザーブ: 10 → 4", "自分.ビートビートル.場所: フィールド → なし"],
})
scenario({
    name: "044 手札から召喚したときは召喚時の無償召喚が起きない",
    start: { me: { hand: [QUEEN], trash: [FERN] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, level: 1 }),
    expect: ["自分.手札: アマゾネス・クィーン → なし", "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6", ...Q_APPEAR("アマゾネス・クィーン", 4000)],
})
function queenEnd(name: string, cores: number, holders: number, recovered: number): void {
    const hs = Array.from({ length: holders }, (_, i) => ({ card: FERN, label: `F${i + 1}`, rested: true }))
    scenario({
        name: `044 ${name}`,
        start: { me: { spirits: [{ card: QUEEN, cores }, ...hs, { card: G, rested: true }] } },
        steps: (t) => t.act("me", { type: "endTurn" }),
        expect: [...OPP_DRAW, ...Array.from({ length: recovered }, (_, i) => `自分.F${i + 1}.疲労: true → false`)],
    })
}
queenEnd("Lv2エンド：光芒持ち3体を回復（光芒なしは回復しない）", 2, 3, 3)
queenEnd("Lv2エンド：光芒持ちが2体なら2体", 2, 2, 2)
queenEnd("Lv1は回復しない", 1, 3, 0)

// ================= BS17-059 ホルス・ジェッター =================
scenario({
    name: "059 召喚時：相手のスピリットすべてをLv1として扱う（自分には効かない）",
    start: { me: { hand: [HORUS], spirits: [{ card: G, cores: 2 }] }, opp: { spirits: [{ card: R, label: "敵R", cores: 2 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, level: 1 }),
    expect: ["自分.手札: ホルス・ジェッター → なし", "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 5", ...Q_APPEAR("ホルス・ジェッター", 3000), "相手.敵R.Lv: 2 → 1", "相手.敵R.BP: 3000 → 1000"],
})
scenario({
    name: "059 合体条件：系統が合わない相手には合体できない",
    start: { me: { spirits: [{ card: G }, { card: HORUS }] } },
    steps: (t) => t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("ホルス・ジェッター"), hostInstanceId: t.id("ビートビートル") }),
    expect: [],
})
scenario({
    name: "059 合体条件：導魔の呪術士リオに合体できる",
    start: { me: { spirits: [{ card: RIO }, { card: HORUS }] } },
    steps: (t) => t.act("me", { type: "combineBrave", braveInstanceId: t.id("ホルス・ジェッター"), hostInstanceId: t.id("呪術士リオ") }),
    expect: ["自分.呪術士リオ.BP: 2000 → 5000", "自分.呪術士リオ.コア: 1 → 2", "自分.ホルス・ジェッター.BP: 3000 → なし", "自分.ホルス・ジェッター.コア: 1 → 0", "自分.ホルス・ジェッター.場所: フィールド → 合体"],
})
scenario({
    name: "059 合体条件：雄将のカルミオン・キャットに合体できる",
    start: { me: { spirits: [{ card: CAT }, { card: HORUS }] } },
    steps: (t) => t.act("me", { type: "combineBrave", braveInstanceId: t.id("ホルス・ジェッター"), hostInstanceId: t.id("カルミオン・キャット") }),
    expect: ["自分.カルミオン・キャット.BP: 2000 → 6000", "自分.カルミオン・キャット.コア: 1 → 2", "自分.カルミオン・キャット.Lv: 1 → 2", "自分.ホルス・ジェッター.BP: 3000 → なし", "自分.ホルス・ジェッター.コア: 1 → 0", "自分.ホルス・ジェッター.場所: フィールド → 合体"],
})

// ================= BS17-069 輝く三連王墓 =================
function tombFlash(name: string, nexusCores: number, hand: string[], expect: string[]): void {
    scenario({
        name: `069 ${name}`,
        start: { phase: "attack", me: { hand, spirits: [{ card: G }], nexuses: [{ card: TOMB, cores: nexusCores }] }, opp: {} },
        steps: (t) => {
            t.act("me", { type: "attack", instanceId: t.id("ビートビートル") })
            t.act("opp", { type: "pass" })
            tryAct(t, "me", { type: "activateAbility", instanceId: t.id("輝く三連王墓"), effectId: abilityId(TOMB) })
            const idx = t.state.pendingChoice?.cardIndices?.[0]
            if (idx !== undefined) t.act("me", { type: "resolveChoice", cardIndex: idx })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.ビートビートル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", ...expect],
    })
}
tombFlash("Lv1：マジックを破棄してBP+3000", 0, [DD], ["自分.ビートビートル.BP: 1000 → 4000", "自分.手札: ダブルドロー → なし", "自分.トラッシュ: なし → ダブルドロー"])
tombFlash("Lv2でも同じ", 2, [DD], ["自分.ビートビートル.BP: 1000 → 4000", "自分.手札: ダブルドロー → なし", "自分.トラッシュ: なし → ダブルドロー"])
tombFlash("手札にマジックが無ければ何も起きない", 0, [R], [])
scenario({
    name: "069 メインステップでは使えない",
    start: { me: { hand: [DD], spirits: [{ card: G }], nexuses: [{ card: TOMB, cores: 0 }] } },
    steps: (t) => tryAct(t, "me", { type: "activateAbility", instanceId: t.id("輝く三連王墓"), effectId: abilityId(TOMB) }),
    expect: [],
})
function tombSave(name: string, o: { nexusCores: number; nexusRested?: boolean; unit: string; mine?: boolean; answer?: "yes" | "skip" | "none" }, expect: string[]): void {
    const unitSpec = { card: o.unit, label: "U" }
    const nexus = o.nexusRested === undefined ? { card: TOMB, cores: o.nexusCores } : { card: TOMB, cores: o.nexusCores, rested: o.nexusRested }
    const ans = o.answer ?? "yes"
    scenarioI({
        name: `069 ${name}`,
        start: o.mine
            ? { phase: "attack", me: { spirits: [unitSpec], nexuses: [nexus] }, opp: { spirits: [{ card: METAL, label: "敵メタル", cores: 8 }] } }
            : { turn: "opp", phase: "attack", me: { spirits: [unitSpec], nexuses: [nexus] }, opp: { spirits: [{ card: METAL, label: "敵メタル", cores: 8 }] } },
        steps: (t) => {
            if (o.mine) {
                myAttack(t, "U")
                t.act("opp", { type: "block", instanceId: t.id("敵メタル") })
            } else {
                oppAttack(t, "敵メタル")
                t.act("me", { type: "block", instanceId: t.id("U") })
            }
            t.closeFlash()
            if (ans === "yes") yes(t, "me")
            if (ans === "skip") skip(t, "me")
        },
        expect: ["相手.敵メタル.疲労: false → true", ...expect],
    })
}
const SAVED = (n: string) => [`自分.${n}.疲労: false → true`, "自分.輝く三連王墓.疲労: false → true"]
tombSave("Lv2：光芒持ちが相手に破壊されたらネクサスを疲労させて疲労状態で残す（相手のアタック）", { nexusCores: 2, unit: FERN }, SAVED("U"))
tombSave("Lv2：自分のアタックでも同じ", { nexusCores: 2, unit: FERN, mine: true }, SAVED("U"))
tombSave("Lv1は残せない", { nexusCores: 0, unit: FERN, answer: "none" }, ["自分.U.場所: フィールド → なし", "自分.トラッシュ: なし → 黄玉の女王フェルネイト", "自分.リザーブ: 10 → 11"])
tombSave("光芒を持たないスピリットは残せない", { nexusCores: 2, unit: G, answer: "none" }, ["自分.U.場所: フィールド → なし", "自分.トラッシュ: なし → ビートビートル", "自分.リザーブ: 10 → 11"])
tombSave("確認を断れば破壊される", { nexusCores: 2, unit: FERN, answer: "skip" }, ["自分.U.場所: フィールド → なし", "自分.トラッシュ: なし → 黄玉の女王フェルネイト", "自分.リザーブ: 10 → 11"])
tombSave("ネクサスが疲労していれば残せない", { nexusCores: 2, nexusRested: true, unit: FERN, answer: "none" }, ["自分.U.場所: フィールド → なし", "自分.トラッシュ: なし → 黄玉の女王フェルネイト", "自分.リザーブ: 10 → 11"])

// ================= BS17-070 密林の秘境都市 =================
const milled4 = "ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス"
function jungleMill(name: string, nexusCores: number, deckTop: string[], expect: string[], hammers = 1, owner: "me" | "opp" = "me"): void {
    const deck = [...deckTop, ...Array.from({ length: 40 - deckTop.length }, () => R)]
    scenario({
        name: `070 ${name}`,
        start: { turn: "opp", me: { deck, nexuses: [{ card: JUNGLE, cores: nexusCores }] }, opp: { hand: Array.from({ length: hammers }, () => HAMMER) } },
        steps: (t) => {
            for (let i = 0; i < hammers; i++) t.act("opp", { type: "castMagic", handIndex: 0 })
            void owner
        },
        expect: [`相手.手札: ${Array.from({ length: hammers }, () => "マジックハンマー").join("、")} → なし`, `相手.トラッシュ: なし → ${Array.from({ length: hammers }, () => "マジックハンマー").join("、")}`,
            `相手.トラッシュのコア: 0 → ${4 * hammers}`, `相手.リザーブ: 10 → ${10 - 4 * hammers}`, ...expect],
    })
}
jungleMill("相手に破棄されたバースト持ちを手札に加える", 0, [BURST1], ["自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${milled4}`, "自分.手札: なし → 双翼乱舞"])
jungleMill("Lv2でも同じ", 2, [BURST1], ["自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${milled4}`, "自分.手札: なし → 双翼乱舞"])
jungleMill("バースト持ちが2枚ならどちらも手札へ", 0, [BURST1, R, BURST2], ["自分.デッキ枚数: 40 → 35", "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス", "自分.手札: なし → 双翼乱舞、絶甲氷盾"])
jungleMill("バースト持ちが無ければ何も起きない", 0, [], ["自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス`])
jungleMill("さらにこのターンの間、自分のデッキは破棄されない（2回目のハンマーは空振り）", 0, [BURST1], ["自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${milled4}`, "自分.手札: なし → 双翼乱舞"], 2)
scenario({
    name: "070 自分が相手のデッキを破棄しても手札に加えない",
    start: { me: { hand: [HAMMER], nexuses: [{ card: JUNGLE, cores: 0 }] }, opp: { deck: [BURST1, R, R, R, R, ...Array.from({ length: 35 }, () => R)] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
    expect: ["自分.手札: マジックハンマー → なし", "自分.トラッシュ: なし → マジックハンマー", "自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 6", "相手.デッキ枚数: 40 → 35", `相手.トラッシュ: なし → ${milled4}、双翼乱舞`],
})
function jungleAtk(name: string, nexusCores: number, expectDraw: boolean, casts = 1, mainCast = false): void {
    const hand = Array.from({ length: casts }, () => DD)
    scenario({
        name: `070 ${name}`,
        start: { phase: mainCast ? "main" : "attack", me: { hand, spirits: [{ card: G }], nexuses: [{ card: JUNGLE, cores: nexusCores }] } },
        steps: (t) => {
            if (mainCast) {
                t.act("me", { type: "castMagic", handIndex: 0 })
                return
            }
            t.act("me", { type: "attack", instanceId: t.id("ビートビートル") })
            t.act("opp", { type: "pass" })
            for (let i = 0; i < casts; i++) {
                giveFlash(t, "me")
                t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") })
            }
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: mainCast
            ? [...DD_MAIN]
            : ["自分.ビートビートル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", `自分.ビートビートル.BP: 1000 → ${1000 + 2000 * casts}`,
                "自分.トラッシュのコア: 0 → " + 4 * casts, "自分.リザーブ: 10 → " + (10 - 4 * casts), "自分.トラッシュ: なし → " + Array.from({ length: casts }, () => "ダブルドロー").join("、"),
                `自分.手札: ${hand.map(() => "ダブルドロー").join("、")} → ${expectDraw ? "ロクケラトプス" : "なし"}`, ...(expectDraw ? ["自分.デッキ枚数: 40 → 39"] : [])],
    })
}
jungleAtk("Lv2：アタックステップでマジックを使うと1枚ドロー", 2, true)
jungleAtk("Lv1はドローしない", 0, false)
jungleAtk("ターンに1回：2回目のマジックではドローしない", 2, true, 2)
scenario({
    name: "070 Lv2でもメインステップのマジックではドローしない",
    start: { me: { hand: [DD], nexuses: [{ card: JUNGLE, cores: 2 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
    expect: DD_MAIN,
})

// ================= BS17-081 ネフェルウアーブ =================
scenario({
    name: "081 フラッシュ：スピリット1体をBP+3000",
    start: { phase: "attack", me: { hand: [NEFER], spirits: [{ card: G }] } },
    steps: (t) => {
        myAttack(t, "ビートビートル", () => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") }))
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ビートビートル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "自分.ビートビートル.BP: 1000 → 4000", "自分.手札: ネフェルウアーブ → なし", "自分.トラッシュ: なし → ネフェルウアーブ", "自分.トラッシュのコア: 0 → 3", "自分.リザーブ: 10 → 7"],
})
function neferBurst(name: string, lv: string, pay: boolean): void {
    const lost = lv === "2"
    const bp = (lost ? 4000 : 6000) + (pay ? 3000 : 0)
    scenarioI({
        name: `081 ${name}`,
        start: { turn: "opp", me: { burst: NEFER, spirits: [{ card: G, rested: true }] }, opp: { hand: [COFFIN], spirits: [{ card: PERI, label: "敵ペリ", cores: 2 }] } },
        steps: (t) => {
            t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") })
            yes(t, "me") // バースト発動
            chooseOption(t, "me", lv)
            if (pay) yes(t, "me")
            else skip(t, "me")
        },
        expect: [...COFFIN_OPP, "自分.ビートビートル.場所: フィールド → なし", "自分.バースト: ネフェルウアーブ → なし",
            `自分.トラッシュ: なし → ${pay ? "ネフェルウアーブ、ビートビートル" : "ネフェルウアーブ、ビートビートル"}`, `自分.リザーブ: 10 → ${pay ? 8 : 11}`, ...(pay ? ["自分.トラッシュのコア: 0 → 3"] : []),
            ...(bp !== 6000 ? [`相手.敵ペリ.BP: 6000 → ${bp}`] : [])],
    })
}
neferBurst("バースト：Lv2を指定すると相手のLv2スピリットは効果を失う（払わない）", "2", false)
neferBurst("バースト：Lv1を指定してもLv2スピリットは効果を失わない", "1", false)
neferBurst("バースト：その後コストを払うとフラッシュ効果も発揮", "2", true)

// ================= BS17-082 リバーシブルスパーク =================
scenario({
    name: "082 自分のアタック：BPを入れ替えると強いアタッカーが負ける",
    start: { phase: "attack", me: { hand: [SPARK], spirits: [{ card: HERA, label: "A", cores: 5 }] }, opp: { spirits: [{ card: R, label: "敵R" }] } },
    steps: (t) => {
        myAttack(t, "A")
        t.act("opp", { type: "block", instanceId: t.id("敵R") })
        giveFlash(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
    },
    expect: ["自分.A.場所: フィールド → なし", "自分.手札: リバーシブルスパーク → なし", "自分.トラッシュ: なし → ヘラクレス・ジオ、リバーシブルスパーク", "自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 11", "相手.敵R.疲労: false → true"],
})
scenario({
    name: "082 相手のアタック：自分が防御側でも入れ替わる",
    start: { turn: "opp", phase: "attack", me: { hand: [SPARK], spirits: [{ card: R, label: "盾" }] }, opp: { spirits: [{ card: HERA, label: "攻撃者", cores: 5 }] } },
    steps: (t) => {
        oppAttack(t, "攻撃者")
        t.act("me", { type: "block", instanceId: t.id("盾") })
        giveFlash(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
    },
    expect: ["相手.攻撃者.場所: フィールド → なし", "相手.トラッシュ: なし → ヘラクレス・ジオ", "相手.リザーブ: 10 → 15", "自分.盾.疲労: false → true", "自分.手札: リバーシブルスパーク → なし", "自分.トラッシュ: なし → リバーシブルスパーク", "自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 6"],
})

// ================= BS17-X05 魅惑の覇王クレオパトラス =================
const CLEO_NAME = "魅惑の覇王クレオパトラス"
function cleoBurst(name: string, life: number, expect: string[]): void {
    scenarioI({
        name: `X05 ${name}`,
        start: { turn: "opp", phase: "attack", me: { life, burst: CLEO }, opp: { spirits: [{ card: R, label: "攻撃者" }] } },
        steps: (t) => {
            oppAttack(t, "攻撃者")
            t.act("me", { type: "takeLife" })
            if (t.state.pendingChoice) yes(t, "me")
        },
        expect: ["相手.攻撃者.疲労: false → true", `自分.ライフ: ${life} → ${life - 1}`, ...expect],
    })
}
cleoBurst("バースト：ライフ減少後に3以下ならコスト無しで召喚", 4, ["自分.バースト: 魅惑の覇王クレオパトラス → なし", ...Q_APPEAR(CLEO_NAME, 5000)])
// 「〜のとき召喚する」の条件はバースト効果の解決時に見る（2026-10-22 ユーザー確認。BURST.md §5.5）：発動はでき、召喚は起きず、カードはトラッシュへ行く
cleoBurst("バースト：減少後のライフが4なら召喚しない", 5, ["自分.リザーブ: 10 → 11", "自分.バースト: 魅惑の覇王クレオパトラス → なし", "自分.トラッシュ: なし → 魅惑の覇王クレオパトラス"])
function cleoSummon(name: string, trash: string[], steps: (t: ScenarioCtx) => void, expect: string[]): void {
    scenarioI({
        name: `X05 ${name}`,
        start: { me: { hand: [CLEO], trash } },
        steps: (t) => {
            t.act("me", { type: "summon", handIndex: 0, level: 1 })
            steps(t)
        },
        expect: ["自分.リザーブ: 10 → 2", "自分.トラッシュのコア: 0 → 7", ...Q_APPEAR(CLEO_NAME, 5000), ...expect],
    })
}
cleoSummon("召喚時：トラッシュのマジック1枚を手札に戻す", [DD, HAMMER], (t) => chooseTrash(t, "me", DD),
    [`自分.手札: ${CLEO_NAME} → ダブルドロー`, "自分.トラッシュ: ダブルドロー、マジックハンマー → マジックハンマー"])
cleoSummon("召喚時：トラッシュにマジックが無ければ何も戻らない", [R], () => undefined, [`自分.手札: ${CLEO_NAME} → なし`])
function cleoAtk(name: string, cores: number, flow: (t: ScenarioCtx) => void, expect: string[], opp?: boolean): void {
    scenarioI({
        name: `X05 ${name}`,
        start: { phase: "attack", me: { hand: opp ? [] : [DD], spirits: [{ card: CLEO, cores }, { card: G }] }, opp: { hand: opp ? [DD] : [], spirits: opp ? [{ card: R, label: "敵R" }] : [] } },
        steps: flow,
        expect: [`自分.${CLEO_NAME}.疲労: false → true`, "相手.ライフ: 5 → 4", `相手.リザーブ: 10 → ${opp ? 8 : 11}`, ...expect], // 相手のマジックはコスト4－敵Rの赤シンボル軽減1＝3
    })
}
const cast = (t: ScenarioCtx) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ビートビートル") })
cleoAtk("Lv2 魔光芒：マジックの効果をもう1度発揮し、戦闘後に手札へ戻す", 2, (t) => {
    myAttack(t, CLEO_NAME, () => { cast(t); yes(t, "me") })
    t.act("opp", { type: "takeLife" })
}, ["自分.ビートビートル.BP: 1000 → 5000", ...DD_COST])
cleoAtk("Lv2 魔光芒：もう1度は断れる", 2, (t) => {
    myAttack(t, CLEO_NAME, () => { cast(t); skip(t, "me") })
    t.act("opp", { type: "takeLife" })
}, [G_BUFF, ...DD_COST])
cleoAtk("Lv1は魔光芒を持たず、再発揮も回収もしない", 1, (t) => {
    myAttack(t, CLEO_NAME, () => cast(t))
    t.act("opp", { type: "takeLife" })
}, [...STAYED])
scenario({
    name: "X05 Lv2：アタック前のメインのマジックは再発揮しない",
    start: { me: { hand: [DD], spirits: [{ card: CLEO, cores: 2 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
    expect: DD_MAIN,
})
cleoAtk("Lv2：相手のマジックでは再発揮しない", 2, (t) => {
    t.act("me", { type: "attack", instanceId: t.id(CLEO_NAME) })
    t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("敵R") })
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}, ["相手.敵R.BP: 1000 → 3000", ...DD_OPP_FLASH_REDUCED], true)

// ================= BS17-043 神獣セグー =================
const BURST_USED = (n: number) => [
    `自分.手札: ${Array.from({ length: n }, () => "双翼乱舞").join("、")} → ${Array.from({ length: 2 * n }, () => "ロクケラトプス").join("、")}`,
    `自分.デッキ枚数: 40 → ${40 - 2 * n}`, `自分.トラッシュ: なし → ${Array.from({ length: n }, () => "双翼乱舞").join("、")}`,
    `自分.トラッシュのコア: 0 → ${4 * n}`, `自分.リザーブ: 10 → ${10 - 4 * n}`,
]
function segu(name: string, o: { attacker: string; hand: string[]; segu?: boolean; uses: number; main?: boolean }, expect: string[], rejected = false): void {
    const spirits = [{ card: o.attacker, label: "攻撃者", cores: o.attacker === CLEO ? 2 : 1 }, ...(o.segu === false ? [] : [{ card: SEGU }])]
    scenarioI({
        name: `043 ${name}`,
        start: { phase: o.main ? "main" : "attack", me: { hand: o.hand, spirits } },
        steps: (t) => {
            const use = (): void => {
                const a: GameAction = { type: "useHandBurstEffect", handIndex: 0 }
                if (rejected) { t.actRejected("me", a); return }
                t.act("me", a)
                if (t.state.pendingChoice) skip(t, "me") // 「その後コストを支払うことで」は払わない
            }
            if (o.main) { use(); return }
            myAttack(t, "攻撃者", () => { for (let i = 0; i < o.uses; i++) { giveFlash(t, "me"); use() } })
            t.act("opp", { type: "takeLife" })
        },
        expect: o.main ? expect : [...ATK_BASE("攻撃者", o.attacker === FERN ? 2 : 1), ...expect],
    })
}
segu("光芒持ちのアタック中、手札のバースト効果を発揮（カードはトラッシュ・光芒で戻らない）", { attacker: FERN, hand: [BURST1], uses: 1 }, BURST_USED(1))
segu("アタック中は何回でも発揮できる", { attacker: FERN, hand: [BURST1, BURST1], uses: 2 }, BURST_USED(2))
segu("魔光芒(X05 Lv2)のアタック中でも発揮できる", { attacker: CLEO, hand: [BURST1], uses: 1 }, BURST_USED(1))
segu("光芒を持たないスピリットのアタック中は使えない", { attacker: G, hand: [BURST1], uses: 1 }, [], true)
segu("アタック中でなければ使えない", { attacker: FERN, hand: [BURST1], uses: 0, main: true }, [], true)
segu("バースト効果を持たないマジックは対象外", { attacker: FERN, hand: [DD], uses: 1 }, [], true)
segu("セグーが場にいなければ使えない", { attacker: FERN, hand: [BURST1], segu: false, uses: 1 }, [], true)

console.log("すべてのチェックに合格しました 🎉（part621）")
