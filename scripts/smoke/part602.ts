// smoke パート602（沈黙していた効果節の場面テストC：賛美するパイプオルガン ほか21枚）
import { act, assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"

const RED = "BS01-002" // ロクケラトプス（赤・バニラ）
const YELLOW = "BS02-051" // チュンポポ
const PURPLE = "BS03-013" // ヘルスコルピオ
const WHITE = "BS01-074" // バーサーカー・ガン
const BLUE = "BS06-061" // ドルフィーノ
const GREEN = "BS01-050" // ビートビートル
const BLUE4 = "BS05-049" // 狼人ウルフィ（コスト4・バニラ）
const BLUE5 = "BS03-091" // 戦闘獣バン・ファロー（コスト5・バニラ）
const COFFIN = "BS01-131" // ダークコフィン（紫・メイン：疲労状態のスピリット1体を破壊）
const HAMMER = "BS03-144" // マジックハンマー（青・メイン：相手のデッキを上から5枚破棄）

const ORGAN = "BS14-085"
const LESSER = "BS14-004"
const MUSHA = "BS14-031"
const GRAVITY = "BS08-062"
const VALLEY = "BS14-074"
const PHOENIX = "BS10-062"
const KAKUREIN = "BS10-069"
const FENRIR = "BS10-071"
const ONIYURIN = "BS10-075"
const BAZOOKA = "BS10-076"
const GAI = "BS10-X01"
const JANBI = "BS11-049"
const RACCOON = "BS14-035"
const MOJI = "BS14-042"
const SEIMEI = "BS14-X02"
const GYOKU = "BS10-077"
const FORT = "BS10-059"
const HERCULES = "BS11-X03"
const SWORD = "BS11-064"
const DIAMOND = "BS14-070"
const PENTAN = "BS14-049"

const ELIXIR = "BS01-142" // ピュアエリクサー（白・フラッシュ：自分の疲労スピリットすべて回復）
const FLAME = "BS01-121" // フレイムダンス（赤・フラッシュ：BP4000以下のスピリット1体を破壊）
const RIBBON = "BS01-146" // ドリームリボン（白・フラッシュ：相手のスピリット1体を手札に戻す）
const BIND = "BS01-134" // バインディングソーン（緑・フラッシュ：相手のスピリット1体を疲労）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [ORGAN]: "賛美するパイプオルガン", [LESSER]: "レッサー・ドラグサウルス", [MUSHA]: "ムシャ・エイプウィップ",
        [GRAVITY]: "超時空重力炉", [VALLEY]: "千識の渓谷", [PHOENIX]: "砲凰竜フェニック・キャノン",
        [KAKUREIN]: "千刀鳥カクレイン", [FENRIR]: "フェンリルキャノンType-B", [ONIYURIN]: "オニユリン",
        [BAZOOKA]: "バズーカ・アームズ", [GAI]: "幻羅星龍ガイ・アスラ", [JANBI]: "ジャンビ・オレピス",
        [RACCOON]: "ラクーンガード", [MOJI]: "鉄の機人モージ", [SEIMEI]: "呪の覇王カオティック・セイメイ",
        [GYOKU]: "ギョクリューン", [FORT]: "フォート・ゴレム", [HERCULES]: "星騎士ハーキュリーΩ",
        [SWORD]: "闇の聖剣", [DIAMOND]: "ダイヤドカリ", [PENTAN]: "執事ペンタン",
        [RED]: "ロクケラトプス", [YELLOW]: "チュンポポ", [PURPLE]: "ヘルスコルピオ", [WHITE]: "バーサーカー・ガン",
        [BLUE]: "ドルフィーノ", [GREEN]: "ビートビートル", [BLUE4]: "狼人ウルフィ",
        [BLUE5]: "戦闘獣バン・ファロー", [COFFIN]: "ダークコフィン", [HAMMER]: "マジックハンマー", [ELIXIR]: "ピュアエリクサー", [FLAME]: "フレイムダンス", [RIBBON]: "ドリームリボン", [BIND]: "バインディングソーン",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => RED)
    s.players.p2.deck = Array.from({ length: 40 }, () => RED)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
void handleAction

