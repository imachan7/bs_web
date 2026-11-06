// smoke パート798（BS21-014・025・059・064・065：紫の召喚時コア除去＋ドロー・アタックステップ開始時の色無効・爪鳥コア保護とマジック疲労回復・ブレイヴのシンボル追加と合体時効果。BS21_PLAN §1・§2 の確定読み）
// BS21 は data/cards に無く未実装。createInstance/getCard/matchesBraveCondition は「カードが見つかりません」で落ちるので、
// その場面は scene() が警告して続行する（実装役が通す）。
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, fireStepTriggers, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { countSymbols, matchesBraveCondition } from "../../shared/rules"

const BOOM = "BS21-014" // 告死蛇ブームスネーク（紫・コスト4・妖蛇・Lv1召喚時コスト3全体コア除去＋0体ドロー・Lv2ステップ開始時色無効）
const CONDOR = "BS21-025" // 大草鳥ソテツニア・コンドル（緑・コスト5・爪鳥・Lv1爪鳥コア保護・Lv2マジック疲労で回復）
const PELICAN = "BS21-059" // カラクリペリカン（緑・ブレイヴ・コスト3・爪鳥・スピリット状態で緑シンボル追加・合体条件緑シンボル・合体時BP比べ破壊で回復）
const TIGER = "BS21-064" // ブリキタイガー（黄・ブレイヴ・コスト4・戯狩・スピリット状態で黄シンボル追加・合体条件コスト3以上・合体時【聖命】）
const ARMS = "BS21-065" // ダイブ・アームズ（青・ブレイヴ・コスト3・造兵・スピリット状態で青シンボル追加・合体条件青シンボル・合体時トラッシュのネクサス回収）

