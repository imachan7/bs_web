// smoke パート792（BS20-029〜036・062・070・079・080：白スピリットのデッキ破棄禁止・重装甲・相手効果破壊で残る・手札増加誘発・ブロック時BP+・連鎖・合体時コア・強化回復・アタック時オープン・ブレイヴ召喚時・ネクサス手札保護・マジック）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SAT = "BS20-029" // サテラット（白・コスト3・Lv1 BP1000/Lv2 BP5000）
const OSHIN = "BS20-030" // 氷楯の守護者オーシン（白・コスト3・武装・Lv1 BP2000/Lv2 BP4000）
const MISSIL = "BS20-031" // ミサイリス（白・コスト4・Lv1 BP3000/Lv2 BP6000）
const BRIGIT = "BS20-032" // 氷刃の剣使いブリギット（白・コスト5・剣使/氷姫・Lv1 BP4000/Lv2 BP5000/Lv3 BP7000）
const CERB = "BS20-033" // ネガ・ケルベロス（白・コスト5・Lv1 BP4000/Lv2 BP6000）
const TIGER = "BS20-034" // ネガ・サーベルタイガー（白・コスト6・Lv1 BP4000/Lv2 BP6000/Lv3 BP8000）
const SPRING = "BS20-035" // ネガ・スプリンガー（白・コスト6・Lv1 BP5000/Lv2 BP8000/Lv3 BP10000）
const GOLMAC = "BS20-036" // 重装騎士ゴル・マック（白・コスト8・武装・Lv1 BP6000/Lv2 BP9000）
const CATAP = "BS20-062" // カタパシール（白・ブレイヴ・コスト4・機獣・合体条件：コスト4以上）
const MIRROR = "BS20-070" // 鏡面世界への入口（白・ネクサス・コスト4・Lv1 コア0/Lv2 コア2）
const DAURA = "BS20-079" // ダークネスオーラ（白・マジック・コスト3・フラッシュ）
const REPAIR = "BS20-080" // パーフェクトリペアー（白・マジック・コスト4・フラッシュ）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const RIO = "BS17-040" // 呪術士リオ（黄・コスト3・効果なし）黄シンボル
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・Lv1 BP4000）
const HERA = "BS01-058" // ヘラクレス・ジオ（赤・コスト3・Lv3 コア5 BP8000）
const COFFIN = "BS01-131" // ダークコフィン（紫・マジック・メイン：疲労状態のスピリット1体を破壊する）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・召喚時：ドロー1）
const MAT = "BS01-056" // マッチュラ（緑・コスト3・『召喚時』相手は手札1枚を破棄する）
const TOWER = "BS11-043" // タワー・ゴレム（青・コスト3・【粉砕】アタック時：相手デッキをLvと同じ枚数破棄）
const DIA = "BS07-076" // ダイヤモンドストライク（白・マジック・フラッシュ：武装の自分スピリット1体を回復させる）
const PHENI = "BS01-023" // 原始鳥フェニキオス（赤・コスト7・召喚時：BP3000以下のスピリットすべてを破壊）
const SBIRD = "BS16-058" // サテライド・バード（白・ブレイヴ・コスト5・合体条件：コスト5以上）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; family: string[]; levels: { cores: number }[] }[]
    const find = (id: string) => staging.find((c) => c.cardId === id)
    assert(find(SAT)?.name === "サテラット" && find(SAT)!.type === "spirit" && find(SAT)!.cost === 3, "SATはサテラット（スピリット・コスト3）")
    assert(find(OSHIN)?.name === "氷楯の守護者オーシン" && find(OSHIN)!.family.includes("武装"), "OSHINは氷楯の守護者オーシン（武装）")
    assert(find(MISSIL)?.name === "ミサイリス" && find(MISSIL)!.cost === 4, "MISSILはミサイリス（コスト4）")
    assert(find(BRIGIT)?.name === "氷刃の剣使いブリギット" && find(BRIGIT)!.cost === 5, "BRIGITは氷刃の剣使いブリギット（コスト5）")
    assert(find(CERB)?.name === "ネガ・ケルベロス" && find(CERB)!.cost === 5, "CERBはネガ・ケルベロス（コスト5）")
    assert(find(TIGER)?.name === "ネガ・サーベルタイガー" && find(TIGER)!.cost === 6, "TIGERはネガ・サーベルタイガー（コスト6）")
    assert(find(SPRING)?.name === "ネガ・スプリンガー" && find(SPRING)!.cost === 6, "SPRINGはネガ・スプリンガー（コスト6）")
    assert(find(GOLMAC)?.name === "重装騎士ゴル・マック" && find(GOLMAC)!.family.includes("武装"), "GOLMACは重装騎士ゴル・マック（武装）")
    assert(find(CATAP)?.name === "カタパシール" && find(CATAP)!.type === "brave" && find(CATAP)!.cost === 4, "CATAPはカタパシール（ブレイヴ・コスト4）")
    assert(find(MIRROR)?.name === "鏡面世界への入口" && find(MIRROR)!.type === "nexus" && find(MIRROR)!.levels.map((l) => l.cores).join("/") === "0/2", "MIRRORは鏡面世界への入口（ネクサス・Lvコア0/2）")
    assert(find(DAURA)?.name === "ダークネスオーラ" && find(DAURA)!.type === "magic" && find(DAURA)!.cost === 3, "DAURAはダークネスオーラ（マジック・コスト3）")
    assert(find(REPAIR)?.name === "パーフェクトリペアー" && find(REPAIR)!.type === "magic" && find(REPAIR)!.cost === 4, "REPAIRはパーフェクトリペアー（マジック・コスト4）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1, "VANはロクケラトプス（コスト1）")
    assert(getCard(RIO).name === "呪術士リオ" && getCard(RIO).colors[0] === "yellow" && getCard(RIO).effect === "", "RIOは呪術士リオ（黄・効果なし）")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).cost === 2 && getCard(SABER).levels[0]!.bp === 4000, "SABERはテラノセイバー（コスト2・BP4000）")
    assert(getCard(HERA).name === "ヘラクレス・ジオ" && getCard(HERA).levels[2]!.bp === 8000, "HERAはヘラクレス・ジオ（Lv3 BP8000）")
    assert(getCard(COFFIN).name === "ダークコフィン" && getCard(COFFIN).type === "magic" && getCard(COFFIN).colors[0] === "purple", "COFFINはダークコフィン（紫マジック）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).effect.includes("ドロー"), "GRIPはグリプ・ハンズ（召喚時ドロー1）")
    assert(getCard(MAT).name === "マッチュラ" && getCard(MAT).cost === 3 && getCard(MAT).effect.includes("破棄"), "MATはマッチュラ（コスト3・召喚時相手は手札1枚を破棄する）")
    assert(getCard(TOWER).name === "タワー・ゴレム" && getCard(TOWER).cost === 3 && getCard(TOWER).effect.includes("粉砕"), "TOWERはタワー・ゴレム（コスト3・【粉砕】）")
    assert(getCard(DIA).name === "ダイヤモンドストライク" && getCard(DIA).effect.includes("武装"), "DIAはダイヤモンドストライク（武装回復マジック）")
    assert(getCard(PHENI).name === "原始鳥フェニキオス" && getCard(PHENI).effect.includes("BP3000以下"), "PHENIは原始鳥フェニキオス（召喚時BP3000以下破壊）")
    assert(getCard(SBIRD).name === "サテライド・バード" && getCard(SBIRD).type === "brave" && getCard(SBIRD).cost === 5, "SBIRDはサテライド・バード（ブレイヴ・コスト5）")
}

