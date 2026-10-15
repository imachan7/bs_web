// 情報欄・バースト欄・バトル欄の表示
import type { GameView, PlayerId } from "../../../server/src/type"
import { effectiveBp, coreZoneChoiceId, canAwakenFromReserve, timedFlashLocked } from "../../../shared/rules"
import { master, UiState, $ } from "../renderer"

// [ソウルコア]の所在を info パネルの「魂: …」項目用の文字列にする（docs/design/SOULCORE.md 案A-outside。
// コア数値には含まれないため、リザーブ/トラッシュの数値と別に所在だけで示す。2026-10-06 ユーザー確認）
export function soulCoreWhereText(view: GameView, pid: PlayerId): string | null {
    const soul = view.players[pid].soulCore
    if (!soul) return null
    if (soul.zone === "reserve") return "リザーブ"
    if (soul.zone === "trash") return "トラッシュ"
    const p = view.players[pid]
    const inst = [...p.field.spirits, ...p.field.nexuses].find((s) => s.instanceId === soul.instanceId)
    return inst ? master(inst.cardId).name : "フィールド"
}

export function renderInfo(
    id: string,
    view: GameView,
    ui: UiState,
    pid: PlayerId,
    isSelf: boolean,
    lifeDamaged: boolean,
): void {
    const p = view.players[pid]
    const el = $(id)
    el.innerHTML = ""
    // 覚醒モード中にリザーブからコアを移せるか（ディノゾールLv2の効果）
    const awakenInstForHighlight = ui.awakenTarget !== null
        ? view.players[view.you].field.spirits.find((s) => s.instanceId === ui.awakenTarget)
        : undefined
    const reserveHighlight = isSelf
        && ui.awakenTarget !== null
        && canAwakenFromReserve(view, view.you, awakenInstForHighlight)
        && p.reserve >= 1
    // 効果解決の選択待ちで、このプレイヤーのリザーブ／トラッシュのコアが候補になっているか（取り先を1個ずつ選ぶ removeCores）
    const myChoiceCandidates = view.pendingChoice?.pid === view.you ? (view.pendingChoice.candidates ?? []) : []
    const zoneChoice = (zone: "reserve" | "trash"): string | undefined =>
        myChoiceCandidates.includes(coreZoneChoiceId(zone, pid)) ? coreZoneChoiceId(zone, pid) : undefined
    // ライフダメージのGameEventがあれば演出用クラスを付与（一過性のアニメーションなので毎描画で再生されるだけでよい）
    const items: [string, string][] = [
        ["", (isSelf ? "あなた: " : "相手: ") + p.name + (view.turnPlayer === pid ? " ⏵ターン中" : "")],
        ["life" + (lifeDamaged ? " life-changed" : ""), `❤ ${p.life}`],
        // ソウルコアはコア数値に含まれない（docs/design/SOULCORE.md 案A-outside）。
        // 案B-inside: 数値には最初から[ソウルコア]が含まれる（2026-10-06 ユーザー確定）。所在は別項目で特定する
        ["reserve", `🔵 リザーブ ${p.reserve}`],
        ["trash-cores", `トラッシュコア ${p.trashCores}`],
        ...((soulCoreWhereText(view, pid)
            ? [["soul-core", `${soulCoreWhereText(view, pid)}`]]
            : []) as [string, string][]),
        // デッキの横に置かれたコア（BS12-078 カシオペアシール）。置かれているときだけ出す
        ...((p.deckSideCores > 0 ? [["", `デッキ横のコア ${p.deckSideCores}`]] : []) as [string, string][]),
        // バーストのセット状況（公開情報）。中身は出さない。自分側だけターン1回制限の消化を添える
        ...((p.burstSet
            ? [["", `バースト セット中${isSelf && p.burstSetThisTurn ? "（このターンはセット済み）" : ""}`]]
            : []) as [string, string][]),
        ["", `デッキ ${p.deckCount}枚`],
        ["", isSelf ? `手札 ${p.handCount}枚` : `相手手札 ${p.handCount}枚`],
        ["", `トラッシュ ${p.trashCards.length}枚`],
    ]

    if (!isSelf && view.players[view.you].peekedOpponentCardIds?.length) {
        const peeked = view.players[view.you].peekedOpponentCardIds!.map(id => master(id).name).join(" / ")
        items.push(["", `(判明: ${peeked})`])
    }
    for (const [cls, text] of items) {
        const span = document.createElement("span")
        if (cls) span.className = cls
        const isReserve = cls.includes("reserve")
        // 覚醒モードでリザーブをコアの移動元にできるカード（ディノゾールLv2）のため、
        // 自分のリザーブ表示をクリック対象として識別できるようにする
        if (isSelf && isReserve) {
            span.dataset.reserve = "self"
            if (reserveHighlight) span.classList.add("targetable", "clickable")
        }
        // リザーブ／トラッシュのコアは、選択待ちの候補になっているときだけクリック対象にする
        const choiceId = isReserve ? zoneChoice("reserve") : cls === "trash-cores" ? zoneChoice("trash") : undefined
        if (choiceId !== undefined) {
            span.dataset.corezone = choiceId
            span.classList.add("targetable", "clickable")
        }
        // 所在項目はソウルコア画像で示す（2026-10-06 ユーザー要望）
        if (cls === "soul-core") {
            span.innerHTML = `<img src="/imgs/soulcore.png" class="soul-core-inline" alt="[ソウルコア]"> ソウルコア ${text}`
        } else {
            span.textContent = text
        }
        el.appendChild(span)
    }
}