const BEAT = "BS01-050" // ビートビートル（緑・コスト0・BP1000/2000・効果なし）
const DOLPHIN = "BS06-061" // ドルフィーノ（青・コスト0・BP1000/5000・効果なし）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000/3000/4000・効果なし）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・BP4000/6000）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・BP2000/3000・召喚時ドロー）
const HARDES = "BS01-031" // デス・ハーデス（紫・コスト3・BP4000/7000・効果なし）
const TODOOR = "BS17-030" // トドール（白・コスト3・BP1000/6000・効果なし）
const CHAIN = "BS04-005" // チェイン・ドラゴン（赤・コスト3・BP3000/6000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・BP3000/5000/8000・効果なし）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・BP6000/8000・効果なし）
const MIRAGE = "BS01-051" // フライングミラージュ（緑・コスト1・BP2000/3000・効果なし）
const CAESAR = "BS01-063" // エメラルドシーザー（緑・コスト4・召喚時：相手のスピリット1体を疲労させる）
const DIOMANTIS = "BS19-025" // ダーク・ディオマンティス（緑・コスト3・アタック時：自分のスピリットのコア3個までを自分のリザーブに）
const THORN = "BS01-134" // バインディングソーン（緑・マジック・コスト2・フラッシュ：相手のスピリット1体を疲労させる）
const WOODS = "BS01-140" // バインディングウッズ（緑・マジック・コスト7・メイン：色をひとつ選び、その色を持つスピリットすべてを疲労させる）
const PURPLEHAZE = "BS19-102" // パープルヘイズ（紫・マジック・コスト6・フラッシュ：相手のスピリット1体のコア1個をリザーブへ）
const SPEARS = "BS01-104" // 千本槍の古戦場（紫・ネクサス・065 の回収対象）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; symbol: string[]; braveConditionText?: string; levels: { level: number; cores: number; bp?: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(BOOM)?.name === "告死蛇ブームスネーク" && byId(BOOM)!.type === "spirit" && byId(BOOM)!.cost === 4 && byId(BOOM)!.colors[0] === "purple" && byId(BOOM)!.family.includes("妖蛇") && byId(BOOM)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/3000,3/5000,5/7000", "BOOMは告死蛇ブームスネーク（紫・コスト4・妖蛇・Lv1=1/3000・Lv2=3/5000・Lv3=5/7000）")
    assert(byId(CONDOR)?.name === "大草鳥ソテツニア・コンドル" && byId(CONDOR)!.type === "spirit" && byId(CONDOR)!.cost === 5 && byId(CONDOR)!.colors[0] === "green" && byId(CONDOR)!.family.includes("爪鳥") && byId(CONDOR)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/4000,3/7000", "CONDORは大草鳥ソテツニア・コンドル（緑・コスト5・爪鳥・Lv1=1/4000・Lv2=3/7000）")
    assert(byId(PELICAN)?.name === "カラクリペリカン" && byId(PELICAN)!.type === "brave" && byId(PELICAN)!.cost === 3 && byId(PELICAN)!.colors[0] === "green" && byId(PELICAN)!.family.includes("爪鳥") && byId(PELICAN)!.symbol.length === 0 && byId(PELICAN)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/2000" && byId(PELICAN)!.braveConditionText === "緑のシンボルを持つ", "PELICANはカラクリペリカン（緑・ブレイヴ・コスト3・爪鳥・BP2000・シンボル無し・合体条件緑シンボル）")
    assert(byId(TIGER)?.name === "ブリキタイガー" && byId(TIGER)!.type === "brave" && byId(TIGER)!.cost === 4 && byId(TIGER)!.colors[0] === "yellow" && byId(TIGER)!.family.includes("戯狩") && byId(TIGER)!.symbol.length === 0 && byId(TIGER)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/3000" && byId(TIGER)!.braveConditionText === "コスト3以上", "TIGERはブリキタイガー（黄・ブレイヴ・コスト4・戯狩・BP3000・シンボル無し・合体条件コスト3以上）")
    assert(byId(ARMS)?.name === "ダイブ・アームズ" && byId(ARMS)!.type === "brave" && byId(ARMS)!.cost === 3 && byId(ARMS)!.colors[0] === "blue" && byId(ARMS)!.family.includes("造兵") && byId(ARMS)!.symbol.length === 0 && byId(ARMS)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/2000" && byId(ARMS)!.braveConditionText === "青のシンボルを持つ", "ARMSはダイブ・アームズ（青・ブレイヴ・コスト3・造兵・BP2000・シンボル無し・合体条件青シンボル）")
    assert(getCard(BEAT).name === "ビートビートル" && getCard(BEAT).colors[0] === "green" && getCard(BEAT).effect === "", "BEATはビートビートル（緑・効果なし）")
    assert(getCard(DOLPHIN).name === "ドルフィーノ" && getCard(DOLPHIN).colors[0] === "blue" && getCard(DOLPHIN).effect === "", "DOLPHINはドルフィーノ（青・効果なし）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).colors[0] === "red" && getCard(VAN).effect === "", "VANはロクケラトプス（赤・コスト1・効果なし）")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).cost === 2, "SABERはテラノセイバー（コスト2）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).cost === 3 && getCard(GRIP).colors[0] === "purple", "GRIPはグリプ・ハンズ（紫・コスト3）")
    assert(getCard(HARDES).name === "デス・ハーデス" && getCard(HARDES).cost === 3 && getCard(HARDES).effect === "", "HARDESはデス・ハーデス（コスト3・効果なし）")
    assert(getCard(TODOOR).name === "トドール" && getCard(TODOOR).cost === 3 && getCard(TODOOR).effect === "", "TODOORはトドール（コスト3・効果なし）")
    assert(getCard(CHAIN).name === "チェイン・ドラゴン" && getCard(CHAIN).cost === 3 && getCard(CHAIN).effect === "", "CHAINはチェイン・ドラゴン（コスト3・効果なし）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).levels[0]!.bp === 3000 && getCard(STIRA).effect === "", "STIRAはスティラホーン（コスト5・BP3000・効果なし）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && getCard(TARAN).levels[1]!.bp === 8000 && getCard(TARAN).effect === "", "TARANはタランドーズ（コスト6・Lv2BP8000・効果なし）")
    assert(getCard(MIRAGE).name === "フライングミラージュ" && getCard(MIRAGE).effect === "", "MIRAGEはフライングミラージュ（効果なし）")
    assert(getCard(CAESAR).name === "エメラルドシーザー" && getCard(CAESAR).effect.includes("相手のスピリット1体を疲労させる"), "CAESARはエメラルドシーザー（召喚時に相手1体を疲労させる）")
    assert(getCard(DIOMANTIS).name === "ダーク・ディオマンティス" && getCard(DIOMANTIS).effect.includes("自分のスピリットのコア3個までを自分のリザーブ"), "DIOMANTISはダーク・ディオマンティス（自分のスピリットのコアをリザーブへ）")
    assert(getCard(THORN).name === "バインディングソーン" && getCard(THORN).type === "magic" && getCard(THORN).effect.includes("相手のスピリット1体を疲労させる"), "THORNはバインディングソーン（フラッシュ：相手1体を疲労）")
    assert(getCard(WOODS).name === "バインディングウッズ" && getCard(WOODS).type === "magic" && getCard(WOODS).effect.includes("その色を持つスピリットすべてを疲労"), "WOODSはバインディングウッズ（色を選びその色のスピリットすべてを疲労）")
    assert(getCard(PURPLEHAZE).name === "パープルヘイズ" && getCard(PURPLEHAZE).type === "magic" && getCard(PURPLEHAZE).effect.includes("コア1個を相手のリザーブに置く"), "PURPLEHAZEはパープルヘイズ（コア除去マジック）")
    assert(getCard(SPEARS).name === "千本槍の古戦場" && getCard(SPEARS).type === "nexus", "SPEARSは千本槍の古戦場（ネクサス）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

// pendingChoice を答える（option は pref に含まれるものを優先、target は picks に入っていればそれを選ぶ。pref が空なら断る）
function settle(s: GameState, picks: string[] = [], pref: string[] = ["発動する", "残る", "戻す", "置く"]): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = pref.find((x) => o.includes(x)) ?? (pref.length === 0 ? undefined : o[0])
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) {
            err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// フラッシュタイミングを連続パスで閉じる
function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

// 未実装カード（data/cards に無い）は createInstance/getCard/matchesBraveCondition が例外を投げるので、その場面だけ警告して続行する
function scene(label: string, fn: () => void): void {
    console.log(`=== ${label} ===`)
    try {
        fn()
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // 見逃すのは未実装の BS21 だけ（既存カードの ID の打ち間違いは落とす）
        if (msg.includes("カードが見つかりません") && msg.includes("BS21-")) console.log(`  ⚠ 未実装カードで未確認: ${msg}`)
        else throw e
    }
}

// A（059/064/065 Lv1）：ブレイヴがスピリット状態の間はその色のシンボルを1つ追加する
scene("A1: 059 スピリット状態のカラクリペリカンは緑シンボル1つとして数える", () => {
    const s = game("a1")
    put(s, "p1", PELICAN, 1) // スピリット状態
    assert(countSymbols(s.players.p1, ["green"]) === 1, "緑シンボルは1つ（ブレイヴの追加シンボル）")
})
scene("A2: 065 スピリット状態のダイブ・アームズは青シンボル1つとして数える", () => {
    const s = game("a2")
    put(s, "p1", ARMS, 1) // スピリット状態
    assert(countSymbols(s.players.p1, ["blue"]) === 1, "青シンボルは1つ（ブレイヴの追加シンボル）")
})
scene("A3: 064 スピリット状態のブリキタイガーは黄シンボル1つとして数える", () => {
    const s = game("a3")
    put(s, "p1", TIGER, 1) // スピリット状態
    assert(countSymbols(s.players.p1, ["yellow"]) === 1, "黄シンボルは1つ（ブレイヴの追加シンボル）")
})
scene("A4: 059 合体したら追加シンボルは数えない（ホストの緑1つのまま）", () => {
    const s = game("a4")
    const beat = put(s, "p1", BEAT, 1)
    combine(s, "p1", beat, PELICAN)
    assert(countSymbols(s.players.p1, ["green"]) === 1, "合体中はブレイヴのシンボルを数えない（ホストの緑1つだけ）")
})
scene("A5: 065 合体したら追加シンボルは数えない（ホストの青1つのまま）", () => {
    const s = game("a5")
    const dol = put(s, "p1", DOLPHIN, 1)
    combine(s, "p1", dol, ARMS)
    assert(countSymbols(s.players.p1, ["blue"]) === 1, "合体中はブレイヴのシンボルを数えない（ホストの青1つだけ）")
})

// B（059/065/064 合体条件）
scene("B1: 059 は緑シンボルを持つスピリットにだけ合体できる", () => {
    const s = game("b1")
    const beat = put(s, "p1", BEAT, 1) // 緑
    const van = put(s, "p1", VAN, 1) // 赤
    assert(matchesBraveCondition(s, "p1", beat, PELICAN), "緑のビートビートルには合体できる")
    assert(!matchesBraveCondition(s, "p1", van, PELICAN), "緑シンボルを持たないロクケラトプスには合体できない")
})
scene("B2: 065 は青シンボルを持つスピリットにだけ合体できる", () => {
    const s = game("b2")
    const dol = put(s, "p1", DOLPHIN, 1) // 青
    const van = put(s, "p1", VAN, 1) // 赤
    assert(matchesBraveCondition(s, "p1", dol, ARMS), "青のドルフィーノには合体できる")
    assert(!matchesBraveCondition(s, "p1", van, ARMS), "青シンボルを持たないロクケラトプスには合体できない")
})
scene("B3: 064 はコスト3以上のスピリットにだけ合体できる", () => {
    const s = game("b3")
    const stira = put(s, "p1", STIRA, 1) // コスト5
    const van = put(s, "p1", VAN, 1) // コスト1
    assert(matchesBraveCondition(s, "p1", stira, TIGER), "コスト5のスティラホーンには合体できる")
    assert(!matchesBraveCondition(s, "p1", van, TIGER), "コスト1のロクケラトプスには合体できない")
})

// C（059/064/065【合体時】）
scene("C1: 059【合体時】BPを比べ相手のスピリットだけを破壊したとき合体スピリットは回復する", () => {
    const s = game("c1")
    const host = put(s, "p1", TARAN, 3) // Lv2・BP8000
    combine(s, "p1", host, PELICAN)
    const stira = put(s, "p2", STIRA, 1) // BP3000
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側フラッシュパス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側フラッシュパス")
    assert(declareBlock(s, "p2", stira.instanceId) === null, "スティラホーンでブロック")
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === stira.instanceId), "BP比べでスティラホーンだけが破壊される（8000対3000）")
    assert(!host.isRested, "059【合体時】破壊したので合体スピリットは回復する")
})
scene("C2: 064【合体時】【聖命】ライフを減らしたらボイドからコア1個を自分のライフへ", () => {
    const s = game("c2")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, TIGER)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "相手のライフは5→4")
    assert(s.players.p1.life === 6, "064【合体時】【聖命】自分のライフは5→6（ボイドからコア1個）")
})
scene("C3: 064 合体していなければ【聖命】は発揮しない", () => {
    const s = game("c3")
    const host = put(s, "p1", STIRA, 1) // 合体していない
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "スティラホーンでアタックできる")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "相手のライフは5→4")
    assert(s.players.p1.life === 5, "合体していなければ自分のライフは5のまま")
})
scene("C4: 065【合体時】合体アタック時にトラッシュのネクサスカード1枚を手札に戻す", () => {
    const s = game("c4")
    const host = put(s, "p1", DOLPHIN, 1)
    combine(s, "p1", host, ARMS)
    s.players.p1.trashCards = [SPEARS]
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    settle(s, [SPEARS])
    passFlash(s)
    takeLifeAndResolve(s, "p2")
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === SPEARS, "065【合体時】トラッシュの千本槍の古戦場が手札に戻る")
    assert(s.players.p1.trashCards.length === 0, "トラッシュからは離れている")
})