function game(seed: string, turnPlayer: PlayerId = "p1", phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// pendingChoice を答える（option は「発動する」を優先、target は picks に入っていればそれを選ぶ）
function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = o.includes("発動する") ? "発動する" : o[0] ?? ""
            err = act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// フラッシュタイミングを連続パスで閉じる
function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

console.log("=== 1. 029 サテラット Lv1：お互いのデッキは破棄されない（【粉砕】で相手デッキが減らない） ===")
{
    const s = game("s1", "p2")
    put(s, "p1", SAT, 1)
    const tower = put(s, "p2", TOWER, 1)
    assert(act(s, "p2", { type: "attack", instanceId: tower.instanceId }) === null, "タワー・ゴレムでアタックできる")
    settle(s)
    takeLifeAndResolve(s, "p1")
    assert(s.players.p1.deck.length === 40, "サテラットがいるので自分のデッキは破棄されない（40のまま）")
    assert(s.players.p2.deck.length === 40, "お互いなので相手のデッキも破棄されない（40のまま）")
}
console.log("=== 1b. 029 がいない境目：【粉砕】でデッキが1枚破棄される ===")
{
    const s = game("s1b", "p2")
    const tower = put(s, "p2", TOWER, 1)
    assert(act(s, "p2", { type: "attack", instanceId: tower.instanceId }) === null, "タワー・ゴレムでアタックできる")
    settle(s)
    takeLifeAndResolve(s, "p1")
    assert(s.players.p1.deck.length === 39, "サテラットがいないのでLv1の【粉砕】で1枚破棄される")
}

console.log("=== 2. 029 Lv2【重装甲：紫/青】：紫マジックの破壊を受けない。Lv1（装甲なし）の境目は破壊される ===")
{
    const s = game("s2", "p2", "main")
    const sat = put(s, "p1", SAT, 2) // Lv2
    sat.isRested = true
    s.players.p2.hand = [COFFIN]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: sat.instanceId }) !== null, "対象がサテラットしかいないのでダークコフィンは使用できない（対象に選べない）")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === sat.instanceId), "Lv2のサテラットは場に残る")
}
{
    const s = game("s2b", "p2", "main")
    const sat = put(s, "p1", SAT, 1) // Lv1＝重装甲なし
    sat.isRested = true
    s.players.p2.hand = [COFFIN]
    act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: sat.instanceId })
    settle(s, [sat.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === sat.instanceId), "Lv1のサテラットは破壊される")
}

