// 効果まわりの2つの巨大な型は `types/` に切り出してある（2026-09-12）。
// ここから re-export しているので、利用側の import 文は変更不要。
export * from "./types/effectAction"
export * from "./types/effectDef"
export * from "./types/choice"
// re-export は利用側に届くが、このファイル自身のスコープには入らないので明示的に読む
import type { EffectDef } from "./types/effectDef"
import type { PendingChoice } from "./types/choice"
import { TargetFilter } from "./types/targetFilter"
import { CardInstance } from "./types/cardInstance"
import { Keyword } from "./types/keyword"
import { TimedContent } from "./types/timedContent"
export type { AuraCounter } from "./types/auraCounter"
export type { AuraCondition } from "./types/auraCondition"
export type { PlayerState } from "./types/playerState"
export type { TimedContent } from "./types/timedContent"
export type { AuraDef } from "./types/auraDef"
export type { Keyword } from "./types/keyword"
export type { GameAction } from "./types/gameAction"
export type { EffectCounter } from "./types/effectCounter"
export type { FieldEvent } from "./types/fieldEvent"
export type { ConstraintDef } from "./types/constraintDef"
export type { CardInstance } from "./types/cardInstance"
export type { GameState } from "./types/gameState"
export type { GlobalConstraintDef } from "./types/globalConstraint"
export type { TargetFilter } from "./types/targetFilter"

// プレイヤーIDやステップ名を厳格に定義（タイポを防ぎます）
// サーバー・クライアント両方から参照する共有型定義
export type PlayerId = "p1" | "p2"
export type Phase =
    | "start"
    | "core"
    | "draw"
    | "refresh"
    | "main"
    | "attack"
    | "end"

export type Color = "red" | "purple" | "green" | "white" | "yellow" | "blue"
// ブレイヴは「カードタイプ」。単体で場に出すとスピリットとして扱われ、
// 合体すると合体元と合わせて**1体のスピリット**になる（docs/design/BRAVE.md §1.1）
export type CardType = "spirit" | "nexus" | "magic" | "brave"

// **効果の発生源の種別は CardType をそのまま流す**（sourceType / srcType）。
// ⚠️ ブレイヴを "spirit" に丸めないこと（2026-08-25 ユーザー確認。docs/design/BRAVE.md §12）。
// 【装甲：色】の効果文は「相手の**スピリット/ネクサス/マジック**の効果を受けない」でブレイヴを列挙していないため、
// **ブレイヴ自身の効果（単体で場に出たブレイヴの召喚時など）は装甲では防げない**（防げるのは【重装甲】だけ）。
// 丸めると装甲が過剰に効く。一方、合体中にブレイヴがホストへ付与している効果の発生源は
// **合体スピリット＝スピリット**なので、そちらは装甲で防げる

// デッキの指定方法: DECK_RECIPES の色キー（"red" 等）またはカスタムデッキのカードリスト（cardId -> 枚数）
export type DeckSpec = string | Record<string, number>

// スピリット/ネクサスのレベル定義（ネクサスは bp: 0）
export interface LevelDef {
    level: number
    cores: number
    bp: number
    soulCoreRequired?: true // 26系《真界放》。このLvは印刷コア数での維持に加えて[ソウルコア]1個のみでも維持できる（2026-10-07 ユーザー裁定。wikiの『<3>Lv2/真界放』表記。キャッシュ全セットでLv2のみ）。このLvに現在いる個体は「真界放状態」として参照される（コアの内訳は問わない。shared/rules/level.ts の instInShinkaihoState）
}

// ブレイヴの合体条件（docs/design/BRAVE.md §2.2）。読点区切りの複数条件は配列＝OR。
// TargetFilter と軸が似ているが「対象は合体先スピリット1体」で意味が違うため共用しない
export interface BraveConditionTerm {
    family?: string // 系統
    minCost?: number // コスト◯以上（BS10 の18枚中12枚）
    cardName?: string // カード名指定
    vanilla?: true // **効果の記述を持たない**（BS10 の18枚中6枚。判定は instIsVanilla＝継続付与の「バニラとしても扱う」も見る）
    keyword?: Keyword // このキーワードを持つ（spiritHasKeywordで判定＝一時付与・継続付与も見る。BS15-057カメン・フクロウ：「コスト4以上/【暴風】を持つ」の後半）
}
export type BraveCondition = BraveConditionTerm | BraveConditionTerm[]

