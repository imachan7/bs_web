// ブレイヴの合体・分離と、ホストが場を離れるときにブレイヴを残すかの確認（docs/design/BRAVE.md §2.3・§6・§12.5）

import type { CardInstance, DestroyContext, GameState, PaySource, PlayerId } from "../type"
import { getCard, log, instMinLevelCores, opponentOf, suspend } from "./GameState"

// removal.ts・triggers.ts・EffectModules.ts とは相互 import（CommonJS の循環 require で安全。removal.ts 冒頭の注記）
import { fireFieldEventTriggers, fireTrigger } from "./triggers"

import {
    activeConstraints,
    braveKeepCores,
    cantSpiritStateBrave,
    coresCantBeRemoved,
    bravesOf,
} from "../../../shared/rules"

import {
    emitEvent,
    payCost,
    refreshLevelAsOverrides,
} from "./EffectModules"

// **合体処理の唯一の入口。** ブレイヴの実体を field.combinedBraves へ入れ、
// ホストが braveRefs で参照する（参照方式。§2.3）。かつては GameEngine.ts の
// placeSummonedSpirit と EffectModules.ts の summonFreeFromHandIndex に同じ処理が
// 2箇所書かれていた（2026-08-28、効果による再合体で3箇所目になる前にここへ寄せた）
export function attachBrave(state: GameState, pid: PlayerId, host: CardInstance, brave: CardInstance): void {
    // スピリット状態のブレイヴは合体先にもなれる（BS13-049イリテバン）ため、候補の絞り込みを
    // 1か所でも忘れると「自分自身と合体した」壊れた盤面ができる。全入口の最終防波堤
    if (host.instanceId === brave.instanceId) return
    const player = state.players[pid]
    // 分離してスピリット状態で field.spirits にいるブレイヴを再合体させる経路（detachBrave.combineToChosenSpirit）
    // では、まずそこから抜く。ダイレクトブレイヴ・召喚直後のインスタンスはそもそも spirits にいないので no-op
    const at = player.field.spirits.findIndex((sp) => sp.instanceId === brave.instanceId)
    if (at !== -1) player.field.spirits.splice(at, 1)
    player.field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    // 合体時の疲労合成：どちらかが疲労状態なら合体スピリットは疲労状態（§1.3）
    host.isRested = host.isRested || brave.isRested
    // ブレイヴが足すコスト・色・シンボルをここで組み直す（このあとに出る召喚時効果等がコストや色を読むため）
    refreshLevelAsOverrides(state)
    // 「スピリットが合体したとき」（BS11-064 闇の聖剣Lv2）。合体の入口はここ1つなので、
    // 経路（召喚・効果・再合体）を問わず必ず1回だけ発火する。両フィールドから呼び、
    // 発生源側は subjectSide で自分/相手を絞る
    fireFieldEventTriggers(state, pid, "anySpiritCombined", { pid, inst: host })
    fireFieldEventTriggers(state, opponentOf(pid), "anySpiritCombined", { pid, inst: host })
}

// 効果によるブレイヴの分離（§12.5）。**コアは要らない**（「場を離れるときに残す」＝
// detachBravesOnLeave の Lv1維持コスト以上のコア支払いとは別の手順）。
// 分離したブレイヴはホストの疲労状態を引き継ぐ（§12.5：ルール改定で移動元が疲労していると移動先も疲労になる）
export function detachBraveByEffect(state: GameState, ownerPid: PlayerId, host: CardInstance, brave: CardInstance): void {
    const player = state.players[ownerPid]
    // BS13-005強暴竜ディラノ・レックス：【超覚醒】を持つ自分の合体スピリットは分離できない（全入口共通の最終防波堤）
    if (activeConstraints(state, ownerPid, host).some((c) => c.type === "cantSeparate")) {
        log(state, `${getCard(host.cardId).name}は分離できなかった。`)
        return
    }
    host.braveRefs = (host.braveRefs ?? []).filter((r) => r.instanceId !== brave.instanceId)
    if (host.braveRefs.length === 0) delete host.braveRefs
    const at = player.field.combinedBraves.findIndex((b) => b.instanceId === brave.instanceId)
    if (at !== -1) player.field.combinedBraves.splice(at, 1)
    brave.isRested = host.isRested
    player.field.spirits.push(brave)
    refreshLevelAsOverrides(state)
    log(state, `${player.name}は${getCard(host.cardId).name}から${getCard(brave.cardId).name}を分離させた。`)
}