console.log("=== 3. 030 オーシン：コスト3以下の自分のスピリットは相手効果で破壊されても疲労状態で残る。コスト4の境目は破壊される ===")
{
    const s = game("s3", "p2", "main")
    put(s, "p1", OSHIN, 1)
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    s.players.p2.hand = [COFFIN]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: van.instanceId }) === null, "ダークコフィンを使用できる")
    settle(s, [van.instanceId])
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "コスト1のロクケラトプスは破壊されずに残る")
    assert(van.isRested, "疲労状態でフィールドに残る")
}
{
    const s = game("s3b", "p2", "main")
    put(s, "p1", OSHIN, 1)
    const mis = put(s, "p1", MISSIL, 1) // コスト4
    mis.isRested = true
    s.players.p2.hand = [COFFIN]
    act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: mis.instanceId })
    settle(s, [mis.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === mis.instanceId), "コスト4のミサイリスは対象外なので破壊される")
}

console.log("=== 4. 030 Lv1･Lv2『相手のメインステップ』：相手の手札が増えたら、増えた1枚につき相手は手札1枚を破棄する ===")
{
    const s = game("s4", "p2", "main")
    put(s, "p1", OSHIN, 1)
    s.players.p2.hand = [GRIP, COFFIN]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "グリプ・ハンズを召喚できる")
    settle(s)
    assert(s.players.p2.field.spirits.some((x) => x.cardId === GRIP), "グリプ・ハンズは場にいる")
    assert(s.players.p2.hand.length === 1, "ドローで増えた1枚につき手札を1枚破棄する（2-1+1-1=1）")
    assert(s.players.p2.trashCards.length === 1, "破棄したカードはトラッシュに1枚")
}
{
    const s = game("s4b", "p2", "main")
    s.players.p2.hand = [GRIP, COFFIN]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "グリプ・ハンズを召喚できる")
    settle(s)
    assert(s.players.p2.hand.length === 2, "オーシンがいないので破棄は起きない（1-1+1+1=2）")
}

console.log("=== 5. 031 ミサイリス『ブロック時』：BP+3000でバトルに勝つ ===")
{
    const s = game("s5", "p2")
    const mis = put(s, "p1", MISSIL, 1) // Lv1 BP3000
    const saber = put(s, "p2", SABER, 1) // BP4000
    assert(act(s, "p2", { type: "attack", instanceId: saber.instanceId }) === null, "テラノセイバーでアタックできる")
    assert(declareBlock(s, "p1", mis.instanceId) === null, "ミサイリスでブロックできる")
    passFlash(s)
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "BP3000+3000=6000でテラノセイバーを破壊する")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === mis.instanceId), "ミサイリスは残る")
}