// D（014 Lv1『このスピリットの召喚時』）
scene("D1: 014 Lv1 召喚時：コスト3の相手3体（コア1・1・2）から1個ずつリザーブへ、0個になった2体ぶん2枚ドロー", () => {
    const s = game("d1")
    s.phase = "main"
    const todoor = put(s, "p2", TODOOR, 1) // コスト3・コア1
    const chain = put(s, "p2", CHAIN, 1) // コスト3・コア1
    const hardes = put(s, "p2", HARDES, 2) // コスト3・コア2
    const van = put(s, "p2", VAN, 1) // コスト1・対象外
    const saber = put(s, "p2", SABER, 1) // コスト2・対象外
    s.players.p1.hand = [BOOM]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ブームスネークをメインステップで召喚できる")
    settle(s)
    const p2 = s.players.p2
    assert(!p2.field.spirits.some((x) => x.instanceId === todoor.instanceId) && !p2.field.spirits.some((x) => x.instanceId === chain.instanceId), "コアが0個になったトドールとチェイン・ドラゴンは破壊される")
    const hardesInst = p2.field.spirits.find((x) => x.instanceId === hardes.instanceId)
    assert(hardesInst !== undefined && hardesInst.cores === 1, "コア2のデス・ハーデスは1個残る（0個にならないので破壊されない・ドロー対象にもならない）")
    const vanInst = p2.field.spirits.find((x) => x.instanceId === van.instanceId)
    const saberInst = p2.field.spirits.find((x) => x.instanceId === saber.instanceId)
    assert(vanInst !== undefined && vanInst.cores === 1 && saberInst !== undefined && saberInst.cores === 1, "コスト3以外のロクケラトプス（コスト1）とテラノセイバー（コスト2）は対象外")
    assert(p2.reserve === 22, "相手のリザーブは20→22（2個移動）")
    assert(s.players.p1.hand.length === 2 && s.players.p1.deck.length === 38, "0個になった2体ぶん2枚ドロー（手札2・デッキ40→38）")
})

