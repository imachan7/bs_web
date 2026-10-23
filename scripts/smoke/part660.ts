// smoke パート660（BS18 黄の場面テスト：効果文だけから先に書いた期待値）
// 解釈の根拠: RULES_BATSPI_WIKI.md（2026-10-23 確定の一般則）、BURST.md §7、CONJUNCTION.md。
// 召喚・マジックの支払い額は「軽減シンボルが無ければ表記コストをリザーブからトラッシュへ、召喚はさらに Lv1 のコア1個をリザーブから置く」前提
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

// 既存カード
const GORA = "BS01-001" // ゴラドン（赤・コスト0）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1=1コア/1000, Lv2=2コア/3000）
const AIBAN = "BS01-005" // アイバーン（赤・コスト2・Lv1 2000）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv2=3コア/5000）
const PONI = "BS03-063" // ポニサス（黄・コスト5・Lv1 4000・Lv2=3コア/6000）
const DARK = "BS03-018" // ダークレイス（紫・コスト4・Lv1 2000）
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・4コアで9000）
const ANT = "BS06-030" // 働きアントマン（緑・コスト3・Lv2=2コア『アタック時』コア1個をリザーブへ）
const DACHO = "BS02-032" // ダッチョーノ（緑・コスト4・『破壊時』コア2個をリザーブへ）
const YURI = "BS07-040" // 百合の妖精ユリィ（黄・コスト3・Lv2=2コア【聖命】）
const NEKURO = "BS07-011" // ネクロウ（紫・コスト2・Lv2=2コア3000・【呪撃】）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・『召喚時』1枚ドロー）
const KOJO = "BS01-102" // 主無き古城（紫ネクサス・Lv1『自分の紫のスピリットすべてBP+1000』）
const FLAME = "BS01-121" // フレイムダンス（赤・コスト5・フラッシュ：BP4000以下を破壊）
const CYCLONE = "BS03-120" // フレイムサイクロン（赤・コスト5・フラッシュ：BP5000以下を破壊）
const RIBBON = "BS01-146" // ドリームリボン（白・コスト4・フラッシュ：相手のスピリット1体を手札に戻す）
const GATHER = "BS01-136" // ギャザーフォース（緑・コスト3・メイン：コア1個をリザーブ／フラッシュ：BP+1000）
const LCHAIN = "BS02-099" // ライフチェイン（緑・コスト5・フラッシュ：自分のスピリットを破壊しコスト分のコア）
const HEAL = "BS09-078" // ヒーリングサークル（白・コスト5・メイン：コア1個をライフへ。軽減に黄×2）
// BS18
const GRETEL = "BS18-038"
const HENZEL = "BS18-039"
const PENTAN = "BS18-040"
const LICAON = "BS18-041"
const MELODY = "BS18-042"
const WILL = "BS18-043"
const JAY = "BS18-044"
const FAUST = "BS18-045"
const ZACCA = "BS18-059"
const SWEETS = "BS18-069"
const WALP = "BS18-070"
const FAIR = "BS18-081"
const PANIC = "BS18-082"
const MEPHI = "BS18-X05"
const XT = "X012T"

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string][] = [
        [GORA, "ゴラドン"], [ROKU, "ロクケラトプス"], [AIBAN, "アイバーン"], [BELL, "デュアルキャノン・ベル"], [PONI, "ポニサス"],
        [DARK, "ダークレイス"], [WINGAL, "ウィンガル"], [ANT, "働きアントマン"], [DACHO, "ダッチョーノ"], [YURI, "百合の妖精ユリィ"],
        [NEKURO, "ネクロウ"], [GRIP, "グリプ・ハンズ"], [KOJO, "主無き古城"], [FLAME, "フレイムダンス"], [CYCLONE, "フレイムサイクロン"],
        [RIBBON, "ドリームリボン"], [GATHER, "ギャザーフォース"], [LCHAIN, "ライフチェイン"], [HEAL, "ヒーリングサークル"],
        [GRETEL, "グリムの天使グレーテル"], [HENZEL, "グリムの天使ヘンゼル"], [PENTAN, "詩人ペンタン"], [LICAON, "クロック・リカオー"],
        [MELODY, "双天使メロディエル"], [WILL, "創造主グリム・ウィル"], [JAY, "創造主グリム・ジェイ"], [FAUST, "ドクトル・ファウスト"],
        [ZACCA, "ザッカ・パンツァー"], [SWEETS, "お菓子の豪邸"], [WALP, "ワルプルギスの夜"], [FAIR, "フェアヴァイレ"],
        [PANIC, "パニックヴォイス"], [MEPHI, "聖魔皇メフィスト・フェレス"], [XT, "英雄皇ロード・ドラゴン・ドミニオン"],
    ]
    for (const [id, name] of expect) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(XT).colors[0] === "yellow" && getCard(XT).cost === 6, "X012T は黄・コスト6")
    assert(getCard(FLAME).cost === 5 && getCard(GRIP).cost === 3 && getCard(PANIC).cost === 7 && getCard(FAIR).cost === 3, "コストの前提")
}

// ---- 場面の共通部品 ----
const GDECK = Array.from({ length: 40 }, () => GORA)
const nm = (...ids: string[]) => ids.map((c) => getCard(c).name).sort().join("、") || "なし"
const name = (id: string) => getCard(id).name
const pidOf = (t: ScenarioCtx, side: Side): PlayerId => (side === "me" ? t.me : t.opp)
const other = (side: Side): Side => (side === "me" ? "opp" : "me")

// 新しく場に出た個体の写像（場所・疲労・コア・Lv・BP）
function appear(label: string, o: { cores: number; lv: number; bp: number; rested?: boolean }): string[] {
    return [
        `${label}.場所: なし → フィールド`,
        `${label}.疲労: なし → ${o.rested ?? false}`,
        `${label}.コア: なし → ${o.cores}`,
        `${label}.Lv: なし → ${o.lv}`,
        `${label}.BP: なし → ${o.bp}`,
    ]
}
const gone = (label: string) => `${label}.場所: フィールド → なし`

// 相手が FLAME 等のマジック1枚を使った分（手札→トラッシュ・コスト支払い）
function spent(side: "自分" | "相手", card: string, cost: number, extra = 0): string[] {
    return [
        `${side}.手札: ${nm(card)} → なし`,
        `${side}.トラッシュ: なし → ${nm(card)}`,
        `${side}.リザーブ: 10 → ${10 - cost + extra}`,
        `${side}.トラッシュのコア: 0 → ${cost}`,
    ]
}