console.log("=== 6. 031 連鎖《黄》：ブロック時、黄シンボルがあれば相手スピリット1体をBP-3000。黄がいない境目は減らない ===")
{
    const s = game("s6", "p2")
    put(s, "p1", RIO, 1) // 黄シンボル
    const mis = put(s, "p1", MISSIL, 1)
    const saber = put(s, "p2", SABER, 1)
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: saber.instanceId }) === null, "テラノセイバーでアタックできる")
    assert(declareBlock(s, "p1", mis.instanceId) === null, "ミサイリスでブロックできる")
    settle(s, [van.instanceId])
    passFlash(s)
    settle(s)
    assert(effectiveBp(s, "p2", van) === 0, "連鎖でロクケラトプスはこのターンBP-3000（BP1000→0。BPは0未満にならない）")
}
{
    const s = game("s6b", "p2")
    const mis = put(s, "p1", MISSIL, 1)
    const saber = put(s, "p2", SABER, 1)
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: saber.instanceId }) === null, "テラノセイバーでアタックできる")
    assert(declareBlock(s, "p1", mis.instanceId) === null, "ミサイリスでブロックできる")
    settle(s)
    passFlash(s)
    settle(s)
    assert(effectiveBp(s, "p2", van) === 1000, "黄シンボルがなければ連鎖は発揮しない（BP1000のまま）")
}

console.log("=== 7. 032 ブリギット：自分のスピリット1体につきBP+1000（自分自身も数える） ===")
{
    const s = game("s7")
    const brig = put(s, "p1", BRIGIT, 1) // Lv1 BP4000
    assert(effectiveBp(s, "p1", brig) === 4000 + 1000, "スピリット1体（自分のみ）でBP+1000")
    put(s, "p1", VAN, 1)
    put(s, "p1", RIO, 1)
    assert(effectiveBp(s, "p1", brig) === 4000 + 3000, "スピリット3体でBP+3000")
}

console.log("=== 8. 032 合体時 Lv2『ブロック時』：ボイドからコア1個を自分のスピリットに置く ===")
{
    const s = game("s8", "p2")
    const brig = put(s, "p1", BRIGIT, 2) // Lv2
    const brave = createInstance(SBIRD, s.turn, 0)
    s.players.p1.field.combinedBraves.push(brave)
    brig.braveRefs = [...(brig.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    const ally = put(s, "p1", VAN, 1)
    const saber = put(s, "p2", SABER, 1)
    assert(act(s, "p2", { type: "attack", instanceId: saber.instanceId }) === null, "テラノセイバーでアタックできる")
    assert(declareBlock(s, "p1", brig.instanceId) === null, "合体ブリギットでブロックできる")
    settle(s, [ally.instanceId])
    passFlash(s)
    settle(s)
    assert(ally.cores === 2, "ブロック時効果でボイドからコア1個を自分のスピリット（ロクケラトプス）に置く（1→2）")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === brig.instanceId), "ブリギットはバトルを制して残る（BP5000+2000対4000）")
}

console.log("=== 9. 033 ネガ・ケルベロス『バトル時』：BP8000以上の相手スピリット1体を手札に戻す ===")
{
    const s = game("s9")
    const cerb = put(s, "p1", CERB, 1) // Lv1
    const hera = put(s, "p2", HERA, 5) // Lv3 BP8000
    assert(act(s, "p1", { type: "attack", instanceId: cerb.instanceId }) === null, "ネガ・ケルベロスでアタックできる")
    settle(s, [hera.instanceId])
    takeLifeAndResolve(s, "p2")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === hera.instanceId), "BP8000のヘラクレス・ジオを手札に戻す")
    assert(s.players.p2.hand.length === 1, "戻ったカードは相手の手札に1枚")
}