// コスト支払い時に使うコアの割り当て（自分のスピリット上またはネクサス上のコア）
export interface PaySource {
    instanceId: string
    count: number
    // この個体の上の[ソウルコア]を支払い1個ぶんとして含める（コスト→トラッシュ。2026-10-06実装）。
    // docs/design/SOULCORE.md 部品3
    includeSoulCore?: boolean
    // この個体の上の[ソウルコア]を**コストでなく維持コア（置くコア）として**使う（2026-10-06 ユーザー確認）。
    // 召喚/配置のpaySources限定。[ソウルコア]は支払い元の個体から新しい個体の上へ移る。
    // includeSoulCore との同時指定は不可
    soulCoreToMaintain?: true
}

// ---- 効果データ層（data.md 5.2） ----

// 系統フィルタ：単一文字列 or 配列（配列＝いずれかの系統を持てばよいOR条件）。
// bpBuffAll/bpBuff.familyFilter が使う。判定は EffectModules.matchesFamilyFilter に集約する
// （BS04エンジン拡張バッチ1。aura.familyFilter・AuraCounter{ownFamily}・keywordGrant.familyFilter は
// public/src/renderer.ts に同型の client-side ミラーがあり、そちらの型も連動改修が要るため今回は見送り。
// 対象カード（BS04-029/097）はbpBuffAll/bpBuffのみで表現できるため実害なし）
export type FamilyFilter = string | string[]

// normalizeFilter() が self 相対のBP指定（"selfBp"）を数値へ解決した後の形。
// matchesTarget はこちらだけを見るため、インスタンス単位の純粋な述語でいられる
export interface ResolvedTargetFilter extends Omit<TargetFilter, "maxBp" | "minBp" | "exactBp"> {
    maxBp?: number
    minBp?: number
    exactBp?: number
    colorAny?: Color[] // sameIceWallColorAs の解決先。いずれかの色を持てば一致（OR。colorが単色専用なのに対しこちらは複数色）
    instanceIn?: string[] // bofuExhausted/damagedOwnLife の解決先（内部専用）。指定時はinstanceIdがこの配列に含まれるものだけ一致
}

 // self の【暴風】の指定数（ブレイヴ合流・ボーナスは見ない）

// 誘発イベント（data.md 5.1 のイベント層）。
// ルール追加時はまず既存イベントで表現できるか検討する。
export type TriggerEvent =
    | "onSummon" // 召喚時（スピリット/ブレイヴの『このスピリットの召喚時』。**ネクサスの『配置時』は含まない**＝onDeploy）
    | "onDeploy" // 『このネクサスの配置時』。onSummon とは**別のカテゴリ**なので分けてある（SEMANTICS_AUDIT.md §3.17。BS10-096 最後の優勝旗／BS12-063 旅団の摩天楼）
    | "onAttack" // アタック時
    | "onDestroy" // 破壊時
    | "onBattleWin" // BPを比べ相手のスピリットだけを破壊したとき（勝利時）。『バトル時』という表記のカードでも、効果文に『BPを比べ〜破壊したとき』が付いているものはこちら
    | "onBattleStart" // バトルが成立した時点（アタック宣言時またはブロック宣言時）で発火。勝敗を問わない「このスピリットのバトル時」はこちら
    | "onBattleLose" // BP比較で相手のスピリットに破壊されたとき（敗北時）。相打ちでは発火しない
    | "onBlock" // ブロック時
    | "onBlocked" // アタック中の自分スピリットが相手のブロック宣言を受けたとき（self=アタッカー）
    | "onBattleEnd" // バトル終了時（GameEngine.resolveBattleの最後。バトル参加者のうちまだ生存している個体に発火。コリスタル）
    | "onLifeDealt" // このスピリットのアタックによって相手のライフを減らしたとき（アタッカー側で発火。老賢樹トレントン）
    | "onLifeReduced" // このスピリットが相手のライフを減らしたとき（アタックでも、このスピリットの効果でも。onLifeDealt の効果版を含む。与える誘発「それが相手のライフを減らした時」用）
    | "onRefreshed" // このスピリットが回復したとき（疲労状態から回復状態になった瞬間。リフレッシュステップ・効果による回復のいずれからも発火。BS07神凰兵フェニックス・ゴレム）
    | "onTenshoTarget" // このスピリットが【転召】の対象（生贄）になったとき（dumpAllCoresTenshoの唯一の解決点から発火。tenshoCoreSubstituteで疲労を選んだ場合も含め必ず発火する。BS08天使オリフィア）

 // 自分のスピリットがキーワードラベルを持つ起動効果（kind:"activated"+effect.keyword）を
    // **解決したとき**（doActivateAbility のコスト支払い・効果解決が済んだ後から発火。不発・選択待ちに入った
    // 場合は発火しない。eventInfo.keyword に発揮されたキーワードを載せる。26系【増幅】の「発揮した時」参照用）
