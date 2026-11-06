// smoke パート793（BS20-037/038/039/041/042/043/045/063/064/081/082/X05/X08：黄【強化】の重なり・破壊されて疲労状態で残る・BP0破壊/デッキ帰還・デッキ破棄禁止・破壊誘発ドロー・ブロック制限・連鎖（紫）・聖命・コストを支払わずに召喚・シンボル0・ソードブレイヴ）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import { countSymbols } from "../../shared/rules/symbols"
import type { GameState, PlayerId } from "./helpers"

const SPIEL = "BS20-037" // 天使スピエル（黄・コスト0・天霊・Lvコア1/2）【強化】
const PIT = "BS20-038" // 弓ピッド（黄・コスト2・天霊・Lvコア1/2/3）【強化】
const EDITH = "BS20-039" // 光楯の守護者イーディス（黄・コスト3・天霊・Lvコア1/2/3）コスト3以下の自分のスピリットは相手の効果で破壊されたとき疲労状態で残ることができる＋【強化】
const PRIMA = "BS20-041" // 天使プリマ（黄・コスト4・天霊・Lvコア1/2/3）Lv1：フラッシュ『このスピリットのアタック時』手札1枚破棄でBP-1000／Lv2：相手がBP0になったときBP0すべてを破壊
const ETOILE = "BS20-042" // 天使姫エトワール（黄・コスト4・天霊・Lvコア1/2/3）お互いのデッキは破棄されない＋アタック時BP-2000
const KYUKI = "BS20-043" // 凶獣キュウキ（黄・コスト5・想獣・Lvコア1/3）想獣が相手によって破壊されたときドロー1
const ZIRANT = "BS20-045" // 幻竜皇ジラント（黄・コスト7・想獣・Lvコア1/3）コスト5/6以外からブロックされない＋連鎖[紫]コア2個トラッシュ＋Lv2【聖命】
const AVANKR = "BS20-063" // アーヴァンクル（黄・ブレイヴ・コスト4・想獣）合体時Lv1の相手からブロックされない＋連鎖[紫]フィールドのコア1個リザーブ
const EGG = "BS20-064" // エンジェルエッグ（黄・ブレイヴ・コスト5・天霊）召喚時：【強化】持ちの黄のスピリットカード1枚をコストを支払わずに召喚
const HEART = "BS20-081" // スティールハート（黄・マジック・コスト3）フラッシュ：相手のスピリット1体のシンボルを0に（メインステップで使えない）
const LIGHTNING = "BS20-082" // ライトニングアタック（黄・マジック・コスト5）フラッシュ：BP-3000＋連鎖[紫]疲労状態のBP5000以下を破壊
const RAPHAEL = "BS20-X05" // 大天使ララファエル（黄・コスト7・天霊・Lvコア1/3/4）天霊のアタック時BP-3000／Lv2：BP0をデッキの上に／Lv3【強化】
const FEATHER = "BS20-X08" // 光翼の神剣エンジェリックフェザー（黄・ブレイヴ・コスト5・剣刃）【強化】＋合体中アタック時BP-3000・初めてBP0にしたとき回復

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1BP1000・バニラ）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・Lv1BP4000・バニラ）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv1BP3000・バニラ）コスト4以上の合体条件のホスト
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・Lv1BP3000・バニラ）コスト5のブロッカー／コスト5以上の合体条件のホスト
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・Lv1BP6000/Lv2BP8000・バニラ）コスト6のブロッカー／Lv2ブロッカー
const SKULL = "BS06-020" // スカルゴイル（紫・効果なし）紫シンボル
const LIME = "BS16-035" // 樹氷竜シルバー・ライム（白・コスト6・Lv1BP5000・効果なし）BP5000の的
const MIRANSA = "BS19-049" // 天使ミランサ（黄・コスト3）召喚時：このターンの間、相手のスピリット1体をBP-2000する（【強化】の確認用のBP-効果）
const STON = "BS03-073" // ストン・スタチュー（コスト1）召喚時：相手のデッキを上から1枚破棄する（デッキ破棄禁止の確認用）
const PRESSURE = "BS19-109" // エンジェリックプレッシャー（黄・マジック・コスト3）フラッシュ：このターンの間、相手のスピリット1体をBP-3000する

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { cores: number }[] }[]
    const expect: [string, string, string, number, string[]][] = [
        [SPIEL, "天使スピエル", "spirit", 0, ["天霊"]],
        [PIT, "弓ピッド", "spirit", 2, ["天霊"]],
        [EDITH, "光楯の守護者イーディス", "spirit", 3, ["天霊"]],
        [PRIMA, "天使プリマ", "spirit", 4, ["天霊"]],
        [ETOILE, "天使姫エトワール", "spirit", 4, ["天霊"]],
        [KYUKI, "凶獣キュウキ", "spirit", 5, ["想獣"]],
        [ZIRANT, "幻竜皇ジラント", "spirit", 7, ["想獣"]],
        [AVANKR, "アーヴァンクル", "brave", 4, ["想獣"]],
        [EGG, "エンジェルエッグ", "brave", 5, ["天霊"]],
        [HEART, "スティールハート", "magic", 3, []],
        [LIGHTNING, "ライトニングアタック", "magic", 5, []],
        [RAPHAEL, "大天使ララファエル", "spirit", 7, ["天霊"]],
        [FEATHER, "光翼の神剣エンジェリックフェザー", "brave", 5, ["剣刃"]],
    ]
    for (const [id, name, type, cost, family] of expect) {
        const c = staging.find((x) => x.cardId === id)
        assert(c?.name === name && c.type === type && c.cost === cost, `${id}は${name}（${type}・コスト${cost}）`)
        assert(JSON.stringify(c?.family) === JSON.stringify(family), `${id}の系統は${family.join("/")}`)
    }
    const cores = (id: string) => staging.find((x) => x.cardId === id)?.levels.map((l) => l.cores).join("/")
    assert(cores(SPIEL) === "1/2" && cores(PIT) === "1/2/3" && cores(EDITH) === "1/2/3", "スピエル/弓ピッド/イーディスのLvコアは1/2・1/2/3・1/2/3")
    assert(cores(PRIMA) === "1/2/3" && cores(ETOILE) === "1/2/3" && cores(KYUKI) === "1/3" && cores(ZIRANT) === "1/3", "プリマ/エトワールは1/2/3、キュウキ/ジラントは1/3")
    assert(cores(RAPHAEL) === "1/3/4" && cores(AVANKR) === "1" && cores(EGG) === "1" && cores(FEATHER) === "1", "ララファエルは1/3/4、ブレイヴ3枚はLvコア1")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1, "VANはロクケラトプス（コスト1）")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).levels[0]!.bp === 4000, "SABERはテラノセイバー（Lv1BP4000）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4, "BELLはデュアルキャノン・ベル（コスト4）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5, "STIRAはスティラホーン（コスト5）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && getCard(TARAN).levels[1]!.bp === 8000, "TARANはタランドーズ（コスト6・Lv2BP8000）")
    assert(getCard(SKULL).name === "スカルゴイル" && getCard(SKULL).colors[0] === "purple", "SKULLはスカルゴイル（紫）")
    assert(getCard(LIME).name === "樹氷竜シルバー・ライム" && getCard(LIME).levels[0]!.bp === 5000, "LIMEはシルバー・ライム（Lv1BP5000）")
    assert(getCard(MIRANSA).name === "天使ミランサ" && (getCard(MIRANSA).effect ?? "").includes("BP-2000"), "MIRANSAは天使ミランサ（召喚時BP-2000）")
    assert(getCard(STON).name === "ストン・スタチュー" && (getCard(STON).effect ?? "").includes("デッキを上から1枚破棄"), "STONはストン・スタチュー（召喚時デッキ破棄1）")
    assert(getCard(PRESSURE).name === "エンジェリックプレッシャー" && getCard(PRESSURE).type === "magic", "PRESSUREはエンジェリックプレッシャー（黄マジック）")
}

