// smoke パート809（BS21 緑：019・020・021・022・023・024・026・027・060・078。BS21_PLAN §1・§2 の確定読み。期待値役が効果文だけから書いた）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, handleAction, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const QUICK = "BS21-019" // クイック・モスキー（緑・怪虫・コスト1・フラッシュ【神速】）
const HARI = "BS21-020" // ハリモグリ（緑・剣獣・コスト2・効果なし）
const ALNAIR = "BS21-021" // 鶴星アルナイル（緑・コスト3・Lv1/2 星魂がアタックでBP4000以下を疲労）
const GENGLASS = "BS21-022" // 水蟲ゲングラス（緑・怪虫・コスト4・Lv2 アタック時 合体していない相手を疲労・連鎖赤でドロー）
const MANDRA = "BS21-023" // マンドラホラ（緑・樹魔・コスト4・Lv2 想獣がアタックでボイドからコア）
const HAWK = "BS21-024" // クロタネホーク（緑・爪鳥・コスト4・【暴風：2】）
const BENI = "BS21-026" // 紅蟲ベニカミキラン（緑・怪虫・コスト6・Lv2 神速が召喚されたら回復）
const GOHON = "BS21-027" // 十剣聖ゴホンカク（緑・剣使/殻人・コスト7）
const DROSERA = "BS21-060" // 食虫草ドロセラー（緑・ブレイヴ・コスト4・合体条件コスト4以上）
const WEB = "BS21-078" // バインディングウェブ（緑・マジック・コスト5・連鎖赤/青）

