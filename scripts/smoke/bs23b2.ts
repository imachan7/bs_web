// BS23 B2（ブレイヴの効果を借りる・合体数）の期待値テスト共通部品。part ではない（smoke.ts は part\d+.ts だけを拾う）
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import type { CardInstance } from "../../server/src/type"

export const VANILLA = "BS01-002" // ロクケラトプス
// BS23 の名前は data/staging/BS23.json で機械確認済み。それ以外は data/cards から確認済み
export const C = {
    f031: "BS23-031", // 大空の剣聖フィンヴェール 白・コスト4・剣使/武装
    s044: "BS23-044", // 氷火の剣聖スフィエル 黄・コスト6・剣使/天霊
    b055: "BS23-055", // 太陽剣カーディナル・サン 剣刃・合体条件 剣使
    b056: "BS23-056", // 炎月剣スカーレット・ムーン 剣刃・合体条件 コスト5以上
    x01: "BS23-X01", // 龍輝神シャイニング・ドラゴン・オーバーレイ 赤・コスト8・剣使
    sword: "X13-11", // ソードディスティニー 赤マジック・コスト5
    gornik: "BS21-055", // ゴルニック・イーグル：合体条件コスト3以上、『合体アタック時』このスピリットをBP+5000（剣刃ではない）
    tirok: "BS20-055", // ティロック・ケファレ：合体条件コスト4以上、【合体時】『アタック時』このスピリットをBP+4000（剣刃ではない）
    wingal: "BS02-046", // ウィンガル 白・コスト6・武装・Lv1 BP5000
    cannon: "BS01-089", // デュアルキャノン・ベル 白・コスト4・武装
    gatling: "BS01-084", // ガトリングスタンド 白・コスト3・武装
    melt: "BS03-009", // 火吹きメルト 赤・コスト5・道化・バニラ
    pardo: "BS19-020", // 影の剣使いブラックパルド 紫・コスト5・剣使。Lv1 では効果が出ない
    megalon: "BS05-006", // 城塞龍メガロン コスト5・Lv1 BP5000
    mattango: "BS10-028", // マタンゴル コスト5・Lv1 BP6000
    tornedra: "BS10-009", // トルネードラ コスト6・コア3個で Lv2 BP9000
    breakMagic: "BS12-076", // ブレイヴブレイク 紫フラッシュ・コスト5：相手の合体スピリット1体のブレイヴ1つを破壊
}
const NAMES: Record<string, string> = {
    [C.f031]: "大空の剣聖フィンヴェール", [C.s044]: "氷火の剣聖スフィエル", [C.b055]: "太陽剣カーディナル・サン",
    [C.b056]: "炎月剣スカーレット・ムーン", [C.x01]: "龍輝神シャイニング・ドラゴン・オーバーレイ", [C.sword]: "ソードディスティニー",
    [C.gornik]: "ゴルニック・イーグル", [C.tirok]: "ティロック・ケファレ", [C.wingal]: "ウィンガル", [C.cannon]: "デュアルキャノン・ベル",
    [C.gatling]: "ガトリングスタンド", [C.melt]: "火吹きメルト", [C.pardo]: "影の剣使いブラックパルド", [C.megalon]: "城塞龍メガロン",
    [C.mattango]: "マタンゴル", [C.tornedra]: "トルネードラ", [C.breakMagic]: "ブレイヴブレイク",
}

// BS23 のカードデータが data/cards に入るまでは true にならない。入っていなければ part は1件の失敗だけを出して終わる
export function ready(part: string): boolean {
    const missing: string[] = []
    for (const [id, name] of Object.entries(NAMES)) {
        try {
            if (getCard(id).name !== name) missing.push(`${id}（名前が違う: ${getCard(id).name}）`)
        } catch {
            missing.push(id)
        }
    }
    assert(missing.length === 0, `${part}: 場面に使うカードがカードデータに揃っている${missing.length ? `（無い: ${missing.join("、")}）` : ""}`)
    return missing.length === 0
}

export function board(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.life = 5
        p.reserve = 10
        p.hand = []
        p.trashCards = []
        p.deck = Array.from({ length: 40 }, () => VANILLA)
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = null
        p.burstSet = false
        p.soulCore = null
    }
    return s
}

export function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): CardInstance {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 自分のメインステップに合体操作をして、拒否されたら理由を返す
export function tryCombine(s: GameState, pid: PlayerId, brave: CardInstance, host: CardInstance): string | null {
    const saved = [s.turnPlayer, s.priorityPlayer, s.phase] as const
    s.turnPlayer = pid
    s.priorityPlayer = pid
    s.phase = "main"
    const err = act(s, pid, { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    ;[s.turnPlayer, s.priorityPlayer, s.phase] = saved
    refreshLevelAsOverrides(s)
    return err
}

// 手札を介さず場に出したブレイヴを合体させて場面を作る（合体できなければ失敗）
export function combine(s: GameState, pid: PlayerId, host: CardInstance, braveCardId: string): CardInstance {
    // 合体するとブレイヴの上のコアはホストに移りホストのレベルが上がるので、場に出す時点でコアは載せない
    const brave = put(s, pid, braveCardId, 0)
    const err = tryCombine(s, pid, brave, host)
    assert(err === null, `準備: ${getCard(braveCardId).name} が ${getCard(host.cardId).name} に合体できる${err ? `（拒否: ${err}）` : ""}`)
    return brave
}

export function braves(s: GameState, pid: PlayerId, host: CardInstance): CardInstance[] {
    const ids = (host.braveRefs ?? []).map((r) => r.instanceId)
    return s.players[pid].field.combinedBraves.filter((b) => ids.includes(b.instanceId))
}
export const braveNames = (s: GameState, pid: PlayerId, host: CardInstance): string => braves(s, pid, host).map((b) => getCard(b.cardId).name).sort().join("、") || "なし"

// pid のターンのアタックステップにする
export function toAttackStep(s: GameState, pid: PlayerId): void {
    s.turnPlayer = pid
    s.priorityPlayer = pid
    s.phase = "main"
    const err = act(s, pid, { type: "nextPhase" })
    assert(err === null, `準備: アタックステップに進める${err ? `（拒否: ${err}）` : ""}`)
}

export function attack(s: GameState, pid: PlayerId, inst: CardInstance): string | null {
    return act(s, pid, { type: "attack", instanceId: inst.instanceId })
}

export function closeFlash(s: GameState): void {
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle; i++) {
        const err = act(s, s.priorityPlayer, { type: "pass" })
        if (err) throw new Error(`フラッシュを閉じられない: ${err}`)
    }
}

// フラッシュタイミングで pid に優先権を回して操作する（相手が先なら先に pass する）
export function flashAs(s: GameState, pid: PlayerId, action: GameAction): string | null {
    if (s.priorityPlayer !== pid) {
        const err = act(s, s.priorityPlayer, { type: "pass" })
        if (err) return `優先権を渡せない: ${err}`
    }
    return act(s, pid, action)
}

export const bp = (s: GameState, pid: PlayerId, inst: CardInstance): number => effectiveBp(s, pid, inst)
export const onField = (s: GameState, pid: PlayerId, inst: CardInstance): boolean => s.players[pid].field.spirits.includes(inst)
export const trashNames = (s: GameState, pid: PlayerId): string => s.players[pid].trashCards.map((c) => getCard(c).name).sort().join("、") || "なし"
export const handNames = (s: GameState, pid: PlayerId): string => s.players[pid].hand.map((c) => getCard(c).name).sort().join("、") || "なし"