function game(seed: string, phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
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

// 未実装カード（data/cards に無い）は createInstance/getCard が例外を投げるので、その場面だけ警告して続行する
function scene(label: string, fn: () => void): void {
    console.log(`=== ${label} ===`)
    try {
        fn()
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes("カードが見つかりません")) console.log(`  ⚠ 未実装カードで未確認: ${msg}`)
        else throw e
    }
}

// pendingChoice を答える（option は pref に含まれるものを優先、target は picks に入っていればそれを選ぶ）
function settle(s: GameState, picks: (string | number)[] = [], pref: string[] = ["発動する", "残る", "戻す"]): string[] {
    const prompts: string[] = []
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; prompt: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        prompts.push(pc.prompt)
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            // pref が空なら任意の確認を断る（選択肢を付けずに答える）
            const pick = pref.find((x) => o.includes(x)) ?? (pref.length === 0 ? undefined : o[0])
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = (picks.filter((x): x is string => typeof x === "string")).find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) {
            const idx = pc.cardIndices.find((i) => picks.includes(i)) ?? pc.cardIndices[0]
            err = act(s, who, { type: "resolveChoice", cardIndex: idx })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
    return prompts
}

// フラッシュタイミングを連続パスで閉じる
function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

// ブレイヴをホストに合体させる
function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