type Decline = number | RegExp | ((t: ScenarioCtx) => boolean)
// 選択待ちを順に片付ける。no＝断る条件（数値＝その番号以降すべて／正規表現＝prompt に一致／関数）。prefer＝選択肢に含まれる語
function settle(t: ScenarioCtx, o: { no?: Decline; prefer?: string } = {}): void {
    for (let i = 0; i < 20; i++) {
        const pc = t.state.pendingChoice as unknown as { pid: PlayerId; kind: string; prompt: string; candidates: string[]; options?: string[] } | null
        if (!pc) return
        const side: Side = pc.pid === t.me ? "me" : "opp"
        const no = o.no
        const decline = typeof no === "number" ? i >= no : no instanceof RegExp ? no.test(pc.prompt) : no ? no(t) : false
        if (decline) t.act(side, { type: "resolveChoice" })
        else if (pc.kind === "target") t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
        else if (pc.kind === "option") {
            const opt = (o.prefer && pc.options?.find((x) => x.includes(o.prefer!))) || pc.options?.[0]
            t.act(side, { type: "resolveChoice", ...(opt ? { option: opt } : {}) })
        } else t.act(side, { type: "resolveChoice", cardIndex: 0 })
    }
    throw new Error("選択待ちが片付かない")
}

// フラッシュの優先権を持っていなければ、相手にパスさせてから動く
function ensurePriority(t: ScenarioCtx, side: Side): void {
    if (t.state.priorityPlayer !== pidOf(t, side)) t.act(other(side), { type: "pass" })
}
function cast(t: ScenarioCtx, side: Side, card: string, target?: string, timing: "main" | "flash" = "flash"): void {
    if (timing === "flash" && t.state.battle) ensurePriority(t, side)
    const handIndex = t.state.players[pidOf(t, side)].hand.indexOf(card)
    t.act(side, { type: "castMagic", handIndex, timing, ...(target ? { targetInstanceId: t.id(target) } : {}) })
}
function castRejected(t: ScenarioCtx, side: Side, card: string, target?: string): void {
    if (t.state.battle) ensurePriority(t, side)
    const handIndex = t.state.players[pidOf(t, side)].hand.indexOf(card)
    t.actRejected(side, { type: "castMagic", handIndex, timing: "flash", ...(target ? { targetInstanceId: t.id(target) } : {}) })
}
const attack = (t: ScenarioCtx, side: Side, label: string) => t.act(side, { type: "attack", instanceId: t.id(label) })
const block = (t: ScenarioCtx, side: Side, label: string) => t.act(side, { type: "block", instanceId: t.id(label) })

// ============================================================
// BS18-037 ホムンクー：効果文なし（場面なし）
// ============================================================

// ============================================================
// BS18-038 / 039 グリムの天使（相手に破壊されたとき、もう一方がいる間は疲労状態で残る）
// ============================================================
console.log("=== 038/039. 相手に破壊されても疲労状態で残る ===")
const oppFlame = (target: string) => (t: ScenarioCtx) => {
    cast(t, "opp", FLAME, target)
    settle(t)
}
const oppFlameLines = spent("相手", FLAME, 5)

scenario({
    name: "038-グレーテルが残る",
    start: { turn: "opp", me: { spirits: [{ card: GRETEL, cores: 2 }, { card: HENZEL }] }, opp: { hand: [FLAME] } },
    steps: oppFlame("自分.グリムの天使グレーテル"),
    expect: ["自分.グリムの天使グレーテル.疲労: false → true", ...oppFlameLines],
})
scenario({
    name: "039-ヘンゼルが残る",
    start: { turn: "opp", me: { spirits: [{ card: HENZEL, cores: 2 }, { card: GRETEL }] }, opp: { hand: [FLAME] } },
    steps: oppFlame("自分.グリムの天使ヘンゼル"),
    expect: ["自分.グリムの天使ヘンゼル.疲労: false → true", ...oppFlameLines],
})
scenario({
    name: "038-相方がいなければ破壊される",
    start: { turn: "opp", me: { spirits: [{ card: GRETEL, cores: 2 }] }, opp: { hand: [FLAME] } },
    steps: oppFlame("自分.グリムの天使グレーテル"),
    expect: [gone("自分.グリムの天使グレーテル"), `自分.トラッシュ: なし → ${name(GRETEL)}`, "自分.リザーブ: 10 → 12", ...oppFlameLines],
})
scenario({
    name: "038-Lv1では残らない",
    start: { turn: "opp", me: { spirits: [{ card: GRETEL, cores: 1 }, { card: HENZEL }] }, opp: { hand: [FLAME] } },
    steps: oppFlame("自分.グリムの天使グレーテル"),
    expect: [gone("自分.グリムの天使グレーテル"), `自分.トラッシュ: なし → ${name(GRETEL)}`, "自分.リザーブ: 10 → 11", ...oppFlameLines],
})
scenario({
    name: "038-自分の効果による破壊では残らない",
    start: { me: { hand: [LCHAIN], spirits: [{ card: GRETEL, cores: 2 }, { card: HENZEL }] } },
    steps(t) {
        cast(t, "me", LCHAIN, "自分.グリムの天使グレーテル")
        settle(t)
    },
    // コスト2のスピリットを破壊して、コスト分のコア2個とスピリット上のコア2個がリザーブへ
    expect: [
        gone("自分.グリムの天使グレーテル"),
        `自分.トラッシュ: なし → ${nm(LCHAIN, GRETEL)}`,
        `自分.手札: ${nm(LCHAIN)} → なし`,
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 5",
    ],
})

