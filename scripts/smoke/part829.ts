// smoke パート829（BS22 青の残り：047・048・051・052・053・065・066・083・X13-06 の各効果節。BS22_PLAN §1・§2 の確定読み、BS19_PLAN の連鎖・強化）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, placeBurst, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const ATRAC = "BS22-047" // アトラック・ナチャ（青・コスト2・異合・自分のターン：無魔のLv+1）
const DEAN = "BS22-048" // 熱血巨人ディーン（青・コスト3・闘神）
const PYUMA = "BS22-051" // ピューマウロス（青・コスト5・異合・召喚時コスト4破壊＋連鎖白）
const TIGRIS = "BS22-052" // 古剣使ティグリス（青・コスト6・剣使/異合）
const NAGUR = "BS22-053" // 災将ナグリアス（青・コスト7・闘神・【強化】青・青シンボル2）
const BULL = "BS22-065" // ブル・アームズ（青・ブレイヴ・コスト5・合体条件コスト5以上）
const CORAL = "BS22-066" // コーラル・ジャガー（青・ブレイヴ・コスト6・合体条件コスト5以上）
const ABYSS = "BS22-083" // アビスブレイク（青・マジック・コスト4・フラッシュ）
const ALEK = "X13-06" // 機動大帝アレク・キャッスル（青・コスト6・闘神/造兵）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・Lv1BP3000・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・BP3000・効果なし）白シンボル
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・効果なし）緑シンボル
const SHEL = "BS11-044" // シェル・ゴレム（青・コスト4・効果なし）
const DUR = "P011" // 首無し騎士デュラハン（紫・コスト4・系統無魔/戦騎・Lv1BP3000/Lv2BP5000/Lv3BP7000・効果なし）
const KONOHA = "BS20-066" // コノハガニン（青のブレイヴ・緑シンボルを持たない）
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ・コスト4・合体条件コスト4以上）
const LORD = "SD06-007" // 英雄龍ロード・ドラゴン（赤・コスト6・バースト効果を持つスピリット）
const HYOGAN = "SD06-016" // 絶甲氷盾（白・マジック・バースト）
const SPEARS = "BS01-104" // 千本槍の古戦場（紫・ネクサス）
const KOBO = "BS07-065" // 造兵工房（青・ネクサス）
const GAKU = "BS06-088" // 計画された場外乱闘（青・ネクサス）
const BUTAI = "BS06-089" // 鎖縛の武舞台（青・ネクサス）
const DATAS = "BS20-050" // トライデントのデータス（青・コスト4・【粉砕】Lv1で1枚破棄）
const DOLPHIN = "BS06-061" // ドルフィーノ（青・コスト0・効果なし）青シンボル1
const ELIXIR = "BS01-142" // ピュアエリクサー（白・マジック）スピリットカードでない