// 相手の効果で分離させられるとき、**コアの移動はブレイヴの持ち主が行う**（BRAVE.md §12.5.1）。
// 「場を離れるとき」と同じ手順（§6.3）に乗せ、持ち主に「残すか・どのコアを置くか」を聞く。
// ⚠️ 自分の効果による分離（detachBraveByEffect。コア不要）とは別の手順。
// ホストはそのまま場に残るので、バトル中でもブレイヴがバトルを引き継ぐことはない
export function detachBraveByOwnerChoice(state: GameState, ownerPid: PlayerId, host: CardInstance, brave: CardInstance): void {
    const player = state.players[ownerPid]
    // BS13-005強暴竜ディラノ・レックス：【超覚醒】を持つ自分の合体スピリットは分離できない（相手の効果でも同じ）
    if (activeConstraints(state, ownerPid, host).some((c) => c.type === "cantSeparate")) {
        log(state, `${getCard(host.cardId).name}は分離できなかった。`)
        return
    }
    host.braveRefs = (host.braveRefs ?? []).filter((r) => r.instanceId !== brave.instanceId)
    if (host.braveRefs.length === 0) delete host.braveRefs
    const at = player.field.combinedBraves.findIndex((b) => b.instanceId === brave.instanceId)
    if (at !== -1) player.field.combinedBraves.splice(at, 1)
    brave.isRested = host.isRested // 分離時に疲労状態を引き継ぐ（§12.5）
    state.pendingBraveKeeps = [...(state.pendingBraveKeeps ?? []), { pid: ownerPid, brave, wasAttacker: false, wasBlocker: false }]
    log(state, `${player.name}の${getCard(host.cardId).name}は分離させられた。`)
    refreshLevelAsOverrides(state)
    flushBraveKeeps(state)
}

// 合体中のブレイヴ**だけ**を破壊する（BRAVE.md §6.5。2026-09-02 ユーザー確認）。
// **ホストは無傷で場に残る。** 合体中のブレイヴはコア0なので、リザーブへ戻るコアは無い。
// 『破壊時』はブレイヴ側のものだけ発火する（ホストは破壊されていないため）。
//
// ⚠️ 合体中のブレイヴは field.spirits にいないので destroySpirit では届かない（専用の経路）
export function destroyCombinedBrave(
    state: GameState,
    ownerPid: PlayerId,
    host: CardInstance,
    brave: CardInstance,
    context?: DestroyContext,
): void {
    const player = state.players[ownerPid]
    host.braveRefs = (host.braveRefs ?? []).filter((r) => r.instanceId !== brave.instanceId)
    if (host.braveRefs.length === 0) delete host.braveRefs
    const at = player.field.combinedBraves.findIndex((b) => b.instanceId === brave.instanceId)
    if (at !== -1) player.field.combinedBraves.splice(at, 1)
    const name = getCard(brave.cardId).name
    // 破壊時の誘発は**ブレイヴ自身のもの**だけ。この時点でブレイヴは場から抜けているので、
    // 発生源として渡して発火させる（スピリットの破壊待機のような窓は設けない）
    player.trashCards.push(brave.cardId)
    refreshLevelAsOverrides(state)
    log(state, `${player.name}の${getCard(host.cardId).name}のブレイヴ「${name}」は破壊された。`)
    emitEvent(state, { type: "destroy", pid: ownerPid, cardName: name })
    fireTrigger(state, ownerPid, brave, "onDestroy")
    void context
}

// 合体中のブレイヴ**だけ**を手札へ戻す（destroyCombinedBrave のバウンス版。
// 「相手のスピリット/ブレイヴ/ネクサス、どれか1つを手札に戻す」の**ブレイヴ**が合体中だったとき。
// 2026-09-02 ユーザー確認：合体中もスピリット状態も「ブレイヴ」に含む）。ホストは無傷で場に残る
export function returnCombinedBraveToHand(state: GameState, ownerPid: PlayerId, host: CardInstance, brave: CardInstance): void {
    const player = state.players[ownerPid]
    host.braveRefs = (host.braveRefs ?? []).filter((r) => r.instanceId !== brave.instanceId)
    if (host.braveRefs.length === 0) delete host.braveRefs
    const at = player.field.combinedBraves.findIndex((b) => b.instanceId === brave.instanceId)
    if (at !== -1) player.field.combinedBraves.splice(at, 1)
    player.hand.push(brave.cardId)
    refreshLevelAsOverrides(state)
    log(state, `${player.name}の${getCard(host.cardId).name}のブレイヴ「${getCard(brave.cardId).name}」は手札に戻った。`)
}