function setTurn(s: GameState, pid: PlayerId): void {
    s.turnPlayer = pid
    s.priorityPlayer = pid
    s.phase = "main"
}
function closeFlash(s: GameState): void {
    while (s.isFlashTiming && s.battle) if (act(s, s.priorityPlayer, { type: "pass" })) break
}
function ok(err: string | null, msg: string): void {
    assert(err === null, `${msg}${err === null ? "" : `（拒否: ${err}）`}`)
}
function rejected(err: string | null, msg: string): void {
    assert(err !== null, `${msg}（拒否されるはず）`)
}
// 合体させて p1 のアタックステップへ。ブレイヴはスピリット状態で場に置いてから合体する
function combine(s: GameState, host: ReturnType<typeof put>, brave: ReturnType<typeof put>): void {
    ok(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }), "合体できる")
}

// ---- BS14-085 賛美するパイプオルガン ----
console.log("=== 1. パイプオルガン: 相手のターンに効果で回復した赤のスピリットは破壊される ===")
scenario({
    name: "organ-destroy",
    start: {
        turn: "opp",
        me: { nexuses: [{ card: ORGAN, cores: 2 }] },
        opp: { hand: [ELIXIR], spirits: [{ card: RED, rested: true }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
    },
    expect: [
        "相手.手札: ピュアエリクサー → なし",
        "相手.トラッシュ: なし → ピュアエリクサー、ロクケラトプス",
        "相手.リザーブ: 10 → 8",
        "相手.トラッシュのコア: 0 → 3",
        "相手.ロクケラトプス.場所: フィールド → なし",
    ],
})
console.log("=== 2. パイプオルガン: 自分のターンに回復しても破壊されない ===")
scenario({
    name: "organ-own-turn",
    start: {
        turn: "me",
        me: { hand: [ELIXIR], nexuses: [{ card: ORGAN, cores: 2 }], spirits: [{ card: RED, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
    },
    expect: [
        "自分.手札: ピュアエリクサー → なし",
        "自分.トラッシュ: なし → ピュアエリクサー",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ロクケラトプス.疲労: true → false",
    ],
})
console.log("=== 3. パイプオルガン: 黄のスピリットは対象の色ではない ===")
scenario({
    name: "organ-yellow",
    start: {
        turn: "opp",
        me: { nexuses: [{ card: ORGAN, cores: 2 }] },
        opp: { hand: [ELIXIR], spirits: [{ card: YELLOW, rested: true }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
    },
    expect: [
        "相手.手札: ピュアエリクサー → なし",
        "相手.トラッシュ: なし → ピュアエリクサー",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
        "相手.チュンポポ.疲労: true → false",
    ],
})
console.log("=== 3b. パイプオルガン: Lv1（コア1）では発揮されない ===")
scenario({
    name: "organ-lv1",
    start: {
        turn: "opp",
        me: { nexuses: [{ card: ORGAN, cores: 1 }] },
        opp: { hand: [ELIXIR], spirits: [{ card: RED, rested: true }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
    },
    expect: [
        "相手.手札: ピュアエリクサー → なし",
        "相手.トラッシュ: なし → ピュアエリクサー",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
        "相手.ロクケラトプス.疲労: true → false",
    ],
})

// ---- BS14-004 レッサー・ドラグサウルス ----
console.log("=== 4. レッサー: バーストをセットしているアタック時、相手のネクサス1つを破壊 ===")
scenario({
    name: "lesser-burst",
    start: {
        me: { spirits: [{ card: LESSER, cores: 3 }], burst: RED },
        opp: { nexuses: [{ card: VALLEY }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("レッサー・ドラグサウルス") })
        t.closeFlash()
    },
    expect: [
        "自分.レッサー・ドラグサウルス.疲労: false → true",
        "相手.千識の渓谷.場所: ネクサス → なし",
        "相手.トラッシュ: なし → 千識の渓谷",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 5. レッサー: バーストをセットしていなければ破壊しない ===")
scenario({
    name: "lesser-noburst",
    start: {
        me: { spirits: [{ card: LESSER, cores: 3 }] },
        opp: { nexuses: [{ card: VALLEY }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("レッサー・ドラグサウルス") })
        t.closeFlash()
    },
    expect: ["自分.レッサー・ドラグサウルス.疲労: false → true"],
})
console.log("=== 5b. レッサー: Lv1ではアタック時効果は無い ===")
scenario({
    name: "lesser-lv1",
    start: {
        me: { spirits: [{ card: LESSER, cores: 1 }], burst: RED },
        opp: { nexuses: [{ card: VALLEY }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("レッサー・ドラグサウルス") })
        t.closeFlash()
    },
    expect: ["自分.レッサー・ドラグサウルス.疲労: false → true"],
})

// ---- BS14-031 ムシャ・エイプウィップ ----
console.log("=== 6. ムシャ: バーストをセットしている召喚時、ボイドからコア2個をリザーブへ ===")
scenario({
    name: "musha-burst",
    start: { me: { hand: [MUSHA], burst: RED } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ムシャ・エイプウィップ → なし",
        "自分.ムシャ・エイプウィップ.場所: なし → フィールド",
        "自分.ムシャ・エイプウィップ.疲労: なし → false",
        "自分.ムシャ・エイプウィップ.コア: なし → 1",
        "自分.ムシャ・エイプウィップ.Lv: なし → 1",
        "自分.ムシャ・エイプウィップ.BP: なし → 3000",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 5",
    ],
})
console.log("=== 7. ムシャ: バーストをセットしていなければコアは増えない ===")
scenario({
    name: "musha-noburst",
    start: { me: { hand: [MUSHA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ムシャ・エイプウィップ → なし",
        "自分.ムシャ・エイプウィップ.場所: なし → フィールド",
        "自分.ムシャ・エイプウィップ.疲労: なし → false",
        "自分.ムシャ・エイプウィップ.コア: なし → 1",
        "自分.ムシャ・エイプウィップ.Lv: なし → 1",
        "自分.ムシャ・エイプウィップ.BP: なし → 3000",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
    ],
})

// ---- BS08-062 超時空重力炉 ----
console.log("=== 8. 重力炉: Lv2の自分のメインステップ、召喚するときシンボルが白3つになる ===")
scenario({
    name: "gravity-self",
    start: { me: { hand: [MOJI], nexuses: [{ card: GRAVITY, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 鉄の機人モージ → なし",
        "自分.鉄の機人モージ.場所: なし → フィールド",
        "自分.鉄の機人モージ.疲労: なし → false",
        "自分.鉄の機人モージ.コア: なし → 1",
        "自分.鉄の機人モージ.Lv: なし → 1",
        "自分.鉄の機人モージ.BP: なし → 4000",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
    ],
})
console.log("=== 9. 重力炉: 相手が召喚するときは自分のネクサスのシンボルは増えない ===")
scenario({
    name: "gravity-opp",
    start: { turn: "opp", me: { nexuses: [{ card: GRAVITY, cores: 1 }] }, opp: { hand: [MOJI] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.手札: 鉄の機人モージ → なし",
        "相手.鉄の機人モージ.場所: なし → フィールド",
        "相手.鉄の機人モージ.疲労: なし → false",
        "相手.鉄の機人モージ.コア: なし → 1",
        "相手.鉄の機人モージ.Lv: なし → 1",
        "相手.鉄の機人モージ.BP: なし → 4000",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 6",
    ],
})

// ---- BS14-074 千識の渓谷 ----
console.log("=== 10. 渓谷: 手札の「覇皇」を持つスピリットに軽減シンボル[赤]が付く ===")
scenario({
    name: "valley-grant",
    start: { me: { hand: [SEIMEI], nexuses: [{ card: VALLEY, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 呪の覇王カオティック・セイメイ → なし",
        "自分.呪の覇王カオティック・セイメイ.場所: なし → フィールド",
        "自分.呪の覇王カオティック・セイメイ.疲労: なし → false",
        "自分.呪の覇王カオティック・セイメイ.コア: なし → 1",
        "自分.呪の覇王カオティック・セイメイ.Lv: なし → 1",
        "自分.呪の覇王カオティック・セイメイ.BP: なし → 5000",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
    ],
})
console.log("=== 11. 渓谷: 系統が違う手札のスピリットには付かない ===")
scenario({
    name: "valley-nogrant",
    start: { me: { hand: [BLUE4], nexuses: [{ card: VALLEY, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 狼人ウルフィ → なし",
        "自分.狼人ウルフィ.場所: なし → フィールド",
        "自分.狼人ウルフィ.疲労: なし → false",
        "自分.狼人ウルフィ.コア: なし → 1",
        "自分.狼人ウルフィ.Lv: なし → 1",
        "自分.狼人ウルフィ.BP: なし → 4000",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
    ],
})

// ---- BS10-062 砲凰竜フェニック・キャノン 【激突】 ----
console.log("=== 12. フェニック: 合体アタックで相手は可能ならブロックしなければならない ===")
{
    const s = game("phoenix-on")
    const host = put(s, "p1", BLUE4)
    const brave = put(s, "p1", PHOENIX)
    put(s, "p2", BLUE)
    combine(s, host, brave)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "アタック")
    closeFlash(s)
    rejected(act(s, "p2", { type: "takeLife" }), "ブロックできるスピリットがいるのでライフで受けられない")
    ok(act(s, "p2", { type: "block", instanceId: s.players.p2.field.spirits[0]!.instanceId }), "ブロックはできる")
}
console.log("=== 13. フェニック: 合体していなければ強制ブロックは無い ===")
{
    const s = game("phoenix-off")
    const host = put(s, "p1", BLUE4)
    put(s, "p1", PHOENIX)
    put(s, "p2", BLUE)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "アタック")
    closeFlash(s)
    ok(act(s, "p2", { type: "takeLife" }), "ブロックせずライフで受けられる")
}

// ---- BS10-069 千刀鳥カクレイン 【暴風：2】 ----
console.log("=== 14. カクレイン: ブロックされたとき相手は自分のスピリット2体を疲労させる ===")
{
    const s = game("kakurein-on")
    const host = put(s, "p1", BLUE5)
    const brave = put(s, "p1", KAKUREIN)
    for (let i = 0; i < 3; i++) put(s, "p2", BLUE)
    combine(s, host, brave)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "アタック")
    closeFlash(s)
    ok(act(s, "p2", { type: "block", instanceId: s.players.p2.field.spirits[0]!.instanceId }), "ブロック")
    assert(s.players.p2.field.spirits.filter((x) => x.isRested).length === 3, "ブロックした1体のほかに2体が疲労して、3体とも疲労状態")
}
console.log("=== 15. カクレイン: 合体していなければ疲労させられない ===")
{
    const s = game("kakurein-off")
    const host = put(s, "p1", BLUE5)
    put(s, "p1", KAKUREIN)
    for (let i = 0; i < 3; i++) put(s, "p2", BLUE)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "アタック")
    closeFlash(s)
    ok(act(s, "p2", { type: "block", instanceId: s.players.p2.field.spirits[0]!.instanceId }), "ブロック")
    assert(s.players.p2.field.spirits.filter((x) => x.isRested).length === 1, "疲労しているのはブロックした1体だけ")
}

// ---- BS10-075 オニユリン 【聖命】 ----
console.log("=== 16. オニユリン: 合体アタックで相手のライフを減らしたとき、ボイドから自分のライフにコア1個 ===")
{
    const s = game("oniyurin-on")
    const host = put(s, "p1", BLUE5)
    const brave = put(s, "p1", ONIYURIN)
    combine(s, host, brave)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "アタック")
    closeFlash(s)
    const before = s.players.p1.life
    ok(act(s, "p2", { type: "takeLife" }), "ライフで受ける")
    assert(s.players.p1.life === before + 1, `自分のライフが1増える（${before} → ${s.players.p1.life}）`)
}
console.log("=== 17. オニユリン: 合体していなければライフは増えない ===")
{
    const s = game("oniyurin-off")
    const host = put(s, "p1", BLUE5)
    put(s, "p1", ONIYURIN)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "アタック")
    closeFlash(s)
    const before = s.players.p1.life
    ok(act(s, "p2", { type: "takeLife" }), "ライフで受ける")
    assert(s.players.p1.life === before, `自分のライフは増えない（${before} → ${s.players.p1.life}）`)
}

// ---- BS10-076 バズーカ・アームズ 【強襲：1】 ----
function bazookaGame(seed: string, combined: boolean) {
    const s = game(seed, true)
    const host = put(s, "p1", BLUE) // 効果を持たない
    const brave = put(s, "p1", BAZOOKA)
    const nex = createInstance(VALLEY, 2, 2)
    s.players.p1.field.nexuses.push(nex)
    put(s, "p2", BLUE, 1, true)
    if (combined) combine(s, host, brave)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "アタック")
    return { s, host, nex }
}
console.log("=== 18. バズーカ: 合体アタック時、ネクサスを疲労させて回復できる（発動する） ===")
{
    const { s, host, nex } = bazookaGame("bazooka-yes", true)
    assert(s.pendingChoice?.kind === "option", "発動確認が出る")
    ok(act(s, "p1", { type: "resolveChoice", option: "発動する" }), "発動する")
    assert(nex.isRested === true && host.isRested === false, `ネクサスが疲労しスピリットが回復（ネクサス疲労=${nex.isRested}・スピリット疲労=${host.isRested}）`)
}
console.log("=== 19. バズーカ: 発動を断ればネクサスもスピリットもそのまま ===")
{
    const { s, host, nex } = bazookaGame("bazooka-no", true)
    assert(s.pendingChoice?.kind === "option", "発動確認が出る")
    const err = act(s, "p1", { type: "resolveChoice" })
    ok(err, "断る")
    assert(nex.isRested === false && host.isRested === true, `断ったので変化なし（ネクサス疲労=${nex.isRested}・スピリット疲労=${host.isRested}）`)
}
console.log("=== 20. バズーカ: 合体していなければ強襲は発揮されない ===")
{
    const { s, host, nex } = bazookaGame("bazooka-off", false)
    assert(s.pendingChoice === null, "発動確認は出ない")
    assert(nex.isRested === false && host.isRested === true, "変化なし")
}

// ---- BS10-071 フェンリルキャノンType-B 【装甲：赤/紫】 ----
function fenrirGame(seed: string, combined: boolean) {
    const s = game(seed)
    const host = put(s, "p1", BLUE4, 1, true)
    const brave = put(s, "p1", FENRIR)
    s.players.p2.hand = [COFFIN, RIBBON]
    if (combined) combine(s, host, brave)
    ok(act(s, "p1", { type: "endTurn" }), "ターンを終える")
    assert(s.turnPlayer === "p2", "相手のターンになる")
    return { s, host }
}
console.log("=== 21. フェンリル: 合体中は相手の紫のマジックの対象にできない ===")
{
    const { s, host } = fenrirGame("fenrir-purple", true)
    rejected(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: host.instanceId }), "紫の疲労スピリット破壊を合体スピリットに撃つ")
}
console.log("=== 22. フェンリル: 合体中でも相手の白のマジックは受ける ===")
{
    const { s, host } = fenrirGame("fenrir-white", true)
    ok(act(s, "p2", { type: "castMagic", handIndex: 1, targetInstanceId: host.instanceId }), "白の手札戻しを合体スピリットに撃つ")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "合体スピリットが手札へ戻る")
}
console.log("=== 23. フェンリル: 合体していなければ紫のマジックで破壊される ===")
{
    const { s, host } = fenrirGame("fenrir-off", false)
    ok(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: host.instanceId }), "紫のマジックを撃つ")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "破壊される")
}

// ---- BS10-X01 幻羅星龍ガイ・アスラ 【超覚醒】 ----
function gaiGame(seed: string) {
    const s = game(seed)
    const gai = put(s, "p1", GAI, 1, true)
    const ally = put(s, "p1", RED, 3)
    const enemy = put(s, "p2", BLUE, 3)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: ally.instanceId }), "味方でアタック")
    ok(act(s, "p2", { type: "pass" }), "相手がパス")
    return { s, gai, ally, enemy }
}
console.log("=== 24. ガイ・アスラ: フラッシュで自分のスピリットのコアを置くと回復する ===")
{
    const { s, gai, ally } = gaiGame("gai-on")
    ok(act(s, "p1", { type: "awaken", instanceId: gai.instanceId, fromInstanceId: ally.instanceId, count: 2 }), "超覚醒")
    assert(gai.cores === 3 && ally.cores === 1, `コアが2個移る（ガイ${gai.cores}・味方${ally.cores}）`)
    assert(gai.isRested === false, "コアを置いたので回復する")
}
console.log("=== 25. ガイ・アスラ: 相手のスピリットのコアは置けない ===")
{
    const { s, gai, enemy } = gaiGame("gai-enemy")
    rejected(act(s, "p1", { type: "awaken", instanceId: gai.instanceId, fromInstanceId: enemy.instanceId, count: 2 }), "相手のスピリットからは置けない")
    assert(gai.isRested === true && gai.cores === 1, "何も起きない")
}

// ---- BS11-049 ジャンビ・オレピス 【覚醒】 ----
function janbiGame(seed: string, combined: boolean) {
    const s = game(seed)
    const host = put(s, "p1", BLUE4, 1)
    const brave = put(s, "p1", JANBI)
    const ally = put(s, "p1", RED, 3)
    put(s, "p2", BLUE, 1, true)
    if (combined) combine(s, host, brave)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "アタック")
    ok(act(s, "p2", { type: "pass" }), "相手がパス")
    return { s, host, ally }
}
console.log("=== 26. ジャンビ: 合体中のスピリットへフラッシュでコアを置ける ===")
{
    const { s, host, ally } = janbiGame("janbi-on", true)
    const before = host.cores
    ok(act(s, "p1", { type: "awaken", instanceId: host.instanceId, fromInstanceId: ally.instanceId, count: 2 }), "覚醒")
    assert(host.cores === before + 2 && ally.cores === 1, `コアが2個移る（${before} → ${host.cores}・味方${ally.cores}）`)
}
console.log("=== 27. ジャンビ: 合体していなければ覚醒できない ===")
{
    const { s, host, ally } = janbiGame("janbi-off", false)
    rejected(act(s, "p1", { type: "awaken", instanceId: host.instanceId, fromInstanceId: ally.instanceId, count: 2 }), "覚醒を持たない")
}

// ---- BS14-035 ラクーンガード / BS14-042 鉄の機人モージ 【重装甲】 ----
function oppMainWith(seed: string, pid: PlayerId, cardId: string, cores: number) {
    const s = game(seed)
    const inst = put(s, pid, cardId, cores)
    setTurn(s, pid === "p1" ? "p2" : "p1")
    s.players[pid === "p1" ? "p2" : "p1"].hand = [RIBBON, FLAME, BIND]
    return { s, inst }
}
console.log("=== 28. ラクーンガード: Lv2は相手の白のマジックを受けない ===")
{
    const { s, inst } = oppMainWith("raccoon-white", "p1", RACCOON, 2)
    rejected(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: inst.instanceId }), "白のマジックを対象にする")
}
console.log("=== 29. ラクーンガード: Lv2でも赤のマジックは受ける ===")
{
    const { s, inst } = oppMainWith("raccoon-red", "p1", RACCOON, 2)
    ok(act(s, "p2", { type: "castMagic", handIndex: 1, targetInstanceId: inst.instanceId }), "赤のマジックを対象にする")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === inst.instanceId), "破壊される")
}
console.log("=== 30. ラクーンガード: Lv1は重装甲を持たない ===")
{
    const { s, inst } = oppMainWith("raccoon-lv1", "p1", RACCOON, 1)
    ok(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: inst.instanceId }), "白のマジックを対象にする")
}
console.log("=== 31. モージ: 緑のマジックを受けない ===")
{
    const { s, inst } = oppMainWith("moji-green", "p1", MOJI, 1)
    rejected(act(s, "p2", { type: "castMagic", handIndex: 2, targetInstanceId: inst.instanceId }), "緑のマジックを対象にする")
}
console.log("=== 32. モージ: 白のマジックは受ける ===")
{
    const { s, inst } = oppMainWith("moji-white", "p1", MOJI, 1)
    ok(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: inst.instanceId }), "白のマジックを対象にする")
}