const BEAT = "BS01-050" // ビートビートル（緑・コスト0・BP1000/2000・効果なし）
const MIRAGE = "BS01-051" // フライングミラージュ（緑・コスト1・BP2000/3000・効果なし）
const EMEANT = "BS01-055" // エメアント（緑・怪虫・BP1000/4000）
const GATLING = "BS01-084" // ガトリングスタンド（白・武装・コスト3・BP3000/5000・効果なし）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000/3000/4000・効果なし）
const KOGUMARU = "BS12-033" // コグマル（黄・小玩/星魂・コスト1・BP2000/3000・効果なし）
const HIPPO = "BS07-037" // ヒッポカンプー（黄・想獣・コスト1・BP1000/4000・効果なし）
const CRYSTAL = "BS10-036" // 水晶魚クリスティール（白・空魚/星魂・コスト4・Lv1BP4000・効果なし）
const ORYX = "BS17-046" // オリクス盗賊団（青・獣頭・コスト1・BP2000・青シンボル確保用）
const ANT = "BS02-030" // 兵隊アントマン（緑・殻人・コスト3・フラッシュ【神速】）
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ・合体条件コスト4以上・合体時はエンドステップに回復するだけ）
const NEXUS = "BS01-098" // 燃えさかる戦場（赤・ネクサス・コスト3）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; effect: string; levels: { level: number; cores: number; bp?: number }[] }[]
    const chk = (id: string, name: string, type: string, cost: number, lv: string, fam?: string) => {
        const c = staging.find((x) => x.cardId === id)
        assert(!!c && c.name === name && c.type === type && c.cost === cost && c.colors.join() === "green" && c.levels.map((l) => `${l.cores}/${l.bp ?? 0}`).join(",") === lv && (fam === undefined || c.family.includes(fam)), `${id} は${name}（緑・${type}・コスト${cost}・Lvコア/BP ${lv}）`)
    }
    chk(QUICK, "クイック・モスキー", "spirit", 1, "1/1000,2/2000,3/3000", "怪虫")
    chk(HARI, "ハリモグリ", "spirit", 2, "1/3000,3/6000", "剣獣")
    chk(ALNAIR, "鶴星アルナイル", "spirit", 3, "1/2000,3/5000", "星魂")
    chk(GENGLASS, "水蟲ゲングラス", "spirit", 4, "1/3000,3/5000", "怪虫")
    chk(MANDRA, "マンドラホラ", "spirit", 4, "1/4000,4/7000", "樹魔")
    chk(HAWK, "クロタネホーク", "spirit", 4, "1/3000,2/5000,4/8000", "爪鳥")
    chk(BENI, "紅蟲ベニカミキラン", "spirit", 6, "1/5000,3/7000", "怪虫")
    chk(GOHON, "十剣聖ゴホンカク", "spirit", 7, "1/5000,2/8000,4/10000", "剣使")
    chk(DROSERA, "食虫草ドロセラー", "brave", 4, "1/5000", "樹魔")
    chk(WEB, "バインディングウェブ", "magic", 5, "")
    assert(staging.find((x) => x.cardId === HARI)!.effect.trim() === "", "020 ハリモグリは効果なし（場面なし）")
    assert(getCard(BEAT).name === "ビートビートル" && getCard(BEAT).levels[0]!.bp === 1000 && getCard(BEAT).effect === "", "BEATはビートビートル（BP1000・効果なし）")
    assert(getCard(MIRAGE).name === "フライングミラージュ" && getCard(MIRAGE).levels[0]!.bp === 2000 && getCard(MIRAGE).effect === "", "MIRAGEはフライングミラージュ（BP2000・効果なし）")
    assert(getCard(EMEANT).name === "エメアント" && getCard(EMEANT).family.includes("怪虫"), "EMEANTはエメアント（怪虫）")
    assert(getCard(GATLING).name === "ガトリングスタンド" && getCard(GATLING).cost === 3 && getCard(GATLING).levels.map((l) => l.bp).join("/") === "3000/5000" && getCard(GATLING).effect === "", "GATLINGはコスト3・BP3000/5000・効果なし")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).colors[0] === "red" && getCard(VAN).levels.map((l) => l.bp).join("/") === "1000/3000/4000" && getCard(VAN).effect === "", "VANは赤・BP1000/3000/4000・効果なし")
    assert(getCard(KOGUMARU).name === "コグマル" && getCard(KOGUMARU).family.includes("星魂") && getCard(KOGUMARU).effect === "", "KOGUMARUはコグマル（星魂・効果なし）")
    assert(getCard(HIPPO).name === "ヒッポカンプー" && getCard(HIPPO).family.includes("想獣") && getCard(HIPPO).effect === "", "HIPPOはヒッポカンプー（想獣・効果なし）")
    assert(getCard(CRYSTAL).name === "水晶魚クリスティール" && getCard(CRYSTAL).cost === 4 && getCard(CRYSTAL).levels[0]!.bp === 4000 && getCard(CRYSTAL).effect === "", "CRYSTALはコスト4・Lv1BP4000・効果なし")
    assert(getCard(ORYX).name === "オリクス盗賊団" && getCard(ORYX).colors[0] === "blue" && getCard(ORYX).effect === "", "ORYXは青・効果なし")
    assert(getCard(ANT).name === "兵隊アントマン" && getCard(ANT).cost === 3 && getCard(ANT).effect.includes("【神速】"), "ANTは神速持ち・コスト3")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave", "KARAKURIはブレイヴ")
    assert(getCard(NEXUS).name === "燃えさかる戦場" && getCard(NEXUS).type === "nexus" && getCard(NEXUS).colors[0] === "red", "NEXUSは赤のネクサス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

// 未実装の BS21 カードだけ警告して続ける（既存カードの ID の打ち間違いは落とす）
function scene(label: string, fn: () => void): void {
    console.log(`=== ${label} ===`)
    try {
        fn()
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes("カードが見つかりません") && msg.includes("BS21-")) console.log(`  ⚠ 未実装カードで未確認: ${msg}`)
        else throw e
    }
}

// 対象の選択は picks を優先して答える。確認（option）は pref にあるものを答え、pref が空なら選択肢を付けずに断る
function settle(s: GameState, picks: string[] = [], pref: string[] = ["発動する"]): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = pref.find((x) => o.includes(x)) ?? (pref.length === 0 ? undefined : o[0])
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

function candidatesOf(s: GameState): string[] {
    return ((s.pendingChoice as { candidates?: string[] } | null)?.candidates ?? [])
}

// p1 がアタックして、防御側 p2 がパスしたところ（p1 がフラッシュを使える）まで進める
function attackAndDefenderPasses(s: GameState, attackerId: string): void {
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "アタックを宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のフラッシュパス")
}

// ブロックされるところまで進めて、ブロッカーを宣言する
function attackAndBlock(s: GameState, attackerId: string, blockerId: string): void {
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "アタックを宣言")
    settleAttackTriggers(s)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", blockerId) === null, "ブロックを宣言")
}
function settleAttackTriggers(s: GameState): void {
    settle(s)
}