// 【強化】（黄）の確認：ミランサを召喚して相手のSABER（BP4000）をBP-する。強化1つで-3000、無しで-2000
function kyokaCheck(seed: string, setup: (s: GameState) => void, expectedBp: number, label: string): void {
    const s = game(seed, "main") // 召喚はメインステップ
    setup(s)
    s.players.p1.hand = [MIRANSA]
    const saber = put(s, "p2", SABER, 1)
    const reserve = s.players.p1.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ミランサを召喚できる")
    settle(s, [saber.instanceId])
    assert(effectiveBp(s, "p2", saber) === expectedBp, `${label}：SABERのBPは${expectedBp}（4000-${4000 - expectedBp}）`)
    assert(s.players.p1.reserve < reserve, "ミランサのコストは支払われる")
}

scene("037/038. スピエル・弓ピッドの【強化】：自分のBP-効果を-1000する（重なる）", () => {
    kyokaCheck("kyoka-none", () => {}, 2000, "【強化】が無いときはBP-2000のまま")
    kyokaCheck("kyoka-spiel", (s) => put(s, "p1", SPIEL, 1), 1000, "スピエルLv1の【強化】でBP-3000")
    kyokaCheck("kyoka-pit-lv3", (s) => put(s, "p1", PIT, 3), 1000, "弓ピッドLv3の【強化】でBP-3000")
    kyokaCheck("kyoka-both", (s) => {
        put(s, "p1", SPIEL, 1)
        put(s, "p1", PIT, 1)
    }, 0, "スピエル＋弓ピッドでBP-4000（SABERはBP0。BP0になっても破壊されない）")
})

scene("039. イーディス：コスト3以下の自分のスピリットは相手の効果で破壊されたとき疲労状態で残ることができる", () => {
    {
        const s = game("edith-remain")
        put(s, "p1", EDITH, 1)
        const van = put(s, "p1", VAN, 1) // コスト1（3以下）
        destroySpirit(s, "p1", van.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
        settle(s, [], ["残る", "発動する"])
        assert(s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "「残る」を選んだロクケラトプスはフィールドに残る")
        assert(van.isRested, "残るとき疲労状態になる")
    }
    {
        const s = game("edith-decline")
        put(s, "p1", EDITH, 1)
        const van = put(s, "p1", VAN, 1)
        destroySpirit(s, "p1", van.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
        settle(s, [], []) // 「残る」を選ばない
        assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "断ったロクケラトプスは破壊されて場を離れる")
    }
    {
        const s = game("edith-cost4")
        put(s, "p1", EDITH, 1)
        const bell = put(s, "p1", BELL, 1) // コスト4（3以下ではない）
        destroySpirit(s, "p1", bell.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
        settle(s, [], ["残る", "発動する"])
        assert(!s.players.p1.field.spirits.some((x) => x.instanceId === bell.instanceId), "コスト4のスピリットは対象外なので破壊される")
    }
    {
        const s = game("edith-bp-compare")
        put(s, "p1", EDITH, 1)
        const van = put(s, "p1", VAN, 1)
        put(s, "p2", TARAN, 1) // Lv1BP6000
        assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
        assert(declareBlock(s, "p2", s.players.p2.field.spirits[0]!.instanceId) === null, "タランドーズでブロックできる")
        passFlash(s)
        assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "BPを比べでの破壊は「相手の効果で破壊された」ではないので残れない")
    }
    {
        kyokaCheck("edith-kyoka", (s) => put(s, "p1", EDITH, 1), 1000, "イーディスの【強化】でBP-3000")
    }
})

scene("041. プリマLv1：アタック中のフラッシュで手札1枚を破棄することで、このターンの間、相手のスピリット1体をBP-1000する", () => {
    {
        const s = game("prima-lv1")
        const prima = put(s, "p1", PRIMA, 1) // Lv1
        const saber = put(s, "p2", SABER, 1)
        s.players.p1.hand = [VAN, VAN]
        assert(act(s, "p1", { type: "attack", instanceId: prima.instanceId }) === null, "プリマでアタックできる")
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
        const effectId = getCard(PRIMA).effects.find((e) => e.kind === "activated")!.id
        assert(act(s, "p1", { type: "activateAbility", instanceId: prima.instanceId, effectId }) === null, "防御側がパスした後でフラッシュ起動ができる")
        settle(s, [saber.instanceId])
        assert(s.players.p1.hand.length === 1, "手札1枚を破棄する（2→1）")
        assert(s.players.p1.trashCards.length === 1, "破棄したカードはトラッシュへ")
        assert(effectiveBp(s, "p2", saber) === 3000, "このターンの間、SABERはBP-1000（4000→3000）")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("prima-no-hand")
        const prima = put(s, "p1", PRIMA, 1)
        put(s, "p2", SABER, 1)
        s.players.p1.hand = []
        assert(act(s, "p1", { type: "attack", instanceId: prima.instanceId }) === null, "プリマでアタックできる")
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
        const effectId = getCard(PRIMA).effects.find((e) => e.kind === "activated")!.id
        assert(act(s, "p1", { type: "activateAbility", instanceId: prima.instanceId, effectId }) !== null, "手札が無ければ破棄を払えないので起動できない")
        takeLifeAndResolve(s, "p2")
    }
})

scene("041. プリマLv2『お互いのアタックステップ』：相手のスピリットがBP0になったとき、BP0になったスピリットすべてを破壊する", () => {
    {
        const s = game("prima-lv2")
        const prima = put(s, "p1", PRIMA, 2) // Lv2
        const van = put(s, "p2", VAN, 1) // BP1000
        s.players.p1.hand = [PRESSURE]
        assert(act(s, "p1", { type: "attack", instanceId: prima.instanceId }) === null, "プリマでアタックできる")
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
        assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: van.instanceId }) === null, "エンジェリックプレッシャー（BP-3000）を使用")
        settle(s, [van.instanceId])
        assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "BP0になったロクケラトプスはプリマLv2で破壊される")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("prima-lv1-bp0")
        const prima = put(s, "p1", PRIMA, 1) // Lv1（Lv2の効果が無い）
        const van = put(s, "p2", VAN, 1)
        s.players.p1.hand = [PRESSURE]
        assert(act(s, "p1", { type: "attack", instanceId: prima.instanceId }) === null, "プリマでアタックできる")
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
        assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: van.instanceId }) === null, "エンジェリックプレッシャー（BP-3000）を使用")
        settle(s, [van.instanceId])
        assert(s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "Lv1では破壊する効果が無いのでBP0のロクケラトプスは場に残る")
        assert(effectiveBp(s, "p2", van) === 0, "BP0のまま")
        takeLifeAndResolve(s, "p2")
    }
})