// ---- BS14-X02 呪の覇王カオティック・セイメイ 【呪滅撃】 ----
console.log("=== 33. セイメイ: Lv3で相手に破壊されるとき、相手のライフを1つ払って回復状態で残る ===")
{
    const s = game("seimei-on")
    const inst = put(s, "p1", SEIMEI, 4, true)
    setTurn(s, "p2")
    s.players.p2.hand = [COFFIN]
    ok(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: inst.instanceId }), "紫の破壊マジック")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === inst.instanceId), "場に残る")
    assert(inst.isRested === false, "回復状態になる")
    assert(s.players.p2.life === 4, `相手のライフが1減る（5 → ${s.players.p2.life}）`)
}
console.log("=== 34. セイメイ: Lv2では呪滅撃は無く破壊される ===")
{
    const s = game("seimei-lv2")
    const inst = put(s, "p1", SEIMEI, 3, true)
    setTurn(s, "p2")
    s.players.p2.hand = [COFFIN]
    ok(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: inst.instanceId }), "紫の破壊マジック")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === inst.instanceId), "破壊される")
    assert(s.players.p2.life === 5, "相手のライフは減らない")
}
console.log("=== 35. セイメイ: 自分の効果による破壊では発揮されない ===")
{
    const s = game("seimei-own")
    const inst = put(s, "p1", SEIMEI, 4, true)
    s.players.p1.hand = [COFFIN]
    ok(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: inst.instanceId }), "自分で紫の破壊マジック")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === inst.instanceId), "破壊される")
    assert(s.players.p2.life === 5, "相手のライフは減らない")
}