// ※ 疲労イベントは EffectModules.exhaustSpirit（疲労の唯一の入口）から発火する。アタック宣言・ブロック宣言・
//    効果による疲労のいずれも通る。すでに疲労している個体を疲労させ直しても発火しない

 // レベルアップ：26系。誘発効果（triggered の onAttack/onBlock）の keyword ラベル専用。
    // 挙動はレコード本体が持つ（このターン最初のアタック/ブロックなら、このバトル中Lv2として扱う）
// ※ 暴風と同じく、seimei / kyoshu / hyoheki も**キーワードエントリ自体は宣言**で、挙動は対になる
//    エントリが持つ（seimei/kyoshu は triggered の onLifeDealt / onAttack、
//    hyoheki は kind:"magicNegate"（cost:{exhaustSelf:true}＋colors＋turn:"opponent"））。宣言があることで
//    「【聖命】を持つ自分のスピリットすべて」のようなキーワード指定の絞り込みが効く
// ⚠️ **上のコメントに書いた挙動が、そのままエンジンに実装されているとは限らない。** kobo / funsai / jugeki 等は
//    エンジンが keyword エントリを直接読んで動く（例: EffectModules.ts が e.keyword === "kobo" を見る）が、
//    宣言だけの4つ（bofu / seimei / kyoshu / hyoheki）は**対になるエントリを書かないと何も起きない**。
//    キーワード持ちを実装するときは、まず `grep -rn '"<キーワード>"' server/src/logic` でエンジン側の実装を確認し、
//    無ければ既存の同キーワード持ちカードのデータを1枚見て、その2件セットの書式を踏襲すること
//    （2026-08-27、BS10-047 で「【聖命】は宣言1件でよい」と誤って指示した。既存9枚は例外なく onLifeDealt を持っていた）

 // 相手フィールドのコスト条件を満たすスピリット数（EffectCounterの同名軸と同じ判定）

 // 自分の指定色のネクサスがcount個以上ある間（効果条件 count.ownNexusColor と同じ数え方。26RBS01-085）

// クライアント演出用のゲームイベント（アクション単位の一時データ）。
// GameEngine.handleAction の冒頭で state.events をクリアし、1アクションで発生した分だけを
// クライアントへ配信する。seq は state.eventSeq の通し番号（クリアしてもリセットしない）で、
// クライアントは前回処理済みの seq より大きいものだけをアニメーション再生する。
export type GameEvent =
    | { seq: number; type: "summon"; pid: PlayerId; cardName: string } // 召喚（神速召喚含む）
    | { seq: number; type: "destroy"; pid: PlayerId; cardName: string; vanish?: true } // 破壊。vanish は消滅（維持コア割れ）
    | { seq: number; type: "draw"; pid: PlayerId; count: number } // ドロー
    | { seq: number; type: "lifeDamage"; pid: PlayerId; amount: number } // ライフのコアが減った（このpidが被弾した側）
    | { seq: number; type: "magic"; pid: PlayerId; cardName: string } // マジック使用
    | { seq: number; type: "burst"; pid: PlayerId; cardName: string }
    // バウンス／デッキ戻し。
    // pid は**カードの持ち主**（＝戻された側）。sourceName は戻した効果の発生源カード名（分かる場合のみ）
    | { seq: number; type: "returnToHand"; pid: PlayerId; cardName: string; sourceName?: string } // フィールドから手札へ戻った（スピリット／ネクサス）
    | { seq: number; type: "returnToDeck"; pid: PlayerId; cardName: string; position: "top" | "bottom"; sourceName?: string } // フィールドからデッキへ戻った