scene("042. エトワール：お互いのデッキは破棄されない", () => {
    {
        const s = game("etoile-deck", "main")
        put(s, "p1", ETOILE, 1)
        s.players.p1.hand = [STON]
        const deck = s.players.p2.deck.length
        const trash = s.players.p2.trashCards.length
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ストン・スタチューを召喚できる")
        settle(s)
        assert(s.players.p2.deck.length === deck, "相手のデッキは破棄されない")
        assert(s.players.p2.trashCards.length === trash, "相手のトラッシュは増えない")
    }
    {
        const s = game("etoile-deck-off", "main")
        s.players.p1.hand = [STON]
        const deck = s.players.p2.deck.length
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ストン・スタチューを召喚できる")
        settle(s)
        assert(s.players.p2.deck.length === deck - 1, "エトワールが無ければ相手のデッキは1枚破棄される")
        assert(s.players.p2.trashCards.length === 1, "破棄されたカードはトラッシュへ")
    }
})

scene("042. エトワール『このスピリットのアタック時』：このターンの間、相手のスピリット1体をBP-2000する", () => {
    {
        const s = game("etoile-attack")
        const etoile = put(s, "p1", ETOILE, 1)
        const saber = put(s, "p2", SABER, 1)
        assert(act(s, "p1", { type: "attack", instanceId: etoile.instanceId }) === null, "エトワールでアタックできる")
        settle(s, [saber.instanceId])
        assert(effectiveBp(s, "p2", saber) === 2000, "このターンの間、SABERはBP-2000（4000→2000）")
        takeLifeAndResolve(s, "p2")
    }
})

