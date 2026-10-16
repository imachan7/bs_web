// 継続効果 AuraDef（kind:"aura" の効果の種類）
import { Keyword } from "./keyword"
import { Phase, Color, FamilyFilter, AuraCounter, AuraCondition } from "../type"

// 常時BP修正の定義
export interface AuraDef {
    type: "bp"
    target: "self" | "ownAll" // 発生源自身のみ / 発生源の持ち主のスピリットすべて
    colorFilter?: Color // ownAll 用: この色のスピリットのみ
    battlingOnly?: boolean // バトル中（アタッカーまたはブロッカー）のスピリットのみ。**target:"self" でも効く**（phaseTurn と同じく target を問わない。2026-08-16 修正）
    amount?: number // 固定量（condition と併用可）
    amountPer?: number // counter × amountPer の可変量
    counter?: AuraCounter
    condition?: AuraCondition // 満たすときのみ amount を適用
    summonedByFilter?: string // ownAll 用: 召喚経路（CardInstance.summonedBy。"soryo" 等）が一致するスピリットのみ（26RBS02-077）
    summonedThisTurnOnly?: boolean // ownAll 用: 対象の summonedTurn === state.turn のスピリットのみ（このターン召喚されたスピリットに限定）
    keywordFilter?: Keyword // ownAll 用: 指定キーワード（静的付与・一時付与・keywordGrant すべて含む）を持つスピリットのみ（暴双龍ディラノス）
    keywordsFilter?: Keyword[] // ownAll 用: 指定キーワードの**いずれか**を持つスピリットのみ（keywordFilter の OR 版。1体が両方を持っていても加算は1回。BS11-081 ライトニングデリバリー＝【光芒】/【聖命】）
    phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // target問わず適用: 指定ステップかつ指定turn条件（own=発生源の持ち主がturnPlayer、opponent=持ち主が非turnPlayer、both=常に）のときのみ有効（アルマ・ジール／エメラルドに輝く鍾乳洞／アルカナプリンス・オベロ）
    minCores?: number // ownAll 用: 対象スピリットのコア数がこれ以上のときのみ有効（エメラルドに輝く鍾乳洞）
    coresExact?: number // ownAll 用: 対象スピリットのコア数がちょうどこの数のときのみ有効（BS03竜騎将ディライダロス：コア1個だけ）
    costFilter?: number // ownAll 用: 対象スピリットのコストがこれと一致するときのみ有効（太古の断層）
    costMinFilter?: number // ownAll 用: 対象スピリットのコストがこれ以上のときのみ有効（costFilter＝完全一致とは別軸。BS07造兵工房Lv2：コスト3以上）
    costMaxFilter?: number // ownAll 用: 対象スピリットのコストがこれ以下のときのみ有効（26RSD04-010：コスト5以下）
    familyFilter?: FamilyFilter // ownAll 用: 指定系統（静的付与・familyGrant による付与を含む。matchesFamilyFilter で判定）を持つスピリットのみ。配列＝いずれかの系統でOR（ポム／BS04翼持つ者の空域）
    familyAllFilter?: string[] // ownAll 用: 指定した系統をすべて持つスピリットのみ（AND。familyFilter の配列は OR）
    nameIncludesFilter?: string | string[] // ownAll 用: カード名にこの文字列を含むスピリットのみ（BS03アルカナビースト・ペイラ：カード名に「アルカナ」）。配列＝いずれかを含むOR（26系スピッツ・ドラコニー：「ノア・フルール」/「ディアナ・フルール」）
    teamFilter?: string // ownAll 用: このチーム（CardData.team）に所属するスピリットのみ（26系グリーンウェーブステージ：「【グリーンウェーブ】を持つ自分のスピリットすべて」）
    keishoFilter?: true // ownAll 用: 《継召》を持つ（カードの effects に kind:"exTrashReduction"）スピリットのみ（26RSD01-011）
    vanillaFilter?: true // ownAll 用: カードに効果の記述を持たない（バニラ）スピリットのみ（無法者の荒野）
    lentOnly?: boolean // 仮想発生源（PlayerState.turnVirtualInstances。マジックが lendSelfThisTurn で貸した場合）からのみ有効。実在するスピリット/ネクサスからは適用しない＝恒久化を防ぐ（TURN_EFFECT_SOURCES.md。パワーオーラ等）
    attackingOnly?: boolean // バトル中のアタッカーのみ（board.battle.attackerInstanceId と一致。battlingOnly と異なりブロッカーは含まない。オフェンシブオーラ／フォレストオーラ）。ownAllの走査ではあるが判定は個体ベースなのでtarget:"self"でも効く（26系ジェーン・ボゥ『アタック中』）
    blockingOnly?: boolean // ownAll 用: バトル中のブロッカーのみ（board.battle.blockerInstanceId と一致。attackingOnly の対。BS06希望の大灯台Lv2／アバランチオーラ）
    minSymbols?: number // ownAll 用: 対象スピリットのシンボル数（instanceSymbolCount）がこれ以上のときのみ有効（一角竜ヴォルスング）
    levelFilter?: number[] // ownAll 用: 対象の現在Lvがこのいずれかの間だけ
    reductionColorsAtLeast?: number // ownAll 用: 対象スピリットの**軽減シンボルの色数**（重複除く。カード静的な reduction を見る）がこれ以上のときのみ有効（BS09-003角竜人ドラケンLv2＝2色以上）
    turn?: "own" | "opponent" | "both" // target問わず適用: フェーズを問わず指定turn条件の間だけ有効（phaseTurnのphase必須版とは別軸。『自分のターン』のようにステップ不問の継続効果用。BS10-079そびえる机山群Lv1）
    combinedFilter?: true // ownAll 用: 対象スピリットが合体スピリット（instIsCombinedがtrue）のときのみ有効（BS10-097ブレイヴオーラ：合体スピリットへの追加BP）
    uncombinedFilter?: true // ownAll 用: combinedFilterのちょうど逆＝対象スピリットが合体していない（instIsCombinedがfalse）ときのみ有効（SD06-004ドス・モンキ：「自分の合体していないスピリットすべてをBP+3000する」）
    refreshedOnly?: true // ownAll 用: 回復状態（isRested=false）のスピリットのみ。疲労するとBPが外れるのが正（26系「回復状態の〜すべてをBP+」）
    braveOnly?: true // ownAll 用: 対象がブレイヴカード（card.type==="brave"）のときのみ有効。合体中のブレイヴはfield.spiritsに実体を置かない（BRAVE.md §2.4）ため、
    // ownAllの走査に来た時点で自動的に「スピリット状態のブレイヴ」を意味する（BS10-086巨星望む大樹Lv1：自分のスピリット状態のブレイヴすべて）
}