// ブロック可否などの制約定義（RuleValidator が参照する宣言的ルール）
// **エンドステップを数える封印**（BS10-108 ルナティックシール）。
// 「『自分のエンドステップ』を3回行うまで、お互い、アタックステップは行えず、デッキは破棄されず、
// ボイド/リザーブからライフにコアを置けない」。
//
// カードは「ボイドからコア3個をデッキの横に置き、『自分のエンドステップ』に1個ずつボイドに置く」と書くが、
// **置かれたコアは以後どこからも参照されない**ため、実体のコアではなく**カウンターとして持つ**
// （2026-08-25 ユーザー確認）。remaining がそのままデッキの横のコア数で、画面にもこれを出す。
export interface EndStepLock {
    pid: PlayerId // 発揮した側。**このプレイヤーのエンドステップ**で remaining が1減る
    remaining: number // 残り回数（＝デッキの横のコア数）。0 になったら解ける
    cardId: string // 表示用。どのカードによる封印か
    locks: ("attackStep" | "deckMill" | "lifeChargeFromVoidOrReserve" | "summonTrigger")[] // 何を止めるか。**両陣営に効く**
}

 // このスピリットは疲労状態でもブロックできる（shared/block.canBlockが判定）。targetMaxCost指定時はアタッカーのコストがこれ以下のときのみ（BS06計画された場外乱闘Lv1-2：コスト1以下）。targetKeywordExclude指定時はアタッカーがそのキーワードを持たないときのみ（spiritHasKeyword判定＝一時付与も見る。BS08一角魚モノケロック：【転召】を持たない相手のスピリット）。
    // 器AL：targetMaxBp指定時はアタッカーの実効BPがこれ以下のときのみ（BS13-029剣馬グラニムLv1-3＝BP6000以下）。targetCombinedOnly指定時はアタッカーが合体スピリット（instIsCombined）のときのみ（BS13-029Lv2-3）

 // 器BV：両陣営それぞれ独立に判定する：アタックしようとしているスピリットの持ち主のフィールドのスピリット数がatMost体以下のときはアタックできない（自分が3体以下なら自分だけアタック不可、相手が3体以下でも自分には効かない＝attackerPid基準の独立判定。1エントリで両陣営を見る。BS13-071巨人港）

// 破壊の発生源コンテキスト（省略可）。復活系効果（reviveOnDestroy）が参照する。
export interface DestroyContext {
    sourcePid?: PlayerId // 破壊を引き起こした効果の持ち主（相手の効果による破壊か判定する）
    sourceType?: CardType
    suppressOnDestroy?: true
    sourceColors?: Color[] // 破壊を引き起こした効果の発生源の色（「相手の**赤の**スピリット/マジックの効果では破壊されない」の判定用。SD01-032 機械神の加護）
    sourceCardId?: string // 破壊を引き起こした効果の発生源のカードID（マジックは self が無いので cardId で系統を引く。26RBS01-105）
    sourceInstanceId?: string // 破壊を引き起こした効果の発生源インスタンスID。
    // fieldEvent.byOpponentSpiritEffectOnly が「その効果を発揮したスピリット」を対象にするために使う（BS10-012アントイーター/BS10-014闇騎士マリス）
    battle?: { attackerColors: Color[]; attackerLevel?: number; attackerBp?: number } // バトルによる破壊のときの「破壊した側（勝者）」の色・レベル・実効BP（装甲・reviveOnDestroy判定用。呼び出し側の命名は歴史的にattacker*だが、実際は勝者側の値を渡す）
}