console.log("=== 10. 033 連鎖《黄》：バトル時、相手スピリット1体を指定してこのターンアタック/ブロックできない ===")
{
    const s = game("s10")
    put(s, "p1", RIO, 1) // 黄シンボル
    const cerb = put(s, "p1", CERB, 1)
    const saber = put(s, "p2", SABER, 1)
    assert(act(s, "p1", { type: "attack", instanceId: cerb.instanceId }) === null, "ネガ・ケルベロスでアタックできる")
    settle(s, [saber.instanceId])
    takeLifeAndResolve(s, "p2")
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(declareBlock(s, "p2", saber.instanceId) !== null, "指定されたテラノセイバーはこのターンブロックできない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 11. 034 ネガ・サーベルタイガー『相手のアタックステップ』：疲労状態でブロックできる ===")
{
    const s = game("s11", "p2")
    const tiger = put(s, "p1", TIGER, 2) // Lv2 BP6000
    tiger.isRested = true
    const saber = put(s, "p2", SABER, 1)
    assert(act(s, "p2", { type: "attack", instanceId: saber.instanceId }) === null, "テラノセイバーでアタックできる")
    assert(declareBlock(s, "p1", tiger.instanceId) === null, "疲労状態のサーベルタイガーでブロックできる")
    passFlash(s)
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "ブロック時BP+2000×2体（自分のみ）で6000+2000=8000、テラノセイバーを破壊する")
}

console.log("=== 12. 034 Lv2『ブロック時』：自分のスピリット1体につきBP+2000。連鎖《黄》でドロー1 ===")
{
    const s = game("s12", "p2")
    put(s, "p1", RIO, 1) // 黄シンボル（2体目）
    const tiger = put(s, "p1", TIGER, 2) // Lv2 BP6000
    const hera = put(s, "p2", HERA, 5) // BP8000
    assert(act(s, "p2", { type: "attack", instanceId: hera.instanceId }) === null, "ヘラクレス・ジオでアタックできる")
    assert(declareBlock(s, "p1", tiger.instanceId) === null, "サーベルタイガーでブロックできる")
    settle(s)
    passFlash(s)
    settle(s)
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === tiger.instanceId), "サーベルタイガーはバトルを制して残る（BP6000+2000×2体=10000対8000）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === hera.instanceId), "ヘラクレス・ジオは破壊される")
    assert(s.players.p1.hand.length === 1, "連鎖《黄》でデッキから1枚ドローする")
}

console.log("=== 13. 035 ネガ・スプリンガー【重装甲：紫/緑/白/黄】：紫マジックの破壊を受けない。装甲のないロクケラトプスの境目は破壊される ===")
{
    const s = game("s13", "p2", "main")
    const spring = put(s, "p1", SPRING, 1)
    spring.isRested = true
    s.players.p2.hand = [COFFIN]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: spring.instanceId }) !== null, "対象がスプリンガーしかいないのでダークコフィンは使用できない（対象に選べない）")
    settle(s, [spring.instanceId])
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === spring.instanceId), "ネガ・スプリンガーは場に残る")
}
{
    const s = game("s13b", "p2", "main")
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    s.players.p2.hand = [COFFIN]
    act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: van.instanceId })
    settle(s, [van.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "装甲のないロクケラトプスは破壊される")
}

