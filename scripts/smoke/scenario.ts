// 場面テスト（docs/design/TEST_STRATEGY.md）。
// 組んでよいのは開始盤面だけで、そこから先は handleAction だけで進める。
// 判定は「盤面の写像の差分」が expect と**完全に一致**すること。書いていない変化が起きても落ちる
// （発生源ではなくイベント対象が回復していた BS13-X04 レオのような取り違えを、テストを書いた側が見落としていても拾うため）。
// 「自分」は場面の主役。mirror（既定 true）で主役を p1→p2 に入れ替えてもう1回走らせる
import { act, assert, createGame, createInstance, currentLevel, effectiveBp, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import type { CardInstance, SoulCoreLocation } from "../../server/src/type"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

export interface InstanceSpec {
    card: string
    label?: string // 省略時はカード名。同じ盤面に同名が2体いるなら必ず付ける
    cores?: number
    rested?: boolean
}

export interface SideSpec {
    life?: number // 既定 5
    reserve?: number // 既定 10
    hand?: string[] // 既定 空
    deck?: string[] // 既定 バニラ40枚
    trash?: string[]
    // ソウルコアの置き場（"リザーブ" か、その陣営の個体の label）。数えるコア数には含まれる（案B-inside）。省略時はソウルコアなし
    soulCore?: string
    spirits?: InstanceSpec[]
    nexuses?: InstanceSpec[]
    burst?: string
}

export type Side = "me" | "opp"

export interface ScenarioCtx {
    state: GameState
    me: PlayerId
    opp: PlayerId
    // 拒否されたら落とす。拒否されるのが正しい場面は actRejected を使う
    act(side: Side, action: GameAction): void
    actRejected(side: Side, action: GameAction): void
    id(label: string): string
    inst(label: string): CardInstance
    // フラッシュタイミングを両者パスで閉じる
    closeFlash(): void
}

export interface ScenarioSpec {
    name: string
    // interactive：選択を PendingChoice で止める（順番選択・対象選択を steps で答える）。既定は自動で選ぶ
    // manualCoreLevel：効果召喚の「置くコアの数（Lv）」の待ちを自動で答えない（その待ちで支払い元を選ぶ場面用）
    start: { turn?: Side; phase?: "main" | "attack"; interactive?: boolean; manualCoreLevel?: true; me?: SideSpec; opp?: SideSpec }
    steps: (t: ScenarioCtx) => void
    // 1行＝「キー: 前 → 後」。キーは写像のもの（例「自分.レオ.疲労」）。並びは問わない
    expect: string[]
    mirror?: boolean
}

type Snapshot = Map<string, string>

// 個体の上なら label。写像の時点で場にいない個体は instanceId のまま出す（整合検査が別に落とす）
function soulCoreWhere(soul: SoulCoreLocation, label: (id: string) => string | undefined): string {
    if (soul.zone === "reserve") return "リザーブ"
    if (soul.zone === "trash") return "トラッシュ"
    return label(soul.instanceId) ?? soul.instanceId
}

const sideName = (side: Side) => (side === "me" ? "自分" : "相手")

// instanceId → 写像のキーの頭（「自分.レオ」）。陣営は最初に見えた時点で決める
type Labels = Map<string, string>

function setupSide(s: GameState, pid: PlayerId, side: Side, spec: SideSpec, labels: Labels): void {
    const p = s.players[pid]
    p.life = spec.life ?? 5
    p.reserve = spec.reserve ?? 10
    p.hand = [...(spec.hand ?? [])]
    p.deck = [...(spec.deck ?? Array.from({ length: 40 }, () => VANILLA))]
    p.trashCards = [...(spec.trash ?? [])]
    p.field.spirits = []
    p.field.nexuses = []
    p.field.combinedBraves = []
    p.burst = spec.burst ?? null
    p.burstSet = spec.burst !== undefined
    const place = (list: InstanceSpec[] | undefined, zone: CardInstance[]) => {
        for (const x of list ?? []) {
            const inst = createInstance(x.card, s.turn - 1, x.cores ?? 1)
            inst.isRested = x.rested ?? false
            const label = `${sideName(side)}.${x.label ?? getCard(x.card).name}`
            if ([...labels.values()].includes(label)) throw new Error(`ラベルが重複: ${label}（label を付けること）`)
            labels.set(inst.instanceId, label)
            zone.push(inst)
        }
    }
    place(spec.spirits, p.field.spirits)
    place(spec.nexuses, p.field.nexuses)
    p.soulCore = null
    if (spec.soulCore === undefined) return
    if (spec.soulCore === "リザーブ") {
        if (p.reserve < 1) throw new Error(`${sideName(side)}のソウルコアをリザーブに置くにはリザーブが1以上要る`)
        p.soulCore = { zone: "reserve" }
        return
    }
    const label = `${sideName(side)}.${spec.soulCore}`
    const inst = [...p.field.spirits, ...p.field.nexuses].find((x) => labels.get(x.instanceId) === label)
    if (!inst) throw new Error(`ソウルコアの置き場「${label}」がいない`)
    p.soulCore = { zone: "instance", instanceId: inst.instanceId }
    inst.soulCoreOn = true
}

// 写像に載せるのは、対戦者が盤面から読み取れるものだけ（内部の印・一時フィールドは見ない）
function snapshot(s: GameState, me: PlayerId, labels: Labels): Snapshot {
    const out: Snapshot = new Map()
    const names = (ids: string[]) => ids.map((c) => getCard(c).name).sort().join("、") || "なし"
    const labelOf = (inst: CardInstance, k: string) => {
        let l = labels.get(inst.instanceId)
        if (l === undefined) {
            // 場面の途中で現れた個体（召喚など）。同名が既にいれば番号を振る
            const base = `${k}.${getCard(inst.cardId).name}`
            const used = new Set(labels.values())
            l = base
            for (let n = 2; used.has(l); n++) l = `${base}#${n}`
            labels.set(inst.instanceId, l)
        }
        return l
    }
    const seen = new Set<string>()
    for (const side of ["me", "opp"] as const) {
        const pid = side === "me" ? me : me === "p1" ? "p2" : "p1"
        const p = s.players[pid]
        const k = sideName(side)
        out.set(`${k}.ライフ`, String(p.life))
        out.set(`${k}.リザーブ`, String(p.reserve))
        out.set(`${k}.トラッシュのコア`, String(p.trashCores))
        out.set(`${k}.手札`, names(p.hand))
        out.set(`${k}.デッキ枚数`, String(p.deck.length))
        out.set(`${k}.トラッシュ`, names(p.trashCards))
        out.set(`${k}.バースト`, p.burst ? getCard(p.burst).name : "なし")
        if (p.soulCore !== null) out.set(`${k}.ソウルコア`, soulCoreWhere(p.soulCore, (id) => labels.get(id)))
        const put = (inst: CardInstance, where: string, withBp: boolean) => {
            const l = labelOf(inst, k)
            seen.add(inst.instanceId)
            out.set(`${l}.場所`, where)
            out.set(`${l}.疲労`, String(inst.isRested))
            out.set(`${l}.コア`, String(inst.cores))
            out.set(`${l}.Lv`, String(currentLevel(inst).level))
            if (withBp) out.set(`${l}.BP`, String(effectiveBp(s, pid, inst)))
        }
        for (const x of p.field.spirits) put(x, "フィールド", true)
        for (const x of p.field.nexuses) put(x, "ネクサス", false)
        for (const x of p.field.combinedBraves) put(x, "合体", false)
    }
    // 開始時にいた個体がフィールドを離れたら「場所: なし」だけを残す（行き先は手札・トラッシュの行に出る）
    for (const [instanceId, label] of labels) if (!seen.has(instanceId)) out.set(`${label}.場所`, "なし")
    out.set("選択待ち", s.pendingChoice ? `${s.pendingChoice.pid === me ? "自分" : "相手"}：${s.pendingChoice.prompt}` : "なし")
    out.set("勝者", s.winner === null ? "なし" : s.winner === me ? "自分" : "相手")
    return out
}

function diff(before: Snapshot, after: Snapshot): string[] {
    const lines: string[] = []
    const gone = new Set([...after].filter(([key, v]) => key.endsWith(".場所") && v === "なし").map(([key]) => key.slice(0, -".場所".length)))
    for (const key of new Set([...before.keys(), ...after.keys()])) {
        const prefix = key.slice(0, key.lastIndexOf("."))
        if (!after.has(key) && gone.has(prefix)) continue
        const a = before.get(key) ?? "なし"
        const b = after.get(key) ?? "なし"
        if (a !== b) lines.push(`${key}: ${a} → ${b}`)
    }
    return lines.sort()
}

function runOnce(spec: ScenarioSpec, me: PlayerId): void {
    const opp: PlayerId = me === "p1" ? "p2" : "p1"
    const pidOf = (side: Side) => (side === "me" ? me : opp)
    const tag = `[${spec.name}｜自分=${me}]`
    const s = createGame(`scenario-${spec.name}-${me}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = pidOf(spec.start.turn ?? "me")
    s.priorityPlayer = s.turnPlayer
    s.phase = spec.start.phase ?? "main"
    s.interactiveTargets = spec.start.interactive ?? false
    const labels: Labels = new Map()
    setupSide(s, me, "me", spec.start.me ?? {}, labels)
    setupSide(s, opp, "opp", spec.start.opp ?? {}, labels)
    refreshLevelAsOverrides(s)

    const find = (label: string): CardInstance => {
        const all = [...s.players.p1.field.spirits, ...s.players.p1.field.nexuses, ...s.players.p1.field.combinedBraves,
            ...s.players.p2.field.spirits, ...s.players.p2.field.nexuses, ...s.players.p2.field.combinedBraves]
        const hits = all.filter((x) => labels.get(x.instanceId) === label || labels.get(x.instanceId)?.split(".")[1] === label)
        if (hits.length > 1) throw new Error(`${tag} 「${label}」が両陣営にいる（「自分.${label}」の形で書くこと）`)
        const hit = hits[0]
        if (!hit) throw new Error(`${tag} フィールドに「${label}」がいない`)
        return hit
    }
    const t: ScenarioCtx = {
        state: s,
        me,
        opp,
        act(side, action) {
            const err = act(s, pidOf(side), action)
            assert(err === null, `${tag} ${sideName(side)}の ${action.type} が通る${err === null ? "" : `（拒否: ${err}）`}`)
            // 効果召喚の「置くコアの数（Lv）」の待ちは、場面の本題ではないので Lv1 で自動的に答える
            while (err === null && !spec.start.manualCoreLevel && s.pendingChoice?.kind === "option" && s.pendingChoice.options?.[0]?.startsWith("コア")) {
                const e2 = act(s, s.pendingChoice.pid, { type: "resolveChoice", option: s.pendingChoice.options[0] })
                assert(e2 === null, `${tag} 置くコアの数（Lv）に答える${e2 === null ? "" : `（拒否: ${e2}）`}`)
            }
        },
        actRejected(side, action) {
            assert(act(s, pidOf(side), action) !== null, `${tag} ${sideName(side)}の ${action.type} は拒否されるはず`)
        },
        id: (label) => find(label).instanceId,
        inst: find,
        closeFlash() {
            while (s.isFlashTiming && s.battle) {
                const err = act(s, s.priorityPlayer, { type: "pass" })
                if (err) throw new Error(`${tag} フラッシュを閉じられない: ${err}`)
            }
        },
    }

    const before = snapshot(s, me, labels)
    spec.steps(t)
    const actual = diff(before, snapshot(s, me, labels))
    const expected = [...spec.expect].map((l) => l.trim()).sort()
    const missing = expected.filter((l) => !actual.includes(l))
    const extra = actual.filter((l) => !expected.includes(l))
    assert(
        missing.length === 0 && extra.length === 0,
        `${tag} 盤面の変化が期待どおり` +
            (missing.length ? `\n    起きなかった: ${missing.join(" ／ ")}` : "") +
            (extra.length ? `\n    書いていない変化: ${extra.join(" ／ ")}` : ""),
    )
}

export function scenario(spec: ScenarioSpec): void {
    runOnce(spec, "p1")
    if (spec.mirror !== false) runOnce(spec, "p2")
}