// 効果定義（kind による判別ユニオン）。
// levels は発動するレベルの配列（null = レベル不問）。
export interface CardData {
    cardId: string
    name: string
    type: CardType
    colors: Color[] // カードの色（単色なら要素1。多色は表記順。BS05-X19 聖皇ジークフリーデン＝["red","white"]）
    cost: number
    reduction: Color[] // 軽減シンボル（色の配列。長さ=軽減数。多色カードは混色になる）
    family: string[] // 系統（日本語のまま）
    team?: string[] // 所属チーム（26系。【チーム：レッドステラ/シャイニーハーツ】＝2要素。effect文言から抽出した
    // カード静的な値で、ゾーンを問わず参照できる。付与系チームは現プールに無く未対応）
    levels: LevelDef[] // magic は空配列
    symbol: Color[] // magic は空配列
    symbolEx?: boolean // EXシンボル持ちか（wiki の「シンボル：EX赤」等の表記由来）
    flash: boolean // magic のみ: フラッシュタイミングで使用可能か
    rarity: string // C/U/R/M/X など（表示用）
    limited: boolean // 禁止カードか
    limitCount?: number // 制限カード（同名の最大投入数。3枚未満に制限する場合のみ指定。省略時は通常の3枚まで）
    effect: string // 表示用テキスト（原文）
    effects: EffectDef[] // 構造化された効果（未対応の効果は含まれない）
    // ---- type === "brave" のときだけ持つ（docs/design/BRAVE.md §2.2）----
    braveLevels?: LevelDef[] // 合体状態のレベル表。bp は「合体時BP+」の加算値、cores は**合体スピリット上の**コア数で判定する。
    // Lv1 の cores は 0（合体中のブレイヴはコアを持たないため。これで currentLevel が Lv0 に落ちない）
    braveCondition?: BraveCondition // 合体条件（満たすスピリットにのみ合体できる）
}

// ソウルコアの居場所（docs/design/SOULCORE.md）。**コアの数値（reserve/trashCores/inst.cores）には含めない**
// （案A-outside・2026-10-05 ユーザー確定）。通常のコア操作では絶対に動かず、
// ソウルコアを明示的に動かす操作・支払いだけがこのポインタを書き換える。
// ライフ（《封印》）と除外（【ソウルドライブ】）は26系v1では型だけ用意しない
// null＝この対戦でソウルコアなし（旧プール互換・テスト用）。案B-inside: 数値（reserve/trashCores/cores）には[ソウルコア]が含まれ、ポインタは「どのコアが[ソウルコア]か」を示す（2026-10-06 ユーザー確定）
export type SoulCoreLocation =
    | { zone: "reserve" }
    | { zone: "trash" }
    | { zone: "instance"; instanceId: string } // スピリット/ネクサスの上。どの個体かはinstanceIdで特定（2026-10-05 ユーザー確認）