// 019 クイック・モスキー：フラッシュ【神速】（リザーブだけで召喚）
scene("F0: 前提（実装済み）神速の召喚フロー。アタック後のフラッシュで兵隊アントマンを召喚できる", () => {
    const s = game("flash-summon-ant")
    const van = put(s, "p1", VAN, 1)
    s.players.p1.hand = [ANT]
    attackAndDefenderPasses(s, van.instanceId)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "フラッシュで神速のアントマンを召喚できる")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === ANT), "アントマンがフィールドに出る")
})
scene("A1: 019 はフラッシュのタイミングでリザーブから召喚できる（コスト1＋上に置くコア1＝リザーブ20→18）", () => {
    const s = game("quick-flash")
    const van = put(s, "p1", VAN, 1)
    s.players.p1.hand = [QUICK]
    attackAndDefenderPasses(s, van.instanceId)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "クイック・モスキーをフラッシュで召喚できる")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === QUICK), "クイック・モスキーがフィールドに出る")
    assert(s.players.p1.reserve === 18, `コストとコアはリザーブから払う（20→18。実際 ${s.players.p1.reserve}）`)
})
scene("A2: 019 の境目。リザーブが2個に満たなければ（場のコアがあっても）召喚できない", () => {
    const s = game("quick-short")
    const van = put(s, "p1", VAN, 3)
    s.players.p1.hand = [QUICK]
    attackAndDefenderPasses(s, van.instanceId)
    s.players.p1.reserve = 1
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) !== null, "リザーブ1個ではコスト1＋コア1を払えず召喚できない（場のコアは使えない）")
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === QUICK), "クイック・モスキーは出ない")
})
scene("A3: 019 の境目。神速を持たないスピリットはフラッシュで召喚できない", () => {
    const s = game("quick-nonflash")
    const van = put(s, "p1", VAN, 1)
    s.players.p1.hand = [BEAT]
    attackAndDefenderPasses(s, van.instanceId)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) !== null, "神速のないビートビートルはフラッシュで召喚できない")
})

