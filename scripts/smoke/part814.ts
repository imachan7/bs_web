// smoke パート814（BS22 バッチB2：疲労の体数と記録・【強化】・連鎖・ターンに1回。BS22_PLAN §1「027・X07の疲労は強化の体数も数える（Q20333）」、BS19_PLAN §2.1 の【連鎖】【強化】）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SONSA = "BS22-027" // 小覇鳥ソンサホーク（緑・コスト9・Lv1BP7000/Lv2BP11000・召喚時：コスト12以下2体疲労しコア・Lv2バトル時：相手の合体1体疲労）
const KAMUI = "BS22-X07" // 疾風の双刃カムイ・ハヤテ（緑・ブレイヴ・コスト6・【強化】緑・合体時アタック時に疲労、3体以上で回復）
const MANTIS = "BS22-026" // ゴースト・マンティス（緑・コスト6・ライフを減らしたときコスト合計8まで疲労・黄連鎖でライフにコア）
const BINDING = "BS22-078" // バインディングブランチ（緑・マジック・コスト4・フラッシュ：コスト合計8まで疲労・黄連鎖で合体スピリットのアタック/ブロック禁止）
const GIGANO = "BS22-X01" // 原始の王者ギガノ・レックス（赤・コスト8・地竜・【激突】・緑連鎖で地竜回復ターン1回・Lv2地竜1体につきBP+5000）
const APOLLO = "X13-01" // 太陽凶龍アポロ・ガンディノス（赤・コスト7・アタック時BP5000以下破壊・破壊したらターン1回回復・Lv2以上で指定アタック）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・BP1000）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・地竜・Lv1BP3000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・機竜・Lv1BP3000）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・Lv1BP4000。Lv1は相手のアタックステップにブロックできないので、ブロッカーには使わない）
const MUSHA = "BS14-029" // ムシャ・ジオ（緑・コスト4・Lv1BP5000）BP5000の境目
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・Lv1BP6000）BP5000超え
const KNIGHT = "BS17-X02" // 騎士の覇王ソーディアス・アーサー（紫・コスト12・Lv1BP10000）コスト12の境目
const HIPPO = "BS07-037" // ヒッポカンプー（黄・コスト1）黄シンボル
const FLY = "BS01-051" // フライングミラージュ（緑・コスト1）緑シンボル
const BUGRE = "BS04-030" // 食蟲花バグ・レシア（緑・コスト6・Lv1BP4000）X07の合体先（コスト6以上）
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ・コスト4）相手の合体スピリット用
const KIJ = "BS20-020" // ケンゴーキジ（緑・コスト2・Lv2【強化】緑）
const SEAZAR = "BS01-063" // エメラルドシーザー（緑・コスト4・召喚時：相手のスピリット1体を疲労）