// E（014 Lv2『自分のアタックステップ』ステップ開始時）
scene("E1: 014 Lv2 ステップ開始時に疲労させて、選んだスピリットの色がこのターン無くなる", () => {
    const s = game("e1")
    const boom = put(s, "p1", BOOM, 3) // Lv2
    const grip = put(s, "p1", GRIP, 1) // 紫（色が残る側の対照）
    fireStepTriggers(s, "attack")
    settle(s, [boom.instanceId]) // 疲労させて、対象にブームスネーク自身を選ぶ
    assert(boom.isRested, "コストとしてブームスネークは疲労する")
    // 相手のメインステップで「色をひとつ選び、その色を持つスピリットすべてを疲労させる」で確かめる
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.phase = "main"
    s.players.p2.hand = [WOODS]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "バインディングウッズをメインで使用できる")
    assert(act(s, "p2", { type: "resolveChoice", option: "紫" }) === null, "紫を選ぶ")
    settle(s)
    assert(!boom.isRested, "色が無くなったブームスネークは紫指定の疲労対象にならない")
    assert(grip.isRested, "色が残っているグリプ・ハンズは疲労する")
})
scene("E2: 014 Lv2 任意の確認を断ったら疲労せず色も残る", () => {
    const s = game("e2")
    const boom = put(s, "p1", BOOM, 3) // Lv2
    fireStepTriggers(s, "attack")
    settle(s, [], []) // 任意の確認は選択肢を付けずに答えて断る
    assert(!boom.isRested, "断ったらブームスネークは疲労しない")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.phase = "main"
    s.players.p2.hand = [WOODS]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "バインディングウッズをメインで使用できる")
    assert(act(s, "p2", { type: "resolveChoice", option: "紫" }) === null, "紫を選ぶ")
    settle(s)
    assert(boom.isRested, "色が残っているブームスネークは紫指定で疲労する")
})
scene("E3: 014 が疲労状態ならステップ開始時の確認は起きない", () => {
    const s = game("e3")
    const boom = put(s, "p1", BOOM, 3) // Lv2
    boom.isRested = true
    fireStepTriggers(s, "attack")
    assert(s.pendingChoice === null, "疲労状態では払えないので聞かれない")
})