scene("043. キュウキ：系統「想獣」を持つ自分のスピリットが相手によって破壊されたとき、デッキから1枚ドローする", () => {
    {
        const s = game("kyuki-effect")
        put(s, "p1", KYUKI, 1)
        const zirant = put(s, "p1", ZIRANT, 1) // 想獣
        const deck = s.players.p1.deck.length
        destroySpirit(s, "p1", zirant.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
        settle(s)
        assert(s.players.p1.hand.length === 1, "相手の効果で想獣が破壊されたので1枚ドローする")
        assert(s.players.p1.deck.length === deck - 1, "ドローはデッキから")
    }
    {
        const s = game("kyuki-not-family")
        put(s, "p1", KYUKI, 1)
        const van = put(s, "p1", VAN, 1) // 地竜（想獣ではない）
        destroySpirit(s, "p1", van.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
        settle(s)
        assert(s.players.p1.hand.length === 0, "想獣以外が破壊されてもドローしない")
    }
    {
        const s = game("kyuki-bp-compare")
        const kyuki = put(s, "p1", KYUKI, 1) // Lv1BP3000
        put(s, "p2", TARAN, 1) // Lv1BP6000
        assert(act(s, "p1", { type: "attack", instanceId: kyuki.instanceId }) === null, "キュウキでアタックできる")
        assert(declareBlock(s, "p2", s.players.p2.field.spirits[0]!.instanceId) === null, "タランドーズでブロックできる")
        passFlash(s)
        assert(!s.players.p1.field.spirits.some((x) => x.instanceId === kyuki.instanceId), "BPを比べでキュウキは破壊される")
        assert(s.players.p1.hand.length === 1, "「相手によって破壊された」はBP比べも含むので1枚ドローする")
    }
})

scene("045. ジラント『このスピリットのアタック時』：コスト5/6以外のスピリットからブロックされない", () => {
    {
        const s = game("zirant-block-cost1")
        const zirant = put(s, "p1", ZIRANT, 1)
        const van = put(s, "p2", VAN, 1) // コスト1
        assert(act(s, "p1", { type: "attack", instanceId: zirant.instanceId }) === null, "ジラントでアタックできる")
        assert(declareBlock(s, "p2", van.instanceId) !== null, "コスト1のスピリットはブロックを宣言できない")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("zirant-block-cost5")
        const zirant = put(s, "p1", ZIRANT, 1)
        const stira = put(s, "p2", STIRA, 1) // コスト5
        assert(act(s, "p1", { type: "attack", instanceId: zirant.instanceId }) === null, "ジラントでアタックできる")
        assert(declareBlock(s, "p2", stira.instanceId) === null, "コスト5のスピリットはブロックできる")
        passFlash(s)
        assert(!s.players.p2.field.spirits.some((x) => x.instanceId === stira.instanceId) && s.players.p1.field.spirits.some((x) => x.instanceId === zirant.instanceId), "BPを比べでジラント（BP4000）がスティラホーン（BP3000）を破壊する")
    }
    {
        const s = game("zirant-block-cost6")
        const zirant = put(s, "p1", ZIRANT, 1)
        const taran = put(s, "p2", TARAN, 1) // コスト6
        assert(act(s, "p1", { type: "attack", instanceId: zirant.instanceId }) === null, "ジラントでアタックできる")
        assert(declareBlock(s, "p2", taran.instanceId) === null, "コスト6のスピリットはブロックできる")
        passFlash(s)
    }
})

scene("045. ジラントの連鎖[紫]：相手のスピリットのコア2個を相手のトラッシュに置く（自分の紫シンボルが必要）", () => {
    {
        const s = game("zirant-chain-purple")
        const zirant = put(s, "p1", ZIRANT, 1)
        put(s, "p1", SKULL, 1) // 自分の紫シンボル
        const skull = put(s, "p2", SKULL, 3)
        assert(act(s, "p1", { type: "attack", instanceId: zirant.instanceId }) === null, "ジラントでアタックできる")
        settle(s, [skull.instanceId])
        assert(skull.cores === 1, "連鎖で相手のスピリットのコア2個がトラッシュに置かれる（3→1）")
        assert(s.players.p2.trashCores === 2, "置かれたコア2個は相手のトラッシュへ")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("zirant-chain-none")
        const zirant = put(s, "p1", ZIRANT, 1)
        const skull = put(s, "p2", SKULL, 3)
        assert(act(s, "p1", { type: "attack", instanceId: zirant.instanceId }) === null, "ジラントでアタックできる")
        settle(s, [skull.instanceId])
        assert(skull.cores === 3, "紫シンボルが無ければ連鎖は発揮しないのでコアは動かない")
        assert(s.players.p2.trashCores === 0, "トラッシュのコアも増えない")
        takeLifeAndResolve(s, "p2")
    }
})

scene("045. ジラントLv2【聖命】：アタックによって相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く", () => {
    {
        const s = game("zirant-seimei-lv2")
        const zirant = put(s, "p1", ZIRANT, 3) // Lv2
        const life = s.players.p1.life
        assert(act(s, "p1", { type: "attack", instanceId: zirant.instanceId }) === null, "ジラントでアタックできる")
        assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
        settle(s)
        assert(s.players.p1.life === life + 1, "ボイドからコア1個が自分のライフに置かれる（5→6）")
    }
    {
        const s = game("zirant-seimei-lv1")
        const zirant = put(s, "p1", ZIRANT, 1) // Lv1（【聖命】はLv2）
        const life = s.players.p1.life
        assert(act(s, "p1", { type: "attack", instanceId: zirant.instanceId }) === null, "ジラントでアタックできる")
        assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
        settle(s)
        assert(s.players.p1.life === life, "Lv1では【聖命】が無いのでライフは増えない")
    }
})

scene("063. アーヴァンクル【合体時】：このスピリットはLv1の相手のスピリットからブロックされない", () => {
    {
        const s = game("avankr-lv1-block")
        const host = put(s, "p1", BELL, 1) // コスト4（合体条件を満たす）
        combine(s, "p1", host, AVANKR)
        const van = put(s, "p2", VAN, 1) // Lv1
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
        assert(declareBlock(s, "p2", van.instanceId) !== null, "Lv1の相手のスピリットはブロックを宣言できない")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("avankr-lv2-block")
        const host = put(s, "p1", BELL, 1)
        combine(s, "p1", host, AVANKR)
        const taran = put(s, "p2", TARAN, 3) // Lv2（コア3）
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
        assert(declareBlock(s, "p2", taran.instanceId) === null, "Lv2の相手のスピリットはブロックできる")
        passFlash(s)
    }
})

scene("063. アーヴァンクルの連鎖[紫]：相手のフィールドのコア1個を相手のリザーブに置く", () => {
    {
        const s = game("avankr-chain-purple")
        const host = put(s, "p1", BELL, 1)
        combine(s, "p1", host, AVANKR)
        put(s, "p1", SKULL, 1) // 自分の紫シンボル
        const skull = put(s, "p2", SKULL, 2)
        const reserve = s.players.p2.reserve
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
        settle(s, [skull.instanceId])
        assert(skull.cores === 1, "連鎖で相手のフィールドのコア1個がリザーブに置かれる（2→1）")
        assert(s.players.p2.reserve === reserve + 1, "置かれたコア1個は相手のリザーブへ")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("avankr-chain-none")
        const host = put(s, "p1", BELL, 1)
        combine(s, "p1", host, AVANKR)
        const skull = put(s, "p2", SKULL, 2)
        const reserve = s.players.p2.reserve
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
        settle(s, [skull.instanceId])
        assert(skull.cores === 2 && s.players.p2.reserve === reserve, "紫シンボルが無ければ連鎖は発揮しないのでコアは動かない")
        takeLifeAndResolve(s, "p2")
    }
})

scene("064. エンジェルエッグ『このブレイヴの召喚時』：【強化】を持つ黄のスピリットカード1枚を、コストを支払わずに召喚できる", () => {
    {
        const s = game("egg-free-summon", "main")
        s.players.p1.hand = [EGG, PIT] // 弓ピッドは【強化】持ちの黄のスピリット
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エンジェルエッグを召喚できる")
        const reserve = s.players.p1.reserve
        settle(s, [1]) // 手札の弓ピッド（cardIndex 1）を選ぶ
        const pit = s.players.p1.field.spirits.find((x) => x.cardId === PIT)
        assert(pit !== undefined, "手札の弓ピッドが召喚される")
        assert(s.players.p1.reserve === reserve - 1, "コストは支払わない（リザーブから減るのは Lv1 に置くコア1個だけ）")
        assert(!s.players.p1.hand.includes(PIT), "手札の弓ピッドは無くなる")
    }
    {
        const s = game("egg-not-kyoka", "main")
        s.players.p1.hand = [EGG, MIRANSA] // ミランサは【強化】を持たない黄のスピリット
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エンジェルエッグを召喚できる")
        const pc = s.pendingChoice as { kind: string; cardIndices?: number[] } | null
        if (pc?.kind === "target" || pc?.cardIndices !== undefined) {
            assert(!(pc.cardIndices ?? []).includes(1), "【強化】を持たないミランサは対象にならない")
        }
        settle(s)
        assert(!s.players.p1.field.spirits.some((x) => x.cardId === MIRANSA), "ミランサは召喚されない")
        assert(s.players.p1.hand.includes(MIRANSA), "ミランサは手札に残る")
    }
})

scene("081. スティールハート：フラッシュでこのターンの間、相手のスピリット1体のシンボルを0にする（メインステップで使えない）", () => {
    {
        const s = game("heart-main")
        s.players.p1.hand = [HEART]
        put(s, "p2", VAN, 1)
        assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null, "メインステップでは使えない")
        assert(s.players.p1.hand.includes(HEART), "使用できないので手札に残る")
    }
    {
        const s = game("heart-flash")
        const attacker = put(s, "p1", VAN, 1)
        const van = put(s, "p2", VAN, 1) // 赤のシンボル1つ
        s.players.p1.hand = [HEART]
        assert(countSymbols(s.players.p2, ["red"]) === 1, "使用前：相手の場の赤シンボルは1つ")
        assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
        assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: van.instanceId }) === null, "フラッシュでスティールハートを使用できる")
        settle(s, [van.instanceId])
        assert(countSymbols(s.players.p2, ["red"]) === 0, "このターンの間、相手のスピリットのシンボルは0になる")
        assert(effectiveBp(s, "p2", van) === 1000, "シンボルを0にしてもBPは変わらない")
        takeLifeAndResolve(s, "p2")
    }
})