console.log("=== 前提: カードの機械確認（BS22 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const chk = (id: string, name: string, type: string, cost: number) => {
        const c = byId(id)
        assert(c?.name === name && c.type === type && c.cost === cost && c.colors[0] === "blue", `${id} は${name}（青・${type}・コスト${cost}）`)
    }
    chk(ATRAC, "アトラック・ナチャ", "spirit", 2)
    chk(DEAN, "熱血巨人ディーン", "spirit", 3)
    chk(PYUMA, "ピューマウロス", "spirit", 5)
    chk(TIGRIS, "古剣使ティグリス", "spirit", 6)
    chk(NAGUR, "災将ナグリアス", "spirit", 7)
    chk(BULL, "ブル・アームズ", "brave", 5)
    chk(CORAL, "コーラル・ジャガー", "brave", 6)
    chk(ABYSS, "アビスブレイク", "magic", 4)
    chk(ALEK, "機動大帝アレク・キャッスル", "spirit", 6)
    assert(byId(TIGRIS)!.levels.map((l) => l.cores).join("/") === "1/2/4", "TIGRIS のLvコアは1/2/4")
    assert(byId(ALEK)!.levels.map((l) => l.cores).join("/") === "1/5", "ALEK のLvコアは1/5")
    assert(byId(ATRAC)!.family.includes("異合") && byId(NAGUR)!.family.includes("闘神"), "系統は ATRAC＝異合・NAGUR＝闘神")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).levels[0]!.bp === 1000, "VANはロクケラトプス")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).levels[0]!.bp === 3000 && getCard(STIRA).effect === "", "STIRAはスティラホーン")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).colors[0] === "white" && getCard(BELL).cost === 4 && getCard(BELL).effect === "", "BELLは白コスト4")
    assert(getCard(HERA).name === "ヘラクレス・ジオ" && getCard(HERA).colors[0] === "green" && getCard(HERA).effect === "", "HERAは緑")
    assert(getCard(SHEL).name === "シェル・ゴレム" && getCard(SHEL).colors[0] === "blue" && getCard(SHEL).cost === 4 && getCard(SHEL).effect === "", "SHELは青コスト4")
    assert(getCard(DUR).name === "首無し騎士デュラハン" && getCard(DUR).family.includes("無魔") && getCard(DUR).levels.map((l) => l.bp).join("/") === "3000/5000/7000" && getCard(DUR).effect === "", "DURは無魔・BP3000/5000/7000")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave" && getCard(KARAKURI).cost === 4, "KARAKURIはカラクリバッタ")
    assert(getCard(LORD).name === "英雄龍ロード・ドラゴン" && getCard(LORD).type === "spirit" && getCard(LORD).effect.includes("【バースト"), "LORDはバースト効果を持つスピリット")
    assert(getCard(HYOGAN).name === "絶甲氷盾" && getCard(HYOGAN).type === "magic", "HYOGANはバーストを持つマジック")
    assert(getCard(SPEARS).name === "千本槍の古戦場" && getCard(SPEARS).colors[0] === "purple" && getCard(SPEARS).type === "nexus", "SPEARSは紫ネクサス")
    assert(getCard(KOBO).name === "造兵工房" && getCard(KOBO).colors[0] === "blue" && getCard(KOBO).type === "nexus", "KOBOは青ネクサス")
    assert(getCard(GAKU).name === "計画された場外乱闘" && getCard(GAKU).colors[0] === "blue" && getCard(GAKU).type === "nexus", "GAKUは青ネクサス")
    assert(getCard(BUTAI).name === "鎖縛の武舞台" && getCard(BUTAI).colors[0] === "blue" && getCard(BUTAI).type === "nexus", "BUTAIは青ネクサス")
    assert(getCard(DATAS).name === "トライデントのデータス" && getCard(DATAS).effect.includes("【粉砕】"), "DATASは【粉砕】")
    assert(getCard(DOLPHIN).name === "ドルフィーノ" && getCard(DOLPHIN).colors[0] === "blue" && getCard(DOLPHIN).symbol.length === 1, "DOLPHINは青シンボル1つ")
    assert(getCard(ELIXIR).name === "ピュアエリクサー" && getCard(ELIXIR).type === "magic", "ELIXIRはマジック")
}

function game(seed: string, turnPlayer: PlayerId = "p1", phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

// option は optionPick が決める（"" を返すと選択肢を付けずに答える＝任意の確認を断る）。target は picks にあればそれ
function settle(s: GameState, picks: string[] = [], optionPick?: (options: string[]) => string | undefined): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const picked = optionPick?.(o) ?? o.find((x) => x === "発動する" || x === "はい") ?? o[0]
            err = picked === "" ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: picked ?? "" })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

const onField = (s: GameState, pid: PlayerId, id: string) => s.players[pid].field.spirits.some((x) => x.instanceId === id)

console.log("=== 047 Lv1･Lv2『自分のターン』：系統「無魔」を持つ自分のスピリットすべてのLvを1つ上として扱う（無魔以外・相手のターン・相手の無魔には効かない） ===")
for (const cores of [1, 3]) {
    const s = game(`atrac-${cores}`)
    put(s, "p1", ATRAC, cores) // Lv1／Lv2
    const dur = put(s, "p1", DUR, 1) // Lv1 BP3000
    const van = put(s, "p1", VAN, 1)
    const oppDur = put(s, "p2", DUR, 1)
    assert(effectiveBp(s, "p1", dur) === 5000, `Lv${cores === 1 ? 1 : 2}のアトラック・ナチャ：無魔のデュラハンはLv2扱いでBP5000`)
    assert(effectiveBp(s, "p1", van) === 1000, "無魔でないロクケラトプスはLvが上がらない")
    assert(effectiveBp(s, "p2", oppDur) === 3000, "相手の無魔スピリットにはLv+1が効かない")
}
{
    const s = game("atrac-opp-turn", "p2")
    put(s, "p1", ATRAC, 1)
    const dur = put(s, "p1", DUR, 1)
    assert(effectiveBp(s, "p1", dur) === 3000, "相手のターンは『自分のターン』の効果が働かずLv1のBP3000")
}

