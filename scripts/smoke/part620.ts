// smoke パート620（BS17 白：期待値役が効果文だけから書いた場面テスト）
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, ScenarioSpec, Side } from "./scenario"

const RED1 = "BS01-002" // ロクケラトプス（赤・バニラ。Lv1 1000／Lv2 2コア3000）
const WHT1 = "BS01-074" // バーサーカー・ガン（白・バニラ。Lv1 1000／Lv2 3000）
const WHT2 = "BS01-084" // ガトリングスタンド（白・バニラ。Lv1 3000）
const KIJU = "BS07-029" // キグナ・スワン（白・機獣・バニラ）
const GUNA = "BS09-034" // 風花の戦乙女グナ（白・氷壁：緑/青）
const GH = "BS01-030" // グリプ・ハンズ（召喚時：1枚ドロー）
const BIND = "BS01-134" // バインディングソーン（緑・フラッシュ：相手のスピリット1体を疲労）
const RIB = "BS01-146" // ドリームリボン（白・フラッシュ：相手のスピリット1体を手札に戻す）
const FLAME = "BS01-121" // フレイムダンス（赤・フラッシュ：BP4000以下のスピリット1体を破壊）
const COFFIN = "BS01-131" // ダークコフィン（紫・メイン：疲労状態のスピリット1体を破壊）
const HAM = "BS03-144" // マジックハンマー（青・メイン：相手のデッキ5枚破棄）
const BRAVE_R = "BS11-049" // ジャンビ・オレピス（赤・ブレイヴ・合体条件コスト3以上）
const BRAVE_W = "BS11-055" // ジャノメ・シールダー（白・ブレイヴ・合体条件コスト3以上）
const BRAVE_P = "BS10-066" // 騎士王蛇ペンドラゴン（紫・ブレイヴ・合体条件コスト3以上）
const BRAVE_B = "BS11-059" // レチクル・アームズ（青・ブレイヴ・合体条件コスト3以上）
const BRAVE_G = "BS12-053" // オオヅツナナフシ（緑・ブレイヴ・合体条件コスト3以上）
const BIG5 = "BS03-091" // 戦闘獣バン・ファロー（青・コスト5・バニラ）

const CARIBOU = "BS17-028"
const BICKEN = "BS17-029"
const GEFION = "BS17-031"
const LAV = "BS17-032"
const RAIL = "BS17-033"
const ERIK = "BS17-034"
const DREAD = "BS17-035"
const HARALD = "BS17-036"
const OSE = "BS17-058"
const FJORD = "BS17-067"
const END = "BS17-068"
const PARRY = "BS17-079"
const QUEL = "BS17-080"
const FENRIR = "BS17-X04"

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [RED1]: "ロクケラトプス", [WHT1]: "バーサーカー・ガン", [WHT2]: "ガトリングスタンド", [KIJU]: "キグナ・スワン",
        [GUNA]: "風花の戦乙女グナ", [GH]: "グリプ・ハンズ", [BIND]: "バインディングソーン", [RIB]: "ドリームリボン",
        [FLAME]: "フレイムダンス", [COFFIN]: "ダークコフィン", [HAM]: "マジックハンマー", [BRAVE_R]: "ジャンビ・オレピス",
        [BRAVE_W]: "ジャノメ・シールダー", [BRAVE_P]: "騎士王蛇ペンドラゴン", [BRAVE_B]: "レチクル・アームズ",
        [BRAVE_G]: "オオヅツナナフシ", [BIG5]: "戦闘獣バン・ファロー",
        [CARIBOU]: "ストリーム・カリブー", [BICKEN]: "リトル・ビッケン", [GEFION]: "豊穣の女神ゲフィオン",
        [LAV]: "ヴァイキング・レイヴ", [RAIL]: "レールガンフィッシュ", [ERIK]: "レッド・エイリーク",
        [DREAD]: "金剛戦艦ドレッドノーグ", [HARALD]: "キング・ハーラル", [OSE]: "オーセベリング",
        [FJORD]: "凍えるフィヨルド", [END]: "最果ての大地", [PARRY]: "フリージングパリィ",
        [QUEL]: "クヴェルドウールヴ", [FENRIR]: "神狼機獣ラグナ・フェンリル",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
}

const other = (s: Side): Side => (s === "me" ? "opp" : "me")
type Pending = NonNullable<GameState["pendingChoice"]>
function pend(t: ScenarioCtx, side: Side, kind: Pending["kind"]): Pending {
    const pc = t.state.pendingChoice
    assert(pc !== null, "選択待ちが立つ")
    assert(pc!.pid === (side === "me" ? t.me : t.opp), `選択待ちの回答者は${side}`)
    assert(pc!.kind === kind, `選択待ちの種別は${kind}（実際: ${pc!.kind}）`)
    return pc!
}
function yes(t: ScenarioCtx, side: Side): void {
    const pc = pend(t, side, "option")
    t.act(side, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
}
function no(t: ScenarioCtx, side: Side): void {
    pend(t, side, "option")
    t.act(side, { type: "resolveChoice" })
}
function pick(t: ScenarioCtx, side: Side, label: string): void {
    const pc = pend(t, side, "target")
    assert(pc.candidates?.includes(t.id(label)) === true, `${label} が候補に入る`)
    t.act(side, { type: "resolveChoice", instanceId: t.id(label) })
}
function candidatesExclude(t: ScenarioCtx, side: Side, hit: string[], miss: string[]): void {
    const pc = pend(t, side, "target")
    for (const l of hit) assert(pc.candidates?.includes(t.id(l)) === true, `${l} は候補に入る`)
    for (const l of miss) assert(pc.candidates?.includes(t.id(l)) !== true, `${l} は候補に入らない`)
}
function noPending(t: ScenarioCtx): void {
    assert(t.state.pendingChoice === null, "選択待ちは立たない")
}
// アタック宣言から、防御側が最初にパスしてブロック宣言できる状態まで進める
function declareAttack(t: ScenarioCtx, atk: Side, label: string): void {
    t.act(atk, { type: "attack", instanceId: t.id(label) })
    t.act(other(atk), { type: "pass" })
    t.act(atk, { type: "pass" })
}
function cast(t: ScenarioCtx, side: Side, index = 0): void {
    t.act(side, { type: "castMagic", handIndex: index })
}
function bp(t: ScenarioCtx, label: string): number {
    return effectiveBp(t.state, t.inst(label).instanceId === "" ? t.me : t.me, t.inst(label))
}
void bp

// マジックの使用コストの差分（手札1枚・コスト c・手札の名前 n）
const castLines = (who: "自分" | "相手", name: string, cost: number, handBefore = name, handAfter = "なし", trashBefore = "なし", trashAfter = name, reserve = 10, tcores = 0) => [
    `${who}.手札: ${handBefore} → ${handAfter}`,
    `${who}.トラッシュ: ${trashBefore} → ${trashAfter}`,
    `${who}.リザーブ: ${reserve} → ${reserve - cost}`,
    `${who}.トラッシュのコア: ${tcores} → ${tcores + cost}`,
]
const R3 = "ロクケラトプス、ロクケラトプス、ロクケラトプス"
const R5 = "ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス"

// ---- BS17-028 ストリーム・カリブー ----
console.log("=== BS17-028 Lv2 ブロック時 BP+4000 ===")
const caribouStart = (cores: number, withFod = false) => ({
    turn: "opp" as Side, phase: "attack" as const,
    me: { spirits: [{ card: CARIBOU, label: "カリブー", cores }, ...(withFod ? [{ card: RED1, label: "FOD", cores: 2 }] : [])] },
    opp: { spirits: [{ card: RED1, label: "ATK", cores: 2 }] },
})
scenario({
    name: "028 Lv2でブロック → BP+4000", start: caribouStart(2),
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.act("me", { type: "block", instanceId: t.id("カリブー") }) },
    expect: ["相手.ATK.疲労: false → true", "自分.カリブー.疲労: false → true", "自分.カリブー.BP: 3000 → 7000"],
})
scenario({
    name: "028 Lv1ではBP+4000されない", start: caribouStart(1),
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.act("me", { type: "block", instanceId: t.id("カリブー") }) },
    expect: ["相手.ATK.疲労: false → true", "自分.カリブー.疲労: false → true"],
})
scenario({
    name: "028 別のスピリットがブロックしてもカリブーは上がらない", start: caribouStart(2, true),
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.act("me", { type: "block", instanceId: t.id("FOD") }) },
    expect: ["相手.ATK.疲労: false → true", "自分.FOD.疲労: false → true"],
})