scene("082. ライトニングアタック：フラッシュでBP-3000＋連鎖[紫]で疲労状態のBP5000以下の相手のスピリット1体を破壊する", () => {
    {
        const s = game("lightning-both")
        const attacker = put(s, "p1", VAN, 1)
        const saber = put(s, "p2", SABER, 1) // BP4000
        const lime = put(s, "p2", LIME, 1) // BP5000
        lime.isRested = true // 疲労状態
        put(s, "p1", SKULL, 1) // 自分の紫シンボル
        s.players.p1.hand = [LIGHTNING]
        assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
        assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: saber.instanceId }) === null, "ライトニングアタックを使用（BP-3000の対象はSABER）")
        settle(s, [saber.instanceId, lime.instanceId]) // BP-3000 はSABER、連鎖の破壊対象は疲労状態のシルバー・ライム
        assert(effectiveBp(s, "p2", saber) === 1000, "このターンの間、SABERはBP-3000（4000→1000）")
        assert(!s.players.p2.field.spirits.some((x) => x.instanceId === lime.instanceId), "連鎖で疲労状態のBP5000のシルバー・ライムは破壊される")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("lightning-no-purple")
        const attacker = put(s, "p1", VAN, 1)
        const lime = put(s, "p2", LIME, 1)
        lime.isRested = true
        s.players.p1.hand = [LIGHTNING]
        assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
        assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: lime.instanceId }) === null, "ライトニングアタックを使用（BP-3000の対象はシルバー・ライム）")
        settle(s)
        assert(effectiveBp(s, "p2", lime) === 2000, "BP-3000は発揮される（5000→2000）")
        assert(s.players.p2.field.spirits.some((x) => x.instanceId === lime.instanceId), "紫シンボルが無ければ連鎖は発揮しないので破壊されない")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("lightning-not-rested")
        const attacker = put(s, "p1", VAN, 1)
        const lime = put(s, "p2", LIME, 1) // 疲労していない
        put(s, "p1", SKULL, 1)
        s.players.p1.hand = [LIGHTNING]
        assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
        assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: lime.instanceId }) === null, "ライトニングアタックを使用")
        const pc = s.pendingChoice as { kind: string; candidates?: string[] } | null
        if (pc?.kind === "target") assert(!(pc.candidates ?? []).includes(lime.instanceId), "疲労状態でないシルバー・ライムは連鎖の破壊対象にならない")
        settle(s)
        assert(s.players.p2.field.spirits.some((x) => x.instanceId === lime.instanceId), "疲労状態でなければ破壊されない")
        takeLifeAndResolve(s, "p2")
    }
})

