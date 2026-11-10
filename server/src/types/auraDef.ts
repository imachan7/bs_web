// 継続効果 AuraDef（kind:"aura" の効果の種類）
import { Phase, AuraCounter, AuraCondition, ResolvedTargetFilter } from "../type"

// 常時BP修正の定義
export interface AuraDef {
    type: "bp"
    target: "self" | "ownAll" | "chosenInstance" // 発生源自身のみ / 発生源の持ち主のスピリットすべて / targetChoiceLendThisTurn で選んだ1体だけ（発生源は仮想発生源）
    filter?: ResolvedTargetFilter // 対象の絞り込み。battling／attacking／blocking／inBattle の軸は target:"self" でも効く（phaseTurn・turn と同じく target を問わない）
    amount?: number // 固定量（condition と併用可）
    amountPer?: number // counter × amountPer の可変量
    counter?: AuraCounter
    condition?: AuraCondition // 満たすときのみ amount を適用
    summonedByFilter?: string // ownAll 用: 召喚経路（CardInstance.summonedBy。"soryo" 等）が一致するスピリットのみ（26RBS02-077）
    phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // target問わず適用: 指定ステップかつ指定turn条件（own=発生源の持ち主がturnPlayer、opponent=持ち主が非turnPlayer、both=常に）のときのみ有効（アルマ・ジール／エメラルドに輝く鍾乳洞／アルカナプリンス・オベロ）
    costMaxFilter?: number // ownAll 用: 対象スピリットのコストがこれ以下のときのみ有効（26RSD04-010：コスト5以下）
    teamFilter?: string // ownAll 用: このチーム（CardData.team）に所属するスピリットのみ（26系グリーンウェーブステージ：「【グリーンウェーブ】を持つ自分のスピリットすべて」）
    keishoFilter?: true // ownAll 用: 《継召》を持つ（カードの effects に kind:"exTrashReduction"）スピリットのみ（26RSD01-011）
    lentOnly?: boolean // 仮想発生源（PlayerState.turnVirtualInstances。マジックが lendSelfThisTurn で貸した場合）からのみ有効。実在するスピリット/ネクサスからは適用しない＝恒久化を防ぐ（TURN_EFFECT_SOURCES.md。パワーオーラ等）
    reductionColorsAtLeast?: number // ownAll 用: 対象スピリットの**軽減シンボルの色数**（重複除く。カード静的な reduction を見る）がこれ以上のときのみ有効（BS09-003角竜人ドラケンLv2＝2色以上）
    turn?: "own" | "opponent" | "both" // target問わず適用: フェーズを問わず指定turn条件の間だけ有効（phaseTurnのphase必須版とは別軸。『自分のターン』のようにステップ不問の継続効果用。BS10-079そびえる机山群Lv1）
    refreshedOnly?: true // ownAll 用: 回復状態（isRested=false）のスピリットのみ。疲労するとBPが外れるのが正（26系「回復状態の〜すべてをBP+」）
}