console.log("=== 048 『相手のアタックステップ』：相手のスピリットがアタックしたとき相手のデッキを1枚破棄し、スピリットカードなら回復する ===")
for (const mode of ["spirit", "magic"] as const) {
    const s = game(`dean-${mode}`, "p2")
    const dean = put(s, "p1", DEAN, 1)
    dean.isRested = true
    const attacker = put(s, "p2", VAN, 1)
    s.players.p2.deck = Array.from({ length: 40 }, () => (mode === "spirit" ? VAN : ELIXIR))
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のロクケラトプスでアタック")
    settle(s)
    assert(s.players.p2.deck.length === 39 && s.players.p2.trashCards.length === 1, "相手のデッキが1枚破棄される")
    assert(dean.isRested === (mode === "magic"), mode === "spirit" ? "破棄したのがスピリットカードなら回復する" : "スピリットカードでなければ回復しない")
}
{
    const s = game("dean-own-turn")
    const dean = put(s, "p1", DEAN, 1)
    dean.isRested = true
    const attacker = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "自分のスピリットでアタック")
    settle(s)
    assert(s.players.p2.deck.length === 40 && dean.isRested, "自分のアタックでは破棄も回復もしない")
}

console.log("=== 051 召喚時：コスト4の相手のスピリットすべてを破壊。連鎖《白》で相手のスピリット1体を手札に戻す（自分のスピリットは破壊しない・連鎖元が不発でも連鎖） ===")
for (const white of [true, false]) {
    const s = game(white ? "pyuma-white" : "pyuma-nowhite", "p1", "main")
    const ownBell = put(s, "p1", BELL, 1) // コスト4。自分のスピリットは破壊されない
    if (!white) s.players.p1.field.spirits = [] // 白シンボルを外す
    const shel = put(s, "p2", SHEL, 1)
    const oppBell = put(s, "p2", BELL, 1)
    const stira = put(s, "p2", STIRA, 1)
    const van = put(s, "p2", VAN, 1)
    s.players.p1.hand = [PYUMA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ピューマウロスを召喚できる")
    settle(s, [stira.instanceId])
    assert(!onField(s, "p2", shel.instanceId) && !onField(s, "p2", oppBell.instanceId), "コスト4の相手のスピリット2体はどちらも破壊される")
    if (white) assert(onField(s, "p1", ownBell.instanceId), "コスト4でも自分のスピリットは破壊されない")
    assert(onField(s, "p2", van.instanceId), "コスト1の相手のスピリットは破壊されない")
    assert(onField(s, "p2", stira.instanceId) === !white, white ? "白シンボルがあれば連鎖で選んだスティラホーンが場を離れる" : "白シンボルが無ければ連鎖は発揮せずスティラホーンは残る")
    assert(s.players.p2.hand.includes(STIRA) === white, white ? "戻したスティラホーンは相手の手札へ" : "相手の手札は増えない")
}
{
    const s = game("pyuma-no-cost4", "p1", "main")
    put(s, "p1", BELL, 1)
    const stira = put(s, "p2", STIRA, 1)
    s.players.p1.hand = [PYUMA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ピューマウロスを召喚できる")
    settle(s, [stira.instanceId])
    assert(!onField(s, "p2", stira.instanceId), "コスト4がいなくて連鎖元が不発でも、白シンボルがあれば連鎖で手札に戻せる")
}

console.log("=== 052 Lv1･Lv2･Lv3『自分のアタックステップ』：コスト5の自分のスピリットすべてをBP+4000（コスト5以外・相手・メインステップは対象外） ===")
{
    const s = game("tigris-aura")
    const tigris = put(s, "p1", TIGRIS, 1)
    const stira = put(s, "p1", STIRA, 1) // コスト5 BP3000
    const van = put(s, "p1", VAN, 1)
    const oppStira = put(s, "p2", STIRA, 1)
    assert(effectiveBp(s, "p1", stira) === 7000, "アタックステップ：コスト5のスティラホーンはBP+4000で7000")
    assert(effectiveBp(s, "p1", van) === 1000 && effectiveBp(s, "p1", tigris) === 5000, "コスト1とコスト6（自身）は上がらない")
    assert(effectiveBp(s, "p2", oppStira) === 3000, "相手のコスト5のスピリットは上がらない")
}
{
    const s = game("tigris-main", "p1", "main")
    put(s, "p1", TIGRIS, 1)
    const stira = put(s, "p1", STIRA, 1)
    assert(effectiveBp(s, "p1", stira) === 3000, "メインステップは『自分のアタックステップ』ではないので上がらない")
}

console.log("=== 052 【合体時】Lv2･Lv3『合体アタック時』：バースト効果を持つ相手のスピリット1体を破壊（Lv1・合体していない・バースト持ちがいない場合は破壊しない） ===")
for (const c of [
    { name: "lv2-combined", cores: 2, combined: true, destroyed: true },
    { name: "lv1-combined", cores: 1, combined: true, destroyed: false },
    { name: "lv2-alone", cores: 2, combined: false, destroyed: false },
]) {
    const s = game(`tigris-${c.name}`)
    const tigris = put(s, "p1", TIGRIS, c.cores)
    if (c.combined) combine(s, "p1", tigris, KARAKURI)
    const lord = put(s, "p2", LORD, 1)
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: tigris.instanceId }) === null, "ティグリスでアタック")
    settle(s, [van.instanceId, lord.instanceId])
    assert(onField(s, "p2", lord.instanceId) === !c.destroyed, c.destroyed ? "バースト効果を持つロード・ドラゴンが破壊される" : "条件を満たさないのでロード・ドラゴンは破壊されない")
    assert(onField(s, "p2", van.instanceId), "バースト効果を持たないロクケラトプスは破壊されない")
}
{
    const s = game("tigris-no-burst-spirit")
    const tigris = put(s, "p1", TIGRIS, 2)
    combine(s, "p1", tigris, KARAKURI)
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: tigris.instanceId }) === null, "ティグリスでアタック")
    settle(s, [van.instanceId])
    assert(onField(s, "p2", van.instanceId), "バースト効果を持つスピリットがいなければ何も破壊しない")
}