// 合体中のブレイヴ**だけ**をデッキの一番下へ戻す（returnCombinedBraveToHand のデッキ下版。
// 「相手のスピリット/ブレイヴ/ネクサス、どれか1つをデッキの下に戻す」の**ブレイヴ**が合体中だったとき。
// ホストは無傷で場に残る（returnCombinedBraveToHandと同じ方針。SD06-017甲竜封絶破）
export function returnCombinedBraveToDeckBottom(state: GameState, ownerPid: PlayerId, host: CardInstance, brave: CardInstance): void {
    const player = state.players[ownerPid]
    host.braveRefs = (host.braveRefs ?? []).filter((r) => r.instanceId !== brave.instanceId)
    if (host.braveRefs.length === 0) delete host.braveRefs
    const at = player.field.combinedBraves.findIndex((b) => b.instanceId === brave.instanceId)
    if (at !== -1) player.field.combinedBraves.splice(at, 1)
    player.deck.push(brave.cardId)
    refreshLevelAsOverrides(state)
    const name = getCard(brave.cardId).name
    log(state, `${player.name}の${getCard(host.cardId).name}のブレイヴ「${name}」はデッキの一番下に戻った。`)
    emitEvent(state, { type: "returnToDeck", pid: ownerPid, cardName: name, position: "bottom" })
}

// メインステップの任意分離（§6.4）。**効果による分離（detachBraveByEffect）とは別の手順**で、// メインステップの任意分離（§6.4）。**効果による分離（detachBraveByEffect）とは別の手順**で、
// スピリット状態のLv1維持コスト以上のコアを置く必要がある。支払い可否は
// RuleValidator.validateDetachBrave が済ませている前提で、ここは実際にコアを動かすだけ。
// 支払いは召喚と同じ payCost に通す（フィールドのコアを使ったときの消滅処理まで共通になる）
export function detachBraveVoluntary(
    state: GameState,
    pid: PlayerId,
    host: CardInstance,
    brave: CardInstance,
    paySources?: PaySource[],
): void {
    const player = state.players[pid]
    const need = braveKeepCores(brave)
    // コストは0・置くコアが need。payCost の戻り値は「フィールドのコアから置くコアへ回った数」
    const placedFromField = payCost(state, pid, 0, paySources, need)
    player.reserve -= need - placedFromField
    detachBraveByEffect(state, pid, host, brave)
    brave.cores = need
    refreshLevelAsOverrides(state)
}

// ---- ブレイヴの分離（場を離れるとき。docs/design/BRAVE.md §6）----

// **ホストが場を離れるときに必ず1回だけ呼ぶ共通の入口。**
// 場を離れる経路は破壊だけではない（維持コア割れの消滅・手札へ戻る・デッキへ戻る・
// ターン終了でネクサスに戻る）。**入口ごとに書くと必ずどれかを忘れる**ので、
// `field.spirits` から個体を抜くすべての箇所がこれを通る（§6.1.1）。
//
// ⚠️ **呼ぶ位置は「ホストを場から抜いてコアを移した後」**（§6.3.1 の裁定）。
// ホストのコアがリザーブに入ってからブレイヴに置くのが正しい順で、
// 逆順にすると「残せるはずのブレイヴ」がトラッシュへ行く。
//
// ここでは合体を解いて**コアを乗せずに脇へ置く**だけで、残すかどうかは flushBraveKeeps が決める。
// 器AT：BS13-057ポッポール「この合体スピリットのブレイヴを回復状態でフィールドに残し、スピリットだけを
// 手札に戻す」。detachBravesOnLeave（コアを払って残すか確認する通常の「残す」フロー）とは違い、
// **無償・強制で・指定した状態のまま**フィールドへ残す（現在のコア数もそのまま。Lv1維持コアへリセットしない）
export function detachBravesOnLeaveFree(state: GameState, ownerPid: PlayerId, host: CardInstance, rested: boolean): void {
    const player = state.players[ownerPid]
    const braves = bravesOf(player, host)
    if (braves.length === 0) return
    delete host.braveRefs
    for (const brave of braves) {
        if (player.field.spirits.some((sp) => (sp.braveRefs ?? []).some((r) => r.instanceId === brave.instanceId))) {
            continue // まだ別のホストと合体している
        }
        const at = player.field.combinedBraves.findIndex((b) => b.instanceId === brave.instanceId)
        if (at !== -1) player.field.combinedBraves.splice(at, 1)
        brave.isRested = rested
        player.field.spirits.push(brave)
        log(state, `${player.name}の${getCard(brave.cardId).name}は、${rested ? "疲労" : "回復"}状態でフィールドに残った。`)
    }
    refreshLevelAsOverrides(state)
}