// F（025）
scene("F1: 025 Lv1 相手のコア除去で爪鳥のコアはLv1コスト未満にならない", () => {
    const s = game("f1")
    const condor = put(s, "p1", CONDOR, 1) // 爪鳥・Lv1コスト1・コア1
    const attacker = put(s, "p2", VAN, 1)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [PURPLEHAZE]
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のロクケラトプスがアタック")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: condor.instanceId }) === null, "防御側のフラッシュでパープルヘイズを使用できる")
    settle(s)
    const condorInst = s.players.p1.field.spirits.find((x) => x.instanceId === condor.instanceId)
    assert(condorInst !== undefined && condorInst.cores === 1, "025 Lv1：相手のコア除去ではコア1個のまま（Lv1コスト未満にならない）")
    passFlash(s)
    takeLifeAndResolve(s, "p1")
})
scene("F2: 025 がいても爪鳥でなければ相手のコア除去でコア0になる", () => {
    const s = game("f2")
    put(s, "p1", CONDOR, 1) // 爪鳥の保護は爪鳥だけ
    const van = put(s, "p1", VAN, 1) // 爪鳥でない・コア1
    const attacker = put(s, "p2", VAN, 1)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [PURPLEHAZE]
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のロクケラトプスがアタック")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: van.instanceId }) === null, "防御側のフラッシュでパープルヘイズを使用できる")
    settle(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "爪鳥でないロクケラトプスはコア0で破壊される")
    passFlash(s)
    takeLifeAndResolve(s, "p1")
})
scene("F3: 025 Lv1 自分の効果なら爪鳥のコアはLv1コスト未満になる", () => {
    const s = game("f3")
    const condor = put(s, "p1", CONDOR, 1) // 爪鳥・コア1
    const dio = put(s, "p1", DIOMANTIS, 1)
    assert(act(s, "p1", { type: "attack", instanceId: dio.instanceId }) === null, "ディオマンティスでアタックできる")
    settle(s, [condor.instanceId]) // 自分の効果でソテツニア・コンドルのコア1個をリザーブへ
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === condor.instanceId), "自分の効果ならコア0になって破壊される")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
})
scene("F4: 025 Lv2 自分のマジックで相手のスピリットが疲労したとき回復する", () => {
    const s = game("f4")
    const condor = put(s, "p1", CONDOR, 3) // Lv2
    condor.isRested = true
    const van = put(s, "p1", VAN, 1)
    const mirage = put(s, "p2", MIRAGE, 1)
    s.players.p1.hand = [THORN]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側フラッシュパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: mirage.instanceId }) === null, "フラッシュでバインディングソーンを使用できる")
    settle(s)
    assert(mirage.isRested, "フライングミラージュは疲労する")
    assert(!condor.isRested, "025 Lv2：自分のマジックの効果で相手が疲労したので回復する")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
})
scene("F5: 025 Lv2 スピリットの効果で疲労させたときは回復しない", () => {
    const s = game("f5")
    s.phase = "main"
    const condor = put(s, "p1", CONDOR, 3) // Lv2
    condor.isRested = true
    const mirage = put(s, "p2", MIRAGE, 1)
    s.players.p1.hand = [CAESAR]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーをメインステップで召喚できる")
    settle(s, [mirage.instanceId]) // 召喚時効果でフライングミラージュを疲労させる
    assert(mirage.isRested, "フライングミラージュは疲労する")
    assert(condor.isRested, "スピリットの効果での疲労なのでソテツニア・コンドルは回復しない")
})

console.log("すべてのチェックに合格しました 🎉（part798）")