// ============================================================
// BS18-040 詩人ペンタン
// ============================================================
console.log("=== 040. 相手のスピリット/ネクサスの効果でボイドからコアが増えたら1個につき1枚ドロー ===")
const oppAntAttack = (t: ScenarioCtx) => {
    attack(t, "opp", "相手.働きアントマン")
    t.closeFlash()
    t.act("me", { type: "takeLife" })
}
scenario({
    name: "040-相手の効果でコアが増えたら1枚",
    start: { turn: "opp", phase: "attack", me: { deck: GDECK, spirits: [{ card: PENTAN }] }, opp: { spirits: [{ card: ANT, cores: 2 }] } },
    steps: oppAntAttack,
    expect: [
        "相手.働きアントマン.疲労: false → true", "相手.リザーブ: 10 → 11", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11",
        `自分.手札: なし → ${name(GORA)}`, "自分.デッキ枚数: 40 → 39",
    ],
})
scenario({
    name: "040-自分の効果ではドローしない",
    start: { phase: "attack", me: { deck: GDECK, spirits: [{ card: PENTAN }, { card: ANT, cores: 2 }] } },
    steps(t) {
        attack(t, "me", "自分.働きアントマン")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.働きアントマン.疲労: false → true", "自分.リザーブ: 10 → 11", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "040-マジックの効果ではドローしない",
    start: { turn: "opp", me: { deck: GDECK, spirits: [{ card: PENTAN }] }, opp: { hand: [GATHER] } },
    steps(t) {
        cast(t, "opp", GATHER, undefined, "main")
        settle(t)
    },
    expect: spent("相手", GATHER, 3, 1),
})
scenario({
    name: "040-コア2個なら2枚ドロー",
    start: { phase: "attack", me: { deck: GDECK, spirits: [{ card: PENTAN }] }, opp: { spirits: [{ card: DACHO }] } },
    steps(t) {
        attack(t, "me", "自分.詩人ペンタン")
        t.closeFlash()
        block(t, "opp", "相手.ダッチョーノ")
        t.closeFlash()
    },
    // ダッチョーノは破壊され、破壊時にボイドからコア2個がリザーブへ。スピリット上のコア1個もリザーブへ戻る
    expect: [
        "自分.詩人ペンタン.疲労: false → true", gone("相手.ダッチョーノ"), `相手.トラッシュ: なし → ${name(DACHO)}`, "相手.リザーブ: 10 → 13",
        `自分.手札: なし → ${nm(GORA, GORA)}`, "自分.デッキ枚数: 40 → 38",
    ],
})
console.log("=== 040 Lv2. バトルした コスト4以下の相手をLv1として扱う ===")
scenario({
    name: "040-コスト4以下はLv1扱いで負ける",
    start: { phase: "attack", me: { spirits: [{ card: PENTAN, cores: 2 }] }, opp: { spirits: [{ card: BELL, cores: 3 }] } },
    steps(t) {
        attack(t, "me", "自分.詩人ペンタン")
        t.closeFlash()
        block(t, "opp", "相手.デュアルキャノン・ベル")
        t.closeFlash()
    },
    // ベルは Lv2(5000) だが Lv1(3000) として扱われ、ペンタン(4000) に負ける
    expect: ["自分.詩人ペンタン.疲労: false → true", gone("相手.デュアルキャノン・ベル"), `相手.トラッシュ: なし → ${name(BELL)}`, "相手.リザーブ: 10 → 13"],
})
scenario({
    name: "040-コスト5以上はLv1扱いにならない",
    start: { phase: "attack", me: { spirits: [{ card: PENTAN, cores: 2 }] }, opp: { spirits: [{ card: PONI, cores: 3 }] } },
    steps(t) {
        attack(t, "me", "自分.詩人ペンタン")
        t.closeFlash()
        block(t, "opp", "相手.ポニサス")
        t.closeFlash()
    },
    // ポニサスは Lv2(6000) のまま。ペンタン(4000) が負ける
    expect: [gone("自分.詩人ペンタン"), `自分.トラッシュ: なし → ${name(PENTAN)}`, "自分.リザーブ: 10 → 12"],
})

// ============================================================
// BS18-041 クロック・リカオー
// ============================================================
console.log("=== 041. アタックステップ中にライフにコアが置かれたら回復 ===")
scenario({
    name: "041-自分のライフにコアが置かれて回復",
    start: { phase: "attack", me: { spirits: [{ card: LICAON, rested: true }, { card: YURI, cores: 2 }] } },
    steps(t) {
        attack(t, "me", "自分.百合の妖精ユリィ")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.百合の妖精ユリィ.疲労: false → true", "自分.クロック・リカオー.疲労: true → false", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "自分.ライフ: 5 → 6",
    ],
})
scenario({
    name: "041-相手のライフにコアが置かれても回復",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: LICAON, rested: true }] }, opp: { spirits: [{ card: YURI, cores: 2 }] } },
    steps(t) {
        attack(t, "opp", "相手.百合の妖精ユリィ")
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.百合の妖精ユリィ.疲労: false → true", "自分.クロック・リカオー.疲労: true → false", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "相手.ライフ: 5 → 6"],
})
scenario({
    name: "041-メインステップでは回復しない",
    start: { me: { hand: [HEAL], spirits: [{ card: LICAON, rested: true }] } },
    steps(t) {
        cast(t, "me", HEAL, undefined, "main")
        settle(t)
    },
    // ヒーリングサークルの軽減（黄×2）はリカオーの黄シンボル1つで1軽減されコスト4
    expect: ["自分.ライフ: 5 → 6", `自分.手札: ${nm(HEAL)} → なし`, `自分.トラッシュ: なし → ${nm(HEAL)}`, "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4"],
})