console.log("=== 052 連鎖《緑》：相手はバーストを発動できない（そのバトルの間。緑シンボルが無ければ発動できる） ===")
for (const green of [true, false]) {
    const s = game(green ? "tigris-green" : "tigris-nogreen")
    const tigris = put(s, "p1", TIGRIS, 2)
    combine(s, "p1", tigris, KONOHA) // カラクリバッタは緑シンボルを持つので「緑なし」が作れない
    if (green) put(s, "p1", HERA, 1)
    placeBurst(s, "p2", HYOGAN) // 【バースト：自分のライフ減少後】
    assert(act(s, "p1", { type: "attack", instanceId: tigris.instanceId }) === null, "ティグリスでアタック")
    settle(s)
    takeLifeAndResolve(s, "p2")
    settle(s)
    assert(green ? s.players.p2.life === 3 : s.players.p2.life < 5, "ライフで受けた（合体スピリットはシンボル2つで5→3。緑なしは発動したバーストの効果でライフが変わる）")
    assert((s.players.p2.burst !== null) === green, green ? "緑シンボルがあれば相手のバーストは発動されず伏せたまま" : "緑シンボルが無ければ相手のバーストは発動できる")
}

console.log("=== 052 連鎖《白》：ネクサスの色1色を指定し、その色の相手のネクサスすべてを手札に戻す（指定しない・白シンボル無しなら戻さない） ===")
for (const c of [
    { name: "purple", white: true, pick: "紫", spears: false, kobo: true },
    { name: "decline", white: true, pick: "", spears: true, kobo: true },
    { name: "nowhite", white: false, pick: "紫", spears: true, kobo: true },
]) {
    const s = game(`tigris-nexus-${c.name}`)
    const tigris = put(s, "p1", TIGRIS, 2)
    combine(s, "p1", tigris, KARAKURI)
    if (c.white) put(s, "p1", BELL, 1)
    const spears = putNexus(s, "p2", SPEARS, 0)
    const kobo = putNexus(s, "p2", KOBO, 0)
    assert(act(s, "p1", { type: "attack", instanceId: tigris.instanceId }) === null, "ティグリスでアタック")
    settle(s, [], (o) => (c.pick === "" ? "" : (o.find((x) => x.includes(c.pick) || x.includes("purple")) ?? o[0])))
    const has = (id: string) => s.players.p2.field.nexuses.some((x) => x.instanceId === id)
    assert(has(spears.instanceId) === c.spears, c.spears ? "紫のネクサスは手札に戻らない" : "指定した紫の相手のネクサスは手札に戻る")
    assert(has(kobo.instanceId) === c.kobo, "指定していない青のネクサスは戻らない")
    assert(s.players.p2.hand.includes(SPEARS) === !c.spears, c.spears ? "相手の手札は増えない" : "戻した千本槍の古戦場は相手の手札へ")
}

