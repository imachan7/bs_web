// smoke パート785（BS20-X07 咎人の骨剣エグゼキューショナーズ・BS20-025 翠刃の剣使いワオノシン・BS20-069 入道雲連峰：合体時バトル時の「このブレイヴを破壊することで相手は相手のスピリット1体を破壊」・【不死：無魔】・相手ドローでの回復・合体時のコア数BP+・疲労誘発のコア1個・緑スピリットの破壊時回復）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, draw, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const X07 = "BS20-X07" // 咎人の骨剣エグゼキューショナーズ（紫・ブレイヴ・コスト5・剣刃・Lvコア[1]）
const WAONO = "BS20-025" // 翠刃の剣使いワオノシン（緑・スピリット・コスト5・剣使/遊精・Lvコア[1/3/6]）
const NIMBUS = "BS20-069" // 入道雲連峰（緑・ネクサス・コスト3・Lvコア[0/2]）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・効果なし）X07の合体条件（コスト5以上）のホスト
const HAM = "BS15-059" // スターハム（黄・ブレイヴ・コスト4・合体条件コスト4以上）025に合体させるブレイヴ
const SKULL = "BS06-020" // スカルゴイル（紫・効果なし・系統「無魔」）【不死：無魔】の対象
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・Lv1 BP6000/Lv2 BP8000・効果なし）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）
const VAJU = "BS17-007" // ヴァジュランガ（赤・コスト6・Lv2 BP10000・効果なし）Eのブロッカー
const SONKEN = "BS17-X03" // 大牙帝ビャクガロード・ソンケン（緑・コスト7・Lv2『アタック時』ブロックされたとき相手のスピリット2体を疲労させる）
const BIND = "BS01-134" // バインディングソーン（緑・マジック・コスト2）フラッシュ：相手のスピリット1体を疲労させる
const ANTMAN = "BS05-024" // 用心棒アントマン（緑・コスト4・Lv1 BP5000・効果なし）相打ち用

console.log("=== 前提: カードの機械確認（BS20 の3枚は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; colors?: string[]; cost: number; family?: string[]; levels: { level: number; cores: number }[] }[]
    const x07 = staging.find((c) => c.cardId === X07)
    const waono = staging.find((c) => c.cardId === WAONO)
    const nimbus = staging.find((c) => c.cardId === NIMBUS)
    assert(x07?.name === "咎人の骨剣エグゼキューショナーズ" && x07.type === "brave" && x07.cost === 5 && x07.colors?.[0] === "purple" && (x07.family ?? []).includes("剣刃"), "X07は咎人の骨剣エグゼキューショナーズ（ブレイヴ・紫・コスト5・剣刃）")
    assert(x07?.levels.map((l) => l.cores).join("/") === "1", "X07のLvコアは1")
    assert(waono?.name === "翠刃の剣使いワオノシン" && waono.type === "spirit" && waono.cost === 5 && waono.colors?.[0] === "green" && (waono.family ?? []).includes("剣使") && (waono.family ?? []).includes("遊精"), "WAONOは翠刃の剣使いワオノシン（緑・スピリット・コスト5・剣使/遊精）")
    assert(waono?.levels.map((l) => l.cores).join("/") === "1/3/6", "WAONOのLvコアは1/3/6")
    assert(nimbus?.name === "入道雲連峰" && nimbus.type === "nexus" && nimbus.cost === 3 && nimbus.colors?.[0] === "green", "NIMBUSは入道雲連峰（緑・ネクサス・コスト3）")
    assert(nimbus?.levels.map((l) => l.cores).join("/") === "0/2", "NIMBUSのLvコアは0/2")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).effect === "", "STIRAはスティラホーン（赤・コスト5・効果なし）")
    assert(getCard(HAM).name === "スターハム" && getCard(HAM).type === "brave" && getCard(HAM).cost === 4, "HAMはスターハム（ブレイヴ・コスト4）")
    assert(getCard(SKULL).name === "スカルゴイル" && getCard(SKULL).colors[0] === "purple" && getCard(SKULL).effect === "" && getCard(SKULL).family.includes("無魔"), "SKULLはスカルゴイル（紫・効果なし・系統「無魔」）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && getCard(TARAN).effect === "" && getCard(TARAN).levels[1]!.bp === 8000, "TARANはタランドーズ（緑・コスト6・効果なし・Lv2 BP8000）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1 && getCard(VANILLA).effect === "", "VANILLAはロクケラトプス（赤・コスト1・効果なし）")
    assert(getCard(VAJU).name === "ヴァジュランガ" && getCard(VAJU).effect === "" && getCard(VAJU).levels[1]!.bp === 10000, "VAJUはヴァジュランガ（赤・効果なし・Lv2 BP10000）")
    assert(getCard(SONKEN).name === "大牙帝ビャクガロード・ソンケン" && getCard(SONKEN).colors[0] === "green" && getCard(SONKEN).levels[1]!.cores === 3, "SONKENは大牙帝ビャクガロード・ソンケン（緑・Lv2=コア3）")
    assert(getCard(BIND).name === "バインディングソーン" && getCard(BIND).type === "magic" && getCard(BIND).cost === 2, "BINDはバインディングソーン（緑・マジック・コスト2）")
    assert(getCard(ANTMAN).name === "用心棒アントマン" && getCard(ANTMAN).colors[0] === "green" && getCard(ANTMAN).effect === "" && getCard(ANTMAN).levels[0]!.bp === 5000, "ANTMANは用心棒アントマン（緑・効果なし・Lv1 BP5000）")
}

