// 効果の解決通知（画面の「どのカードのどの効果か」の表示）。スピリット・ネクサス・ブレイヴの効果だけで、マジック・バーストは別の出来事を持つ
import type { CardData, CardInstance, EffectAction, EffectDef, GameState, PlayerId } from "../type"
import { getCard } from "./GameState"
import { emitEvent } from "./EffectModules"

// 誘発の種類ごとに、効果文の段落を探す語。head は見出し行（『このスピリットのアタック時』）、trig は本文の「〜したとき、」の文。
// head が当たる段落を先に採り、無ければ trig で探す。trig だけで探した場合と fieldEvent・battleWon は、画面に誘発の文を出す
// （見出しが『自分のアタックステップ』のように誘発の形を言わないため。2026-11-24 ユーザー報告）
type Spec = { cls: string; head?: RegExp; trig?: RegExp; showTrigger?: boolean }

const TRIGGERED: Record<string, { head?: RegExp; trig?: RegExp }> = {
    onSummon: { head: /召喚時/, trig: /召喚/ },
    onDeploy: { head: /配置時/, trig: /配置/ },
    onAttack: { head: /アタック時/, trig: /アタックした/ },
    onBlock: { head: /ブロック時/, trig: /ブロックした/ },
    onDestroy: { head: /破壊時/, trig: /破壊された/ },
    onBlocked: { head: /ブロックされ/, trig: /ブロックされ|ブロック(を)?宣言/ },
    onBattleStart: { head: /バトル時/ },
    onBattleEnd: { head: /バトル終了時/, trig: /バトル終了/ },
    onRefreshed: { head: /回復/, trig: /回復/ },
    onBattleWin: { trig: /破壊したとき|破壊するたび|勝った|勝利/ },
    onBattleLose: { trig: /破壊されたとき|負け/ },
    onBattleDestroy: { trig: /破壊したとき/ },
    onLifeDealt: { trig: /ライフ/ },
    onTenshoTarget: { trig: /転召/ },
    onUnblocked: { trig: /ブロックされなかった/ },
}

const FIELD_EVENT: Record<string, RegExp> = {
    anySpiritAttacked: /アタック/,
    ownSpiritDestroyed: /破壊された/,
    opponentSpiritDestroyed: /破壊された/,
    ownSpiritSummoned: /召喚/,
    anySpiritSummoned: /召喚/,
    anyBraveSummoned: /ブレイヴ/,
    ownLifeDamaged: /ライフ/,
    opponentLifeDamaged: /ライフ/,
    ownSpiritDealtLife: /ライフ/,
    ownBurstActivated: /バースト/,
    ownBurstSet: /バースト/,
    opponentBurstSet: /バースト/,
    ownMagicUsed: /マジック/,
    opponentMagicUsed: /マジック/,
    ownNexusDestroyed: /ネクサス/,
    anyNexusDestroyed: /ネクサス/,
    ownNexusDeployed: /ネクサス/,
    ownSpiritBlocked: /ブロック/,
    ownSpiritDeclaredBlock: /ブロック/,
    anySpiritDeclaredBlock: /ブロック/,
    ownSpiritExhausted: /疲労/,
    anySpiritExhausted: /疲労/,
    opponentSpiritBpReachedZero: /BP/,
    opponentHandAdded: /手札/,
    opponentDrew: /ドロー/,
    opponentDrewByEffect: /ドロー/,
    ownTensho: /転召/,
    anySpiritRefreshed: /回復/,
    ownSpiritRefreshed: /回復/,
    ownSpiritReturnedToHand: /手札/,
    anySpiritReturnedToHand: /手札/,
    coresGainedFromVoid: /ボイド/,
}

const STEP_WORD: Record<string, string> = { start: "スタート", draw: "ドロー", refresh: "リフレッシュ", main: "メイン", attack: "アタック", end: "エンド", core: "コア" }
const TURN_WORD: Record<string, string> = { own: "自分の", opponent: "相手の", both: "お互いの" }

function specOf(effect: EffectDef): Spec | undefined {
    switch (effect.kind) {
        case "triggered": {
            const s = TRIGGERED[effect.trigger]
            return s && { cls: `t:${effect.trigger}`, ...s, showTrigger: s.head === undefined }
        }
        case "fieldEvent":
            return { cls: `f:${effect.event}`, ...(effect.event === "ownBurstActivated" ? { head: /バースト発動後/ } : {}), trig: FIELD_EVENT[effect.event] ?? /./, showTrigger: true }
        case "battleWon":
            return { cls: "battleWon", trig: /破壊したとき|破壊するたび|勝った|勝利/, showTrigger: true }
        case "reviveOnDestroy":
            return { cls: "revive", trig: /破壊された/, showTrigger: true }
        case "step": {
            const w = TURN_WORD[effect.turn as string]
            const st = STEP_WORD[effect.step as string]
            return w && st ? { cls: `s:${effect.step}:${effect.turn}`, head: new RegExp(`${w}${st}ステップ`) } : undefined
        }
        case "activated":
            return { cls: `a:${effect.timing}`, head: effect.timing === "main" ? /メイン/ : /フラッシュ/ }
        default:
            return undefined
    }
}

type Para = { head: string | undefined; lvs: number[] | null; triggers: string[] }
// 行頭が見出しの形の行から次の見出し行の手前まで（public/src/ui/effectNotice.ts の effectBodyText と同じ見出しの形）
const HEAD_LINE = /^(Lv\d(･Lv\d)*($|『|：|【)|(【[^】]*】)+($|Lv|『)|『)/