console.log("=== 前提: カードの機械確認 ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp: number }[] }[]
    const find = (id: string) => staging.find((c) => c.cardId === id)
    const lv = (id: string) => find(id)!.levels.map((l) => `${l.level}:${l.cores}:${l.bp}`).join("/")
    assert(find(SONSA)?.name === "小覇鳥ソンサホーク" && find(SONSA)!.type === "spirit" && find(SONSA)!.cost === 9 && lv(SONSA) === "1:1:7000/2:3:11000", "SONSAはソンサホーク（コスト9・Lv1コア1BP7000・Lv2コア3BP11000）")
    assert(find(KAMUI)?.name === "疾風の双刃カムイ・ハヤテ" && find(KAMUI)!.type === "brave" && find(KAMUI)!.cost === 6, "KAMUIはカムイ・ハヤテ（ブレイヴ・コスト6）")
    assert(find(MANTIS)?.name === "ゴースト・マンティス" && find(MANTIS)!.type === "spirit" && find(MANTIS)!.cost === 6 && lv(MANTIS) === "1:1:5000/2:3:8000", "MANTISはゴースト・マンティス（コスト6・Lv1BP5000）")
    assert(find(BINDING)?.name === "バインディングブランチ" && find(BINDING)!.type === "magic" && find(BINDING)!.cost === 4, "BINDINGはバインディングブランチ（マジック・コスト4）")
    assert(find(GIGANO)?.name === "原始の王者ギガノ・レックス" && find(GIGANO)!.cost === 8 && find(GIGANO)!.family.includes("地竜") && lv(GIGANO) === "1:1:7000/2:3:12000", "GIGANOはギガノ・レックス（コスト8・地竜・Lv1BP7000・Lv2BP12000）")
    assert(find(APOLLO)?.name === "太陽凶龍アポロ・ガンディノス" && find(APOLLO)!.cost === 7 && lv(APOLLO) === "1:1:5000/2:3:10000/3:5:12000", "APOLLOはアポロ・ガンディノス（コスト7・Lv2コア3BP10000）")
    const c = (id: string) => getCard(id)
    assert(c(VAN).name === "ロクケラトプス" && c(VAN).family.includes("地竜") && c(VAN).levels[0]!.bp === 1000, "VANはロクケラトプス（地竜・BP1000）")
    assert(c(STIRA).name === "スティラホーン" && c(STIRA).cost === 5 && c(STIRA).family.includes("地竜") && c(STIRA).levels[0]!.bp === 3000, "STIRAはスティラホーン（コスト5・地竜・BP3000）")
    assert(c(METAL).name === "メタルバーン" && c(METAL).cost === 3 && !c(METAL).family.includes("地竜") && c(METAL).levels[0]!.bp === 3000, "METALはメタルバーン（コスト3・地竜でない・BP3000）")
    assert(c(SABER).name === "テラノセイバー" && c(SABER).levels[0]!.bp === 4000, "SABERはテラノセイバー（BP4000）")
    assert(c(MUSHA).name === "ムシャ・ジオ" && c(MUSHA).levels[0]!.bp === 5000 && c(MUSHA).colors[0] === "green", "MUSHAはムシャ・ジオ（緑・BP5000）")
    assert(c(TARAN).name === "タランドーズ" && c(TARAN).levels[0]!.bp === 6000, "TARANはタランドーズ（BP6000）")
    assert(c(KNIGHT).name === "騎士の覇王ソーディアス・アーサー" && c(KNIGHT).cost === 12, "KNIGHTはソーディアス・アーサー（コスト12）")
    assert(c(HIPPO).name === "ヒッポカンプー" && c(HIPPO).colors[0] === "yellow", "HIPPOはヒッポカンプー（黄）")
    assert(c(FLY).name === "フライングミラージュ" && c(FLY).colors[0] === "green", "FLYはフライングミラージュ（緑）")
    assert(c(BUGRE).name === "食蟲花バグ・レシア" && c(BUGRE).cost === 6 && c(BUGRE).colors[0] === "green", "BUGREはバグ・レシア（緑・コスト6）")
    assert(c(KARAKURI).name === "カラクリバッタ" && c(KARAKURI).type === "brave", "KARAKURIはカラクリバッタ（ブレイヴ）")
    assert(c(KIJ).name === "ケンゴーキジ" && c(KIJ).effect.includes("【強化】"), "KIJはケンゴーキジ（【強化】）")
    assert(c(SEAZAR).name === "エメラルドシーザー" && c(SEAZAR).cost === 4, "SEAZARはエメラルドシーザー（コスト4）")
}