export function detachBravesOnLeave(state: GameState, ownerPid: PlayerId, host: CardInstance): void {
    const player = state.players[ownerPid]
    const braves = bravesOf(player, host)
    if (braves.length === 0) return
    // 先に参照を切る。異魔神ブレイヴ（実体1つ・参照2本）は、
    // **もう片方のホストがまだ生きていれば合体したまま**にする
    delete host.braveRefs
    const wasAttacker = state.battle?.attackerInstanceId === host.instanceId
    const wasBlocker = state.battle?.blockerInstanceId === host.instanceId
    for (const brave of braves) {
        if (player.field.spirits.some((sp) => (sp.braveRefs ?? []).some((r) => r.instanceId === brave.instanceId))) {
            continue // まだ別のホストと合体している
        }
        const at = player.field.combinedBraves.findIndex((b) => b.instanceId === brave.instanceId)
        if (at !== -1) player.field.combinedBraves.splice(at, 1)
        // 合体スピリットの疲労状態をそのまま引き継ぐ（合体中は1体なので状態を共有している。§1.3）
        brave.isRested = host.isRested
        state.pendingBraveKeeps = [...(state.pendingBraveKeeps ?? []), { pid: ownerPid, brave, wasAttacker, wasBlocker }]
    }
    refreshLevelAsOverrides(state)
    flushBraveKeeps(state)
}

// このプレイヤーがいま支払いに回せるコアの総数（リザーブ＋フィールドの取り除けるコア）。
// 「残す」を選べる状態かどうかの判定に使う（払えないなら確認を出さずトラッシュへ）
function payableCores(state: GameState, pid: PlayerId): number {
    const player = state.players[pid]
    const onField = [...player.field.spirits, ...player.field.nexuses]
        .filter((inst) => !coresCantBeRemoved(state, pid, inst))
        .reduce((sum, inst) => sum + inst.cores, 0)
    return player.reserve + onField
}

// 脇に置いてあるブレイヴを1体ずつ決着させる。
// **非対話（テスト・AI）では従来どおりリザーブから自動で払って残す**（払えなければトラッシュ）。
// 対話では持ち主に「残しますか？」を聞いて中断する。**エントリは答えが返るまで消さない**ので、
// 確認が別の中断に上書きされても、次の flush で聞き直される
export function flushBraveKeeps(state: GameState): void {
    if (state.winner) {
        delete state.pendingBraveKeeps
        return
    }
    while (!state.pendingChoice && (state.pendingBraveKeeps?.length ?? 0) > 0) {
        const entry = state.pendingBraveKeeps![0]!
        const player = state.players[entry.pid]
        const need = braveKeepCores(entry.brave)
        const name = getCard(entry.brave.cardId).name
        // BS11-X02 滅神星龍ダークヴルム・ノヴァLv3：この持ち主はブレイヴをスピリット状態にできない
        // ＝「残す」を選べない（確認を出さずトラッシュへ）
        const cantKeep = cantSpiritStateBrave(state, entry.pid)
        if (!cantKeep && state.interactiveTargets && payableCores(state, entry.pid) >= need) {
            suspend(state, {
                pid: entry.pid,
                kind: "option",
                prompt: `${name}：コア${need}個を置いて、スピリット状態でフィールドに残しますか？`,
                candidates: [],
                options: ["残す"],
                optional: true,
                confirm: true,
                skipLabel: "残さない（トラッシュへ）",
                braveKeep: { pid: entry.pid, instanceId: entry.brave.instanceId, cardId: entry.brave.cardId, need },
                action: { type: "noop" },
                selfInstanceId: null,
            })
            return
        }
        state.pendingBraveKeeps!.shift()
        if (cantKeep || player.reserve < need) {
            // 残せない → **合体元と同時にトラッシュへ**（§1.4）
            player.trashCards.push(entry.brave.cardId)
            log(state, `${player.name}の${name}は、コアを置けないため合体元と一緒にトラッシュに置かれた。`)
            continue
        }
        player.reserve -= need
        keepBrave(state, entry, need)
    }
    if ((state.pendingBraveKeeps?.length ?? 0) === 0) delete state.pendingBraveKeeps
}