// ============================================================
// BS18-042 双天使メロディエル
// ============================================================
console.log("=== 042. お互いのメインステップではネクサスのLv1効果が発揮されない ===")
scenario({
    name: "042-自分のネクサスのLv1効果がメインで止まる",
    start: { me: { spirits: [{ card: MELODY }, { card: DARK }], nexuses: [{ card: KOJO, cores: 0 }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.ダークレイス.BP: 2000 → 3000"],
})
scenario({
    name: "042-メロディエルがいなければメインでも発揮される",
    start: { me: { spirits: [{ card: DARK }], nexuses: [{ card: KOJO, cores: 0 }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})
scenario({
    name: "042-相手のネクサスのLv1効果も止まる",
    start: { me: { spirits: [{ card: MELODY }] }, opp: { spirits: [{ card: DARK }], nexuses: [{ card: KOJO, cores: 0 }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["相手.ダークレイス.BP: 2000 → 3000"],
})
scenario({
    name: "042-相手のメインステップも止まる",
    start: { turn: "opp", me: { spirits: [{ card: MELODY }] }, opp: { spirits: [{ card: DARK }], nexuses: [{ card: KOJO, cores: 0 }] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: ["相手.ダークレイス.BP: 2000 → 3000"],
})

// ============================================================
// BS18-043 / 044 創造主グリム・ウィル／ジェイ
// ============================================================
console.log("=== 043/044. コスト指定のブロックされない ===")
scenario({
    name: "043-コスト1のスピリットはブロックできない",
    start: { phase: "attack", me: { spirits: [{ card: WILL }] }, opp: { spirits: [{ card: ROKU }] } },
    steps(t) {
        attack(t, "me", "自分.創造主グリム・ウィル")
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.創造主グリム・ウィル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "043-コスト2のスピリットはブロックできる",
    start: { phase: "attack", me: { spirits: [{ card: WILL }] }, opp: { spirits: [{ card: AIBAN }] } },
    steps(t) {
        attack(t, "me", "自分.創造主グリム・ウィル")
        t.closeFlash()
        block(t, "opp", "相手.アイバーン")
        t.closeFlash()
    },
    expect: ["自分.創造主グリム・ウィル.疲労: false → true", gone("相手.アイバーン"), `相手.トラッシュ: なし → ${name(AIBAN)}`, "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "044-ウィルがいればジェイはコスト1でも2でもブロックされない",
    start: { phase: "attack", me: { spirits: [{ card: WILL }, { card: JAY }] }, opp: { spirits: [{ card: ROKU }, { card: AIBAN }] } },
    steps(t) {
        attack(t, "me", "自分.創造主グリム・ジェイ")
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
        t.actRejected("opp", { type: "block", instanceId: t.id("相手.アイバーン") })
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.創造主グリム・ジェイ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "044-ジェイ単独ならコスト1はブロックできる",
    start: { phase: "attack", me: { spirits: [{ card: JAY }] }, opp: { spirits: [{ card: ROKU }, { card: AIBAN }] } },
    steps(t) {
        attack(t, "me", "自分.創造主グリム・ジェイ")
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("相手.アイバーン") })
        block(t, "opp", "相手.ロクケラトプス")
        t.closeFlash()
    },
    expect: ["自分.創造主グリム・ジェイ.疲労: false → true", gone("相手.ロクケラトプス"), `相手.トラッシュ: なし → ${name(ROKU)}`, "相手.リザーブ: 10 → 11"],
})

console.log("=== 043 Lv2. 相手の効果ではフィールドから手札に戻らない ===")
const oppRibbon = (target: string) => (t: ScenarioCtx) => {
    cast(t, "opp", RIBBON, target)
    settle(t)
}
const oppRibbonLines = spent("相手", RIBBON, 4)
scenario({
    name: "043-Lv2のウィルは戻らない",
    start: { turn: "opp", me: { spirits: [{ card: WILL, cores: 2 }, { card: ROKU }] }, opp: { hand: [RIBBON] } },
    steps: oppRibbon("自分.創造主グリム・ウィル"),
    expect: oppRibbonLines,
})
scenario({
    name: "043-Lv2のウィルがいればLv1のジェイも戻らない",
    start: { turn: "opp", me: { spirits: [{ card: WILL, cores: 2 }, { card: JAY }] }, opp: { hand: [RIBBON] } },
    steps: oppRibbon("自分.創造主グリム・ジェイ"),
    expect: oppRibbonLines,
})
scenario({
    name: "043-Lv1のウィルは戻る",
    start: { turn: "opp", me: { spirits: [{ card: WILL }, { card: JAY }] }, opp: { hand: [RIBBON] } },
    steps: oppRibbon("自分.創造主グリム・ウィル"),
    expect: [gone("自分.創造主グリム・ウィル"), `自分.手札: なし → ${name(WILL)}`, "自分.リザーブ: 10 → 11", ...oppRibbonLines],
})

console.log("=== 044 Lv2. 相手に破壊されたとき疲労状態で残る ===")
scenario({
    name: "044-ウィルが残る",
    start: { turn: "opp", me: { spirits: [{ card: JAY, cores: 2 }, { card: WILL }] }, opp: { hand: [FLAME] } },
    steps: oppFlame("自分.創造主グリム・ウィル"),
    expect: ["自分.創造主グリム・ウィル.疲労: false → true", ...oppFlameLines],
})
scenario({
    name: "044-ジェイ自身も残る",
    start: { turn: "opp", me: { spirits: [{ card: JAY, cores: 2 }, { card: WILL }] }, opp: { hand: [CYCLONE] } },
    steps(t) {
        cast(t, "opp", CYCLONE, "自分.創造主グリム・ジェイ")
        settle(t)
    },
    expect: ["自分.創造主グリム・ジェイ.疲労: false → true", ...spent("相手", CYCLONE, 5)],
})
scenario({
    name: "044-Lv1のジェイでは残らない",
    start: { turn: "opp", me: { spirits: [{ card: JAY }, { card: WILL }] }, opp: { hand: [FLAME] } },
    steps: oppFlame("自分.創造主グリム・ウィル"),
    expect: [gone("自分.創造主グリム・ウィル"), `自分.トラッシュ: なし → ${name(WILL)}`, "自分.リザーブ: 10 → 11", ...oppFlameLines],
})

// ============================================================
// BS18-045 ドクトル・ファウスト
// ============================================================
console.log("=== 045. 相手による破壊後バースト：コスト5以上の白/黄が破壊されていたら召喚 ===")
const faustField = (t: ScenarioCtx) => t.state.players[t.me].field.spirits.some((x) => x.cardId === FAUST)
const faustDestroyLines = [
    gone("自分.創造主グリム・ウィル"), `自分.トラッシュ: なし → ${name(WILL)}`, ...oppFlameLines,
]
scenario({
    name: "045-バースト召喚して5枚オープンから召喚",
    start: { turn: "opp", me: { burst: FAUST, spirits: [{ card: WILL }] }, opp: { hand: [FLAME] } },
    steps: oppFlame("自分.創造主グリム・ウィル"),
    // 創造主(コスト5・黄)が破壊 → ファウスト召喚 → デッキ上5枚から1体を無償召喚（リザーブ: +1 −1 −1）
    expect: [
        ...faustDestroyLines, "自分.バースト: ドクトル・ファウスト → なし", "自分.リザーブ: 10 → 9", "自分.デッキ枚数: 40 → 39",
        ...appear("自分.ドクトル・ファウスト", { cores: 1, lv: 1, bp: 7000 }), ...appear("自分.ロクケラトプス", { cores: 1, lv: 1, bp: 1000 }),
    ],
})
scenario({
    name: "045-バーストを発動しない",
    start: { turn: "opp", me: { burst: FAUST, spirits: [{ card: WILL }] }, opp: { hand: [FLAME] } },
    steps(t) {
        cast(t, "opp", FLAME, "自分.創造主グリム・ウィル")
        settle(t, { no: 0 })
    },
    expect: [...faustDestroyLines, "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "045-召喚時のオープン召喚をしない",
    start: { turn: "opp", me: { burst: FAUST, spirits: [{ card: WILL }] }, opp: { hand: [FLAME] } },
    steps(t) {
        cast(t, "opp", FLAME, "自分.創造主グリム・ウィル")
        settle(t, { no: faustField })
    },
    // オープンした5枚は好きな順でデッキの下に戻るので枚数は変わらない
    expect: [...faustDestroyLines, "自分.バースト: ドクトル・ファウスト → なし", ...appear("自分.ドクトル・ファウスト", { cores: 1, lv: 1, bp: 7000 })],
})
const faustNoSummon = (victim: string) => ({
    start: { turn: "opp" as const, me: { burst: FAUST, spirits: [{ card: victim }] }, opp: { hand: [FLAME] } },
    steps: oppFlame(`自分.${name(victim)}`),
    // 条件はバースト効果の解決時に見る（BURST.md）。発動はでき、召喚は起きず、カードはトラッシュへ
    expect: [
        gone(`自分.${name(victim)}`), `自分.トラッシュ: なし → ${nm(victim, FAUST)}`, "自分.バースト: ドクトル・ファウスト → なし",
        `自分.リザーブ: 10 → ${10 + 1}`, ...oppFlameLines,
    ],
})
assert(getCard(BELL).cost === 4 && getCard("BS03-009").cost === 5 && getCard("BS03-009").colors[0] === "red", "前提: ベルはコスト4の白、火吹きメルトはコスト5の赤")
scenario({ name: "045-コスト4が破壊されても召喚しない", ...faustNoSummon(BELL) })
scenario({ name: "045-コスト5でも赤なら召喚しない", ...faustNoSummon("BS03-009") })
scenario({
    name: "045-自分の効果での破壊ではバーストしない",
    start: { me: { burst: FAUST, hand: [LCHAIN], spirits: [{ card: WILL }] } },
    steps(t) {
        cast(t, "me", LCHAIN, "自分.創造主グリム・ウィル")
        settle(t)
    },
    expect: [
        gone("自分.創造主グリム・ウィル"), `自分.トラッシュ: なし → ${nm(LCHAIN, WILL)}`, `自分.手札: ${nm(LCHAIN)} → なし`,
        "自分.リザーブ: 10 → 11", "自分.トラッシュのコア: 0 → 5",
    ],
})

// ============================================================
// BS18-059 ザッカ・パンツァー：場面の写像が合体の表現に依存するので通常の assert で書く
// ============================================================
console.log("=== 059. 合体アタック時、手札のマジックの軽減シンボルをすべて黄として扱う ===")
function game059(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    return s
}
function put059(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// 戻り値＝フレイムダンス（赤×3軽減・コスト5）の支払い額。味方に赤のシンボルは無い
function paid059(seed: string, combine: boolean, attackFirst = true): number {
    const s = game059(seed)
    const host = put059(s, "p1", PONI)
    const brave = put059(s, "p1", ZACCA)
    const foe = put059(s, "p2", ROKU)
    s.players.p1.hand = [FLAME]
    if (combine) assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, `${seed} 合体できる`)
    if (attackFirst) {
        assert(act(s, "p1", { type: "nextPhase" }) === null, `${seed} アタックステップへ`)
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, `${seed} アタックできる`)
    }
    const before = s.players.p1.reserve
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: foe.instanceId }) === null, `${seed} マジックが使える`)
    return before - s.players.p1.reserve
}
{
    // 軽減数＝マジックの軽減シンボルのうち、自分の場の黄シンボルで満たせる数（合体スピリットはホストとブレイヴのシンボルを合わせる）
    const redSlots = getCard(FLAME).reduction.filter((c: string) => c === "red").length
    const yellowOnField = getCard(PONI).symbol.filter((c: string) => c === "yellow").length + getCard(ZACCA).symbol.filter((c: string) => c === "yellow").length
    assert(redSlots === 3 && yellowOnField === 2, "前提: 軽減の赤が3つ・場の黄シンボルが2つ")
    const full = getCard(FLAME).cost
    const reduced = full - Math.min(redSlots, yellowOnField)
    assert(paid059("z1", true) === reduced, `合体アタック中のフラッシュは軽減が効く（${reduced}）`)
    assert(paid059("z2", false) === full, "合体していなければ軽減なし")
    assert(paid059("z3", true, false) === full, "合体していてもアタックしていないメインステップでは軽減が効かない")
}

// ============================================================
// BS18-069 お菓子の豪邸
// ============================================================
console.log("=== 069. 相手に自分のスピリットが破壊されたとき、ターンに1回、手札の『グリム』スピリットを無償召喚 ===")
const henzelAppear = appear("自分.グリムの天使ヘンゼル", { cores: 1, lv: 1, bp: 2000 })
scenario({
    name: "069-無償召喚する",
    start: { turn: "opp", me: { hand: [HENZEL], spirits: [{ card: ROKU }], nexuses: [{ card: SWEETS, cores: 0 }] }, opp: { hand: [FLAME] } },
    steps: oppFlame("自分.ロクケラトプス"),
    // 破壊されたロクのコア+1、召喚のLv1コア−1でリザーブは変わらない
    expect: [gone("自分.ロクケラトプス"), `自分.トラッシュ: なし → ${name(ROKU)}`, `自分.手札: ${nm(HENZEL)} → なし`, ...henzelAppear, ...oppFlameLines],
})
scenario({
    name: "069-断る",
    start: { turn: "opp", me: { hand: [HENZEL], spirits: [{ card: ROKU }], nexuses: [{ card: SWEETS, cores: 0 }] }, opp: { hand: [FLAME] } },
    steps(t) {
        cast(t, "opp", FLAME, "自分.ロクケラトプス")
        settle(t, { no: 0 })
    },
    expect: [gone("自分.ロクケラトプス"), `自分.トラッシュ: なし → ${name(ROKU)}`, "自分.リザーブ: 10 → 11", ...oppFlameLines],
})
scenario({
    name: "069-ターンに1回",
    start: {
        turn: "opp",
        me: { hand: [HENZEL, JAY], spirits: [{ card: ROKU, label: "ロク甲" }, { card: ROKU, label: "ロク乙" }], nexuses: [{ card: SWEETS, cores: 0 }] },
        opp: { hand: [FLAME, FLAME] },
    },
    steps(t) {
        cast(t, "opp", FLAME, "自分.ロク甲")
        settle(t, { prefer: name(HENZEL) })
        cast(t, "opp", FLAME, "自分.ロク乙")
        settle(t)
    },
    // 1回目で召喚（リザーブ±0）、2回目は召喚できず ロク乙のコア+1
    expect: [
        gone("自分.ロク甲"), gone("自分.ロク乙"), `自分.トラッシュ: なし → ${nm(ROKU, ROKU)}`, `自分.手札: ${nm(HENZEL, JAY)} → ${nm(JAY)}`,
        "自分.リザーブ: 10 → 11", ...henzelAppear,
        `相手.手札: ${nm(FLAME, FLAME)} → なし`, `相手.トラッシュ: なし → ${nm(FLAME, FLAME)}`, "相手.リザーブ: 10 → 0", "相手.トラッシュのコア: 0 → 10",
    ],
})
scenario({
    name: "069-自分の効果での破壊では召喚しない",
    start: { me: { hand: [LCHAIN, HENZEL], spirits: [{ card: ROKU }], nexuses: [{ card: SWEETS, cores: 0 }] } },
    steps(t) {
        cast(t, "me", LCHAIN, "自分.ロクケラトプス")
        settle(t)
    },
    expect: [
        gone("自分.ロクケラトプス"), `自分.トラッシュ: なし → ${nm(LCHAIN, ROKU)}`, `自分.手札: ${nm(LCHAIN, HENZEL)} → ${nm(HENZEL)}`,
        "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 5",
    ],
})
scenario({
    name: "069-名前にグリムが無ければ召喚しない",
    start: { turn: "opp", me: { hand: [AIBAN], spirits: [{ card: ROKU }], nexuses: [{ card: SWEETS, cores: 0 }] }, opp: { hand: [FLAME] } },
    steps: oppFlame("自分.ロクケラトプス"),
    expect: [gone("自分.ロクケラトプス"), `自分.トラッシュ: なし → ${name(ROKU)}`, "自分.リザーブ: 10 → 11", ...oppFlameLines],
})
console.log("=== 069 Lv2. 系統「天霊」の自分のスピリットが疲労したら1枚ドロー ===")
const attackHenzel = (t: ScenarioCtx, label: string) => {
    attack(t, "me", label)
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}
scenario({
    name: "069-Lv2で天霊が疲労したらドロー",
    start: { phase: "attack", me: { deck: GDECK, spirits: [{ card: HENZEL }], nexuses: [{ card: SWEETS, cores: 1 }] } },
    steps: (t) => attackHenzel(t, "自分.グリムの天使ヘンゼル"),
    expect: [
        "自分.グリムの天使ヘンゼル.疲労: false → true", `自分.手札: なし → ${name(GORA)}`, "自分.デッキ枚数: 40 → 39", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "069-Lv1ではドローしない",
    start: { phase: "attack", me: { deck: GDECK, spirits: [{ card: HENZEL }], nexuses: [{ card: SWEETS, cores: 0 }] } },
    steps: (t) => attackHenzel(t, "自分.グリムの天使ヘンゼル"),
    expect: ["自分.グリムの天使ヘンゼル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "069-天霊でなければドローしない",
    start: { phase: "attack", me: { deck: GDECK, spirits: [{ card: ROKU }], nexuses: [{ card: SWEETS, cores: 1 }] } },
    steps: (t) => attackHenzel(t, "自分.ロクケラトプス"),
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ============================================================
// BS18-070 ワルプルギスの夜
// ============================================================
console.log("=== 070. コアが1個の相手のスピリットのアタックでは自分のライフは減らない ===")
const oppAttacksMe = (t: ScenarioCtx, label: string) => {
    attack(t, "opp", label)
    t.closeFlash()
    t.act("me", { type: "takeLife" })
}
scenario({
    name: "070-コア1個のアタックではライフが減らない",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: WALP, cores: 0 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => oppAttacksMe(t, "相手.ロクケラトプス"),
    expect: ["相手.ロクケラトプス.疲労: false → true"],
})
scenario({
    name: "070-Lv2でもコア1個ならライフが減らない",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: WALP, cores: 2 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => oppAttacksMe(t, "相手.ロクケラトプス"),
    expect: ["相手.ロクケラトプス.疲労: false → true"],
})
scenario({
    name: "070-コア2個なら減る",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: WALP, cores: 0 }] }, opp: { spirits: [{ card: ROKU, cores: 2 }] } },
    steps: (t) => oppAttacksMe(t, "相手.ロクケラトプス"),
    expect: ["相手.ロクケラトプス.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "070-自分のアタックでは相手のライフは減る",
    start: { phase: "attack", me: { nexuses: [{ card: WALP, cores: 0 }], spirits: [{ card: ROKU }] } },
    steps: (t) => attackHenzel(t, "自分.ロクケラトプス"),
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
console.log("=== 070 Lv2. 系統「導魔」の自分のスピリットに【聖命】を与える ===")
scenario({
    name: "070-Lv2で導魔に聖命",
    start: { phase: "attack", me: { nexuses: [{ card: WALP, cores: 2 }], spirits: [{ card: WILL }] } },
    steps: (t) => attackHenzel(t, "自分.創造主グリム・ウィル"),
    expect: ["自分.創造主グリム・ウィル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "自分.ライフ: 5 → 6"],
})
scenario({
    name: "070-Lv1では聖命を与えない",
    start: { phase: "attack", me: { nexuses: [{ card: WALP, cores: 0 }], spirits: [{ card: WILL }] } },
    steps: (t) => attackHenzel(t, "自分.創造主グリム・ウィル"),
    expect: ["自分.創造主グリム・ウィル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "070-導魔でなければ聖命を与えない",
    start: { phase: "attack", me: { nexuses: [{ card: WALP, cores: 2 }], spirits: [{ card: ROKU }] } },
    steps: (t) => attackHenzel(t, "自分.ロクケラトプス"),
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ============================================================
// BS18-081 フェアヴァイレ（バースト：相手の『このスピリット/ブレイヴの召喚時』発揮後）
// ============================================================
console.log("=== 081. 召喚時効果をもう1度（自分のスピリットが発揮したものとして）→ 支払ってフラッシュ ===")
// 相手が グリプ・ハンズ（召喚時：1枚ドロー）を召喚する。召喚の支払いはコスト3＋Lv1のコア1個
const oppSummonsGrip = [
    `相手.手札: ${nm(GRIP)} → ${name(GORA)}`, "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 3",
    ...appear("相手.グリプ・ハンズ", { cores: 1, lv: 1, bp: 2000 }),
]
const fairUsed = ["自分.バースト: フェアヴァイレ → なし", `自分.トラッシュ: なし → ${name(FAIR)}`]
const fairStart = (mySpirits: { card: string; label?: string }[]) => ({
    turn: "opp" as const,
    interactive: true,
    me: { burst: FAIR, deck: GDECK, spirits: mySpirits },
    opp: { hand: [GRIP], deck: GDECK, spirits: [{ card: ROKU, label: "ロク乙" }] },
})
const summonGrip = (t: ScenarioCtx) => {
    t.act("opp", { type: "summon", handIndex: 0, level: 1 })
}
scenario({
    name: "081-もう1度発揮して支払いフラッシュ",
    start: fairStart([{ card: ROKU, label: "ロク甲" }]),
    steps(t) {
        summonGrip(t)
        settle(t)
        t.act("opp", { type: "nextPhase" })
        t.actRejected("opp", { type: "attack", instanceId: t.id("相手.ロク乙") })
    },
    expect: [
        ...oppSummonsGrip, ...fairUsed, `自分.手札: なし → ${name(GORA)}`, "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3",
    ],
})
scenario({
    name: "081-支払わなければフラッシュは発揮されない",
    start: fairStart([{ card: ROKU, label: "ロク甲" }]),
    steps(t) {
        summonGrip(t)
        settle(t, { no: /支払|コスト/ })
        t.act("opp", { type: "nextPhase" })
        attack(t, "opp", "相手.ロク乙")
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        ...oppSummonsGrip, ...fairUsed, `自分.手札: なし → ${name(GORA)}`, "自分.デッキ枚数: 40 → 39", "相手.ロク乙.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "081-自分のスピリットがいなければもう1度は発揮しないが支払いはできる",
    start: fairStart([]),
    steps(t) {
        summonGrip(t)
        settle(t)
        t.act("opp", { type: "nextPhase" })
        t.actRejected("opp", { type: "attack", instanceId: t.id("相手.ロク乙") })
    },
    expect: [...oppSummonsGrip, ...fairUsed, "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3"],
})

// ============================================================
// BS18-082 パニックヴォイス
// ============================================================
console.log("=== 082. アタックしていない相手のスピリットを疲労させ、そのスピリットでブロックする ===")
const paniced = spent("自分", PANIC, 7)
const oppAttackPanic = (target: string, after: (t: ScenarioCtx) => void) => (t: ScenarioCtx) => {
    attack(t, "opp", "相手.ポニサス")
    cast(t, "me", PANIC, target)
    t.closeFlash()
    after(t)
}
scenario({
    name: "082-相手のスピリットが自陣のアタッカーをブロックする",
    start: { turn: "opp", phase: "attack", me: { hand: [PANIC] }, opp: { spirits: [{ card: PONI }, { card: ROKU }] } },
    steps: oppAttackPanic("相手.ロクケラトプス", () => {}),
    // ブロッカー(ロク)は疲労してブロック、BPで負けて破壊。ライフは減らない
    expect: ["相手.ポニサス.疲労: false → true", gone("相手.ロクケラトプス"), `相手.トラッシュ: なし → ${name(ROKU)}`, "相手.リザーブ: 10 → 11", ...paniced],
})
scenario({
    name: "082-疲労状態のスピリットを指定するとブロックは起きない",
    start: { turn: "opp", phase: "attack", me: { hand: [PANIC] }, opp: { spirits: [{ card: PONI }, { card: ROKU, rested: true }] } },
    steps: oppAttackPanic("相手.ロクケラトプス", (t) => t.act("me", { type: "takeLife" })),
    expect: ["相手.ポニサス.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 4", ...paniced.filter((l) => !l.includes("リザーブ"))],
})
scenario({
    name: "082-対象が場を離れたら防御側が通常どおり決める",
    start: { turn: "opp", phase: "attack", me: { hand: [PANIC] }, opp: { hand: [LCHAIN], spirits: [{ card: PONI }, { card: ROKU }] } },
    steps(t) {
        attack(t, "opp", "相手.ポニサス")
        cast(t, "me", PANIC, "相手.ロクケラトプス")
        cast(t, "opp", LCHAIN, "相手.ロクケラトプス")
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    // ライフチェイン：ロク(コスト1)を破壊しコア1個＋ロク上のコア1個がリザーブへ。ブロッカーがいないので防御側(自分)がライフで受ける
    expect: [
        "相手.ポニサス.疲労: false → true", gone("相手.ロクケラトプス"), `相手.手札: ${nm(LCHAIN)} → なし`, `相手.トラッシュ: なし → ${nm(LCHAIN, ROKU)}`,
        "相手.リザーブ: 10 → 7", "相手.トラッシュのコア: 0 → 5", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 4", ...paniced.filter((l) => !l.includes("リザーブ")),
    ],
})
scenario({
    name: "082-ブロック前のフラッシュ以外では使えない",
    start: { phase: "attack", me: { spirits: [{ card: ROKU }] }, opp: { hand: [PANIC], spirits: [{ card: AIBAN }] } },
    steps(t) {
        attack(t, "me", "自分.ロクケラトプス")
        castRejected(t, "opp", PANIC, "相手.アイバーン")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "082-ブロック宣言後のフラッシュでは使えない",
    start: { turn: "opp", phase: "attack", me: { hand: [PANIC], spirits: [{ card: ROKU }] }, opp: { spirits: [{ card: PONI }, { card: AIBAN }] } },
    steps(t) {
        attack(t, "opp", "相手.ポニサス")
        t.closeFlash()
        block(t, "me", "自分.ロクケラトプス")
        castRejected(t, "me", PANIC, "相手.アイバーン")
        t.closeFlash()
    },
    expect: ["相手.ポニサス.疲労: false → true", gone("自分.ロクケラトプス"), `自分.トラッシュ: なし → ${name(ROKU)}`, "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "082-アタックしていないスピリットがいなければ使えない",
    start: { turn: "opp", phase: "attack", me: { hand: [PANIC] }, opp: { spirits: [{ card: PONI }] } },
    steps(t) {
        attack(t, "opp", "相手.ポニサス")
        castRejected(t, "me", PANIC)
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.ポニサス.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "082-同じ陣営のバトルでは呪撃は発揮しない",
    start: { turn: "opp", phase: "attack", me: { hand: [PANIC] }, opp: { spirits: [{ card: NEKURO, cores: 2 }, { card: PONI }] } },
    steps(t) {
        attack(t, "opp", "相手.ネクロウ")
        cast(t, "me", PANIC, "相手.ポニサス")
        t.closeFlash()
    },
    // ネクロウ(3000) は ポニサス(4000) に負けて破壊される。ポニサスは疲労するが、呪撃では破壊されない
    expect: [
        "相手.ネクロウ.疲労: false → true", gone("相手.ネクロウ"), `相手.トラッシュ: なし → ${name(NEKURO)}`, "相手.リザーブ: 10 → 12", "相手.ポニサス.疲労: false → true", ...paniced,
    ],
})

// ============================================================
// BS18-X05 聖魔皇メフィスト・フェレス
// ============================================================
console.log("=== X05. アタック時：マジック使用後、デッキ上4枚からバーストを条件無視で発動 ===")
const mephiStart = {
    phase: "attack" as const,
    me: { hand: [GATHER], deck: [XT, ROKU, ROKU, ROKU], spirits: [{ card: MEPHI }] },
}
const mephiMagic = ["自分.聖魔皇メフィスト・フェレス.疲労: false → true", "自分.聖魔皇メフィスト・フェレス.BP: 5000 → 6000", ...spent("自分", GATHER, 3).slice(0, 2)]
const mephiAttackCast = (t: ScenarioCtx, o?: Parameters<typeof settle>[1]) => {
    attack(t, "me", "自分.聖魔皇メフィスト・フェレス")
    cast(t, "me", GATHER, "自分.聖魔皇メフィスト・フェレス")
    settle(t, o)
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}
const oppLifeHit = ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]
scenario({
    name: "X05-マジック使用後にオープンして発動",
    start: mephiStart,
    steps: (t) => mephiAttackCast(t),
    // X012T のバースト（召喚する）は出来事に依存しないので条件無視で働く。残り3枚はデッキの下
    expect: [
        ...mephiMagic, "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", "自分.デッキ枚数: 4 → 3", ...oppLifeHit,
        ...appear("自分.英雄皇ロード・ドラゴン・ドミニオン", { cores: 1, lv: 1, bp: 5000 }),
    ],
})
scenario({
    name: "X05-オープンしない",
    start: mephiStart,
    steps: (t) => mephiAttackCast(t, { no: 0 }),
    expect: [...mephiMagic, "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3", ...oppLifeHit],
})
scenario({
    name: "X05-相手のマジック使用では発動しない",
    start: { ...mephiStart, me: { ...mephiStart.me, hand: [] }, opp: { hand: [GATHER], spirits: [{ card: ROKU }] } },
    steps(t) {
        attack(t, "me", "自分.聖魔皇メフィスト・フェレス")
        cast(t, "opp", GATHER, "相手.ロクケラトプス")
        settle(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.聖魔皇メフィスト・フェレス.疲労: false → true", "相手.ロクケラトプス.BP: 1000 → 2000", ...spent("相手", GATHER, 3, 1), "相手.ライフ: 5 → 4",
    ],
})
console.log("=== X05 Lv2. 相手に破壊されたとき手札かデッキの上に戻る ===")
const mephiBlocked = (cores: number, o?: Parameters<typeof settle>[1]) => ({
    start: {
        turn: "opp" as const, phase: "attack" as const,
        me: { spirits: [{ card: MEPHI, cores }] },
        opp: { spirits: [{ card: WINGAL, cores: 4 }] },
    },
    steps(t: ScenarioCtx) {
        attack(t, "opp", "相手.ウィンガル")
        t.closeFlash()
        block(t, "me", "自分.聖魔皇メフィスト・フェレス")
        t.closeFlash()
        settle(t, o)
    },
})
scenario({
    name: "X05-破壊されて手札に戻る",
    ...mephiBlocked(2, { prefer: "手札" }),
    expect: ["相手.ウィンガル.疲労: false → true", gone("自分.聖魔皇メフィスト・フェレス"), `自分.手札: なし → ${name(MEPHI)}`, "自分.リザーブ: 10 → 12"],
})
scenario({
    name: "X05-破壊されてデッキの上に戻る",
    ...mephiBlocked(2, { prefer: "デッキ" }),
    expect: ["相手.ウィンガル.疲労: false → true", gone("自分.聖魔皇メフィスト・フェレス"), "自分.デッキ枚数: 40 → 41", "自分.リザーブ: 10 → 12"],
})
scenario({
    name: "X05-Lv1では戻らずトラッシュへ",
    ...mephiBlocked(1),
    expect: ["相手.ウィンガル.疲労: false → true", gone("自分.聖魔皇メフィスト・フェレス"), `自分.トラッシュ: なし → ${name(MEPHI)}`, "自分.リザーブ: 10 → 11"],
})

// ============================================================
// X012T 英雄皇ロード・ドラゴン・ドミニオン（黄）
// ============================================================
console.log("=== X012T. 自分のライフ減少後バースト／召喚時にバーストをセットしてドロー／Lv3 BP+3000 ===")
const XTL = "自分.英雄皇ロード・ドラゴン・ドミニオン"
scenario({
    name: "X012T-ライフ減少後にバースト召喚",
    start: { turn: "opp", phase: "attack", me: { burst: XT }, opp: { spirits: [{ card: ROKU }] } },
    steps(t) {
        attack(t, "opp", "相手.ロクケラトプス")
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        settle(t)
    },
    // ライフのコアがリザーブへ(+1)、召喚のLv1コア(−1)
    expect: ["相手.ロクケラトプス.疲労: false → true", "自分.ライフ: 5 → 4", "自分.バースト: 英雄皇ロード・ドラゴン・ドミニオン → なし", ...appear(XTL, { cores: 1, lv: 1, bp: 5000 })],
})
scenario({
    name: "X012T-召喚時に手札のバースト持ちをセットしてドロー",
    start: { me: { hand: [XT, FAIR], deck: GDECK } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, level: 1 })
        settle(t)
    },
    expect: [
        `自分.手札: ${nm(XT, FAIR)} → ${name(GORA)}`, "自分.バースト: なし → フェアヴァイレ", "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6",
        ...appear(XTL, { cores: 1, lv: 1, bp: 5000 }),
    ],
})
scenario({
    name: "X012T-バースト持ちが手札に無ければドローしない",
    start: { me: { hand: [XT, ROKU], deck: GDECK } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, level: 1 })
        settle(t, { no: 0 })
    },
    expect: [`自分.手札: ${nm(XT, ROKU)} → ${nm(ROKU)}`, "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6", ...appear(XTL, { cores: 1, lv: 1, bp: 5000 })],
})
scenario({
    name: "X012T-Lv3でバーストをセットしている間BP+3000",
    start: { me: { burst: FAIR, spirits: [{ card: XT, cores: 5 }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [`${XTL}.BP: 10000 → 13000`],
})
scenario({
    name: "X012T-バーストが無ければBP+されない",
    start: { me: { spirits: [{ card: XT, cores: 5 }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})
scenario({
    name: "X012T-Lv2ではBP+されない",
    start: { me: { burst: FAIR, spirits: [{ card: XT, cores: 3 }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part660）")
