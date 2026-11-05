import type { GameState, PlayerId } from "../../server/src/type"

// カードは増えも減りもしない：デッキ・手札・トラッシュ・手元・フィールド・公開ゾーンの
// 総数は1回の handleAction をまたいで変わらない。
// **固定のベースラインとは比べない**：smoke はテスト準備で createInstance を直接フィールドへ
// 積むため総数が動く。エンジンの責任範囲は「1アクションの前後で変わらないこと」なので差分で見る。
//
// 実績：実対戦で出た deckReveal のデッキ流出（選ぶたびにデッキ上から count 枚が消えていた）は
// 手順書では防げず、この検査でしか捕まらない種類のバグ（HANDOFF §5.1）。
//
// コアは保存則が成り立たない（ボイドは無尽蔵の供給源で、出入りが正当）ため総数は見ない。
// 代わりに負値・非整数だけを弾く。
export function countCards(state: GameState): number {
    let total = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = state.players[pid]
        total +=
            p.deck.length +
            p.hand.length +
            p.trashCards.length +
            // 《継召》(exTrashReduction)で除外されたカードも盤上のカードの一部なので保存則に数える
            p.excludedCards.length +
            p.tegamoto.length +
            p.field.spirits.length +
            // スピリットの下に裏向きで置いたカード（BS19-X02）。フィールド走査の対象ではないが
            // カードとしては場に存在するので保存則には数える
            p.field.spirits.reduce((n, s) => n + (s.underCards?.length ?? 0), 0) +
            p.field.nexuses.length +
            // 合体中のブレイヴ（docs/design/BRAVE.md §2.3）。**フィールド走査の対象ではないが、
            // カードとしては場に存在する**ので保存則には数える。数え忘れると
            // 「合体するたびに1枚消えた」と誤検出される（2026-08-25 に実際に出た）
            p.field.combinedBraves.length +
            // 場に残るマジック（BS19-099 等）。フィールド走査の対象ではないがカードとしては場に存在する
            p.field.magics.length +
            // バーストエリアに伏せている1枚（2026-09-16。数え忘れると、バーストから
            // 自身を召喚する効果で「カードが1枚増えた」と誤検出される）
            (p.burst === null ? 0 : 1)
    }
    // 公開ゾーンは解決中だけ存在する一時領域。ここに滞留したぶんも数に入れる
    total += state.revealedCards?.cardIds.length ?? 0
    // 召喚の途中（【転召】の対象選択で中断中）は、召喚するカードが手札から出ていて
    // フィールドにもまだ無い。この1枚も数に入れる（RESUME_STACK.md §6 の手順どおりに
    // 「コストを支払う → 転召 → 維持コアを置く → 召喚完了」と進めるため。2026-08-20）
    total += state.summoningInstanceId !== undefined ? 1 : 0
    // 場を離れた合体スピリットから外されて、残すかの確認を待っているブレイヴ（BRAVE.md §6.3）。
    // 「コアを乗せずに分けて置いてある」状態で場のどのゾーンにも属さないので、ここで数える
    total += state.pendingBraveKeeps?.length ?? 0
    // 使用中のマジック（解決し終えるまで手札にもトラッシュにも無い。magic/inUse.ts）
    total += state.magicsInUse?.length ?? 0
    // reviveOnDestroy.revived:"handOrDeckTop" の行き先確認待ち。どのゾーンにも入れず保留している1枚（待ち行列と、いま聞いている1件）
    total += (state.pendingReviveDestinations?.length ?? 0) + (state.pendingChoice?.reviveDestination ? 1 : 0)
    return total
}
