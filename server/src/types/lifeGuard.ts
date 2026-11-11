// ライフを減らす処理への制限。GlobalConstraintDef（場にいる発生源）と PlayerRuleDef（timedEffect の playerRule）の両方に
// type:"lifeGuard" で入る。判定は shared/rules/lifeGuard.ts
import type { CardType, ResolvedTargetFilter } from "../type"

// 軸はすべて AND。「A または B」は lifeGuard を2つ並べて書く（1つにすると AND になる）。
// 0にならない（floor:1）と減らない（max:0）、1回の上限と1体ごとの累計は別物なので値の形で分けてある
export type LifeGuardDef = {
    type: "lifeGuard"
    side?: "own" | "opponent" // globalConstraint のときだけ読む。発生源の持ち主から見て守られる側（省略＝両陣営）。playerRule は積まれた側が守られる
    from?: "attack" | "effect" // 止める原因（省略＝アタック・効果・コスト支払いすべて）。effect はコスト支払いを含まない
    source?: ResolvedTargetFilter // ライフを減らすスピリット（アタッカー、または効果の発生源のスピリット）の絞り込み。発生源がスピリットでない減少には当たらない
    byOpponentOnly?: true // 減らす側が守られる側の相手のときだけ
    effectSource?: { sourceTypes?: CardType[] } // from:"effect" のとき、効果の発生源のカード種別
    max?: number // 減らせる量の上限。0＝減らない
    per?: "attack" | "spirit" // max の数え方。attack（既定）＝1回の減少ごと。spirit＝減らすスピリット1体のそのターンの累計（CardInstance.lifeDealtThisTurn）
    total?: true // max を、記録してから（期間つき効果として積まれてから）の合計の上限にする。playerRule だけで意味を持つ（2026-11-11 ユーザー確認：SD01-039）
    used?: number // total のとき、記録に持つ消費量。ターン終了で記録ごと消える
    floor?: number // この値を下回らない（0にならない＝1）
}