// ---- BS10-077 ギョクリューン ----
function gyokuGame(seed: string, combined: boolean) {
    const s = game(seed)
    const host = put(s, "p1", BLUE4)
    const brave = put(s, "p1", GYOKU)
    const blocker = put(s, "p2", BLUE)
    s.players.p2.hand = [BIND]
    if (combined) combine(s, host, brave)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "アタック")
    closeFlash(s)
    ok(act(s, "p2", { type: "block", instanceId: blocker.instanceId }), "ブロック")
    while (s.priorityPlayer !== "p2") ok(act(s, s.priorityPlayer, { type: "pass" }), "パス")
    const before = s.players.p2.reserve
    ok(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: host.instanceId }), "バトル中にマジックを使う")
    return before - s.players.p2.reserve
}
console.log("=== 36. ギョクリューン: 合体スピリットのバトル中、相手のマジックは2コスト余分 ===")
assert(gyokuGame("gyoku-on", true) === 4, "コスト2のマジックに4コスト払う")
console.log("=== 37. ギョクリューン: 合体していなければ余分は無い ===")
assert(gyokuGame("gyoku-off", false) === 2, "コスト2のマジックに2コストだけ払う")

// ---- BS10-059 フォート・ゴレム ----
console.log("=== 38. フォート: 自分のネクサスがある間、手札のコストが4になる ===")
scenario({
    name: "fort-nexus",
    start: { me: { hand: [FORT], nexuses: [{ card: VALLEY, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: フォート・ゴレム → なし",
        "自分.フォート・ゴレム.場所: なし → フィールド",
        "自分.フォート・ゴレム.疲労: なし → false",
        "自分.フォート・ゴレム.コア: なし → 1",
        "自分.フォート・ゴレム.Lv: なし → 1",
        "自分.フォート・ゴレム.BP: なし → 4000",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
    ],
})
console.log("=== 39. フォート: ネクサスが無ければ本来のコスト6 ===")
scenario({
    name: "fort-nonexus",
    start: { me: { hand: [FORT] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: フォート・ゴレム → なし",
        "自分.フォート・ゴレム.場所: なし → フィールド",
        "自分.フォート・ゴレム.疲労: なし → false",
        "自分.フォート・ゴレム.コア: なし → 1",
        "自分.フォート・ゴレム.Lv: なし → 1",
        "自分.フォート・ゴレム.BP: なし → 4000",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
    ],
})

// ---- BS11-X03 星騎士ハーキュリーΩ ----
console.log("=== 40. ハーキュリー: ライフ3以下の間、手札のコストが4になる ===")
scenario({
    name: "hercules-life3",
    start: { me: { life: 3, hand: [HERCULES] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 星騎士ハーキュリーΩ → なし",
        "自分.星騎士ハーキュリーΩ.場所: なし → フィールド",
        "自分.星騎士ハーキュリーΩ.疲労: なし → false",
        "自分.星騎士ハーキュリーΩ.コア: なし → 1",
        "自分.星騎士ハーキュリーΩ.Lv: なし → 1",
        "自分.星騎士ハーキュリーΩ.BP: なし → 6000",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
    ],
})
console.log("=== 41. ハーキュリー: ライフ4なら本来のコスト7 ===")
scenario({
    name: "hercules-life4",
    start: { me: { life: 4, hand: [HERCULES] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 星騎士ハーキュリーΩ → なし",
        "自分.星騎士ハーキュリーΩ.場所: なし → フィールド",
        "自分.星騎士ハーキュリーΩ.疲労: なし → false",
        "自分.星騎士ハーキュリーΩ.コア: なし → 1",
        "自分.星騎士ハーキュリーΩ.Lv: なし → 1",
        "自分.星騎士ハーキュリーΩ.BP: なし → 6000",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
    ],
})

// ---- BS14-070 ダイヤドカリ ----
console.log("=== 42. ダイヤドカリ: スピリット状態ではアタックできない ===")
{
    const s = game("diamond")
    const brave = put(s, "p1", DIAMOND)
    const host = put(s, "p1", BLUE4)
    put(s, "p2", BLUE)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    rejected(act(s, "p1", { type: "attack", instanceId: brave.instanceId }), "スピリット状態のブレイヴでアタック")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "ほかのスピリットはアタックできる")
}
console.log("=== 43. ダイヤドカリ: 合体したあとは合体スピリットとしてアタックできる ===")
{
    const s = game("diamond-combined")
    const brave = put(s, "p1", DIAMOND)
    const host = put(s, "p1", BLUE4)
    put(s, "p2", BLUE)
    combine(s, host, brave)
    ok(act(s, "p1", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p1", { type: "attack", instanceId: host.instanceId }), "合体スピリットでアタック")
}

// ---- BS11-064 闇の聖剣 ----
function swordGame(seed: string, withSword: boolean) {
    const s = game(seed, true)
    setTurn(s, "p2")
    if (withSword) s.players.p1.field.nexuses.push(createInstance(SWORD, s.turn - 1, 1))
    const victim = put(s, "p1", RED)
    const attacker = put(s, "p2", "BS03-099") // 虎拳士タイガ（BP5000）
    s.players.p1.trashCards = ["BS16-016"] // ボアトリクター（【不死：コスト3/4】）
    ok(act(s, "p2", { type: "nextPhase" }), "アタックステップへ")
    ok(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }), "アタック")
    for (let i = 0; i < 3 && s.isFlashTiming; i++) ok(act(s, s.priorityPlayer, { type: "pass" }), "パス")
    ok(act(s, "p1", { type: "block", instanceId: victim.instanceId }), "コスト1のスピリットでブロック")
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle && !s.pendingChoice; i++) ok(act(s, s.priorityPlayer, { type: "pass" }), "パス")
    return s
}
console.log("=== 44. 闇の聖剣: 破壊された自分のスピリットはコスト3/4としても扱われ【不死：コスト3/4】を誘発する ===")
{
    const s = swordGame("sword-on", true)
    assert(s.pendingChoice?.pid === "p1" && s.pendingChoice.prompt.includes("不死"), `【不死】の確認が出る（${s.pendingChoice?.prompt ?? "なし"}）`)
}
console.log("=== 45. 闇の聖剣: 無ければコスト1のスピリットの破壊では【不死：コスト3/4】は誘発しない ===")
{
    const s = swordGame("sword-off", false)
    assert(s.pendingChoice === null, `【不死】の確認は出ない（${s.pendingChoice?.prompt ?? "なし"}）`)
}

// ---- BS14-049 執事ペンタン ----
function pentanGame(seed: string, deckTop: string) {
    const s = game(seed, true)
    setTurn(s, "p2")
    s.players.p1.deck = [deckTop, ...Array.from({ length: 39 }, () => RED)]
    s.players.p2.hand = [HAMMER, HAMMER]
    ok(act(s, "p2", { type: "castMagic", handIndex: 0 }), "相手がデッキ破棄のマジックを使う")
    return s
}
console.log("=== 46. ペンタン: 相手のデッキ破棄で破棄されたとき、無償で召喚でき、以後デッキは破棄されない ===")
{
    const s = pentanGame("pentan-summon", PENTAN)
    assert(s.pendingChoice?.pid === "p1", "召喚の確認が自分に出る")
    ok(act(s, "p1", { type: "resolveChoice", option: "召喚する" }), "召喚する")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === PENTAN), "執事ペンタンが場に出る")
    assert(s.players.p1.deck.length === 39, `残りの破棄は止まる（デッキ ${s.players.p1.deck.length}枚）`)
    ok(act(s, "p2", { type: "castMagic", handIndex: 0 }), "もう一度デッキ破棄")
    assert(s.players.p1.deck.length === 39, `このターンはもう破棄されない（デッキ ${s.players.p1.deck.length}枚）`)
}
console.log("=== 47. ペンタン: 召喚を断っても以後のデッキ破棄は止まりトラッシュに残る ===")
{
    const s = pentanGame("pentan-decline", PENTAN)
    ok(act(s, "p1", { type: "resolveChoice" }), "断る")
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === PENTAN), "場には出ない")
    assert(s.players.p1.trashCards.includes(PENTAN), "トラッシュに残る")
    assert(s.players.p1.deck.length === 39, `残りの破棄は止まる（デッキ ${s.players.p1.deck.length}枚）`)
}
console.log("=== 48. ペンタン: 別のカードが破棄されても何も起きない ===")
{
    const s = pentanGame("pentan-other", RED)
    assert(s.pendingChoice === null, "確認は出ない")
    assert(s.players.p1.deck.length === 35, `5枚破棄される（デッキ ${s.players.p1.deck.length}枚）`)
}

console.log("すべてのチェックに合格しました 🎉（part602）")