function game(seed: string, turnPlayer: "p1" | "p2" = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "attack"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VANILLA)
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

// ブレイヴをホストに合体させる（part776 と同じ作り方。合体条件はここで確認すること）
function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

// pendingChoice を答える（declide=false は「発動する」を優先、true は「発動しない」側を優先。target は picks に入っていればそれを選ぶ）
function settle(s: GameState, picks: string[] = [], decline = false): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = decline
                ? o.find((x) => !x.includes("発動する") && !x.includes("破壊する")) ?? o[o.length - 1] ?? ""
                : o.includes("発動する")
                    ? "発動する"
                    : o[0] ?? ""
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

console.log("=== A. X07【合体時】バトル時：払うとこのブレイヴだけが破壊され、相手が選んだ相手のスピリット1体が破壊される ===")
{
    const s = game("a")
    const host = put(s, "p1", STIRA, 1) // コスト5以上
    combine(s, "p1", host, X07)
    const blocker = put(s, "p2", VANILLA, 1)
    const bystander = put(s, "p2", SKULL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    // バトル時の任意効果の確認はアタック宣言の列の中で出る：発動し、相手に破壊するスピリットを選ばせる（バトルしていないスカルゴイルを選ぶ）
    settle(s, [bystander.instanceId])
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "相手スピリットでブロックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    assert(s.players.p1.trashCards.includes(X07), "払ったX07はトラッシュに置かれる")
    assert(!s.players.p1.field.combinedBraves.some((x) => x.cardId === X07), "X07は合体を外れる")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "ホストのスティラホーンは場に残る")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === bystander.instanceId), "相手が選んだスカルゴイルが破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカーもBP負けで破壊される")
}

console.log("=== B. X07【合体時】バトル時の境目：払わなければX07も相手のスピリットも残る ===")
{
    const s = game("b")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, X07)
    const blocker = put(s, "p2", VANILLA, 1)
    const bystander = put(s, "p2", SKULL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    // 確認の選択肢が「発動する」1つだけなので、選択肢を付けない resolveChoice で断る
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "任意効果の確認を払わないと答える")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "相手スピリットでブロックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    assert(s.players.p1.field.combinedBraves.some((x) => x.cardId === X07), "払わないのでX07は合体したまま")
    assert(!s.players.p1.trashCards.includes(X07), "X07はトラッシュに置かれない")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === bystander.instanceId), "バトルしていないスカルゴイルは残る")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカーはBP負けで破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "ホストは場に残る")
}

console.log("=== C. X07【不死：無魔】：相手のアタックステップで自分の無魔スピリットが破壊されたとき、トラッシュから召喚できる ===")
{
    const s = game("c", "p2")
    const muma = put(s, "p1", SKULL, 1) // 系統「無魔」
    s.players.p1.trashCards.push(X07)
    const attacker = put(s, "p2", TARAN, 1) // Lv1 BP6000 ＞ スカルゴイル BP4000
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手スピリットでアタックできる")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p1", { type: "block", instanceId: muma.instanceId }) === null, "無魔のスカルゴイルでブロックできる")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    settle(s) // 【不死：無魔】の召喚を選ぶ
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === muma.instanceId), "無魔のスカルゴイルはBP負けで破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === X07), "トラッシュのX07がスピリット状態で場に出る")
    assert(!s.players.p1.trashCards.includes(X07), "X07はトラッシュから離れる")
}

console.log("=== D. 025 Lv1：相手がドローしたとき回復する。自分のドローでは回復しない ===")
{
    const s = game("d")
    const waono = put(s, "p1", WAONO, 1) // Lv1
    waono.isRested = true
    draw(s, "p1", 1)
    assert(waono.isRested, "自分のドローでは回復しない")
    draw(s, "p2", 1)
    assert(!waono.isRested, "相手がドローしたので回復する")
}