// バトル（アタック〜解決まで）の状態
export interface BattleState {
    attackerInstanceId: string
    blockerInstanceId: string | null // **実際にバトルするブロッカー**。複数体ブロック（blockRequiresCount）でも1体しか入らない
    pendingBlockerIds?: string[] // 複数体ブロックで、必要数がそろうまで宣言を貯める場所（そろったら空にする）
    extraBlockerIds?: string[] // 複数体ブロックで宣言はしたが**バトルはしない**ブロッカー。
    // 効果文が「どれか1体とだけバトルする」なので、BP比較・破壊・バトル終了の処理は blockerInstanceId だけを見る
    // （既存の処理に手を入れずに済ませるための形。BS10-X03巨蟹武神キャンサード）
    directed: boolean // 指定アタックか（canDirectAttack。通常アタックは false）
    directedTargetInstanceId?: string // 指定アタックで指定された相手スピリット。**アタック宣言の時点ではまだブロックは確定しない**（アタック時効果と【バースト】をすべて解決した後に確定する。2026-09-06 ユーザー確認）。GameEngine.doPass がフラッシュ①を閉じる時点で finishBlockDeclaration へ渡し、正規のブロック宣言として成立させる（疲労状態でも成立する＝『ブロック時』効果は発揮する）。指定先が場を離れた／耐性を得た／アタッカーが効果を失った場合は何もせず、通常のアタックに戻る
    skipBpCompare?: true // 器AV：バトル解決時にBP比較（とその結果の破壊）自体を飛ばす。outcomeが"none"になり、勝敗判定・onBattleWin/onBattleLose・fireBattleWonTriggersは発火しない。【呪撃】・endBattleDestroy等のBP比較に依らない処理はそのまま動く（BS13-082ペガサスフラップ）
    usedMagicCardIds?: { p1: string[]; p2: string[] } // このバトル中に使用されたマジックのcardId（光芒用）
    treatAsUnblocked?: ("always" | "blockerLevel1" | "levelAtLeastBlocker")[] // バトルの解決で条件を満たせば、BPを比べずブロックされなかったものとして扱う（action treatAsUnblocked）
    // oncePerBattle 指定の magicFreeGrant / magicRepeatGrant を、このバトルで既に使い切った発生源のinstanceId
    // （BS07大天使イスフィール＝無償で使えるのは「1枚」だけ）。**無償化と再発揮で別リストに分ける**のは
    // 消費点が違うため: 無償化は resolveMagic の冒頭（コスト判定はその手前で済んでいる）、
    // 再発揮は resolveMagicEffects が repeat を確定させる時点。1つのリストにすると、
    // 1枚目の無償化を記録した時点で同じ1枚目の再発揮まで消えてしまう
    oncePerBattleMagicFreeUsed?: string[]
    oncePerBattleMagicRepeatUsed?: string[]
    // 「バトル終了後に破壊する」の予約（action:"destroyBlockerAfterBattle"）。
    // ＞７（【呪撃】の直後）に、まだ場にいる対象を通常の destroy 経路で破壊する。
    // 発生源が場を離れていても予約は消えない（発揮はコストを払った時点で成立している）ため、
    // 装甲・効果耐性の判定に要る色と種別を予約時の値で持ち回る（BS01-104 千本槍の古戦場Lv2）
    endBattleDestroy?: {
        targetInstanceId: string
        sourceInstanceId: string
        sourcePid: PlayerId
        sourceColors: Color[]
    }[]
    lifeDamagers?: string[] // このバトルで相手のライフを減らしたスピリットのinstanceId（アタックで減らすたびに積む）。
    // event:"ownLifeDamaged"のバースト発動時、GameState.burstEventLifeDamagerIdへ引き継ぐ材料（BS16バッチ0：080用の器）
}


 // この色のスピリットにブロックされたとき回復する（ブロック宣言の処理の中で回復させる。誘発効果にはしていない） // このスピリットをブロックするには、ブロックする側が cost を count 回払う（払えなければブロックできない） // set＝Lv◯として扱う／up＝いまの Lv から上げる（最大Lvで止める）／max＝各カードの最高Lv

// 期間つき効果の記録（docs/design/TIMED_EFFECTS.md）。追加順に意味がある（後から掛けた方が勝つもの）
export type TimedRecord = {
    content: TimedContent[]
    target:
        | { kind: "instance"; instanceId: string }
        | { kind: "rule"; pid?: PlayerId; filter: ResolvedTargetFilter; selfInstanceId?: string } // 判定のたびに照合＝後から出たスピリットにも効く
        | { kind: "player"; pid: PlayerId } // プレイヤーに掛かるもの（そのプレイヤーの誘発すべてを止める、など）
        | { kind: "battle" } // このバトルの解決方法（比べるもの・勝敗の逆転）。until は "battle"
        | { kind: "braveHost"; braveInstanceId: string } // そのブレイヴがいま合体しているホスト。読むたびに引き直す（分離したら誰にも当たらない）
    until: "turn" | "battle" | "attack" | "nextRefresh" | "step" | "firstAttack" // step＝いまのステップの終わりで消える（PhaseManager.endStepScoped）。attack＝対象の個体がアタックしたバトルの終了かターン終了の早い方で消える（「ターンに1回」）。nextRefresh＝ターン終了では消えず、対象のプレイヤー（個体なら持ち主）の次のリフレッシュステップで使って消える
    ownerPid: PlayerId
}