// コアを置いたブレイヴを、スピリット状態でフィールドへ戻す（支払いは呼び出し元が済ませてある）
function keepBrave(
    state: GameState,
    entry: { pid: PlayerId; brave: CardInstance; wasAttacker: boolean; wasBlocker: boolean },
    need: number,
): void {
    const player = state.players[entry.pid]
    entry.brave.cores = need
    player.field.spirits.push(entry.brave)
    log(state, `${player.name}の${getCard(entry.brave.cardId).name}は、コア${need}個を置いてスピリット状態でフィールドに残った。`)
    // アタック中なら、ブレイヴがそのままバトルを引き継ぐ（§6.2 の5）。
    // **アタック宣言はやり直さない**＝アタック時効果は再発揮しない（2026-08-25 ユーザー確認。§12 の7）
    if (state.battle && entry.wasAttacker) state.battle.attackerInstanceId = entry.brave.instanceId
    else if (state.battle && entry.wasBlocker) state.battle.blockerInstanceId = entry.brave.instanceId
    refreshLevelAsOverrides(state)
}

// 「残す」が選ばれた（doResolveChoice から呼ぶ）。支払いは召喚と同じ payCost に通す
// （フィールドのコアを使ったときの維持コア割れの処理まで共通になる）
export function applyBraveKeep(
    state: GameState,
    info: { pid: PlayerId; instanceId: string; need: number },
    paySources?: PaySource[],
): void {
    const entry = takeBraveKeep(state, info.instanceId)
    if (!entry) return
    // 支払い元の指定が無くリザーブが足りないとき（AI・自動応答）は、フィールドのコアから自動で補う。
    // 確認を出す時点で払えることは flushBraveKeeps が確かめてあるので、ここで不足することはない
    const sources = paySources ?? autoPaySources(state, info.pid, info.need)
    const placedFromField = payCost(state, info.pid, 0, sources, info.need)
    state.players[info.pid].reserve -= info.need - placedFromField
    keepBrave(state, entry, info.need)
}

// リザーブで足りない分をフィールドのコアから自動で拾う（維持コアを割らない余剰コアを優先する）。
// 支払い元を選ばない応答（AI・自動応答）のための決定的なフォールバック
function autoPaySources(state: GameState, pid: PlayerId, need: number): PaySource[] {
    const player = state.players[pid]
    let short = need - player.reserve
    if (short <= 0) return []
    const sources: PaySource[] = []
    const targets = [...player.field.spirits, ...player.field.nexuses].filter(
        (inst) => !coresCantBeRemoved(state, pid, inst),
    )
    for (const surplusOnly of [true, false]) {
        for (const inst of targets) {
            if (short <= 0) break
            const already = sources.find((src) => src.instanceId === inst.instanceId)?.count ?? 0
            const floor = surplusOnly ? instMinLevelCores(inst) : 0
            const usable = Math.max(inst.cores - already - floor, 0)
            if (usable === 0) continue
            const take = Math.min(usable, short)
            if (already > 0) sources.find((src) => src.instanceId === inst.instanceId)!.count += take
            else sources.push({ instanceId: inst.instanceId, count: take })
            short -= take
        }
    }
    return sources
}

// 「残さない」が選ばれた（doResolveChoice から呼ぶ）。合体元と同じくトラッシュへ
export function declineBraveKeep(state: GameState, info: { pid: PlayerId; instanceId: string }): void {
    const entry = takeBraveKeep(state, info.instanceId)
    if (!entry) return
    const player = state.players[entry.pid]
    player.trashCards.push(entry.brave.cardId)
    log(state, `${player.name}の${getCard(entry.brave.cardId).name}は、残さずトラッシュに置かれた。`)
}

function takeBraveKeep(
    state: GameState,
    instanceId: string,
): { pid: PlayerId; brave: CardInstance; wasAttacker: boolean; wasBlocker: boolean } | undefined {
    const list = state.pendingBraveKeeps ?? []
    const at = list.findIndex((e) => e.brave.instanceId === instanceId)
    if (at === -1) return undefined
    const [entry] = list.splice(at, 1)
    if (list.length === 0) delete state.pendingBraveKeeps
    return entry
}