scene("X05. ララファエルLv1『自分のアタックステップ』：系統「天霊」を持つ自分のスピリットがアタックしたとき、このターンの間、相手のスピリット1体をBP-3000する", () => {
    {
        const s = game("raphael-tenrei")
        put(s, "p1", RAPHAEL, 1)
        const spiel = put(s, "p1", SPIEL, 1) // 天霊
        const saber = put(s, "p2", SABER, 1)
        assert(act(s, "p1", { type: "attack", instanceId: spiel.instanceId }) === null, "スピエル（天霊）でアタックできる")
        settle(s, [saber.instanceId])
        assert(effectiveBp(s, "p2", saber) === 0, "天霊がアタックしたのでこのターンの間、SABERはBP-3000。アタックしたスピエルの【強化】で-1000されて BP0（4000→0）")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("raphael-not-tenrei")
        put(s, "p1", RAPHAEL, 1)
        const van = put(s, "p1", VAN, 1) // 地竜（天霊ではない）
        const saber = put(s, "p2", SABER, 1)
        assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
        settle(s, [saber.instanceId])
        assert(effectiveBp(s, "p2", saber) === 4000, "天霊以外のアタックではBP-されない")
        takeLifeAndResolve(s, "p2")
    }
})

scene("X05. ララファエルLv2『このスピリットのアタック時』：相手のスピリットがBP0になったとき、BP0になったスピリットすべてをデッキの上に戻すことができる", () => {
    {
        const s = game("raphael-deck-top")
        const raphael = put(s, "p1", RAPHAEL, 3) // Lv2
        const van = put(s, "p2", VAN, 1) // BP1000
        s.players.p1.hand = [PRESSURE]
        const deck = s.players.p2.deck.length
        assert(act(s, "p1", { type: "attack", instanceId: raphael.instanceId }) === null, "ララファエルでアタックできる")
        // ララファエル自身が天霊なので、アタックした時点の Lv1 効果（BP-3000）でロクケラトプスが BP0 になる
        settle(s, [van.instanceId], ["戻す", "発動する"])
        assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "BP0になったロクケラトプスは場を離れる")
        assert(s.players.p2.deck.length === deck + 1, "デッキの上に戻る（40→41）")
        assert(!s.players.p2.trashCards.includes(VAN) || s.players.p2.trashCards.length === 0, "トラッシュには置かれない")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("raphael-lv1-bp0")
        const raphael = put(s, "p1", RAPHAEL, 1) // Lv1（Lv2の効果が無い）
        const van = put(s, "p2", VAN, 1)
        s.players.p1.hand = [PRESSURE]
        const deck = s.players.p2.deck.length
        assert(act(s, "p1", { type: "attack", instanceId: raphael.instanceId }) === null, "ララファエルでアタックできる")
        // ララファエル自身が天霊なので、アタックした時点の Lv1 効果（BP-3000）でロクケラトプスが BP0 になる
        settle(s, [van.instanceId], ["戻す", "発動する"])
        assert(s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "Lv1ではデッキに戻す効果が無いのでBP0のロクケラトプスは場に残る")
        assert(s.players.p2.deck.length === deck, "デッキも増えない")
        takeLifeAndResolve(s, "p2")
    }
})