console.log("=== 14. 036 ゴル・マック Lv1【強化】：白の回復効果の体数+1（ダイヤモンドストライクで2体回復）。強化なしの境目は1体 ===")
{
    const s = game("s14", "p1", "attack")
    put(s, "p1", GOLMAC, 1) // 【強化】白
    const o1 = put(s, "p1", OSHIN, 1) // 武装
    const o2 = put(s, "p1", OSHIN, 1) // 武装
    o1.isRested = true
    o2.isRested = true
    s.players.p1.hand = [DIA]
    const atk = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: o1.instanceId }) === null, "ダイヤモンドストライクを使用できる")
    settle(s, [o1.instanceId])
    assert(!o1.isRested && !o2.isRested, "回復1体+【強化】1体で疲労状態の武装2体がどちらも回復する")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("s14b", "p1", "attack")
    const o1 = put(s, "p1", OSHIN, 1)
    const o2 = put(s, "p1", OSHIN, 1)
    o1.isRested = true
    o2.isRested = true
    s.players.p1.hand = [DIA]
    const atk = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: o1.instanceId }) === null, "ダイヤモンドストライクを使用できる")
    settle(s, [o1.instanceId])
    assert(!o1.isRested, "選んだ1体は回復する")
    assert(o2.isRested, "【強化】がなければもう1体は回復しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 15. 036 Lv2『アタック時』：上から4枚オープン、武装カード1枚につき相手スピリット1体を手札に戻し、オープンしたカードは破棄 ===")
{
    const s = game("s15")
    const gol = put(s, "p1", GOLMAC, 2) // Lv2
    s.players.p1.deck = [OSHIN, VAN, VAN, OSHIN, ...Array.from({ length: 36 }, () => VAN)]
    const a = put(s, "p2", SABER, 1)
    const b = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: gol.instanceId }) === null, "ゴル・マックでアタックできる")
    settle(s, [a.instanceId, b.instanceId])
    takeLifeAndResolve(s, "p2")
    assert(s.players.p1.deck.length === 36, "デッキは上から4枚オープンして破棄される（40→36）")
    assert(s.players.p1.trashCards.length === 4, "オープンした4枚はトラッシュに破棄される")
    assert(s.players.p2.field.spirits.length === 0, "武装カード2枚で相手スピリット2体を手札に戻す")
    assert(s.players.p2.hand.length === 2, "戻った2枚は相手の手札に")
}
{
    const s = game("s15b")
    const gol = put(s, "p1", GOLMAC, 2)
    const saber = put(s, "p2", SABER, 1)
    assert(act(s, "p1", { type: "attack", instanceId: gol.instanceId }) === null, "ゴル・マックでアタックできる")
    settle(s)
    takeLifeAndResolve(s, "p2")
    assert(s.players.p1.deck.length === 36 && s.players.p1.trashCards.length === 4, "武装カードがなくても4枚は破棄される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "武装カード0枚なので相手スピリットは戻らない")
}

console.log("=== 15b. 036『アタック時』は任意：オープンを断ればデッキも相手も変わらない ===")
{
    const s = game("s15c")
    const gol = put(s, "p1", GOLMAC, 2) // Lv2
    const saber = put(s, "p2", SABER, 1)
    assert(act(s, "p1", { type: "attack", instanceId: gol.instanceId }) === null, "ゴル・マックでアタックできる")
    // 「発動する」ではなく断る
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[] }
        const o = pc.options ?? []
        const pick = pc.kind === "option" ? (o.find((x) => x !== "発動する") ?? "") : ""
        const res: Record<string, unknown> = pick !== "" ? { type: "resolveChoice", option: pick } : { type: "resolveChoice" }
        if (act(s, pc.pid ?? "p1", res as never) !== null) break
    }
    takeLifeAndResolve(s, "p2")
    assert(s.players.p1.deck.length === 40 && s.players.p1.trashCards.length === 0, "断ればデッキは破棄されない")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "断れば相手スピリットは戻らない")
}

console.log("=== 16. 062 カタパシール『召喚時』：相手スピリット1体を手札に戻す。連鎖《黄》でBP-3000 ===")
{
    const s = game("s16")
    s.phase = "main" // 召喚はメインステップで行う
    put(s, "p1", RIO, 1) // 黄シンボル
    const saber = put(s, "p2", SABER, 1)
    const van = put(s, "p2", VAN, 1)
    s.players.p1.hand = [CATAP]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "カタパシールを召喚できる")
    settle(s, [saber.instanceId, van.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "召喚時効果でテラノセイバーを手札に戻す")
    assert(s.players.p2.hand.length === 1, "戻ったカードは相手の手札に")
    assert(effectiveBp(s, "p2", van) === 0, "連鎖《黄》でロクケラトプスはこのターンBP-3000（BP1000→0。BPは0未満にならない）")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === CATAP), "カタパシールはスピリット状態で場に残る")
}

console.log("=== 17. 070 鏡面世界への入口 Lv1：自分の手札は相手の効果を受けない（召喚時の手札破棄が起きない） ===")
{
    const s = game("s17", "p2", "main")
    putNexus(s, "p1", MIRROR, 1) // Lv1
    s.players.p1.hand = [VAN, VAN]
    s.players.p2.hand = [MAT]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "マッチュラを召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 2, "自分の手札は相手の効果を受けない（破棄されない）")
}
{
    const s = game("s17b", "p2", "main")
    s.players.p1.hand = [VAN, VAN]
    s.players.p2.hand = [MAT]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "マッチュラを召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 1, "入口がいないので相手は手札1枚を破棄する")
}