// ---- BS17-029 リトル・ビッケン ----
console.log("=== BS17-029 デッキ破棄ターン3枚／Lv2 重装甲 白/青 ===")
const millMe = (extra: string[]) => [...castLines("自分", "マジックハンマー", 4), ...extra]
scenario({
    name: "029 自分側にいる：5枚のはずが3枚", start: { me: { hand: [HAM], spirits: [{ card: BICKEN, label: "ビッケン", cores: 1 }] } },
    steps: (t) => cast(t, "me"),
    expect: millMe(["相手.デッキ枚数: 40 → 37", `相手.トラッシュ: なし → ${R3}`]),
})
scenario({
    name: "029 いなければ5枚（起きない場面）", start: { me: { hand: [HAM], spirits: [{ card: RED1, label: "FOD" }] } },
    steps: (t) => cast(t, "me"),
    expect: millMe(["相手.デッキ枚数: 40 → 35", `相手.トラッシュ: なし → ${R5}`]),
})
scenario({
    name: "029 相手側にいても（お互い）3枚", start: { me: { hand: [HAM] }, opp: { spirits: [{ card: BICKEN, label: "ビッケン", cores: 2 }] } },
    steps: (t) => cast(t, "me"),
    expect: millMe(["相手.デッキ枚数: 40 → 37", `相手.トラッシュ: なし → ${R3}`]),
})
scenario({
    name: "029 同じターンの2回目は破棄されない（合計3枚）", start: { me: { hand: [HAM, HAM], spirits: [{ card: BICKEN, label: "ビッケン", cores: 1 }] } },
    steps: (t) => { cast(t, "me"); cast(t, "me") },
    expect: [
        "自分.手札: マジックハンマー、マジックハンマー → なし", "自分.トラッシュ: なし → マジックハンマー、マジックハンマー",
        "自分.リザーブ: 10 → 2", "自分.トラッシュのコア: 0 → 8", "相手.デッキ枚数: 40 → 37", `相手.トラッシュ: なし → ${R3}`,
    ],
})
scenario({
    name: "029 相手のマジックで自分のデッキを破棄されるときも3枚", start: { turn: "opp", me: { spirits: [{ card: BICKEN, label: "ビッケン", cores: 2 }] }, opp: { hand: [HAM] } },
    steps: (t) => cast(t, "opp"),
    expect: [...castLines("相手", "マジックハンマー", 4), "自分.デッキ枚数: 40 → 37", `自分.トラッシュ: なし → ${R3}`],
})
const bickenArmor = (cores: number) => ({
    turn: "opp" as Side, interactive: true,
    me: { spirits: [{ card: BICKEN, label: "ビッケン", cores }, { card: RED1, label: "FOD", cores: 1 }] },
    opp: { hand: [RIB] },
})
scenario({
    name: "029 Lv2は相手の白の効果を受けない（対象に選べない）", start: bickenArmor(2),
    steps: (t) => { cast(t, "opp"); candidatesExclude(t, "opp", ["FOD"], ["ビッケン"]); pick(t, "opp", "FOD") },
    expect: [...castLines("相手", "ドリームリボン", 4), "自分.FOD.場所: フィールド → なし", "自分.手札: なし → ロクケラトプス", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "029 Lv1は重装甲を持たない（対象に選べる）", start: bickenArmor(1),
    steps: (t) => { cast(t, "opp"); candidatesExclude(t, "opp", ["FOD", "ビッケン"], []); pick(t, "opp", "ビッケン") },
    expect: [...castLines("相手", "ドリームリボン", 4), "自分.ビッケン.場所: フィールド → なし", "自分.手札: なし → リトル・ビッケン", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "029 Lv2でも緑の効果は受ける", start: { ...bickenArmor(2), opp: { hand: [BIND] } },
    steps: (t) => { cast(t, "opp"); candidatesExclude(t, "opp", ["FOD", "ビッケン"], []); pick(t, "opp", "ビッケン") },
    expect: [...castLines("相手", "バインディングソーン", 2), "自分.ビッケン.疲労: false → true"],
})

// ---- BS17-031 豊穣の女神ゲフィオン ----
console.log("=== BS17-031 氷壁：緑/白／Lv2 氷壁持ちは疲労状態でブロックできる ===")
const gefStart = (o: { cores?: number; rested?: boolean; hand?: string[]; turn?: Side } = {}): ScenarioSpec["start"] => ({
    turn: o.turn ?? ("opp" as Side), interactive: true,
    me: { spirits: [{ card: GEFION, label: "ゲフィオン", cores: o.cores ?? 1, rested: o.rested ?? false }, { card: RED1, label: "FOD", cores: 1 }], hand: o.turn === "me" ? (o.hand ?? []) : [] },
    opp: { hand: o.turn === "me" ? [] : (o.hand ?? [BIND]), spirits: o.turn === "me" ? [{ card: RED1, label: "X", cores: 1 }, { card: RED1, label: "Y", cores: 1 }] : [] },
})
scenario({
    name: "031 相手の緑マジックを疲労で無効（Lv1）", start: gefStart(),
    steps: (t) => { cast(t, "opp"); yes(t, "me"); noPending(t) },
    expect: [...castLines("相手", "バインディングソーン", 2), "自分.ゲフィオン.疲労: false → true"],
})
scenario({
    name: "031 断ると効果は解決する", start: gefStart(),
    steps: (t) => { cast(t, "opp"); no(t, "me"); pick(t, "opp", "FOD") },
    expect: [...castLines("相手", "バインディングソーン", 2), "自分.FOD.疲労: false → true"],
})
scenario({
    name: "031 白のマジックも無効にできる（Lv2）", start: gefStart({ cores: 2, hand: [RIB] }),
    steps: (t) => { cast(t, "opp"); yes(t, "me"); noPending(t) },
    expect: [...castLines("相手", "ドリームリボン", 4), "自分.ゲフィオン.疲労: false → true"],
})
scenario({
    name: "031 青のマジックは対象外", start: gefStart({ hand: [HAM] }),
    steps: (t) => { cast(t, "opp"); noPending(t) },
    expect: [...castLines("相手", "マジックハンマー", 4), "自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${R5}`],
})
scenario({
    name: "031 自分のターンの自分のマジックには使えない", start: gefStart({ turn: "me", hand: [BIND] }),
    steps: (t) => { cast(t, "me"); pend(t, "me", "target"); pick(t, "me", "X") },
    expect: [...castLines("自分", "バインディングソーン", 2), "相手.X.疲労: false → true"],
})
scenario({
    name: "031 すでに疲労していれば疲労させられず無効にできない", start: gefStart({ rested: true }),
    steps: (t) => { cast(t, "opp"); pick(t, "opp", "FOD") },
    expect: [...castLines("相手", "バインディングソーン", 2), "自分.FOD.疲労: false → true"],
})
const gefBlock = (o: { gefCores: number; guna?: boolean; fodRested?: boolean }) => ({
    turn: "opp" as Side, phase: "attack" as const,
    me: { spirits: [
        { card: GEFION, label: "ゲフィオン", cores: o.gefCores, rested: !o.guna && !o.fodRested },
        ...(o.guna ? [{ card: GUNA, label: "グナ", cores: 1, rested: true }] : []),
        ...(o.fodRested ? [{ card: RED1, label: "FOD", cores: 1, rested: true }] : []),
    ] },
    opp: { spirits: [{ card: RED1, label: "ATK", cores: 1 }] },
})
const atkDies = ["相手.ATK.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]
scenario({
    name: "031 Lv2：疲労したゲフィオン自身がブロックできる", start: gefBlock({ gefCores: 2 }),
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.act("me", { type: "block", instanceId: t.id("ゲフィオン") }); t.closeFlash() },
    expect: atkDies,
})
scenario({
    name: "031 Lv1は疲労状態でブロックできない", start: gefBlock({ gefCores: 1 }),
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.actRejected("me", { type: "block", instanceId: t.id("ゲフィオン") }) },
    expect: ["相手.ATK.疲労: false → true"],
})
scenario({
    name: "031 Lv2：氷壁を持つ別のスピリット（グナ）も疲労状態でブロックできる", start: gefBlock({ gefCores: 2, guna: true }),
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.act("me", { type: "block", instanceId: t.id("グナ") }); t.closeFlash() },
    expect: atkDies,
})
scenario({
    name: "031 Lv2でも氷壁を持たないスピリットは疲労状態でブロックできない", start: gefBlock({ gefCores: 2, fodRested: true }),
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.actRejected("me", { type: "block", instanceId: t.id("FOD") }) },
    expect: ["相手.ATK.疲労: false → true"],
})