// プレイヤーに掛かる「このターンの間」の制約（期間つき効果の一覧に target.kind:"player" で記録する。効くプレイヤーは timedEffect の side）
export type PlayerRuleDef =
    | { type: "cantUseHandCardsForPid"; allowedColor?: Color; bannedColors?: Color[] | "last"; cardType?: CardType } // 手札のカードを使えない（召喚・配置・マジック）。allowedColor＝その色だけ使える、bannedColors＝その色だけ使えない（配列）、cardType＝その種別だけ使えない。"last"は置く時点で直前に動いたカードの色の和集合に解決する（timedEffect.ts）
    | { type: "armorDisabledForPid" } // スピリットの【装甲】が働かない（持っている分もこのターンに得た分も。2026-08-16 ユーザー判断）
    | { type: "freeFushiSummonForPid" } // このターン最初の【不死】召喚だけコストが0（維持コアは要る）。使ったら記録を消す
    | { type: "lifeDamageMaxForPid"; max: number } // ライフは1回のアタックで max 個までしか減らない
    | { type: "lifeFloorForPid"; floor: number; byAttackMinCost?: number; byEffectSourceTypes?: CardType[] } // ライフは floor を下回らない。byAttackMinCost＝そのコスト以上のスピリットのアタックでだけ、byEffectSourceTypes＝その種別の効果でだけ（指定すればOR）
    | { type: "lifeImmuneForPid" } // ライフはあらゆる原因（アタック・効果）で減らない
    | { type: "bounceToDeckTopForPid" } // このプレイヤーの効果で手札に戻すスピリットは、手札の代わりにデッキの上へ
    | { type: "nexusEffectsDisabledForPid" } // ネクサスすべての効果が発揮されない
    | { type: "noLifeDamageByCostForPid"; maxCost?: number; symbolCount?: number; combinedOnly?: true; cores?: number } // maxCost 以下のスピリット（symbolCount 指定時はシンボル数ちょうど、combinedOnly なら合体スピリット、cores 指定時は載っているコアがちょうどその数のスピリット。26RSD02-013）のアタックではライフが減らない
    | { type: "handReductionColorAsForPid"; color: Color; cardType: CardType } // 手札にある cardType のカードすべての軽減シンボルを color 一色として扱う（件数は変えない）
    | { type: "noDeckMillByOpponentForPid" } // デッキは相手の効果では破棄されない
    | { type: "noDeckMillForPid" } // デッキは自分の効果も含めて破棄されない
    | { type: "noBurstSpiritSummonForPid" } // バースト効果でスピリットを召喚できない（バーストの発動自体は止めない。ブレイヴは対象外）
    | { type: "ignoreUnblockableForPid" } // このプレイヤーのスピリットは「ブロックされない」効果を持つスピリットもブロックできる
    | { type: "trashCardAsEx"; cardId: string; color: Color } // トラッシュにある cardId の1枚のシンボル1つを color のEXシンボルとして扱う（寿命 step。《継召》の除外候補になる。26RBS03-X04）


// ---- クライアントへ送る公開ビュー（相手の手札・デッキ内容は隠す） ----

