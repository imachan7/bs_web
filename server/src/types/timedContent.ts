// 期間つき効果の中身 TimedContent（timedEffects に積む記録の種類）
import type { EffectAction } from "./effectAction"
import { TargetFilter } from "./targetFilter"
import { EffectCounter } from "./effectCounter"
import { Keyword } from "./keyword"
import { Color, CardType, ResolvedTargetFilter, TriggerEvent, PlayerRuleDef, ImmuneSource } from "../type"

// 期間つき継続効果（timedEffect）の内容。bp の amountCounter は、全体ルールでは計算のたびに数え直す（ダークパワーの Q&A）。
// countOnce は「〜した回数」のように再計算すると意味が変わるカウンタ（lastFunsaiSpirits 等）用：解決時に固定する（旧 selfBuff と同じ）
export type TimedContent =
    | { type: "cantAttack" }
    | { type: "mustAttack" } // 可能ならば必ずアタックする（期間は turn のみ）
    | { type: "canBlockWhileRested" } // 疲労状態でもブロックできる（期間は turn のみ。1体は自分のスピリットから選ぶ）
    | { type: "mustBlock" } // 可能ならばブロックしなければならない（期間は battle。その個体でブロックできるなら、ライフで受ける・ほかの個体でブロックは検証で拒否する。26RSD03-007）
    | { type: "grantTrigger"; trigger: TriggerEvent; action: EffectAction; battleRole?: "attacker" | "blocker"; targetFilter?: TargetFilter } // 誘発効果を与える（期間は turn、または自分1体に限り battle。1体は自分のスピリットから選ぶ）。targetFilter＝イベントの相手役（onBlocked ならブロッカー）が合うときだけ発火
    | { type: "suppressTrigger"; trigger: TriggerEvent } // そのスピリット自身の指定トリガーの効果が発揮されない（期間は turn のみ。onAttack は『合体アタック時』も含む）
    | { type: "cantBlock" }
    | { type: "bp"; amount: number; amountCounter?: EffectCounter; countOnce?: true }
    | { type: "keyword"; keyword: Keyword; colors?: Color[] } // colors＝【装甲】の色
    | { type: "playerRule"; rule: PlayerRuleDef } // プレイヤーに掛かる「このターンの間」の制約。効くプレイヤーは timedEffect の side
    | { type: "unblockable"; from?: ResolvedTargetFilter; fromMaxBpSelf?: true } // 相手のスピリットにブロックされない。from に合う相手からだけ（省くとどの相手からも）。条件つきでも「ブロックされない効果を持つ」に数える（2026-09-25 ユーザー決定）。fromMaxBpSelf＝置く時点の self の実効BP以下の相手からだけ（値は置く時点で固定。26RBS02-X11「そのBP以下の相手のスピリットから」）
    | { type: "battleLock"; lock: "flash" | "burst" | "magic" } // マジック追加＝使用不可（バースト発動は含まない。Q22399）
    | { type: "compareBy"; by: "level" | "cores" | "cost" } // このバトルの解決で BP の代わりに比べるもの（期間は battle のみ。複数重なったら level→cores→cost の順で優先）
    | { type: "restedNexusEffectsDisabled" } // 疲労状態のネクサスすべて（両陣営）の効果が発揮されない（期間は battle のみ、target.kind:"battle"）。ネクサスの疲労は元から効果を止めないので、止める側を内容として持つ
    | { type: "noBpCompareDestroy" } // BP比べでは破壊されない（期間は battle。バトルは成立し、相手側の破壊判定は通常どおり。26RBS03-036）
    | { type: "invertBattleWinner" } // このバトルの解決で値が高い方が破壊される（期間は battle のみ。装甲では防げない）
    | { type: "symbolAdd"; color?: Color; count?: number } // 持っているシンボルと同じ色のシンボルを1つ追加する。color 指定時は、その色を count 個（既定1）追加する（自分のスピリット1体を filter で選ぶ。26RBS03-X08）
    | { type: "symbolSet"; color?: Color; count: number } // シンボルを◯色◯つとして扱う。color 省略時は対象が元々持つシンボルの1色目（kind:"symbolFix" と同じ読み）
    | { type: "symbolLoss"; color?: Color } // 指定した色のシンボルを1つ失う。color を省くと使う人が色を選ぶ
    | { type: "cost"; amount: number } // コストを増減する（元のコストは残らない）
    | { type: "triggerSwap"; from: "onAttack" | "onBlock" } // from の効果を、もう片方（アタック時⇔ブロック時）に発揮する（元のタイミングでは発揮しない）
    | { type: "color"; color?: Color } // color を省くと使う人が色を選ぶ（対象を選ぶ→色を選ぶ、の2段階）
    | { type: "level"; set?: number; up?: number; max?: true; requireLevelExists?: true }
    | { type: "bpAs"; levels: number[]; amount: number } // Lv◯BP を amount として扱う（ブレイヴの合体時BP+ は含めて置き換わり、BP+ は上に乗る。RULES_BATSPI_WIKI §5.1）
    | { type: "countAs"; count: number; sourceTypes?: CardType[] } // 記録を出した側の効果で数えるとき count 体分として数える。sourceTypes＝数える側の発生源の種別の限定
    | { type: "immune"; against?: ImmuneSource[] } // 相手のカードの効果を受けない（範囲効果も含む）。against 指定時はその種類の効果だけ
    | { type: "untargetableByOpponentMagic" } // 相手のマジックの効果では指定されない（constraint 同名の期間つき版。範囲効果は届く。26RBS01-119）
    | { type: "lifeCap"; max: number } // このスピリットがこのターンに記録を出した側のライフを減らせるのは合計maxまで（アタック・効果の両方。lifeDealtThisTurn で判定。2026-10-11 ユーザー確認：26RBS03-079）
    | { type: "noLifeDamage" } // このスピリットのアタックでは、記録を出した側のライフが減らない
    | { type: "colorless" } // 色とシンボルを無いものとして扱う
    | { type: "destroyedCoresTo"; to: "void" | "trash" } // このプレイヤーのスピリットが破壊されたとき、コアをリザーブではなく to に置く（void＝ゲームから取り除く。【装甲】では防げない＝RULES_BATSPI_WIKI §6）
    | { type: "skipRefresh" } // 次のリフレッシュステップで回復しない（寿命 nextRefresh）
    | { type: "trashCoreReturnCap"; max: number } // 次のリフレッシュステップで、トラッシュのコアを max 個までしかリザーブに戻せない（寿命 nextRefresh。重なったら小さい方）
    | { type: "blockCost"; cost: "reserveCoreToTrash" | "discardMagic"; count: number }
    | { type: "blockerCoresProtected" } // このバトルのブロッカー上のコアは効果で取り除けない（target.kind:"battle"。アタック時にはまだブロッカーが決まっていないため）
    | { type: "refreshWhenBlockedBy"; color: Color }