// ---- BS17-032 ヴァイキング・レイヴ ----
console.log("=== BS17-032 バースト／Lv2･3 バトル時 白のスピリット1体につきBP+1000 ===")
const lavBurst = (hand: string[]) => ({ turn: "opp" as Side, interactive: true, me: { burst: LAV }, opp: { hand } })
const ghLines = [
    "相手.グリプ・ハンズ.場所: なし → フィールド", "相手.グリプ・ハンズ.Lv: なし → 1", "相手.グリプ・ハンズ.BP: なし → 2000",
    "相手.グリプ・ハンズ.コア: なし → 1", "相手.グリプ・ハンズ.疲労: なし → false", "相手.手札: グリプ・ハンズ → ロクケラトプス",
    "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 3",
]
scenario({
    name: "032 相手の召喚時発揮後にバースト → 召喚＆相手のメインステップ終了", start: lavBurst([GH]),
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 }); yes(t, "me")
        assert(t.state.phase !== "main", "相手のメインステップが終了した")
    },
    expect: [...ghLines, "自分.バースト: ヴァイキング・レイヴ → なし", "自分.ヴァイキング・レイヴ.場所: なし → フィールド",
        "自分.ヴァイキング・レイヴ.Lv: なし → 1", "自分.ヴァイキング・レイヴ.BP: なし → 4000", "自分.ヴァイキング・レイヴ.コア: なし → 1",
        "自分.ヴァイキング・レイヴ.疲労: なし → false", "自分.リザーブ: 10 → 9"],
})
scenario({
    name: "032 発動しなければ召喚もメイン終了も起きない", start: lavBurst([GH]),
    steps: (t) => { t.act("opp", { type: "summon", handIndex: 0 }); no(t, "me"); assert(t.state.phase === "main", "メインステップは続く") },
    expect: ghLines,
})
scenario({
    name: "032 召喚時効果を持たないスピリットでは発動しない", start: lavBurst([RED1]),
    steps: (t) => { t.act("opp", { type: "summon", handIndex: 0 }); noPending(t) },
    expect: ["相手.ロクケラトプス.場所: なし → フィールド", "相手.ロクケラトプス.Lv: なし → 1", "相手.ロクケラトプス.BP: なし → 1000",
        "相手.ロクケラトプス.コア: なし → 1", "相手.ロクケラトプス.疲労: なし → false", "相手.手札: ロクケラトプス → ロクケラトプス",
        "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1"].filter((l) => !l.startsWith("相手.手札")),
})
const lavBattle = (cores: number, mine: { card: string; label: string }[], oppExtra: { card: string; label: string }[] = []) => ({
    phase: "attack" as const,
    me: { spirits: [{ card: LAV, label: "LAV", cores }, ...mine.map((m) => ({ ...m, cores: 1 }))] },
    opp: { spirits: [{ card: RED1, label: "BLK", cores: 1 }, ...oppExtra.map((m) => ({ ...m, cores: 1 }))] },
})
const lavSteps = (t: ScenarioCtx) => { declareAttack(t, "me", "LAV"); t.act("opp", { type: "block", instanceId: t.id("BLK") }) }
const lavBase = (bpBefore: number, bpAfter: number | null) => ["自分.LAV.疲労: false → true", "相手.BLK.疲労: false → true",
    ...(bpAfter === null ? [] : [`自分.LAV.BP: ${bpBefore} → ${bpAfter}`])]
scenario({
    name: "032 Lv2：白3体（自身含む）でBP+3000", start: lavBattle(2, [{ card: WHT1, label: "W1" }, { card: WHT2, label: "W2" }, { card: RED1, label: "R" }]),
    steps: lavSteps, expect: lavBase(5000, 8000),
})
scenario({
    name: "032 Lv3：白2体でBP+2000", start: lavBattle(4, [{ card: WHT1, label: "W1" }]),
    steps: lavSteps, expect: lavBase(8000, 10000),
})
scenario({
    name: "032 Lv1はバトル時効果なし", start: lavBattle(1, [{ card: WHT1, label: "W1" }]),
    steps: lavSteps, expect: lavBase(4000, null),
})
scenario({
    name: "032 相手の白は数えない", start: lavBattle(2, [{ card: RED1, label: "R" }], [{ card: WHT1, label: "OW" }, { card: WHT2, label: "OW2" }]),
    steps: lavSteps, expect: lavBase(5000, 6000),
})

// ---- 合体を伴う場面（imperative） ----
function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    for (const p of ["p1", "p2"] as const) {
        s.players[p].reserve = 12
        s.players[p].deck = Array.from({ length: 40 }, () => RED1)
        s.players[p].hand = []
    }
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function ok(err: string | null, msg: string): void { assert(err === null, `${msg}${err === null ? "" : `（拒否: ${err}）`}`) }
function ng(err: string | null, msg: string): void { assert(err !== null, `${msg}（拒否されるはず）`) }
function turnOf(s: GameState, pid: PlayerId, phase: "main" | "attack" = "main"): void {
    s.turnPlayer = pid; s.priorityPlayer = pid; s.phase = phase
}
function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof put>, brave: ReturnType<typeof put>): void {
    turnOf(s, pid)
    ok(act(s, pid, { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }), "合体できる")
    refreshLevelAsOverrides(s)
}
const inField = (s: GameState, pid: PlayerId, id: string) =>
    [...s.players[pid].field.spirits, ...s.players[pid].field.combinedBraves].some((x) => x.instanceId === id)
