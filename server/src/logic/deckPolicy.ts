// 禁止・制限カードの適用ポリシー
//
// 公式（Wiki）の禁止・制限カードリストは、このプロジェクトでは**基本的に適用しない**
// （2026-08-18 ユーザー指示）。カードデータ側の `limited` / `limitCount` は
// scripts/fetch_wiki_cards.py が Wiki の「(禁止カード)」「(制限カード<1>)」表記から
// 自動で書き込む**事実の記録**なので消さない。適用するかどうかはここ1か所で決める。
//
// ここに載っていないカードは、データが禁止・制限を持っていても通常どおり同名3枚まで入る。
import type { CardData } from "../type"

// 禁止カードとして実際に適用する cardId
const BANNED_CARD_IDS = new Set<string>([
    "BS02-063", // 冥犬ケルル・ベロス
])

// 制限カードとして実際に適用する cardId → 同名の最大投入枚数
// 現在は1枚も適用していない（侵されざる聖域・侵食されゆく尖塔・海底に眠りし古代都市・
// 翼神機グラン・ウォーデンの4枚は、データ上 limitCount:1 だが3枚まで入る）
const RESTRICTED_LIMITS: Record<string, number> = {}

// カードデータの limited / limitCount を、上のポリシーに沿って上書きしたコピーを返す。
// ALL_CARDS を組む時点で通すので、デッキ検証（validateDeckCards）も
// クライアントへ配る GET /api/cards も同じ値を見る（＝UIの禁止マークもここで決まる）
export function applyDeckPolicy(card: CardData): CardData {
    const limited = BANNED_CARD_IDS.has(card.cardId)
    const limitCount = RESTRICTED_LIMITS[card.cardId]
    if (limited === card.limited && limitCount === card.limitCount) return card
    const applied: CardData = { ...card, limited }
    if (limitCount !== undefined) applied.limitCount = limitCount
    else delete applied.limitCount
    return applied
}