// 021 鶴星アルナイル：Lv1･Lv2『自分のアタックステップ』星魂のアタックでBP4000以下の相手を疲労
scene("B1: 021 Lv1。星魂（コグマル）がアタックしたら、BP4000以下の相手のスピリット1体（ちょうど4000も可）を疲労させる。BP5000は選べない", () => {
    const s = game("alnair-lv1")
    put(s, "p1", ALNAIR, 1) // Lv1
    const kogu = put(s, "p1", KOGUMARU, 1)
    const low = put(s, "p2", VAN, 1) // BP1000
    const edge = put(s, "p2", VAN, 3) // Lv3 BP4000
    const high = put(s, "p2", GATLING, 2) // Lv2 BP5000
    assert(act(s, "p1", { type: "attack", instanceId: kogu.instanceId }) === null, "コグマル（星魂）でアタック")
    const c = candidatesOf(s)
    assert(c.includes(low.instanceId) && c.includes(edge.instanceId) && !c.includes(high.instanceId), "候補はBP4000以下（1000・ちょうど4000）で、BP5000は含まない")
    settle(s, [edge.instanceId])
    assert(edge.isRested && !low.isRested && !high.isRested, "選んだBP4000のスピリットだけ疲労する")
})
scene("B2: 021 Lv2 でも同じく働く", () => {
    const s = game("alnair-lv2")
    put(s, "p1", ALNAIR, 3) // Lv2
    const crystal = put(s, "p1", CRYSTAL, 1)
    const t = put(s, "p2", MIRAGE, 1) // BP2000
    assert(act(s, "p1", { type: "attack", instanceId: crystal.instanceId }) === null, "クリスティール（星魂）でアタック")
    settle(s, [t.instanceId])
    assert(t.isRested, "Lv2 でもBP4000以下の相手のスピリットを疲労させる")
})
scene("B3: 021 の境目。星魂でないスピリットのアタックでは疲労させない", () => {
    const s = game("alnair-nonfamily")
    put(s, "p1", ALNAIR, 1)
    const van = put(s, "p1", VAN, 1)
    const t = put(s, "p2", MIRAGE, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプス（星魂でない）でアタック")
    settle(s, [t.instanceId])
    assert(!t.isRested && s.pendingChoice === null, "星魂でないので誘発しない")
})

// 022 水蟲ゲングラス：Lv2 アタック時 合体していない相手を疲労。連鎖赤でドロー
scene("C1: 022 Lv2。合体していない相手のスピリット1体を疲労させ、赤シンボルがあれば1枚ドローする（合体中のスピリットは対象外）", () => {
    const s = game("gengrass-chain")
    const g = put(s, "p1", GENGLASS, 3) // Lv2
    put(s, "p1", VAN, 1) // 赤シンボル
    const plain = put(s, "p2", MIRAGE, 1)
    const host = put(s, "p2", CRYSTAL, 1)
    combine(s, "p2", host, KARAKURI)
    assert(act(s, "p1", { type: "attack", instanceId: g.instanceId }) === null, "ゲングラスでアタック")
    assert(!candidatesOf(s).includes(host.instanceId), "合体している相手のスピリットは候補に入らない")
    settle(s, [plain.instanceId])
    assert(plain.isRested && !host.isRested, "合体していない方だけ疲労する")
    assert(s.players.p1.hand.length === 1 && s.players.p1.deck.length === 39, "赤シンボルがあるので連鎖で1枚ドロー（手札1・デッキ39）")
})
scene("C2: 022 の境目。赤シンボルが無ければ疲労させるがドローしない", () => {
    const s = game("gengrass-nochain")
    const g = put(s, "p1", GENGLASS, 3) // Lv2（緑だけ）
    const plain = put(s, "p2", MIRAGE, 1)
    assert(act(s, "p1", { type: "attack", instanceId: g.instanceId }) === null, "ゲングラスでアタック")
    settle(s, [plain.instanceId])
    assert(plain.isRested, "疲労させる")
    assert(s.players.p1.hand.length === 0 && s.players.p1.deck.length === 40, "赤シンボルが無いのでドローしない")
})
scene("C3: 022 の境目。Lv1 では効果が無い（赤シンボルがあっても）", () => {
    const s = game("gengrass-lv1")
    const g = put(s, "p1", GENGLASS, 1) // Lv1
    put(s, "p1", VAN, 1)
    const plain = put(s, "p2", MIRAGE, 1)
    assert(act(s, "p1", { type: "attack", instanceId: g.instanceId }) === null, "ゲングラスでアタック")
    settle(s, [plain.instanceId])
    assert(!plain.isRested && s.players.p1.hand.length === 0, "Lv1 は疲労もドローもしない")
})

// 023 マンドラホラ：Lv2 想獣がアタックしたらボイドからコア1個をそのスピリットに置く
scene("D1: 023 Lv2。想獣（ヒッポカンプー）がアタックしたら、ボイドからコア1個をそのスピリットに置く（リザーブは減らない）", () => {
    const s = game("mandra-lv2")
    put(s, "p1", MANDRA, 4) // Lv2
    const hippo = put(s, "p1", HIPPO, 1)
    assert(act(s, "p1", { type: "attack", instanceId: hippo.instanceId }) === null, "ヒッポカンプー（想獣）でアタック")
    settle(s)
    assert(hippo.cores === 2, `アタックしたスピリットにコアが1個増える（1→2。実際 ${hippo.cores}）`)
    assert(s.players.p1.reserve === 20, "コアはボイドから来るのでリザーブは減らない")
})
scene("D2: 023 の境目。Lv1 では置かない", () => {
    const s = game("mandra-lv1")
    put(s, "p1", MANDRA, 1) // Lv1
    const hippo = put(s, "p1", HIPPO, 1)
    assert(act(s, "p1", { type: "attack", instanceId: hippo.instanceId }) === null, "ヒッポカンプーでアタック")
    settle(s)
    assert(hippo.cores === 1, "Lv1 ではコアを置かない")
})
scene("D3: 023 の境目。想獣でないスピリットのアタックでは置かない", () => {
    const s = game("mandra-nonfamily")
    put(s, "p1", MANDRA, 4)
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプス（想獣でない）でアタック")
    settle(s)
    assert(van.cores === 1, "想獣でないのでコアは増えない")
})

// 024 クロタネホーク：【暴風：2】ブロックされたとき、相手は相手のスピリット2体を疲労させる
scene("E1: 024 Lv1。ブロックされると、ブロックした側（相手）が自分のスピリット2体を選んで疲労させる（選ばれなかった1体は疲労しない）", () => {
    const s = game("hawk-blocked")
    const hawk = put(s, "p1", HAWK, 1)
    const blocker = put(s, "p2", BEAT, 1)
    const x = put(s, "p2", MIRAGE, 1)
    const y = put(s, "p2", MIRAGE, 1)
    const z = put(s, "p2", MIRAGE, 1)
    attackAndBlock(s, hawk.instanceId, blocker.instanceId)
    const pc = s.pendingChoice as { pid?: PlayerId } | null
    assert(pc !== null && pc.pid === "p2", "疲労させるスピリットを選ぶのは相手（ブロックした側）")
    settle(s, [x.instanceId, y.instanceId])
    assert(x.isRested && y.isRested && !z.isRested, "相手が選んだ2体だけ疲労する")
})
scene("E2: 024 の境目。ブロックされなければ疲労させない", () => {
    const s = game("hawk-unblocked")
    const hawk = put(s, "p1", HAWK, 1)
    const a = put(s, "p2", MIRAGE, 1)
    const b = put(s, "p2", MIRAGE, 1)
    assert(act(s, "p1", { type: "attack", instanceId: hawk.instanceId }) === null, "クロタネホークでアタック")
    settle(s)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p2")
    assert(!a.isRested && !b.isRested && s.players.p2.life === 4, "ブロックされない（ライフで受ける）ので疲労しない")
})

// 026 紅蟲ベニカミキラン：Lv2『お互いのアタックステップ』神速を持つ自分のスピリット/ブレイヴが召喚されたとき回復
scene("G1: 026 Lv2。神速を持つ自分のスピリット（アントマン）がフラッシュで召喚されたら、疲労していた026が回復する", () => {
    const s = game("beni-lv2")
    const beni = put(s, "p1", BENI, 3) // Lv2
    beni.isRested = true
    const van = put(s, "p1", VAN, 1)
    s.players.p1.hand = [ANT]
    attackAndDefenderPasses(s, van.instanceId)
    assert(beni.isRested, "召喚前は疲労したまま")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "アントマンをフラッシュで召喚")
    settle(s)
    assert(!beni.isRested, "神速を持つ自分のスピリットが召喚されたので回復する")
})
scene("G2: 026 の境目。Lv1 では回復しない", () => {
    const s = game("beni-lv1")
    const beni = put(s, "p1", BENI, 1) // Lv1
    beni.isRested = true
    const van = put(s, "p1", VAN, 1)
    s.players.p1.hand = [ANT]
    attackAndDefenderPasses(s, van.instanceId)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "アントマンをフラッシュで召喚")
    settle(s)
    assert(beni.isRested, "Lv1 は回復しない")
})
scene("G3: 026 の境目。相手が神速のスピリットを召喚しても回復しない（「自分の」）", () => {
    const s = game("beni-opponent")
    const beni = put(s, "p1", BENI, 3)
    beni.isRested = true
    const van = put(s, "p1", VAN, 1)
    s.players.p2.hand = [ANT]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がフラッシュでアントマンを召喚")
    settle(s)
    assert(beni.isRested, "相手の神速の召喚では回復しない")
})