const both = (name: string, fn: (me: PlayerId, opp: PlayerId, s: GameState) => void) => {
    for (const me of ["p1", "p2"] as const) {
        const opp: PlayerId = me === "p1" ? "p2" : "p1"
        console.log(`  --- ${name}｜自分=${me}`)
        fn(me, opp, game(`${name}-${me}`))
    }
}
function answerYes(s: GameState, pid: PlayerId): void {
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === pid && pc.kind === "option", "確認（option）の選択待ちが立つ")
    ok(act(s, pid, { type: "resolveChoice", option: pc!.options?.[0] ?? "" }), "発動を選べる")
}

// ---- BS17-033 レールガンフィッシュ ----
console.log("=== BS17-033 【合体時】Lv2 自分のエンドステップ ブレイヴ1つを手札に戻せる ===")
function railCase(cores: number, combined: boolean, answer: "yes" | "no" | "none"): { s: GameState; me: PlayerId; braveId: string } {
    let out!: { s: GameState; me: PlayerId; braveId: string }
    both(`033 cores${cores} 合体${combined} ${answer}`, (me, opp, s) => {
        const rail = put(s, me, RAIL, cores)
        const brave = put(s, me, BRAVE_W, 1)
        if (combined) combine(s, me, rail, brave)
        turnOf(s, me)
        ok(act(s, me, { type: "endTurn" }), "ターン終了")
        if (answer === "none") assert(s.pendingChoice === null || s.pendingChoice.kind !== "option", "確認は出ない")
        else {
            assert(s.pendingChoice !== null && s.pendingChoice.pid === me, "エンドステップの確認が立つ")
            if (answer === "yes") answerYes(s, me)
            else ok(act(s, me, { type: "resolveChoice" }), "断る")
        }
        const inHand = s.players[me].hand.includes(BRAVE_W)
        assert(inHand === (answer === "yes"), `ブレイヴの手札戻り=${answer === "yes"}`)
        assert(opp !== me, "")
        out = { s, me, braveId: brave.instanceId }
    })
    return out
}
railCase(2, true, "yes")
railCase(2, true, "no")
railCase(1, true, "none")
railCase(2, false, "none")

// ---- BS17-034 レッド・エイリーク ----
console.log("=== BS17-034 アタックステップ開始時のブレイヴ無償召喚／バトル時のデッキトップ戻し ===")
both("034 自分のアタックステップ開始時", (me, opp, s) => {
    put(s, me, ERIK, 1)
    s.players[me].hand = [BRAVE_B]
    turnOf(s, me)
    const reserve = s.players[me].reserve
    ok(act(s, me, { type: "nextPhase" }), "アタックステップへ")
    assert(s.pendingChoice !== null && s.pendingChoice.pid === me, "無償召喚の確認が立つ")
    if (s.pendingChoice!.kind === "option") answerYes(s, me)
    if (s.pendingChoice !== null && s.pendingChoice.kind === "card") ok(act(s, me, { type: "resolveChoice", cardIndex: 0 }), "ブレイヴを選ぶ")
    assert(!s.players[me].hand.includes(BRAVE_B), "ブレイヴが手札から出た")
    assert(s.players[me].reserve >= reserve - 1, "召喚コストは支払わない（置くコア以外は減らない）")
    assert(s.players[me].trashCores === 0, "コストのコアはトラッシュへ行かない")
    assert(opp !== me, "")
})
both("034 相手のアタックステップ開始時にも自分が召喚できる", (me, opp, s) => {
    put(s, me, ERIK, 1)
    put(s, opp, RED1, 1)
    s.players[me].hand = [BRAVE_B]
    turnOf(s, opp)
    ok(act(s, opp, { type: "nextPhase" }), "相手がアタックステップへ")
    assert(s.pendingChoice !== null && s.pendingChoice.pid === me, "自分に無償召喚の確認が立つ")
})
both("034 メインステップ開始時は出ない／手札にブレイヴが無ければ出ない", (me, opp, s) => {
    put(s, me, ERIK, 1)
    s.players[me].hand = [BRAVE_B]
    turnOf(s, me)
    assert(s.pendingChoice === null, "メインステップでは確認が立たない")
    s.players[me].hand = [RED1]
    ok(act(s, me, { type: "nextPhase" }), "アタックステップへ")
    assert(s.pendingChoice === null, "手札にブレイヴが無ければ確認が立たない")
    assert(opp !== me, "")
})
function erikBattle(name: string, erikCores: number, combined: boolean, blockerCores: number, answer: "yes" | "no" | "none"): void {
    both(name, (me, opp, s) => {
        const erik = put(s, me, ERIK, erikCores)
        if (combined) combine(s, me, erik, put(s, me, BRAVE_W, 1))
        const blk = put(s, opp, RED1, blockerCores)
        turnOf(s, me, "attack")
        ok(act(s, me, { type: "attack", instanceId: erik.instanceId }), "アタック")
        ok(act(s, opp, { type: "pass" }), "パス")
        ok(act(s, me, { type: "pass" }), "パス")
        ok(act(s, opp, { type: "block", instanceId: blk.instanceId }), "ブロック")
        const deck = s.players[opp].deck.length
        // バトル解決までフラッシュを閉じる
        let guard = 0
        while (s.isFlashTiming && s.battle && s.pendingChoice === null && guard++ < 6) ok(act(s, s.priorityPlayer, { type: "pass" }), "パス")
        if (answer === "none") {
            assert(s.pendingChoice === null || s.pendingChoice.kind !== "option", "デッキトップ戻しの確認は出ない")
            assert(s.players[opp].deck.length === deck, "デッキは増えない")
        } else {
            assert(s.pendingChoice !== null && s.pendingChoice.pid === me, "デッキトップに戻す確認が自分に立つ")
            if (answer === "yes") answerYes(s, me)
            else ok(act(s, me, { type: "resolveChoice" }), "断る")
            assert((s.players[opp].deck.length === deck + 1) === (answer === "yes"), "破壊した相手のスピリットがデッキの上に戻る/戻らない")
            if (answer === "yes") assert(s.players[opp].deck[0] === RED1 && !s.players[opp].trashCards.includes(RED1), "トラッシュに無くデッキの一番上")
        }
    })
}
erikBattle("034 Lv2 合体 破壊 → 戻す", 2, true, 1, "yes")
erikBattle("034 Lv2 合体 破壊 → 断る", 2, true, 1, "no")
erikBattle("034 Lv1 合体は対象外", 1, true, 1, "none")
erikBattle("034 Lv2 未合体は対象外", 2, false, 1, "none")
erikBattle("034 Lv2 合体 BP同値の相打ちは対象外", 2, true, 3, "none") // Lv2 7000 vs ... 相打ちにならない値は実装役が調整