console.log("=== 053 【強化】青：自分の「相手へのデッキ破棄効果」の枚数を+1枚（【粉砕】Lv1の1枚が2枚に。相手の053では増えない） ===")
for (const c of [
    { name: "own-lv1", side: "p1" as PlayerId | null, cores: 1, milled: 2 },
    { name: "own-lv2", side: "p1" as PlayerId | null, cores: 5, milled: 2 },
    { name: "none", side: null, cores: 1, milled: 1 },
    { name: "opp", side: "p2" as PlayerId | null, cores: 1, milled: 1 },
]) {
    const s = game(`nagur-${c.name}`)
    if (c.side) put(s, c.side, NAGUR, c.cores)
    const datas = put(s, "p1", DATAS, 1)
    const deck = s.players.p2.deck.length
    assert(act(s, "p1", { type: "attack", instanceId: datas.instanceId }) === null, "データスでアタック")
    settle(s)
    assert(deck - s.players.p2.deck.length === c.milled, `【粉砕】Lv1の破棄は${c.milled}枚`)
    takeLifeAndResolve(s, "p2")
}

console.log("=== 065 【合体時】『バトル時』：相手の合体スピリットとバトルしている間BP+10000（相手が合体でない・合体でなくなったら働かない。アタック側・ブロック側の両方） ===")
{
    const s = game("bull-attack-vs-combined")
    const me = put(s, "p1", STIRA, 1)
    combine(s, "p1", me, BULL)
    const blocker = put(s, "p2", STIRA, 1)
    combine(s, "p2", blocker, KARAKURI)
    assert(act(s, "p1", { type: "attack", instanceId: me.instanceId }) === null, "ブル・アームズ合体でアタック")
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュを両者パス")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手の合体スピリットでブロック")
    settle(s)
    assert(effectiveBp(s, "p1", me) === 3000 + 10000, "相手の合体スピリットとバトルしている間BP+10000（3000→13000）")
    s.players.p2.field.combinedBraves = []
    blocker.braveRefs = []
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", me) === 3000, "相手が合体でなくなったらBP+10000は止まる（Q20330）")
}
{
    const s = game("bull-attack-vs-single")
    const me = put(s, "p1", STIRA, 1)
    combine(s, "p1", me, BULL)
    const blocker = put(s, "p2", STIRA, 1)
    assert(act(s, "p1", { type: "attack", instanceId: me.instanceId }) === null, "ブル・アームズ合体でアタック")
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュを両者パス")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "合体していないスピリットでブロック")
    settle(s)
    assert(effectiveBp(s, "p1", me) === 3000, "相手が合体していなければBP+10000されない")
}
{
    const s = game("bull-block-vs-combined", "p2")
    const me = put(s, "p1", STIRA, 1)
    combine(s, "p1", me, BULL)
    const attacker = put(s, "p2", STIRA, 1)
    combine(s, "p2", attacker, KARAKURI)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手の合体スピリットでアタック")
    assert(act(s, "p1", { type: "pass" }) === null && act(s, "p2", { type: "pass" }) === null, "フラッシュを両者パス")
    assert(declareBlock(s, "p1", me.instanceId) === null, "ブル・アームズ合体でブロック")
    settle(s)
    assert(effectiveBp(s, "p1", me) === 3000 + 10000, "ブロックしたときも相手の合体スピリットとバトルしている間BP+10000")
}