// 027 十剣聖ゴホンカク
scene("H1: 027 Lv1。BPを比べ相手のスピリットだけを破壊したら、怪虫を持つ自分のスピリット2体を回復する（3体の疲労した怪虫から2体。怪虫でないものは対象外）", () => {
    const s = game("gohon-win")
    const gohon = put(s, "p1", GOHON, 1) // Lv1 BP5000
    const a = put(s, "p1", EMEANT, 1)
    const b = put(s, "p1", EMEANT, 1)
    const c = put(s, "p1", EMEANT, 1)
    const van = put(s, "p1", VAN, 1)
    for (const x of [a, b, c, van]) x.isRested = true
    const blocker = put(s, "p2", BEAT, 1) // BP1000
    attackAndBlock(s, gohon.instanceId, blocker.instanceId)
    passFlash(s)
    settle(s, [a.instanceId, b.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "相手のブロッカーだけ破壊される（5000 vs 1000）")
    assert(!a.isRested && !b.isRested && c.isRested, "怪虫2体だけ回復し、残る1体は疲労のまま")
    assert(van.isRested, "怪虫でないスピリットは回復しない")
})
scene("H2: 027 の境目。相打ち（自分も破壊される）なら回復しない", () => {
    const s = game("gohon-tie")
    const gohon = put(s, "p1", GOHON, 1) // Lv1 BP5000
    const a = put(s, "p1", EMEANT, 1)
    a.isRested = true
    const blocker = put(s, "p2", GATLING, 2) // Lv2 BP5000
    attackAndBlock(s, gohon.instanceId, blocker.instanceId)
    passFlash(s)
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId) && !s.players.p1.field.spirits.some((x) => x.instanceId === gohon.instanceId), "BP5000どうしで両方破壊される")
    assert(a.isRested, "相手のスピリット「だけ」ではないので回復しない")
})
scene("H3: 027 の境目。ブロックされずライフで受けたときは回復しない", () => {
    const s = game("gohon-unblocked")
    const gohon = put(s, "p1", GOHON, 1)
    const a = put(s, "p1", EMEANT, 1)
    a.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: gohon.instanceId }) === null, "ゴホンカクでアタック")
    settle(s)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p2")
    settle(s)
    assert(a.isRested, "スピリットを破壊していないので回復しない")
})
scene("H4: 027【合体時】Lv2。合体アタック時、相手のスピリット2体を疲労させる（選ぶのは自分）", () => {
    const s = game("gohon-combined")
    const gohon = put(s, "p1", GOHON, 2) // Lv2
    combine(s, "p1", gohon, KARAKURI)
    const a = put(s, "p2", MIRAGE, 1)
    const b = put(s, "p2", MIRAGE, 1)
    const c = put(s, "p2", MIRAGE, 1)
    assert(act(s, "p1", { type: "attack", instanceId: gohon.instanceId }) === null, "合体したゴホンカクでアタック")
    const pc = s.pendingChoice as { pid?: PlayerId } | null
    assert(pc !== null && (pc.pid ?? "p1") === "p1", "疲労させる相手を選ぶのは自分")
    settle(s, [a.instanceId, b.instanceId])
    assert(a.isRested && b.isRested && !c.isRested, "選んだ2体だけ疲労する")
})
scene("H5: 027【合体時】の境目。合体していなければ疲労させない／Lv1 の合体では疲労させない", () => {
    const s = game("gohon-alone")
    const gohon = put(s, "p1", GOHON, 2) // Lv2・合体なし
    const a = put(s, "p2", MIRAGE, 1)
    const b = put(s, "p2", MIRAGE, 1)
    assert(act(s, "p1", { type: "attack", instanceId: gohon.instanceId }) === null, "合体していないゴホンカクでアタック")
    settle(s)
    assert(!a.isRested && !b.isRested, "合体していないので疲労させない")
    const t = game("gohon-combined-lv1")
    const g1 = put(t, "p1", GOHON, 1) // Lv1
    combine(t, "p1", g1, KARAKURI)
    const c = put(t, "p2", MIRAGE, 1)
    const d = put(t, "p2", MIRAGE, 1)
    assert(act(t, "p1", { type: "attack", instanceId: g1.instanceId }) === null, "Lv1 の合体ゴホンカクでアタック")
    settle(t)
    assert(!c.isRested && !d.isRested, "【合体時】は Lv2･Lv3 のみ。Lv1 では疲労させない")
})