function game(seed: string, turnPlayer: PlayerId = "p1", phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
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

type Inst = ReturnType<typeof createInstance>

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false): Inst {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: Inst, braveCardId: string): Inst {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

// 対象の選択は picks の先頭から（選択済みは飛ばす）。exact=true なら picks に無いときは確定する（好きなだけ選ぶ効果で「選ばない」を表す）
function settle(s: GameState, picks: string[] = [], exact = false): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; selectedIds?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        else if (pc.kind === "target") {
            const hit = picks.find((x) => (pc.candidates ?? []).includes(x) && !(pc.selectedIds ?? []).includes(x))
            const next = hit ?? (exact ? undefined : (pc.candidates ?? [])[0])
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

// アタック宣言後、お互いにパスしてブロック宣言の場面にする
function toBlock(s: GameState, attacker: PlayerId): void {
    const defender: PlayerId = attacker === "p1" ? "p2" : "p1"
    act(s, defender, { type: "pass" })
    act(s, attacker, { type: "pass" })
}

const onField = (s: GameState, pid: PlayerId, x: Inst): boolean => s.players[pid].field.spirits.some((y) => y.instanceId === x.instanceId)

// ───────── 027 小覇鳥ソンサホーク ─────────

// 召喚して召喚時の選択を答え、ソンサホークの個体を返す
function summonSonsa(s: GameState, picks: string[]): Inst {
    s.players.p1.hand = [SONSA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ソンサホークを召喚できる")
    settle(s, picks)
    return s.players.p1.field.spirits.find((x) => x.cardId === SONSA)!
}

console.log("=== 027 召喚時：コスト12以下の相手のスピリット2体を疲労させ、疲労した1体につきボイドからコア1個を自分に置く ===")
const baseCores = (() => {
    const s = game("sonsa-base", "p1", "main")
    return summonSonsa(s, []).cores // 相手に対象がいないときの召喚直後のコア数
})()
{
    const s = game("sonsa-two", "p1", "main")
    const v = put(s, "p2", VAN)
    const st = put(s, "p2", STIRA)
    const m = put(s, "p2", METAL)
    const sonsa = summonSonsa(s, [v.instanceId, st.instanceId, m.instanceId])
    assert(v.isRested && st.isRested, "選んだ相手のスピリット2体が疲労する")
    assert(!m.isRested, "3体目は疲労しない（2体まで）")
    assert(sonsa.cores === baseCores + 2, "疲労した2体につきコア2個がソンサホークに置かれる")
}
{
    const s = game("sonsa-one", "p1", "main")
    const v = put(s, "p2", VAN)
    const sonsa = summonSonsa(s, [v.instanceId])
    assert(v.isRested, "相手のスピリットが1体だけならその1体が疲労する")
    assert(sonsa.cores === baseCores + 1, "疲労したのは1体なのでコアは1個だけ置かれる")
}
{
    const s = game("sonsa-cost12", "p1", "main")
    const k = put(s, "p2", KNIGHT)
    const v = put(s, "p2", VAN)
    const sonsa = summonSonsa(s, [k.instanceId, v.instanceId])
    assert(k.isRested && v.isRested, "コスト12ちょうどのスピリットも対象にできる（12以下）")
    assert(sonsa.cores === baseCores + 2, "コスト12の1体を含む2体ぶんのコア2個")
}
{
    const s = game("sonsa-kyoka", "p1", "main")
    put(s, "p1", KAMUI) // 【強化】緑：相手への疲労効果の体数+1体（Q20333：強化で増えた体数も数える）
    const v = put(s, "p2", VAN)
    const st = put(s, "p2", STIRA)
    const m = put(s, "p2", METAL)
    const sonsa = summonSonsa(s, [v.instanceId, st.instanceId, m.instanceId])
    assert(v.isRested && st.isRested && m.isRested, "カムイの【強化】で疲労は3体になる")
    assert(sonsa.cores === baseCores + 3, "【強化】で増えた1体ぶんも数えてコア3個")
}

console.log("=== 027 Lv2『このスピリットのバトル時』：相手の合体スピリット1体を疲労させる（Lv1・合体なしでは起きない） ===")
for (const [cores, label] of [[3, "Lv2"], [1, "Lv1"]] as const) {
    const s = game(`sonsa-battle-${label}`)
    const sonsa = put(s, "p1", SONSA, cores)
    const host = put(s, "p2", STIRA)
    combine(s, "p2", host, KARAKURI)
    const blocker = put(s, "p2", VAN)
    const bystander = put(s, "p2", METAL)
    assert(act(s, "p1", { type: "attack", instanceId: sonsa.instanceId }) === null, "ソンサホークでアタックできる")
    settle(s)
    toBlock(s, "p1")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "合体していないスピリットでブロックできる")
    settle(s, [bystander.instanceId, host.instanceId])
    assert(host.isRested === (label === "Lv2"), label === "Lv2" ? "Lv2：相手の合体スピリットが疲労する" : "Lv1：バトル時効果は無く合体スピリットは疲労しない")
    assert(!bystander.isRested, "合体していないスピリットは疲労させられない")
}
{
    const s = game("sonsa-battle-nocombine")
    const sonsa = put(s, "p1", SONSA, 3)
    const blocker = put(s, "p2", VAN)
    const other = put(s, "p2", METAL)
    assert(act(s, "p1", { type: "attack", instanceId: sonsa.instanceId }) === null, "ソンサホークでアタックできる")
    settle(s)
    toBlock(s, "p1")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックできる")
    settle(s, [other.instanceId])
    assert(!other.isRested, "相手に合体スピリットがいなければ誰も疲労しない")
}

// ───────── X07 疾風の双刃カムイ・ハヤテ ─────────

console.log("=== X07 Lv1【強化】：自分の「相手への疲労効果」の体数+1体（単体でも合体中でも。無ければ+されない） ===")
{
    const s = game("kamui-alone", "p1", "main")
    put(s, "p1", KAMUI)
    const v1 = put(s, "p2", VAN)
    const v2 = put(s, "p2", STIRA)
    s.players.p1.hand = [SEAZAR]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーを召喚できる")
    settle(s, [v1.instanceId, v2.instanceId])
    assert(v1.isRested && v2.isRested, "カムイが場にいれば召喚時の疲労は2体になる")
}
{
    const s = game("kamui-none", "p1", "main")
    const v1 = put(s, "p2", VAN)
    const v2 = put(s, "p2", STIRA)
    s.players.p1.hand = [SEAZAR]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーを召喚できる")
    settle(s, [v1.instanceId, v2.instanceId])
    assert((v1.isRested ? 1 : 0) + (v2.isRested ? 1 : 0) === 1, "カムイがいなければ疲労は1体だけ")
}

console.log("=== X07【合体時】アタック時：相手のスピリット1体を疲労（【強化】で2体）。3体以上疲労したらこのスピリットは回復 ===")
for (const [withKij, label] of [[false, "強化1つ"], [true, "強化2つ"]] as const) {
    const s = game(`kamui-attack-${label}`)
    const host = put(s, "p1", BUGRE) // コスト6以上
    combine(s, "p1", host, KAMUI)
    if (withKij) put(s, "p1", KIJ, 3) // Lv2【強化】緑
    const o1 = put(s, "p2", VAN)
    const o2 = put(s, "p2", STIRA)
    const o3 = put(s, "p2", METAL)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    settle(s, [o1.instanceId, o2.instanceId, o3.instanceId])
    const n = [o1, o2, o3].filter((x) => x.isRested).length
    assert(n === (withKij ? 3 : 2), withKij ? "【強化】が2つ（合体時とケンゴーキジ）なので3体が疲労する" : "合体時の【強化】1つなので疲労は2体")
    assert(host.isRested === !withKij, withKij ? "3体疲労したのでこのスピリットは回復する" : "2体では回復しない（アタックで疲労したまま）")
}
// ───────── 026 ゴースト・マンティス ─────────

console.log("=== 026 アタック時：ライフを減らしたとき、コスト合計8まで相手のスピリットを好きなだけ疲労（黄連鎖でボイドからコア1個をライフへ） ===")
function mantisBoard(seed: string, yellow: boolean) {
    const s = game(seed)
    const mantis = put(s, "p1", MANTIS)
    if (yellow) put(s, "p1", HIPPO)
    const a = put(s, "p2", METAL) // コスト3
    const b = put(s, "p2", STIRA) // コスト5
    const c = put(s, "p2", VAN) // コスト1
    return { s, mantis, a, b, c }
}
{
    const { s, mantis, a, b, c } = mantisBoard("mantis-8", false)
    assert(act(s, "p1", { type: "attack", instanceId: mantis.instanceId }) === null, "マンティスでアタックできる")
    settle(s)
    assert(takeLifeAndResolve(s, "p2") === null, "相手はブロックせずライフで受ける")
    settle(s, [a.instanceId, b.instanceId, c.instanceId], true)
    assert(s.players.p2.life === 4, "相手のライフが1減る")
    assert(a.isRested && b.isRested, "コスト3＋5＝合計8の2体を疲労させられる")
    assert(!c.isRested, "9を超える3体目（コスト1）は選べず疲労しない")
    assert(s.players.p1.life === 5, "黄シンボルが無いので連鎖のライフ増加は起きない")
}
{
    const { s, mantis, a, b, c } = mantisBoard("mantis-subset", false)
    assert(act(s, "p1", { type: "attack", instanceId: mantis.instanceId }) === null, "マンティスでアタックできる")
    settle(s)
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    settle(s, [c.instanceId], true)
    assert(c.isRested && !a.isRested && !b.isRested, "好きなだけなので選んだ1体（コスト1）だけ疲労する")
}
{
    const { s, mantis, a, b, c } = mantisBoard("mantis-none", false)
    assert(act(s, "p1", { type: "attack", instanceId: mantis.instanceId }) === null, "マンティスでアタックできる")
    settle(s)
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    settle(s, [], true)
    assert(!a.isRested && !b.isRested && !c.isRested, "0体を選んでもよい（誰も疲労しない）")
}
{
    const { s, mantis, a, b, c } = mantisBoard("mantis-yellow", true)
    const life = s.players.p1.life
    assert(act(s, "p1", { type: "attack", instanceId: mantis.instanceId }) === null, "マンティスでアタックできる")
    settle(s)
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    settle(s, [a.instanceId, b.instanceId], true)
    assert(a.isRested && b.isRested && !c.isRested, "黄シンボルがあっても疲労の内容は同じ")
    assert(s.players.p1.life === life + 1, "黄連鎖：ボイドからコア1個が自分のライフに置かれる（5→6）")
}
{
    const { s, mantis, a, b, c } = mantisBoard("mantis-blocked", true)
    const life = s.players.p1.life
    assert(act(s, "p1", { type: "attack", instanceId: mantis.instanceId }) === null, "マンティスでアタックできる")
    settle(s)
    toBlock(s, "p1")
    assert(declareBlock(s, "p2", a.instanceId) === null, "メタルバーンでブロックできる")
    settle(s, [b.instanceId, c.instanceId], true)
    passFlash(s)
    assert(!b.isRested && !c.isRested, "ブロックされてライフを減らせなかったので疲労効果は起きない")
    assert(s.players.p1.life === life, "連鎖のライフ増加も起きない")
}

// ───────── 078 バインディングブランチ ─────────

console.log("=== 078 フラッシュ：コスト合計8まで相手のスピリットを好きなだけ疲労（黄連鎖で相手の合体スピリット1体はこのターンアタック/ブロック不可） ===")
function bindingBoard(seed: string, yellow: boolean) {
    const s = game(seed)
    const attacker = put(s, "p1", VAN)
    if (yellow) put(s, "p1", HIPPO)
    const a = put(s, "p2", METAL)
    const b = put(s, "p2", STIRA)
    const c = put(s, "p2", SABER) // コスト2
    s.players.p1.hand = [BINDING]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    return { s, a, b, c }
}
{
    const { s, a, b, c } = bindingBoard("binding-8", false)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでバインディングブランチを使用できる")
    settle(s, [a.instanceId, b.instanceId, c.instanceId], true)
    assert(a.isRested && b.isRested, "コスト3＋5＝8の2体が疲労する")
    assert(!c.isRested, "合計が8を超えるコスト2は選べず疲労しない")
    assert(s.players.p1.trashCards.includes(BINDING), "使ったマジックはトラッシュへ")
}
{
    const { s, a, b, c } = bindingBoard("binding-subset", false)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでバインディングブランチを使用できる")
    settle(s, [c.instanceId], true)
    assert(c.isRested && !a.isRested && !b.isRested, "好きなだけなので選んだ1体だけ疲労する")
}
{
    const { s, a, b, c } = bindingBoard("binding-none", false)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでバインディングブランチを使用できる")
    settle(s, [], true)
    assert(!a.isRested && !b.isRested && !c.isRested, "0体を選んでもよい")
}
for (const yellow of [true, false]) {
    const s = game(yellow ? "binding-block-yellow" : "binding-block-noyellow")
    const attacker = put(s, "p1", VAN)
    if (yellow) put(s, "p1", HIPPO)
    const host = put(s, "p2", STIRA)
    combine(s, "p2", host, KARAKURI)
    const plain = put(s, "p2", METAL)
    s.players.p1.hand = [BINDING]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでバインディングブランチを使用できる")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "疲労させるスピリットは選ばず確定する")
    settle(s, [host.instanceId]) // 連鎖：指定する合体スピリット
    assert(!host.isRested && !plain.isRested, "疲労させるスピリットを選ばなければ誰も疲労しない")
    act(s, "p1", { type: "pass" })
    if (yellow) {
        assert(declareBlock(s, "p2", host.instanceId) !== null, "黄連鎖：指定された合体スピリットはこのターンブロックできない")
        assert(declareBlock(s, "p2", plain.instanceId) === null, "指定されていない合体でないスピリットはブロックできる")
    } else {
        assert(declareBlock(s, "p2", host.instanceId) === null, "黄シンボルが無ければ合体スピリットもブロックできる")
    }
}
for (const yellow of [true, false]) {
    const s = game(yellow ? "binding-attack-yellow" : "binding-attack-noyellow", "p2")
    if (yellow) put(s, "p1", HIPPO)
    else put(s, "p1", VAN)
    const host = put(s, "p2", STIRA)
    combine(s, "p2", host, KARAKURI)
    const plain = put(s, "p2", METAL)
    s.players.p1.hand = [BINDING]
    assert(act(s, "p2", { type: "attack", instanceId: plain.instanceId }) === null, "相手が合体でないスピリットでアタックする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "防御側が先にフラッシュでバインディングブランチを使用できる")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "疲労させるスピリットは選ばず確定する")
    settle(s, [host.instanceId]) // 連鎖：指定する合体スピリット
    assert(takeLifeAndResolve(s, "p1") === null, "ブロックせずライフで受ける")
    const err = act(s, "p2", { type: "attack", instanceId: host.instanceId })
    if (yellow) assert(err !== null, "黄連鎖：指定された合体スピリットはこのターンアタックできない")
    else assert(err === null, "黄シンボルが無ければ合体スピリットもアタックできる")
}

// ───────── X01 原始の王者ギガノ・レックス ─────────

console.log("=== X01【激突】：相手は可能ならば必ずブロック。緑連鎖で地竜の自分のスピリットすべてを回復（ターンに1回）。Lv2 地竜1体につきBP+5000 ===")
function gigBoard(seed: string, green: boolean, cores = 3) {
    const s = game(seed)
    const gig = put(s, "p1", GIGANO, cores)
    if (green) put(s, "p1", FLY)
    const van = put(s, "p1", VAN, 1, true)
    const stira = put(s, "p1", STIRA, 1, true)
    const metal = put(s, "p1", METAL, 1, true) // 地竜でない
    const blocker = put(s, "p2", METAL)
    return { s, gig, van, stira, metal, blocker }
}
{
    const { s, gig, van, stira, metal, blocker } = gigBoard("gig-green", true)
    assert(act(s, "p1", { type: "attack", instanceId: gig.instanceId }) === null, "ギガノ・レックスでアタックできる")
    settle(s)
    assert(!van.isRested && !stira.isRested, "緑連鎖：系統「地竜」の自分のスピリットがすべて回復する")
    assert(!gig.isRested, "アタックで疲労したギガノ自身も地竜なので回復する")
    assert(metal.isRested, "地竜でないスピリットは回復しない")
    assert(effectiveBp(s, "p1", gig) === 12000 + 5000 * 3, "Lv2：地竜3体（ギガノ・ロクケラトプス・スティラホーン）でBP+15000（27000）")
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    assert(takeLifeAndResolve(s, "p2") !== null, "【激突】：ブロックできるスピリットがいるのでライフで受けられない")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックする")
}
{
    const { s, gig, van, stira, metal } = gigBoard("gig-nogreen", false)
    assert(act(s, "p1", { type: "attack", instanceId: gig.instanceId }) === null, "ギガノ・レックスでアタックできる")
    settle(s)
    assert(van.isRested && stira.isRested && metal.isRested, "緑シンボルが無ければ回復しない")
    assert(gig.isRested, "ギガノ自身も疲労したまま")
    assert(effectiveBp(s, "p1", gig) === 27000, "連鎖が無くてもLv2のBP+5000×地竜3体は有効")
}
{
    const { s, gig } = gigBoard("gig-lv1", true, 1)
    assert(act(s, "p1", { type: "attack", instanceId: gig.instanceId }) === null, "Lv1でアタックできる")
    settle(s)
    assert(effectiveBp(s, "p1", gig) === 7000, "Lv1ではBP+5000は無い（7000のまま）")
    assert(!gig.isRested, "Lv1でも緑連鎖で回復する")
}
{
    const s = game("gig-exhausted-opp")
    const gig = put(s, "p1", GIGANO, 3)
    put(s, "p2", METAL, 1, true) // ブロックできるスピリットがいない
    assert(act(s, "p1", { type: "attack", instanceId: gig.instanceId }) === null, "ギガノ・レックスでアタックできる")
    settle(s)
    assert(takeLifeAndResolve(s, "p2") === null, "ブロックできるスピリットがいなければライフで受ける")
}
{
    const { s, gig, van, blocker } = gigBoard("gig-once", true)
    const blocker2 = put(s, "p2", METAL)
    assert(act(s, "p1", { type: "attack", instanceId: gig.instanceId }) === null, "1回目のアタック")
    settle(s)
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "1回目はブロックされる")
    passFlash(s)
    assert(!gig.isRested && !van.isRested, "1回目の連鎖で回復している")
    van.isRested = true // 2回目の回復が起きないことを見るため、疲労させ直す
    assert(act(s, "p1", { type: "attack", instanceId: gig.instanceId }) === null, "回復したギガノで2回目のアタック")
    settle(s)
    assert(van.isRested, "ターンに1回なので2回目のアタックでは回復しない")
    assert(gig.isRested, "2回目のアタックでギガノは疲労したまま")
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    assert(declareBlock(s, "p2", blocker2.instanceId) === null, "2回目も必ずブロックする")
}

// ───────── X13-01 太陽凶龍アポロ・ガンディノス ─────────

console.log("=== X13-01 アタック時：BP5000以下の相手のスピリット1体を破壊。破壊したらターンに1回回復。Lv2以上は相手のスピリットを指定してアタックできる ===")
{
    const s = game("apollo-lv2")
    const apollo = put(s, "p1", APOLLO, 3)
    const musha = put(s, "p2", MUSHA) // BP5000ちょうど
    const saber = put(s, "p2", SABER) // BP4000
    const taran = put(s, "p2", TARAN) // BP6000
    assert(act(s, "p1", { type: "attack", instanceId: apollo.instanceId, targetSpiritInstanceId: taran.instanceId }) === null, "Lv2：アタック宣言でタランドーズを指定してアタックできる")
    settle(s, [musha.instanceId])
    assert(!onField(s, "p2", musha), "BP5000ちょうどのスピリットは破壊される（5000以下）")
    assert(onField(s, "p2", saber), "選ばなかったBP4000のスピリットは破壊されない")
    assert(!apollo.isRested, "スピリットを破壊したのでアポロは回復する")
    passFlash(s)
    assert(!onField(s, "p2", taran), "Lv2：宣言で指定したBP6000のスピリットが自動でブロッカーになりバトルし、BP10000のアポロが勝って破壊される")
    assert(onField(s, "p1", apollo), "アポロは残る")
}
{
    const s = game("apollo-lv1")
    const apollo = put(s, "p1", APOLLO, 1)
    const musha = put(s, "p2", MUSHA)
    const taran = put(s, "p2", TARAN)
    assert(act(s, "p1", { type: "attack", instanceId: apollo.instanceId, targetSpiritInstanceId: taran.instanceId }) !== null, "Lv1は相手のスピリットを指定してアタックできない")
    assert(act(s, "p1", { type: "attack", instanceId: apollo.instanceId }) === null, "Lv1は通常のアタックはできる")
    settle(s, [musha.instanceId])
    assert(!onField(s, "p2", musha), "Lv1でもBP5000以下は破壊される")
    assert(!apollo.isRested, "Lv1でも破壊したら回復する")
    assert(takeLifeAndResolve(s, "p2") === null, "Lv1は指定アタックできず、通常のアタックでライフで受けられる")
    assert(onField(s, "p2", taran) && s.players.p2.life === 4, "指定されなかったスピリットは無事で、相手のライフが1減る")
}
{
    const s = game("apollo-notarget")
    const apollo = put(s, "p1", APOLLO, 3)
    const taran = put(s, "p2", TARAN)
    assert(act(s, "p1", { type: "attack", instanceId: apollo.instanceId, targetSpiritInstanceId: taran.instanceId }) === null, "Lv2：タランドーズを指定してアタックできる")
    settle(s)
    assert(apollo.isRested, "破壊していないので回復しない（アタックで疲労したまま）")
    passFlash(s)
    assert(!onField(s, "p2", taran), "Lv2の指定アタックは破壊とは別に行える（BP6000のタランドーズに勝つ）")
    assert(apollo.isRested, "バトルで相手を破壊しても、この回復はアタック時の破壊に限るので回復しない")
}
{
    const s = game("apollo-once")
    const apollo = put(s, "p1", APOLLO, 1)
    const saber = put(s, "p2", SABER)
    const van = put(s, "p2", VAN)
    assert(act(s, "p1", { type: "attack", instanceId: apollo.instanceId }) === null, "1回目のアタック")
    settle(s, [saber.instanceId])
    assert(!onField(s, "p2", saber) && !apollo.isRested, "1回目：破壊して回復する")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(act(s, "p1", { type: "attack", instanceId: apollo.instanceId }) === null, "回復したアポロで2回目のアタック")
    settle(s, [van.instanceId])
    assert(!onField(s, "p2", van), "2回目も破壊は起きる")
    assert(apollo.isRested, "回復はターンに1回なので2回目は回復しない")
}

console.log("すべてのチェックに合格しました 🎉（part814）")