console.log("=== 066 Lv1『このブレイヴの召喚時』：最もコストの低い相手のスピリット1体を破壊（コストが同じなら選ぶ・相手がいなくても召喚できる） ===")
{
    const s = game("coral-lowest", "p1", "main")
    const van = put(s, "p2", VAN, 1) // コスト1
    const bell = put(s, "p2", BELL, 1)
    const stira = put(s, "p2", STIRA, 1)
    const own = put(s, "p1", VAN, 1)
    s.players.p1.hand = [CORAL]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "コーラル・ジャガーを召喚できる")
    settle(s, [bell.instanceId, stira.instanceId])
    assert(!onField(s, "p2", van.instanceId), "最もコストの低いロクケラトプスが破壊される")
    assert(onField(s, "p2", bell.instanceId) && onField(s, "p2", stira.instanceId), "ほかの相手のスピリットは破壊されない")
    assert(onField(s, "p1", own.instanceId), "自分のスピリットは破壊されない")
}
{
    const s = game("coral-tie", "p1", "main")
    const v1 = put(s, "p2", VAN, 1)
    const v2 = put(s, "p2", VAN, 1)
    const stira = put(s, "p2", STIRA, 1)
    s.players.p1.hand = [CORAL]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "コーラル・ジャガーを召喚できる")
    settle(s, [v2.instanceId, stira.instanceId])
    assert(onField(s, "p2", v1.instanceId) && !onField(s, "p2", v2.instanceId), "コストが同じ最低が複数なら選んだ1体（v2）だけ破壊される")
    assert(onField(s, "p2", stira.instanceId), "最低コストでないスティラホーンは候補外で破壊されない")
}
{
    const s = game("coral-no-target", "p1", "main")
    s.players.p1.hand = [CORAL]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "相手のスピリットがいなくても召喚できる")
    settle(s)
    assert(s.players.p1.field.combinedBraves.length + s.players.p1.field.spirits.length >= 1, "コーラル・ジャガーが場に出ている")
}

console.log("=== 083 フラッシュ：コスト4以下の相手のスピリット1体を破壊（コスト5は対象外）。メインステップでは使えない ===")
{
    const s = game("abyss-flash")
    const attacker = put(s, "p1", VAN, 1)
    const bell = put(s, "p2", BELL, 1)
    const stira = put(s, "p2", STIRA, 1)
    s.players.p1.hand = [ABYSS]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでアビスブレイクを使用できる")
    settle(s, [stira.instanceId, bell.instanceId])
    assert(!onField(s, "p2", bell.instanceId), "コスト4のベルが破壊される")
    assert(onField(s, "p2", stira.instanceId), "コスト5のスティラホーンは対象にできず破壊されない")
    assert(s.players.p1.trashCards.includes(ABYSS), "使ったマジックはトラッシュへ")
}
{
    const s = game("abyss-main", "p1", "main")
    const bell = put(s, "p2", BELL, 1)
    s.players.p1.hand = [ABYSS]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) !== null, "メインステップでは使えない")
    assert(onField(s, "p2", bell.instanceId) && s.players.p1.hand.includes(ABYSS), "拒否されたので盤面も手札も変わらない")
}