// 060 食虫草ドロセラー
scene("I1: 060 合体アタックでライフを減らしたら、ボイドからコア1個を合体スピリットに置く", () => {
    const s = game("drosera-life")
    const host = put(s, "p1", CRYSTAL, 1)
    combine(s, "p1", host, DROSERA)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    settle(s)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p2")
    settle(s)
    assert(s.players.p2.life === 3, "相手のライフが2減る（合体スピリットのシンボルはホストの白とブレイヴの緑で2つ）")
    assert(host.cores === 2, `合体スピリットにコアが1個増える（1→2。実際 ${host.cores}）`)
    assert(s.players.p1.reserve === 20, "コアはボイドから来るのでリザーブは減らない")
})
scene("I2: 060 の境目。ブロックされてライフを減らさなければコアを置かない", () => {
    const s = game("drosera-blocked")
    const host = put(s, "p1", CRYSTAL, 1)
    combine(s, "p1", host, DROSERA)
    const blocker = put(s, "p2", BEAT, 1)
    attackAndBlock(s, host.instanceId, blocker.instanceId)
    passFlash(s)
    settle(s)
    assert(s.players.p2.life === 5, "ライフは減らない")
    assert(host.cores === 1, "ライフを減らしていないのでコアは増えない")
})
scene("I3: 060 の合体条件。コスト4以上のスピリットにだけ合体できる（コスト3は不可）", () => {
    const s = game("drosera-cond")
    s.phase = "main"
    const low = put(s, "p1", GATLING, 1) // コスト3
    const high = put(s, "p1", CRYSTAL, 1) // コスト4
    const brave = put(s, "p1", DROSERA, 1)
    assert(handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: low.instanceId }) !== null, "コスト3のスピリットには合体できない")
    assert(handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: high.instanceId }) === null, "コスト4のスピリットには合体できる")
})