console.log("=== E. 025【合体時】Lv2：バトルしている自分のスピリットはコア1個につきBP+1000。バトルしていない025自身は上がらない ===")
{
    const s = game("e")
    const waono = put(s, "p1", WAONO, 3) // Lv2
    combine(s, "p1", waono, HAM) // 合体時。BP6000+2000=8000
    const attacker = put(s, "p1", TARAN, 3) // Lv2 BP8000・コア3個
    const blocker = put(s, "p2", VAJU, 3) // Lv2 BP10000
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "タランドーズでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ヴァジュランガでブロックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    // BP8000+3000=11000 ＞ BP10000。+3000が無ければBP負けで破壊される
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "コア3個ぶんBP+3000されてヴァジュランガを破壊する")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === attacker.instanceId), "タランドーズは場に残る")
    assert(effectiveBp(s, "p1", waono) === 8000, "バトルしていない025自身のBPは+3000されない（8000のまま）")
}

console.log("=== F. 069 Lv2：自分のスピリットの効果で相手のスピリット2体を疲労させても、ボイドからコアは1個だけ ===")
{
    const s = game("f")
    putNexus(s, "p1", NIMBUS, 2) // Lv2
    const sonken = put(s, "p1", SONKEN, 3) // Lv2
    const ally = put(s, "p1", VANILLA, 1)
    const blocker = put(s, "p2", VANILLA, 1)
    const tiredA = put(s, "p2", SKULL, 1)
    const tiredB = put(s, "p2", SKULL, 1)
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: sonken.instanceId }) === null, "ソンケンでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ロクケラトプスでブロックできる")
    // ソンケンのブロック時効果の選択はブロック宣言の列の中で出る：相手のスピリット2体を疲労させ、069はコアを置く自分のスピリットを選ばせる（ソンケンを選ぶ）
    settle(s, [tiredA.instanceId, tiredB.instanceId, sonken.instanceId])
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    assert(tiredA.isRested && tiredB.isRested, "ソンケンの効果で相手のスピリット2体が疲労する")
    assert(sonken.cores === 4, "効果1回の解決につきボイドからコア1個だけが置かれる（3→4）")
    assert(ally.cores === 1, "選んでいない自分のスピリットはコアが増えない")
    assert(s.players.p1.reserve === reserveBefore, "コアはボイドからなのでリザーブは増えない")
}

console.log("=== F2. 069 Lv2の境目：自分のマジックで疲労させたときはコアは置かれない ===")
{
    const s = game("f2")
    putNexus(s, "p1", NIMBUS, 2) // Lv2
    const attacker = put(s, "p1", TARAN, 1)
    const target = put(s, "p2", SKULL, 1)
    s.players.p1.hand = [BIND]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "タランドーズでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null, "フラッシュでバインディングソーンを使用できる")
    settle(s, [target.instanceId])
    assert(target.isRested, "マジックで相手のスピリット1体を疲労させる")
    assert(attacker.cores === 1 && s.players.p1.field.spirits.every((x) => x.cores === 1), "自分のマジックの効果ではボイドからコアは置かれない")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
}

console.log("=== G. 069 Lv1：相手のアタックステップで自分の緑のスピリットがBPを比べ相手のスピリットだけを破壊したとき回復する ===")
{
    const s = game("g", "p2")
    putNexus(s, "p1", NIMBUS, 0) // Lv1
    const blocker = put(s, "p1", TARAN, 3) // 緑・Lv2 BP8000
    const attacker = put(s, "p2", TARAN, 1) // Lv1 BP6000
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手スピリットでアタックできる")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p1", { type: "block", instanceId: blocker.instanceId }) === null, "緑のタランドーズでブロックできる")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId), "相手のスピリットだけを破壊する")
    assert(!blocker.isRested, "BPを比べ相手のスピリットだけを破壊したのでブロッカーは回復する")
}

console.log("=== G2. 069 Lv1の境目：相打ちは「相手のスピリットだけ」ではないので回復しない ===")
{
    const s = game("g2", "p2")
    putNexus(s, "p1", NIMBUS, 0) // Lv1
    const blocker = put(s, "p1", ANTMAN, 1) // 緑・Lv1 BP5000
    const attacker = put(s, "p2", ANTMAN, 1) // Lv1 BP5000
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手スピリットでアタックできる")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p1", { type: "block", instanceId: blocker.instanceId }) === null, "緑のアントマンでブロックできる")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === blocker.instanceId), "相打ちなので自分のブロッカーも破壊される（回復しない）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId), "相手のアタッカーも破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part785）")