// バーストエリア（docs/design/BURST.md）。セットされているか否かは公開情報（burstSet）だが、
// 中身のcardIdは自分にしか来ない（相手側は view.players[相手].burst が常にnull）。
// ⚠️ 相手側の分岐では cardId・カード名を一切 DOM に入れないこと
export function renderBurst(id: string, view: GameView, pid: PlayerId, isMine: boolean): void {
    const player = view.players[pid]
    const zone = $(id)
    zone.innerHTML = ""

    if (!player.burstSet) {
        const empty = document.createElement("div")
        empty.className = "burst-slot burst-empty"
        empty.textContent = "バースト"
        zone.appendChild(empty)
        return
    }

    const el = document.createElement("div")
    el.className = "burst-slot"

    if (isMine && player.burst) {
        // 自分のバースト：裏向き（相手には見えない）だが、自分にはカード名を出し、
        // 既存の効果ツールチップ（.card + data-cardId）に乗せてホバーで効果を読めるようにする
        const m = master(player.burst)
        el.classList.add("card", "burst-mine")
        el.dataset.cardId = player.burst
        el.style.setProperty("--c-main", `var(--c-${m.colors[0]})`)
        el.style.setProperty("--c-sub", `var(--c-${m.colors[m.colors.length > 1 ? 1 : 0]})`)
        const lock = document.createElement("div")
        lock.className = "burst-hidden-icon"
        lock.textContent = "🔒"
        lock.title = "相手には見えません（裏向き）"
        el.appendChild(lock)
        const name = document.createElement("div")
        name.className = "name"
        name.textContent = m.name
        el.appendChild(name)
    } else {
        // 相手のバースト：伏せてあることだけが公開情報。中身は絶対に出さない
        el.classList.add("burst-back")
    }

    zone.appendChild(el)
}

export function renderBattle(view: GameView): void {
    const el = $("battle-info")
    if (!view.battle) {
        el.classList.add("hidden")
        return
    }
    el.classList.remove("hidden")

    const attackerPid = view.turnPlayer
    const attacker = view.players[attackerPid].field.spirits.find(
        (s) => s.instanceId === view.battle?.attackerInstanceId,
    )
    if (!attacker) {
        el.textContent = "バトル解決中…"
        return
    }
    const m = master(attacker.cardId)
    const bp = effectiveBp(view, attackerPid, attacker)
    const isDefender = view.you !== attackerPid
    const hasPriority = view.priorityPlayer === view.you
    // ブロック宣言済みか（宣言後はフラッシュが再オープンされる）
    const blocked = !!view.battle.blockerInstanceId

    // ブロッカーの名前・BP（ブロック宣言後のみ算出。相手陣営のフィールドから探す）
    let blockerText = ""
    if (blocked) {
        const defenderPid: PlayerId = attackerPid === "p1" ? "p2" : "p1"
        const blocker = view.players[defenderPid].field.spirits.find(
            (s) => s.instanceId === view.battle?.blockerInstanceId,
        )
        if (blocker) {
            const bm = master(blocker.cardId)
            const blockerBp = effectiveBp(view, defenderPid, blocker)
            blockerText = ` ブロッカー: ${bm.name}（BP${blockerBp}）。`
        }
    }

    let message: string
    if (blocked) {
        // ブロック宣言後の追加フラッシュ
        if (isDefender) {
            if (view.isFlashTiming && hasPriority) {
                message = `⚔ ${m.name}（BP${bp}）をブロック宣言中。${blockerText}追加でフラッシュマジックを使うか「パス」してください。`
            } else {
                message = `⚔ ${m.name}（BP${bp}）をブロック宣言中。${blockerText}相手の対応を待っています…`
            }
        } else {
            if (view.isFlashTiming && hasPriority) {
                message = `⚔ ${m.name}（BP${bp}）はブロックされました。${blockerText}フラッシュマジックを使うか「パス」してください。`
            } else {
                message = `⚔ ${m.name}（BP${bp}）はブロックされました。${blockerText}相手の対応を待っています…`
            }
        }
    } else if (isDefender) {
        if (view.isFlashTiming && !hasPriority) {
            message = `⚔ ${m.name}（BP${bp}）がアタック中。相手がフラッシュの優先権を持っています…`
        } else if (view.isFlashTiming) {
            message = `⚔ ${m.name}（BP${bp}）がアタック！ フラッシュマジックを使うか「パス」してください。パス後にブロック／「ライフで受ける」を選べます。`
        } else {
            message = `⚔ ${m.name}（BP${bp}）がアタック！ フラッシュ終了。ブロックするスピリットを選ぶか「ライフで受ける」を押してください。`
        }
    } else {
        if (view.isFlashTiming && hasPriority) {
            message = `⚔ ${m.name}（BP${bp}）でアタック中。フラッシュの優先権があります。マジックを使うか「パス」してください。`
        } else {
            message = `⚔ ${m.name}（BP${bp}）でアタック中。相手の対応を待っています…`
        }
    }

    // ディバインチェイン等でフラッシュ封印中の場合、封じられている側の視点で追記
    if (timedFlashLocked(view, view.you)) {
        message += " あなたはフラッシュ封印中（手札のカードを使用できない）。"
    } else if (timedFlashLocked(view, view.you === "p1" ? "p2" : "p1")) {
        message += " 相手はフラッシュ封印中（手札のカードを使用できない）。"
    }

    el.textContent = message
}