scene("X05. ララファエルLv3【強化】：自分の「BP-効果」を-1000する（Lv2では無い）", () => {
    kyokaCheck("raphael-kyoka-lv3", (s) => put(s, "p1", RAPHAEL, 4), 1000, "ララファエルLv3の【強化】でBP-3000")
    kyokaCheck("raphael-kyoka-lv2", (s) => put(s, "p1", RAPHAEL, 3), 2000, "Lv2では【強化】が無いのでBP-2000のまま")
})

scene("X08. エンジェリックフェザーLv1【強化】：アルティメット以外の自分の「BP-効果」を-1000する（スピリット状態でも）", () => {
    kyokaCheck("feather-kyoka", (s) => put(s, "p1", FEATHER, 1), 1000, "スピリット状態のX08の【強化】でBP-3000")
})

scene("X08. エンジェリックフェザー【合体中】：アタック時BP-3000（【強化】で-4000）・ターンで初めてBP0にしたときこのスピリットは回復する", () => {
    {
        const s = game("feather-combined")
        const host = put(s, "p1", STIRA, 1) // コスト5（合体条件を満たす）
        combine(s, "p1", host, FEATHER)
        const saber = put(s, "p2", SABER, 1) // BP4000
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
        settle(s, [saber.instanceId])
        assert(effectiveBp(s, "p2", saber) === 0, "アタック時のBP-3000に【強化】の-1000が重なりSABERはBP0（4000→0）")
        assert(!host.isRested, "ターンで初めてBP0にしたので合体スピリットは回復する")
        takeLifeAndResolve(s, "p2")
    }
    {
        const s = game("feather-second-bp0")
        const host = put(s, "p1", STIRA, 1)
        combine(s, "p1", host, FEATHER)
        const saber1 = put(s, "p2", SABER, 1)
        const saber2 = put(s, "p2", SABER, 1)
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "1回目のアタックができる")
        settle(s, [saber1.instanceId])
        assert(!host.isRested, "1体目をBP0にしたので回復する")
        takeLifeAndResolve(s, "p2")
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "回復したので2回目のアタックができる")
        settle(s, [saber2.instanceId])
        assert(effectiveBp(s, "p2", saber2) === 0, "2体目もBP-4000でBP0になる")
        assert(host.isRested, "ターンで2回目のBP0なので回復しない")
        takeLifeAndResolve(s, "p2")
    }
})

console.log("すべてのチェックに合格しました 🎉（part793）")