// 078 バインディングウェブ
function webGame(seed: string, mine: string[]): { s: GameState; a: ReturnType<typeof createInstance>; b: ReturnType<typeof createInstance>; c: ReturnType<typeof createInstance>; nexus: ReturnType<typeof createInstance> } {
    const s = game(seed)
    const attacker = put(s, "p1", mine[0]!, 1)
    for (const id of mine.slice(1)) put(s, "p1", id, 1)
    const a = put(s, "p2", MIRAGE, 1)
    const b = put(s, "p2", MIRAGE, 1)
    const c = put(s, "p2", MIRAGE, 1)
    const nexus = putNexus(s, "p2", NEXUS, 0)
    s.players.p1.hand = [WEB]
    s.players.p1.trashCards = [NEXUS]
    attackAndDefenderPasses(s, attacker.instanceId)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "バインディングウェブをフラッシュで使用")
    return { s, a, b, c, nexus }
}
scene("J1: 078 赤シンボルのみ。相手が2体を選んで疲労し、連鎖[赤]で相手のネクサスを破壊する（[青]のトラッシュ回収は起きない）", () => {
    const { s, a, b, c, nexus } = webGame("web-red", [VAN])
    const pc = s.pendingChoice as { pid?: PlayerId } | null
    assert(pc !== null && pc.pid === "p2", "疲労させる2体を選ぶのは相手")
    settle(s, [a.instanceId, b.instanceId])
    assert(a.isRested && b.isRested && !c.isRested, "相手が選んだ2体だけ疲労する")
    assert(!s.players.p2.field.nexuses.some((x) => x.instanceId === nexus.instanceId), "赤シンボルがあるので相手のネクサスを破壊する")
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.includes(NEXUS), "青シンボルが無いのでトラッシュのネクサスは手札に戻らない")
    assert(s.players.p1.trashCards.includes(WEB), "使ったマジックはトラッシュへ")
})
scene("J2: 078 青シンボルのみ。連鎖[青]で自分のトラッシュのネクサス1枚を手札に戻す（相手のネクサスは壊れない）", () => {
    const { s, a, b, nexus } = webGame("web-blue", [ORYX])
    settle(s, [a.instanceId, b.instanceId])
    assert(a.isRested && b.isRested, "2体疲労する")
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === NEXUS && !s.players.p1.trashCards.includes(NEXUS), "トラッシュのネクサスが手札に戻る")
    assert(s.players.p2.field.nexuses.some((x) => x.instanceId === nexus.instanceId), "赤シンボルが無いので相手のネクサスは壊れない")
})
scene("J3: 078 赤と青の両方があれば両方の連鎖効果が起きる", () => {
    const { s, a, b, nexus } = webGame("web-both", [VAN, ORYX])
    settle(s, [a.instanceId, b.instanceId])
    assert(!s.players.p2.field.nexuses.some((x) => x.instanceId === nexus.instanceId), "相手のネクサスを破壊する")
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === NEXUS, "トラッシュのネクサスが手札に戻る")
})
scene("J4: 078 の境目。赤も青もシンボルが無ければ疲労させるだけ", () => {
    const { s, a, b, nexus } = webGame("web-none", [BEAT])
    settle(s, [a.instanceId, b.instanceId])
    assert(a.isRested && b.isRested, "2体疲労する")
    assert(s.players.p2.field.nexuses.some((x) => x.instanceId === nexus.instanceId) && s.players.p1.hand.length === 0, "連鎖効果は起きない（ネクサスは残り、手札は0）")
})

console.log("すべてのチェックに合格しました 🎉（part809）")