// ---- BS17-035 金剛戦艦ドレッドノーグ ----
console.log("=== BS17-035 重装甲 赤/紫 ===")
const dreadStart = (cores: number, hand: string[], rested = false) => ({
    turn: "opp" as Side, interactive: true,
    me: { spirits: [{ card: DREAD, label: "ドレッド", cores, rested }, { card: RED1, label: "FOD", cores: 1, rested }] },
    opp: { hand },
})
scenario({
    name: "035 赤のマジックの対象に選べない", start: dreadStart(1, [FLAME]),
    steps: (t) => { cast(t, "opp"); candidatesExclude(t, "opp", ["FOD"], ["ドレッド"]); pick(t, "opp", "FOD") },
    expect: [...castLines("相手", "フレイムダンス", 5), "自分.FOD.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "035 紫のマジックの対象に選べない（Lv2）", start: dreadStart(3, [COFFIN], true),
    steps: (t) => { cast(t, "opp"); candidatesExclude(t, "opp", ["FOD"], ["ドレッド"]); pick(t, "opp", "FOD") },
    expect: [...castLines("相手", "ダークコフィン", 7), "自分.FOD.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "035 緑のマジックは受ける", start: dreadStart(1, [BIND]),
    steps: (t) => { cast(t, "opp"); candidatesExclude(t, "opp", ["FOD", "ドレッド"], []); pick(t, "opp", "ドレッド") },
    expect: [...castLines("相手", "バインディングソーン", 2), "自分.ドレッド.疲労: false → true"],
})

// ---- BS17-036 キング・ハーラル ----
console.log("=== BS17-036 シンボル1つの合体スピリットはブロックされない／色別の効果無効 ===")
function haraldAttack(name: string, hostCard: string, braveCard: string, blockable: boolean): void {
    both(name, (me, opp, s) => {
        const host = put(s, me, hostCard, 2)
        const brave = put(s, me, braveCard, 1)
        put(s, me, HARALD, 2)
        combine(s, me, host, brave)
        const blk = put(s, opp, RED1, 1)
        turnOf(s, me, "attack")
        ok(act(s, me, { type: "attack", instanceId: host.instanceId }), "アタック")
        ok(act(s, opp, { type: "pass" }), "パス")
        ok(act(s, me, { type: "pass" }), "パス")
        const err = act(s, opp, { type: "block", instanceId: blk.instanceId })
        if (blockable) ok(err, "ブロックできる")
        else ng(err, "ブロックできない")
    })
}
haraldAttack("036 シンボル1の合体スピリットはブロックされない", WHT1, BRAVE_R, false)
haraldAttack("036 シンボル2の合体スピリットはブロックされる", RAIL, BRAVE_W, true)
both("036 未合体のスピリットはブロックされる", (me, opp, s) => {
    const a = put(s, me, WHT1, 2)
    put(s, me, HARALD, 2)
    const blk = put(s, opp, RED1, 1)
    turnOf(s, me, "attack")
    ok(act(s, me, { type: "attack", instanceId: a.instanceId }), "アタック")
    ok(act(s, opp, { type: "pass" }), "パス")
    ok(act(s, me, { type: "pass" }), "パス")
    ok(act(s, opp, { type: "block", instanceId: blk.instanceId }), "ブロックできる")
})
both("036 Lv1では効果なし", (me, opp, s) => {
    const host = put(s, me, WHT1, 2)
    put(s, me, HARALD, 1)
    combine(s, me, host, put(s, me, BRAVE_R, 1))
    const blk = put(s, opp, RED1, 1)
    turnOf(s, me, "attack")
    ok(act(s, me, { type: "attack", instanceId: host.instanceId }), "アタック")
    ok(act(s, opp, { type: "pass" }), "パス")
    ok(act(s, me, { type: "pass" }), "パス")
    ok(act(s, opp, { type: "block", instanceId: blk.instanceId }), "ブロックできる")
})
// 赤/白ブレイヴ合体 → 相手のスピリットの効果を受けない（相手の召喚時に疲労させる効果で確認）
function haraldImmune(name: string, braveCard: string, byMagic: boolean, immune: boolean, cores = 2): void {
    both(name, (me, opp, s) => {
        const harald = put(s, me, HARALD, cores)
        combine(s, me, harald, put(s, me, braveCard, 1))
        const fod = put(s, me, RED1, 1)
        turnOf(s, opp)
        if (byMagic) {
            s.players[opp].hand = [BIND]
            ok(act(s, opp, { type: "castMagic", handIndex: 0 }), "マジックを使う")
        } else {
            s.players[opp].hand = ["BS01-063"] // エメラルドシーザー（召喚時：相手のスピリット1体を疲労）
            ok(act(s, opp, { type: "summon", handIndex: 0 }), "召喚")
        }
        const pc = s.pendingChoice
        assert(pc !== null && pc.kind === "target" && pc.pid === opp, "相手が対象を選ぶ")
        assert((pc!.candidates?.includes(harald.instanceId) === true) === !immune, `ハーラルが候補に入る=${!immune}`)
        assert(pc!.candidates?.includes(fod.instanceId) === true, "合体していないスピリットは候補に入る")
    })
}
haraldImmune("036 Lv2 赤ブレイヴ → スピリットの効果を受けない", BRAVE_R, false, true)
haraldImmune("036 Lv2 白ブレイヴ → スピリットの効果を受けない", BRAVE_W, false, true)
haraldImmune("036 Lv2 紫ブレイヴ → スピリットの効果は受ける", BRAVE_P, false, false)
haraldImmune("036 Lv1 赤ブレイヴ → 受ける", BRAVE_R, false, false, 1)
haraldImmune("036 Lv2 紫ブレイヴ → マジックの効果を受けない", BRAVE_P, true, true)
haraldImmune("036 Lv2 青ブレイヴ → マジックの効果を受けない", BRAVE_B, true, true)
haraldImmune("036 Lv2 緑ブレイヴ → マジックの効果を受けない", BRAVE_G, true, true)
haraldImmune("036 Lv2 赤ブレイヴ → マジックの効果は受ける", BRAVE_R, true, false)

// ---- BS17-058 オーセベリング ----
console.log("=== BS17-058 バースト：スピリット破壊後 ／ 合体時：相手のアタックで相手のスピリット1体を疲労 ===")
both("058 合体条件：コスト5以上", (me, opp, s) => {
    const cheap = put(s, me, RED1, 1)
    const big = put(s, me, BIG5, 1)
    const o1 = put(s, me, OSE, 1)
    const o2 = put(s, me, OSE, 1)
    turnOf(s, me)
    ng(act(s, me, { type: "combineBrave", braveInstanceId: o1.instanceId, hostInstanceId: cheap.instanceId }), "コスト1には合体できない")
    ok(act(s, me, { type: "combineBrave", braveInstanceId: o2.instanceId, hostInstanceId: big.instanceId }), "コスト5には合体できる")
    assert(opp !== me, "")
})
function oseAttack(name: string, combined: boolean, attacker: "opp" | "me"): void {
    both(name, (me, opp, s) => {
        const big = put(s, me, BIG5, 1)
        if (combined) combine(s, me, big, put(s, me, OSE, 1))
        const a = put(s, opp, RED1, 1)
        const b = put(s, opp, RED1, 1)
        if (attacker === "opp") {
            turnOf(s, opp, "attack")
            ok(act(s, opp, { type: "attack", instanceId: a.instanceId }), "相手がアタック")
            if (combined) {
                const pc = s.pendingChoice
                assert(pc !== null && pc.pid === me && pc.kind === "target", "自分が疲労させる相手のスピリットを選ぶ")
                assert(pc!.candidates?.includes(b.instanceId) === true, "相手の回復状態のスピリットが候補")
                ok(act(s, me, { type: "resolveChoice", instanceId: b.instanceId }), "選ぶ")
                assert(b.isRested, "選んだスピリットが疲労した")
            } else assert(s.pendingChoice === null && !b.isRested, "合体していなければ何も起きない")
        } else {
            turnOf(s, me, "attack")
            ok(act(s, me, { type: "attack", instanceId: big.instanceId }), "自分がアタック")
            assert(s.pendingChoice === null || s.pendingChoice.kind !== "target" || s.pendingChoice.pid !== me, "自分のアタックでは誘発しない")
            assert(!a.isRested && !b.isRested, "相手のスピリットは疲労しない")
        }
    })
}
oseAttack("058 相手のアタックで相手のスピリット1体を疲労", true, "opp")
oseAttack("058 合体していなければ起きない", false, "opp")
oseAttack("058 自分のアタックでは起きない", true, "me")
function oseBurst(name: string, accept: boolean, destroyedByOpp: boolean): void {
    both(name, (me, opp, s) => {
        s.players[me].burst = OSE
        s.players[me].burstSet = true
        const dying = put(s, me, RED1, 1, true)
        const safe = put(s, me, RED1, 1)
        s.players[opp].reserve = 14
        s.players[opp].hand = [COFFIN, "BS01-063"]
        turnOf(s, destroyedByOpp ? opp : me)
        if (!destroyedByOpp) {
            s.players[me].hand = [COFFIN]
            ok(act(s, me, { type: "castMagic", handIndex: 0 }), "自分のマジック")
            if (s.pendingChoice?.kind === "target") ok(act(s, me, { type: "resolveChoice", instanceId: dying.instanceId }), "自分のスピリットを選ぶ")
            assert(s.pendingChoice === null || s.pendingChoice.kind !== "option", "自分で破壊したのでバーストは出ない")
            return
        }
        ok(act(s, opp, { type: "castMagic", handIndex: 0 }), "相手がダークコフィン")
        if (s.pendingChoice?.kind === "target") ok(act(s, opp, { type: "resolveChoice", instanceId: dying.instanceId }), "対象を選ぶ")
        assert(s.pendingChoice !== null && s.pendingChoice.pid === me && s.pendingChoice.kind === "option", "バースト発動の確認が立つ")
        if (!accept) {
            ok(act(s, me, { type: "resolveChoice" }), "断る")
            assert(s.players[me].burst === OSE, "バーストはセットされたまま")
            return
        }
        answerYes(s, me)
        assert(s.players[me].burst === null, "バーストが消費された")
        assert(s.players[me].field.spirits.some((x) => x.cardId === OSE) || s.players[me].field.combinedBraves.some((x) => x.cardId === OSE), "ブレイヴカードが召喚された")
        // このターンの間、自分のスピリットすべては相手のスピリットの効果を受けない（後から出たものを含む）
        ok(act(s, opp, { type: "summon", handIndex: 0 }), "相手がスピリットを召喚")
        const pc = s.pendingChoice
        if (pc && pc.kind === "target") {
            assert(pc.candidates?.includes(safe.instanceId) !== true, "自分のスピリットは疲労の対象に選べない")
            assert(!pc.candidates?.some((c) => s.players[me].field.spirits.some((x) => x.instanceId === c)), "召喚されたブレイヴ（スピリット状態）も選べない")
        }
        assert(!safe.isRested, "自分のスピリットは疲労しない")
    })
}
oseBurst("058 バースト：相手に破壊された → 発動・ブレイヴ召喚・スピリットは相手のスピリット効果を受けない", true, true)
oseBurst("058 バースト：断れば何も起きない", false, true)
oseBurst("058 バースト：自分の効果で破壊しても発動しない", true, false)

// ---- BS17-067 凍えるフィヨルド ----
console.log("=== BS17-067 ブレイヴ召喚時だけシンボルが白2つ／Lv2 相手のアタックステップ 合体スピリットに重装甲 赤/青 ===")
function braveCost(name: string, withNexus: boolean, cores: number, handCard: string, expectPaid: number): void {
    both(name, (me, opp, s) => {
        if (withNexus) {
            const n = createInstance(FJORD, s.turn - 1, cores)
            s.players[me].field.nexuses.push(n)
        }
        s.players[me].hand = [handCard]
        turnOf(s, me)
        const reserve = s.players[me].reserve
        const tc = s.players[me].trashCores
        ok(act(s, me, { type: "summon", handIndex: 0 }), "召喚")
        if (s.pendingChoice !== null && s.pendingChoice.kind === "option") ok(act(s, me, { type: "resolveChoice" }), "確認を閉じる")
        const paid = s.players[me].trashCores - tc
        assert(paid === expectPaid, `支払ったコストは${expectPaid}（実際: ${paid}、reserve ${reserve}→${s.players[me].reserve}）`)
        assert(opp !== me, "")
    })
}
// ジャノメ・シールダー（白・コスト3・軽減 白白）：ネクサスの白シンボルが2つ扱いなら軽減2
braveCost("067 ブレイヴ召喚：白2つ扱いで軽減2（コスト3→1）", true, 0, BRAVE_W, 1)
braveCost("067 ネクサスが無ければ軽減なし（コスト3）", false, 0, BRAVE_W, 3)
braveCost("067 Lv2でも同じ", true, 2, BRAVE_W, 1)
// スピリット召喚では白1つ扱いのまま：キグナ・スワン（コスト1・軽減 白）は軽減1でコスト0
braveCost("067 スピリット召喚では白1つのまま（軽減1）", true, 0, "BS12-026", 1) // ウリボーグ コスト2 軽減 白白 → 軽減1でコスト1
const fjordArmor = (cores: number, inAttack: boolean) => ({
    turn: "opp" as Side, phase: (inAttack ? "attack" : "main") as "attack" | "main", interactive: true,
})
void fjordArmor
function fjordGuard(name: string, cores: number, oppAttackStep: boolean, combined: boolean, immune: boolean): void {
    both(name, (me, opp, s) => {
        s.players[me].field.nexuses.push(createInstance(FJORD, s.turn - 1, cores))
        const host = put(s, me, BIG5, 1)
        const fod = put(s, me, RED1, 1)
        if (combined) combine(s, me, host, put(s, me, BRAVE_W, 1))
        refreshLevelAsOverrides(s)
        s.players[opp].hand = [FLAME]
        turnOf(s, opp, oppAttackStep ? "attack" : "main")
        ok(act(s, opp, { type: "castMagic", handIndex: 0 }), "赤のフレイムダンス")
        const pc = s.pendingChoice
        assert(pc !== null && pc.kind === "target" && pc.pid === opp, "相手が対象を選ぶ")
        const hits = pc!.candidates?.includes(host.instanceId) === true
        assert(hits === !immune, `合体スピリットが候補に入る=${!immune}`)
        assert(pc!.candidates?.includes(fod.instanceId) === true, "合体していないスピリットは候補に入る")
    })
}
fjordGuard("067 Lv2・相手のアタックステップ：合体スピリットは赤の効果を受けない", 2, true, true, true)
fjordGuard("067 相手のメインステップでは付かない", 2, false, true, false)
fjordGuard("067 Lv1では付かない", 0, true, true, false)

// ---- BS17-068 最果ての大地 ----
console.log("=== BS17-068 相手のバースト発動時にコア2個トラッシュ／Lv2 機獣が破壊されたら手札へ ===")
function endBurst(name: string, cores: number, oppReserve: number, answer: "pay" | "refuse" | "none"): void {
    both(name, (me, opp, s) => {
        s.players[me].field.nexuses.push(createInstance(END, s.turn - 1, cores))
        const atk = put(s, me, RED1, 1)
        s.players[opp].burst = "BS14-099" // 武迅衝（相手の召喚時発揮後）は使えないので、アタック後の飛雷震之計に差し替える
        s.players[opp].burst = "BS15-078" // 飛雷震之計（相手のスピリットのアタック後：自分のスピリット1体を回復させる）
        s.players[opp].burstSet = true
        s.players[opp].reserve = oppReserve
        put(s, opp, RED1, 1, true)
        turnOf(s, me, "attack")
        ok(act(s, me, { type: "attack", instanceId: atk.instanceId }), "アタック")
        const pc = s.pendingChoice
        assert(pc !== null && pc.pid === opp, "相手にバースト発動の確認が立つ")
        answerYes(s, opp)
        const before = s.players[opp].trashCores
        if (answer === "none") {
            assert(s.players[opp].trashCores === before, "払えなければコアは動かない")
        } else if (s.pendingChoice !== null) {
            const pc2 = s.pendingChoice
            assert(pc2.pid === opp, "コア2個を払うか相手が選ぶ")
            if (answer === "pay") ok(act(s, opp, { type: "resolveChoice", option: pc2.options?.[0] ?? "" }), "払う")
            else ok(act(s, opp, { type: "resolveChoice" }), "払わない")
            assert(s.players[opp].trashCores === before + (answer === "pay" ? 2 : 0), "払ったときだけコア2個がトラッシュへ")
        }
    })
}
endBurst("068 払うと効果を発揮する", 0, 6, "pay")
endBurst("068 払わなければ効果は発揮されない", 0, 6, "refuse")
endBurst("068 リザーブが1個しかなければ払えず発揮されない", 2, 1, "none")
const kijuStart = (nexusCores: number) => ({
    turn: "opp" as Side, phase: "attack" as const,
    me: { spirits: [{ card: KIJU, label: "機獣", cores: 1 }, { card: RED1, label: "FOD", cores: 1 }], nexuses: [{ card: END, label: "大地", cores: nexusCores }] },
    opp: { spirits: [{ card: BIG5, label: "ATK", cores: 1 }] },
})
scenario({
    name: "068 Lv2：機獣が相手に破壊されたら手札に戻る", start: kijuStart(2),
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.act("me", { type: "block", instanceId: t.id("機獣") }); t.closeFlash() },
    expect: ["相手.ATK.疲労: false → true", "自分.機獣.場所: フィールド → なし", "自分.手札: なし → キグナ・スワン", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "068 Lv1ではトラッシュに置かれたまま", start: kijuStart(0),
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.act("me", { type: "block", instanceId: t.id("機獣") }); t.closeFlash() },
    expect: ["相手.ATK.疲労: false → true", "自分.機獣.場所: フィールド → なし", "自分.トラッシュ: なし → キグナ・スワン", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "068 Lv2でも機獣でないスピリットは戻らない", start: { ...kijuStart(2), me: { spirits: [{ card: RED1, label: "FOD", cores: 1 }], nexuses: [{ card: END, label: "大地", cores: 2 }] } },
    steps: (t) => { declareAttack(t, "opp", "ATK"); t.act("me", { type: "block", instanceId: t.id("FOD") }); t.closeFlash() },
    expect: ["相手.ATK.疲労: false → true", "自分.FOD.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11"],
})

// ---- BS17-079 フリージングパリィ ----
console.log("=== BS17-079 このバトルの間、ブロックしている自分のスピリットが破壊されたら疲労状態で残す ===")
function parry(name: string, castIt: boolean, blocker: boolean): void {
    both(name, (me, opp, s) => {
        const atk = put(s, opp, BIG5, 1)
        const blk = put(s, me, RED1, 1)
        s.players[me].hand = [PARRY]
        if (blocker) {
            turnOf(s, opp, "attack")
            ok(act(s, opp, { type: "attack", instanceId: atk.instanceId }), "相手がアタック")
            ok(act(s, me, { type: "pass" }), "パス")
            ok(act(s, opp, { type: "pass" }), "パス")
            ok(act(s, me, { type: "block", instanceId: blk.instanceId }), "ブロック")
            if (castIt) ok(act(s, me, { type: "castMagic", handIndex: 0 }), "フリージングパリィ")
            let guard = 0
            while (s.isFlashTiming && s.battle && s.pendingChoice === null && guard++ < 6) ok(act(s, s.priorityPlayer, { type: "pass" }), "パス")
            const stays = inField(s, me, blk.instanceId)
            assert(stays === castIt, `ブロッカーが場に残る=${castIt}`)
            if (castIt) assert(blk.isRested, "疲労状態で残る")
            else assert(s.players[me].trashCards.includes(RED1), "通常どおり破壊されトラッシュへ")
        } else {
            // 自分がアタックして破壊される（ブロックしている側ではない）
            const wall = put(s, opp, BIG5, 1)
            const me1 = put(s, me, RED1, 2)
            void blk
            turnOf(s, me, "attack")
            ok(act(s, me, { type: "attack", instanceId: me1.instanceId }), "自分がアタック")
            ok(act(s, opp, { type: "pass" }), "パス")
            ok(act(s, me, { type: "pass" }), "パス")
            ok(act(s, opp, { type: "block", instanceId: wall.instanceId }), "相手がブロック")
            ok(act(s, me, { type: "castMagic", handIndex: 0 }), "フリージングパリィ")
            let guard = 0
            while (s.isFlashTiming && s.battle && s.pendingChoice === null && guard++ < 6) ok(act(s, s.priorityPlayer, { type: "pass" }), "パス")
            assert(!inField(s, me, me1.instanceId), "ブロックしていないアタッカーは通常どおり破壊される")
            void atk
        }
    })
}
parry("079 ブロックしたスピリットが破壊されても残る", true, true)
parry("079 使わなければ破壊される", false, true)
parry("079 ブロックしていないスピリットには効かない", true, false)

// ---- BS17-080 クヴェルドウールヴ ----
console.log("=== BS17-080 バースト：トラッシュのブレイヴを手札へ、その後コストで無償召喚 ／ フラッシュ ===")
function quel(name: string, o: { trashBrave: boolean; payAfter: boolean; handBrave: string[] }): void {
    both(name, (me, opp, s) => {
        s.players[me].burst = QUEL
        s.players[me].burstSet = true
        const dying = put(s, me, RED1, 1, true)
        s.players[me].trashCards = o.trashBrave ? [BRAVE_R] : []
        s.players[me].hand = [...o.handBrave]
        s.players[opp].hand = [COFFIN]
        turnOf(s, opp)
        ok(act(s, opp, { type: "castMagic", handIndex: 0 }), "相手がダークコフィン")
        if (s.pendingChoice?.kind === "target") ok(act(s, opp, { type: "resolveChoice", instanceId: dying.instanceId }), "対象")
        answerYes(s, me)
        if (o.trashBrave) {
            if (s.pendingChoice?.kind === "card") ok(act(s, me, { type: "resolveChoice", cardIndex: 0 }), "トラッシュのブレイヴを選ぶ")
            assert(s.players[me].hand.includes(BRAVE_R), "ブレイヴが手札に戻った")
            assert(!s.players[me].trashCards.includes(BRAVE_R), "トラッシュから消えた")
        }
        const reserve = s.players[me].reserve
        const pc = s.pendingChoice
        assert(pc !== null && pc.pid === me && pc.kind === "option", "コストを支払ってフラッシュ効果を発揮するか確認が立つ")
        if (!o.payAfter) {
            ok(act(s, me, { type: "resolveChoice" }), "払わない")
            assert(s.players[me].reserve === reserve, "コストは払われない")
            return
        }
        ok(act(s, me, { type: "resolveChoice", option: pc!.options?.[0] ?? "" }), "払う")
        const summoned = [...s.players[me].field.spirits, ...s.players[me].field.combinedBraves].some((x) => x.cardId === BRAVE_R)
        const hasCand = o.handBrave.length > 0 || o.trashBrave
        if (hasCand) {
            if (s.pendingChoice?.kind === "card") ok(act(s, me, { type: "resolveChoice", cardIndex: 0 }), "召喚するブレイヴを選ぶ")
            assert([...s.players[me].field.spirits].some((x) => x.cardId === BRAVE_R) || summoned, "赤のブレイヴが無償で召喚された")
        }
    })
}
quel("080 トラッシュのブレイヴを戻し、払って赤ブレイヴを無償召喚", { trashBrave: true, payAfter: true, handBrave: [] })
quel("080 払わなければ手札に戻るだけ", { trashBrave: true, payAfter: false, handBrave: [] })
quel("080 トラッシュにブレイヴが無くても払ってフラッシュ効果を発揮できる", { trashBrave: false, payAfter: true, handBrave: [BRAVE_W] })
both("080 フラッシュ：青のブレイヴは召喚できない／赤緑白のブレイヴは召喚できる", (me, opp, s) => {
    s.players[me].hand = [QUEL, BRAVE_B]
    turnOf(s, me)
    ok(act(s, me, { type: "castMagic", handIndex: 0 }), "クヴェルドウールヴをフラッシュ効果として使う")
    assert(s.pendingChoice === null || s.pendingChoice.kind !== "card" || s.pendingChoice.candidates === undefined || !s.pendingChoice.candidates.length, "青のブレイヴは候補に出ない")
    assert(!s.players[me].field.spirits.some((x) => x.cardId === BRAVE_B), "青のブレイヴは召喚されない")
    assert(opp !== me, "")
})
both("080 フラッシュ：白のブレイヴを無償召喚（コストは払わない）", (me, opp, s) => {
    s.players[me].hand = [QUEL, BRAVE_W]
    turnOf(s, me)
    const tc = s.players[me].trashCores
    ok(act(s, me, { type: "castMagic", handIndex: 0 }), "使用")
    if (s.pendingChoice?.kind === "card") ok(act(s, me, { type: "resolveChoice", cardIndex: 0 }), "選ぶ")
    assert(s.players[me].field.spirits.some((x) => x.cardId === BRAVE_W), "白のブレイヴが召喚された")
    assert(s.players[me].trashCores - tc === 4, "支払ったのはクヴェルドウールヴの使用コスト4だけ")
    assert(opp !== me, "")
})

// ---- BS17-X04 神狼機獣ラグナ・フェンリル ----
console.log("=== BS17-X04 召喚時：相手のスピリットは次のリフレッシュで回復できない／シンボル無しブレイヴと追加合体／合体アタック時のバウンス ===")
function fenrirSummon(name: string, handCard: string, summoner: "me" | "other"): void {
    both(name, (me, opp, s) => {
        const o1 = put(s, opp, RED1, 1, true)
        const o2 = put(s, opp, RED1, 1, true)
        s.players[me].hand = [handCard]
        s.players[me].reserve = 14
        turnOf(s, me)
        ok(act(s, me, { type: "summon", handIndex: 0 }), "召喚")
        if (s.pendingChoice !== null && s.pendingChoice.kind === "option") ok(act(s, me, { type: "resolveChoice" }), "確認を閉じる")
        ok(act(s, me, { type: "endTurn" }), "ターン終了")
        assert(s.turnPlayer === opp, "相手のターンになった")
        if (summoner === "me") assert(o1.isRested && o2.isRested, "相手のスピリットは次のリフレッシュステップで回復しない")
        else assert(!o1.isRested && !o2.isRested, "フェンリルでなければ通常どおり回復する")
    })
}
fenrirSummon("X04 召喚 → 相手のスピリットは回復しない", FENRIR, "me")
fenrirSummon("X04 対照：別のスピリットなら回復する", BIG5, "other")
both("X04 回復できないのは次のリフレッシュだけ（その次は回復する）", (me, opp, s) => {
    const o1 = put(s, opp, RED1, 1, true)
    s.players[me].hand = [FENRIR]
    s.players[me].reserve = 14
    turnOf(s, me)
    ok(act(s, me, { type: "summon", handIndex: 0 }), "召喚")
    if (s.pendingChoice !== null && s.pendingChoice.kind === "option") ok(act(s, me, { type: "resolveChoice" }), "確認を閉じる")
    ok(act(s, me, { type: "endTurn" }), "ターン終了")
    assert(o1.isRested, "1回目は回復しない")
    ok(act(s, opp, { type: "endTurn" }), "相手のターン終了")
    ok(act(s, me, { type: "endTurn" }), "自分のターン終了")
    assert(!o1.isRested, "次の次のリフレッシュでは回復する")
})
both("X04 シンボルを持たないブレイヴをさらに1つ合体できる／シンボルを持つブレイヴはできない", (me, opp, s) => {
    const f = put(s, me, FENRIR, 3)
    const b1 = put(s, me, BRAVE_W, 1)
    const b2 = put(s, me, BRAVE_R, 1) // シンボル無し
    const b3 = put(s, me, "BS10-071", 1) // フェンリルキャノンType-B（白シンボルあり・コスト4以上）
    combine(s, me, f, b1)
    turnOf(s, me)
    ng(act(s, me, { type: "combineBrave", braveInstanceId: b3.instanceId, hostInstanceId: f.instanceId }), "シンボルを持つブレイヴは追加合体できない")
    ok(act(s, me, { type: "combineBrave", braveInstanceId: b2.instanceId, hostInstanceId: f.instanceId }), "シンボル無しのブレイヴは追加合体できる")
    assert(opp !== me, "")
})
both("X04 他のスピリットは2つ目のブレイヴと合体できない", (me, opp, s) => {
    const h = put(s, me, BIG5, 1)
    const b1 = put(s, me, BRAVE_W, 1)
    const b2 = put(s, me, BRAVE_R, 1)
    combine(s, me, h, b1)
    ng(act(s, me, { type: "combineBrave", braveInstanceId: b2.instanceId, hostInstanceId: h.instanceId }), "2つ目は合体できない")
    assert(opp !== me, "")
})
function fenrirAttack(name: string, cores: number, braves: number): void {
    both(name, (me, opp, s) => {
        const f = put(s, me, FENRIR, cores)
        combine(s, me, f, put(s, me, BRAVE_W, 1))
        if (braves === 2) combine(s, me, f, put(s, me, BRAVE_R, 1))
        const o1 = put(s, opp, RED1, 1)
        const o2 = put(s, opp, RED1, 1)
        const o3 = put(s, opp, RED1, 1)
        turnOf(s, me, "attack")
        ok(act(s, me, { type: "attack", instanceId: f.instanceId }), "合体アタック")
        const targets = [o1, o2, o3]
        const need = cores >= 3 ? braves : 0
        for (let i = 0; i < need; i++) {
            const pc = s.pendingChoice
            assert(pc !== null && pc.pid === me && pc.kind === "target", `手札に戻す相手のスピリットを選ぶ（${i + 1}/${need}）`)
            const pick1 = targets.find((x) => pc!.candidates?.includes(x.instanceId))
            assert(pick1 !== undefined, "候補がある")
            ok(act(s, me, { type: "resolveChoice", instanceId: pick1!.instanceId }), "選ぶ")
            targets.splice(targets.indexOf(pick1!), 1)
        }
        const bounced = [o1, o2, o3].filter((x) => !inField(s, opp, x.instanceId)).length
        assert(bounced === need, `手札に戻った相手のスピリットは${need}体（実際: ${bounced}）`)
    })
}
fenrirAttack("X04 Lv2 ブレイヴ1つ → 1体戻す", 3, 1)
fenrirAttack("X04 Lv2 ブレイヴ2つ → 2体戻す", 3, 2)
fenrirAttack("X04 Lv1 合体アタックでは戻さない", 1, 1)

console.log("すべてのチェックに合格しました 🎉（part620）")