function paragraphsOf(cardId: string): Para[] {
    const lines = getCard(cardId).effect.split("\n")
    const out: Para[] = []
    let i = 0
    while (i < lines.length) {
        const line = lines[i]!
        if (!HEAD_LINE.test(line)) { i++; continue }
        let end = i + 1
        while (end < lines.length && !HEAD_LINE.test(lines[end]!)) end++
        const at = line.indexOf("』")
        const hasHead = line.includes("『") && at !== -1
        const head = hasHead ? line.slice(0, at + 1) : undefined
        const headPart = line.split(/『|$/)[0]!
        const lvs = [...headPart.matchAll(/Lv(\d)/g)].map((m) => Number(m[1]))
        const body = [hasHead ? line.slice(at + 1) : "", ...lines.slice(i + 1, end)].join("\n")
        const triggers = [...body.matchAll(/[^。\n]*?(?:とき|たび|時、)/g)].map((m) => m[0].replace(/、$/, ""))
        out.push({ head, lvs: lvs.length > 0 ? lvs : null, triggers })
        i = end
    }
    return out
}

// 決められないときは何も返さない（違う段落を出すより出さないほうがよい）
export function noticeOf(cardId: string, effect: EffectDef): { heading?: string; trigger?: string } {
    const spec = specOf(effect)
    const levels = "levels" in effect ? (effect.levels ?? null) : null
    if (!spec) return {}
    const paras = paragraphsOf(cardId)
    const byHead = spec.head ? paras.filter((p) => p.head !== undefined && spec.head!.test(p.head)) : []
    const byTrig = spec.trig ? paras.filter((p) => p.triggers.some((t) => spec.trig!.test(t))) : []
    const viaHead = byHead.length > 0
    const pool = viaHead ? byHead : byTrig
    const lvOk = (p: Para) => levels === null || p.lvs === null || p.lvs.some((l) => levels!.includes(l))
    let cands = pool.filter(lvOk)
    // 【粉砕】『このスピリットのアタック時』のようなキーワードの段落は、キーワード自身のエントリの段落で、誘発のエントリの段落ではない
    const plain = cands.filter((p) => !/【(?!合体時)[^】]*】『/.test(p.head ?? ""))
    if (plain.length > 0) cands = plain
    const exact = cands.filter((p) => p.lvs !== null && levels !== null && p.lvs.length === levels.length && p.lvs.every((l) => levels!.includes(l)))
    if (exact.length > 0) cands = exact
    let hit: Para | undefined = cands.length === 1 ? cands[0] : undefined
    let ambiguous = false
    if (cands.length > 1) {
        // 同じ種類の効果エントリの並びと段落の並びを対応させる
        const same = getCard(cardId).effects.filter((e) => specOf(e)?.cls === spec.cls)
        const idx = same.indexOf(effect)
        if (same.length === pool.length && idx !== -1 && cands.includes(pool[idx]!)) hit = pool[idx]
        // 『…』の中身が同じなら見出しだけは言える（誘発の文は段落ごとに違うので出さない）
        else if (cands.every((p) => p.head !== undefined && p.head.slice(p.head.indexOf("『")) === cands[0]!.head!.slice(cands[0]!.head!.indexOf("『")))) { hit = cands[0]; ambiguous = true }
    }
    if (!hit) return {}
    const trigger = !ambiguous && (!viaHead || spec.showTrigger) ? hit.triggers.find((t) => spec.trig?.test(t)) : undefined
    return { ...(hit.head !== undefined ? { heading: hit.head } : {}), ...(trigger !== undefined ? { trigger } : {}) }
}

// 破壊された自身の誘発は包みの内部アクションで来る（効果自身の action はその中で発揮され、入れ子なので通知しない）。
// 同じ種類のエントリが複数あれば先頭の見出しを出す（2026-11-24 ユーザー報告：破壊されたときの誘発の見出しが出なかった）
const WRAPPED: Partial<Record<EffectAction["type"], "onDestroy" | "onBattleLose">> = { resolveOwnDestroyTriggers: "onDestroy", resolveOwnBattleLoseTriggers: "onBattleLose" }

function effectOf(card: CardData, action: EffectAction): EffectDef | undefined {
    const wrapped = WRAPPED[action.type]
    if (wrapped !== undefined) return card.effects.find((e) => e.kind === "triggered" && e.trigger === wrapped)
    if (action.type === "applyReviveOnDestroy") return card.effects.find((e) => e.id === action.effectId)
    // action は EffectDef が持つ同じオブジェクトで来るので、参照一致で引く（ターン1回の包み直しなどで外れたら見出しだけ省く）
    return card.effects.find((e) => "action" in e && e.action === action)
}

export function emitEffectNotice(state: GameState, owner: PlayerId, self: CardInstance, action: EffectAction): void {
    emitEffectNoticeFor(state, owner, self, effectOf(getCard(self.cardId), action))
}

// 効果の定義が手元にある入口（fieldEvent の解決）から直接出す。fieldEvent は self がイベントの主語になることがあり、
// resolveAction の入口では発生源が分からないため（2026-11-24 ユーザー報告：破壊・BP勝ちの誘発が出ない）
export function emitEffectNoticeFor(state: GameState, owner: PlayerId, source: CardInstance, effect: EffectDef | undefined): void {
    // 同じ発生源の通知が直前に出ていれば重ねない（fieldEvent の入口と resolveAction の入口の両方を通る場合）
    const last = state.events[state.events.length - 1]
    if (last?.type === "effect" && last.instanceId === source.instanceId) return
    const card = getCard(source.cardId)
    const { heading, trigger } = effect ? noticeOf(source.cardId, effect) : ({} as { heading?: string; trigger?: string })
    emitEvent(state, { type: "effect", pid: owner, cardId: source.cardId, cardName: card.name, instanceId: source.instanceId, ...(heading !== undefined ? { heading } : {}), ...(trigger !== undefined ? { trigger } : {}) })
}