console.log("=== 18. 070 Lv2『相手のアタックステップ』：アタックしたスピリットのコスト以下の自分のスピリット1体を回復させる ===")
{
    const s = game("s18", "p2")
    putNexus(s, "p1", MIRROR, 2) // Lv2
    const oshin = put(s, "p1", OSHIN, 1) // コスト3
    oshin.isRested = true
    const tower = put(s, "p2", TOWER, 1) // コスト3
    assert(act(s, "p2", { type: "attack", instanceId: tower.instanceId }) === null, "コスト3のタワー・ゴレムでアタックできる")
    settle(s, [oshin.instanceId])
    assert(!oshin.isRested, "アタックしたスピリットのコスト3以下のオーシン（コスト3）が回復する")
    takeLifeAndResolve(s, "p1")
}
{
    const s = game("s18b", "p2")
    putNexus(s, "p1", MIRROR, 2) // Lv2
    const oshin = put(s, "p1", OSHIN, 1) // コスト3
    oshin.isRested = true
    const saber = put(s, "p2", SABER, 1) // コスト2
    assert(act(s, "p2", { type: "attack", instanceId: saber.instanceId }) === null, "コスト2のテラノセイバーでアタックできる")
    settle(s)
    assert(oshin.isRested, "アタックしたスピリットのコスト2より大きいコスト3は回復しない")
    takeLifeAndResolve(s, "p1")
}

console.log("=== 19. 079 ダークネスオーラ：フラッシュで自分のスピリット1体をBP+3000。連鎖《黄》で相手1体をBP-3000 ===")
{
    const s = game("s19")
    put(s, "p1", RIO, 1) // 黄シンボル
    const atk = put(s, "p1", VAN, 1)
    const van = put(s, "p2", VAN, 1)
    s.players.p1.hand = [DAURA]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null, "ダークネスオーラを使用できる")
    settle(s, [atk.instanceId, van.instanceId])
    assert(effectiveBp(s, "p1", atk) === 1000 + 3000, "このターンの間、自分のロクケラトプスはBP+3000")
    assert(effectiveBp(s, "p2", van) === 0, "連鎖《黄》で相手のロクケラトプスはBP-3000（BP1000→0。BPは0未満にならない）")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("s19b")
    const atk = put(s, "p1", VAN, 1)
    const van = put(s, "p2", VAN, 1)
    s.players.p1.hand = [DAURA]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null, "ダークネスオーラを使用できる")
    settle(s, [atk.instanceId])
    assert(effectiveBp(s, "p1", atk) === 1000 + 3000, "BP+3000は黄シンボルがなくても発揮する")
    assert(effectiveBp(s, "p2", van) === 1000, "黄シンボルがなければ連鎖のBP-3000は発揮しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 20. 080 パーフェクトリペアー：1体を回復させ、回復したスピリットはこのターン相手のスピリットの効果を受けない ===")
{
    const s = game("s20", "p1", "main")
    const hera = put(s, "p1", HERA, 5) // Lv3 BP8000
    hera.isRested = true
    const cerb = put(s, "p2", CERB, 1) // 『バトル時』BP8000以上の相手スピリット1体を手札に戻す
    s.players.p1.hand = [REPAIR]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: hera.instanceId }) === null, "パーフェクトリペアーを使用できる")
    settle(s, [hera.instanceId])
    assert(!hera.isRested, "疲労状態のヘラクレス・ジオが回復する")
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: hera.instanceId }) === null, "ヘラクレス・ジオでアタックできる")
    assert(declareBlock(s, "p2", cerb.instanceId) === null, "ネガ・ケルベロスでブロックできる")
    settle(s, [hera.instanceId])
    passFlash(s)
    settle(s)
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === hera.instanceId), "回復したヘラクレス・ジオは相手スピリットの効果（BP8000以上を手札に戻す）を受けない")
    assert(s.players.p1.hand.length === 0, "手札には戻されていない")
}
{
    const s = game("s20b", "p1", "main")
    const hera = put(s, "p1", HERA, 5) // Lv3 BP8000
    const cerb = put(s, "p2", CERB, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: hera.instanceId }) === null, "ヘラクレス・ジオでアタックできる")
    assert(declareBlock(s, "p2", cerb.instanceId) === null, "ネガ・ケルベロスでブロックできる")
    settle(s, [hera.instanceId])
    passFlash(s)
    settle(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === hera.instanceId), "パーフェクトリペアーで回復していないヘラクレス・ジオは手札に戻される")
    assert(s.players.p1.hand.length === 1, "戻ったカードは自分の手札に")
}

console.log("すべてのチェックに合格しました 🎉（part792）")