console.log("=== 083 連鎖《白》：相手のバースト1つを破棄（白シンボルが無ければ破棄しない・破壊対象がいなくても連鎖） ===")
for (const white of [true, false]) {
    const s = game(white ? "abyss-chain-white" : "abyss-chain-nowhite")
    const attacker = put(s, "p1", VAN, 1)
    if (white) put(s, "p1", BELL, 1)
    const bell = put(s, "p2", BELL, 1)
    placeBurst(s, "p2", HYOGAN)
    s.players.p1.hand = [ABYSS]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでアビスブレイクを使用できる")
    settle(s, [bell.instanceId])
    assert(!onField(s, "p2", bell.instanceId), "コスト4のベルは破壊される")
    assert((s.players.p2.burst === null) === white, white ? "白シンボルがあれば相手のバーストが破棄される" : "白シンボルが無ければバーストは残る")
    assert(s.players.p2.trashCards.includes(HYOGAN) === white, white ? "破棄したバーストは相手のトラッシュへ" : "トラッシュは増えない")
}
{
    const s = game("abyss-chain-no-target")
    const attacker = put(s, "p1", VAN, 1)
    put(s, "p1", BELL, 1)
    const stira = put(s, "p2", STIRA, 1)
    placeBurst(s, "p2", HYOGAN)
    s.players.p1.hand = [ABYSS]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "対象がいなくてもアビスブレイクを使用できる")
    settle(s)
    assert(onField(s, "p2", stira.instanceId), "コスト5しかいないので何も破壊されない")
    assert(s.players.p2.burst === null, "連鎖元が不発でも白シンボルがあれば相手のバーストを破棄する（Q773）")
}

console.log("=== X13-06 Lv1･Lv2【強襲：2】：アタック時、ターンに2回まで、自分のネクサス1つを疲労させて回復できる（断ると回復しない） ===")
{
    const s = game("alek-assault-accept")
    const alek = put(s, "p1", ALEK, 1)
    const nexus = putNexus(s, "p1", KOBO)
    assert(act(s, "p1", { type: "attack", instanceId: alek.instanceId }) === null, "アレク・キャッスルでアタック")
    settle(s, [nexus.instanceId])
    assert(alek.isRested === false && nexus.isRested === true, "ネクサスを疲労させてアレク・キャッスルが回復する")
}
{
    const s = game("alek-assault-decline")
    const alek = put(s, "p1", ALEK, 1)
    const nexus = putNexus(s, "p1", KOBO)
    assert(act(s, "p1", { type: "attack", instanceId: alek.instanceId }) === null, "アレク・キャッスルでアタック")
    settle(s, [], () => "")
    assert(alek.isRested === true && nexus.isRested === false, "断ると回復せずネクサスも疲労しない")
}
{
    const s = game("alek-assault-twice")
    const alek = put(s, "p1", ALEK, 1)
    const nexuses = [putNexus(s, "p1", KOBO), putNexus(s, "p1", GAKU), putNexus(s, "p1", BUTAI)]
    const restedCount = () => nexuses.filter((n) => n.isRested).length
    for (const n of [1, 2]) {
        assert(act(s, "p1", { type: "attack", instanceId: alek.instanceId }) === null, `${n}回目のアタック`)
        settle(s)
        assert(alek.isRested === false && restedCount() === n, `${n}回目：回復し、疲労したネクサスは${n}つ`)
        takeLifeAndResolve(s, "p2")
    }
    assert(act(s, "p1", { type: "attack", instanceId: alek.instanceId }) === null, "3回目のアタック")
    settle(s)
    assert(alek.isRested === true && restedCount() === 2, "ターンに2回までなので3回目は回復せず、ネクサスも疲労しない")
}

console.log("=== X13-06 Lv2『アタック時』：自分の青のシンボル1つにつき相手のデッキを上から1枚破棄（Lv1では破棄しない） ===")
for (const c of [
    { name: "lv2-alone", cores: 5, extra: false, milled: 1 },
    { name: "lv2-symbols", cores: 5, extra: true, milled: 3 },
    { name: "lv1", cores: 1, extra: true, milled: 0 },
]) {
    const s = game(`alek-mill-${c.name}`)
    const alek = put(s, "p1", ALEK, c.cores)
    put(s, "p1", BELL, 1) // 白・緑は数えない
    put(s, "p1", HERA, 1)
    if (c.extra) {
        put(s, "p1", DOLPHIN, 1) // 青1
        putNexus(s, "p1", KOBO) // 青のネクサス1
    }
    assert(act(s, "p1", { type: "attack", instanceId: alek.instanceId }) === null, "アレク・キャッスルでアタック")
    settle(s, [], () => "")
    assert(40 - s.players.p2.deck.length === c.milled, `青シンボルの数だけ破棄（${c.milled}枚）`)
}

console.log("すべてのチェックに合格しました 🎉（part829）")