export interface PlayerView {
    id: PlayerId
    name: string
    life: number
    reserve: number
    trashCores: number
    deckSideCores: number // デッキの横に置かれたコア（BS12-078）。公開情報なので両者分を配信する
    deckCount: number
    hand: string[] | null // 自分のみ。相手は null
    handCount: number
    trashCards: string[]
    excludedCards: string[] // 除外ゾーン（ゲーム外）。公開情報のため自分/相手ともに配信する
    tegamoto: string[] // 公開ゾーンのため自分/相手とも常に配信する
    field: {
        spirits: CardInstance[]
        nexuses: CardInstance[]
        combinedBraves: CardInstance[] // 公開情報のため自分/相手とも常に配信する（合体表示に要る）
    }
    tempHandKeywordGrants?: { cardId: string; keyword: Keyword }[] // 自分のみ。相手は常に省略（手札内容に紐づくため）
    payToNegate?: boolean // 自分のみ。「手札を破棄して効果を受けない」を払う方針か（UIのトグル表示用。未指定は true 扱い）
    peekedOpponentCardIds?: string[] // 自分のみ。相手の手札で内容を見たカード（BS09-039探偵ペンタン）。相手には常に省略する
    turnVirtualInstances: CardInstance[] // 公開情報のため自分/相手とも常に配信する（TURN_EFFECT_SOURCES.md §2.1）
    battleVirtualInstances: CardInstance[] // 同上（lendSelfThisBattle で貸した「このバトルの間」の発生源）
    burst: string | null // 自分のみ。相手は必ず null（伏せているため内容は見えない。docs/design/BURST.md）
    burstSet: boolean // 両者に見える（伏せてあるか否かは公開情報）
    onceByNameUsed?: Record<string, number>
    burstSetThisTurn: boolean // 両者に見える公開情報（このターンにセット済みか。クライアントがセットボタンのグレーアウトに使う）
    soulCore: SoulCoreLocation | null // 公開情報のため自分/相手ともに配信する（どのコアが[ソウルコア]かの所在。案B-insideなので数値には既に含まれている。docs/design/SOULCORE.md）
}

export interface GameView {
    gameId: string
    turn: number
    turnPlayer: PlayerId
    phase: Phase
    priorityPlayer: PlayerId
    isFlashTiming: boolean
    battle: BattleState | null
    players: Record<PlayerId, PlayerView>
    log: string[]
    winner: PlayerId | null
    you: PlayerId
    timedEffects: TimedRecord[] // 公開情報
    extraMainStep?: true // BS15-X04 Lv2 の追加メインステップ中（「アタックステップへ」ボタンを出さない）
    secondMainStep?: true // 第2メインステップ中（「アタックステップへ」ボタンを出さず、メインのフェーズ表示を「第2メイン」に切り替える）
    endStepLocks: EndStepLock[] // 公開情報。両者に配信する（画面にカウンターとして出す）
    attacksThisTurn: number // このターンに宣言されたアタックの回数（AuraCondition ownAttacksAtLeast がクライアントでも読む）
    lifeLostThisTurn?: Partial<Record<PlayerId, true>> // GameState と同じ（公開情報）
    spiritVanishedThisTurn?: Partial<Record<PlayerId, true>> // GameState と同じ（公開情報）
    magicIdsUsedThisTurn?: Partial<Record<PlayerId, string[]>> // GameState と同じ（公開情報）
    oppSpiritRemovedByEffectThisTurn?: Partial<Record<PlayerId, string[]>> // GameState と同じ（公開情報。AuraCondition.ownEffectVanishedOpponentSpirit が読む）
    ownSpiritDestroyedByOwnEffectColors?: Partial<Record<PlayerId, Color[]>> // GameState と同じ（公開情報。手札のコスト注記の計算に使う）
    selfSummonCostUsedNames?: Partial<Record<PlayerId, string[]>> // GameState と同じ
    magicUsedThisTurn: Record<PlayerId, number> // このターンの各プレイヤーのマジック使用回数（隠匿情報なし。クライアントのmagicRestriction判定に必要＝作戦参謀フォクシン）
    pendingChoice: PendingChoice | null // 相手視点では candidates を空配列・prompt をマスクして配信（viewFor）
    events: GameEvent[] // クライアント演出用の一時イベント列（隠匿情報なし。viewForがそのまま渡す）
    revealedCards?: { pid: PlayerId; cardIds: string[] } // 公開ゾーン（オープンされたカードは両者に見えるためマスクしない）
}

// ---- クライアント → サーバーのアクション ----

 // 降参：相手の勝利としてただちに終了する。手順の外側の操作なので、
    // 自分のターンでなくても、フラッシュ中でも、対象の選択待ち中でも受け付ける
