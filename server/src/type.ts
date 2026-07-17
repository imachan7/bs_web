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
export type CardType = "spirit" | "nexus" | "magic"

// デッキの指定方法: DECK_RECIPES の色キー（"red" 等）またはカスタムデッキのカードリスト（cardId -> 枚数）
export type DeckSpec = string | Record<string, number>

// スピリット/ネクサスのレベル定義（ネクサスは bp: 0）
export interface LevelDef {
    level: number
    cores: number
    bp: number
}

// コスト支払い時に使うスピリット上のコアの割り当て（v1: スピリット上のコアのみ、ネクサス上は将来対応）
export interface PaySource {
    instanceId: string
    count: number
}

// ---- 効果データ層（data.md 5.2） ----

// 効果の実行内容。EffectModules のアクションハンドラと 1:1 で対応する。
// 新しい効果を足すときは「ここに型を追加」→「ハンドラを追加」の2手で完結する。
export type EffectAction =
    | { type: "draw"; count: number } // 自分がデッキから引く
    | { type: "destroy"; maxBp?: number; count: number; keywordFilter?: Keyword } // 相手スピリットを破壊（maxBp 省略=BP不問、keywordFilter=指定キーワード持ちのみ）
    | { type: "destroyAll"; maxBp: number } // BP以下の相手スピリットを全破壊
    | { type: "selfBuff"; amount: number } // このスピリット自身をBP+（ターン終了時まで）
    | { type: "destroyNexus"; count: number; drawPerDestroyed?: number } // 相手のネクサスを破壊（drawPerDestroyed指定時は実際に破壊できた数×ドロー）
    | { type: "returnSelfToHand" } // このスピリットを持ち主の手札に戻す
    | { type: "coreRemove"; count: number } // 対象スピリットのコアを持ち主のリザーブへ置く
    | { type: "bpBuff"; amount: number } // 対象スピリット1体をBP+（ターン終了時まで）
    | { type: "exhaust"; count: number } // 相手スピリットを疲労させる
    | { type: "destroyExhausted"; count: number } // 疲労状態の相手スピリットを破壊
    | { type: "drawPer"; counter: DrawPerCounter } // カウント値ぶん自分がドロー（0ならログのみ）
    | { type: "bpBuffPer"; counter: "exhaustedEnemies"; amountPer: number } // 対象スピリット1体を「カウント値×amountPer」だけBP+（0ならログのみ）
    | { type: "discardHandAll" } // 自分の手札をすべてトラッシュへ
    | { type: "bpBuffAll"; amount: number } // 自分のフィールドのスピリットすべてをBP+（ターン終了時まで）
    | { type: "returnToHand"; count: number } // 対象スピリットを持ち主の手札に戻す（破壊ではないためonDestroyは誘発しない）
    | { type: "returnToDeckTop" } // 対象スピリットを持ち主のデッキの一番上に戻す
    | { type: "coreCharge"; count: number } // 自分のリザーブから対象の自分スピリットへコアを最大count個置く
    | { type: "lifeCharge"; count: number } // 自分のリザーブから自分のライフへコアをcount個置く（不足なら可能な分だけ）
    | { type: "coreGain"; count: number } // ボイドから自分のリザーブへコアをcount個追加
    | { type: "refreshAllOwn" } // 自分の疲労スピリットをすべて回復。回復した個体はこのターン中アタック不可
    | { type: "endBattle" } // 今行っているバトルをただちに終了（BP比較・ライフダメージなし。バトル外はno-op）
    | { type: "exhaustAllByColor" } // 相手フィールドで最多の色を自動選択し、その色を持つ両陣営のスピリットを疲労させる
    | { type: "lockFlash" } // バトル中のみ有効：このバトルの間、相手はフラッシュで手札のカードを使用できなくする
    | { type: "returnNexusToHand"; count: number } // 相手のネクサスを持ち主の手札に戻す（破壊ではない）
    | { type: "reclaimTrashCores" } // 自分のtrashCoresをすべてリザーブへ（0ならログのみ）
    | { type: "refreshSelf" } // このスピリット自身を回復させる（selfがnull/既に回復状態ならno-op）
    | { type: "lifeCrush"; count: number } // 相手のライフのコアcount個を相手のリザーブへ（ライフ0以下で勝敗決定）
    | { type: "voidCoreToSelf"; count: number } // ボイドからコアcount個をこのスピリット上に置く（selfがnullならno-op）
    | { type: "voidCoreToSelfPer"; counter: "ownOtherSpirits" } // カウント値ぶんボイドからこのスピリット上にコアを置く（0ならno-op）
    | { type: "discardOpponent"; count: number } // 相手の手札からcount枚を破棄（手札末尾から。手札が足りなければある分だけ）
    | { type: "refreshOne"; keywordFilter?: Keyword; colorFilter?: Color } // 自分の疲労スピリット1体を回復（keywordFilter/colorFilter指定時はそれぞれの条件持ちのみ。候補から実効BP最大を自動選択、いなければno-op）
    | { type: "coreRemoveSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のリザーブへ（selfがnullならno-op）
    | { type: "selfBuffPer"; counter: "readyEnemies"; amountPer: number } // このスピリット自身を「相手フィールドの回復状態スピリット数×amountPer」だけBP+（ターン終了時まで。selfがnull/カウント0はno-op）
    | { type: "voidCoreToOther"; count: number } // ボイドからコアcount個を、self以外の自分のスピリットのうち実効BP最大の1体に置く（候補がいなければno-op）
    | { type: "coreSqueezeAll" } // 両プレイヤーの全スピリットについて、コアを1個だけ残し超過分をその持ち主のリザーブへ（1個未満で維持コア割れになる場合は消滅処理を適用）
    | { type: "endAttackStepAfterBattle" } // バトル中のみ：このバトルが終了したときアタックステップを終了するフラグを立てる（バトル外はno-op）
    | { type: "coreToTrashSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のトラッシュへ（維持コア割れの消滅処理を含む。selfがnullならno-op）
    | { type: "recoverSpiritFromTrash"; count: number } // 自分のトラッシュにあるスピリットカードをcount枚、手札に戻す（末尾＝新しい方から自動選択。本来は選択の簡略化。該当なしはno-op）
    | { type: "coreSqueezeOne"; count: number } // 相手フィールドの実効BP最大のスピリットをcount体選び、それぞれコアを1個だけ残して超過分を持ち主のリザーブへ（coreSqueezeAllの単体版。対象なしはno-op）
    | { type: "coreToVoidOwn"; count: number } // 自分のコアcount個をボイドへ置く（消す）。trashCoresから優先的に減らし、足りなければ自分フィールドのスピリット（実効BP最小）から取る。維持コア割れは消滅処理
    | { type: "bothSidesCoreToTrash"; count: number } // 両プレイヤーのフィールドから各自の実効BP最大スピリット1体を選び、そのコアcount個を各持ち主のトラッシュへ（維持コア割れは消滅処理。片側のみ対象がいてもその側は処理する）
    | { type: "discardSelfOne" } // 自分の手札の末尾1枚をトラッシュへ破棄（手札0ならno-op。本来は自分が選ぶ処理の簡略化）
    | { type: "coreDrainAllOthers" } // このスピリット（self）以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブへ（両陣営）。この効果で消滅した数ぶんボイドからselfへコアを置く（selfがnullならno-op）
    | { type: "grantBlockerImmunity" } // ブロックしている自分のスピリット1体に、このターンの間 immuneToOpponentThisTurn を付与する（フェザーバリア）
    | { type: "negateOwnBlockConstraint" } // 自分のスピリット1体が持つ cantBlock/cantBlockLowerBp を、このターンの間無効化する（バーストファイア）
    | { type: "endAttackStep"; onlyOpponentTurn?: boolean } // 今行っているアタックステップの終了フラグを立てる（onlyOpponentTurn=true時は自分のターンなら発動しない。妖機妃ソール）
    | { type: "deckReveal"; count: number; pickType?: CardType } // 自分のデッキ上からcount枚を公開し、pickTypeに一致する最初の1枚（省略時は先頭）を手札に加える。残りは元の順でデッキの下に戻す（スワロウアイヴィー）
    | { type: "coreGainPer"; counter: DrawPerCounter } // カウント値ぶんボイドから自分のリザーブへコアを追加（0ならログのみ。宝石の獣カーバルク）
    | { type: "refreshAllByCost"; cost: number } // 両陣営のコストが一致するスピリットすべてを回復させる（refreshAllOwnと異なりcantAttackThisTurnは付与しない。ローヤルポーション）
    | { type: "destroyOwnByCost"; maxCost: number; gainCoresEqualCost?: boolean } // 自分のフィールドからself以外でコスト<=maxCostのうちコスト最大の1体を破壊する（プレイヤー選択の簡略化＝決定的選択）。gainCoresEqualCost指定時は破壊したスピリットのコストと同数のコアをボイドから自分のリザーブへ（天使長プリンシパール）

// drawPer / coreGainPer 共通のカウンタ定義。
// { ownFamily: string } は自分のフィールドの指定系統スピリット数（onDestroy等では発火時点で
// selfはすでにフィールドから除去されているため、self自身はカウントに含まれない）
export type DrawPerCounter =
    | "exhaustedEnemies"
    | "opponentHand"
    | { ownFamily: string }

// 誘発イベント（data.md 5.1 のイベント層）。
// ルール追加時はまず既存イベントで表現できるか検討する。
export type TriggerEvent =
    | "onSummon" // 召喚時
    | "onAttack" // アタック時
    | "onDestroy" // 破壊時
    | "onBattle" // バトル時
    | "onBlock" // ブロック時

// フィールドイベント誘発（data.md 5.1 のイベント層の追加分）。
// TriggerEvent は「効果の発生源となったスピリット自身に起きたこと」を起点とするが、
// fieldEvent は「フィールド上の他のスピリットに起きたこと」に対してネクサス等が反応する場合に使う
// （相手によってライフが減った／自分のスピリットが破壊された、など）。
export type FieldEvent =
    | "ownLifeDamaged" // 相手によって自分のライフが減らされたとき
    | "ownSpiritDestroyed" // 自分のスピリットが破壊されたとき
    | "anySpiritAttacked" // 両陣営どちらかのスピリットがアタックを宣言したとき（self はアタックしたスピリット。魔帝の墓標Lv2）
    | "opponentDrew" // 持ち主から見て相手がデッキからカードをドローしたとき（GameState.draw から発火。シダフクロウ）

// キーワード効果。今後同名キーワードを持つカードが多数追加されるため、
// カードデータには名前だけを持たせ、挙動は EffectModules のレジストリで解決する。
export type Keyword =
    | "soku" // 神速：手札からフラッシュタイミングで召喚できる
    | "awaken" // 覚醒：フラッシュタイミングで自分のスピリットのコアを集められる
    | "clash" // 激突（将来弾用に予約）
    | "armor" // 装甲（将来弾用に予約）
    | "jugeki" // 呪撃：アタック時、ブロックした相手スピリット1体をバトル終了時に破壊

// 常時BP修正（オーラ）のカウンタ。発生源の持ち主基準で数える。
export type AuraCounter =
    | "ownReserve" // 自分のリザーブのコア数
    | "ownNexuses" // 自分のネクサス数
    | "allNexuses" // 両者のネクサス数の合計
    | "ownExhausted" // 自分の疲労スピリット数
    | { ownFamily: string } // 自分フィールドの指定系統を持つスピリット数（発生源自身も含む）

// 常時BP修正（オーラ）の発動条件。満たすときのみ amount を適用する。
export type AuraCondition =
    | { hasOwnColor: Color } // 自分フィールドに指定色のスピリットまたはネクサスがある
    | { hasOwnColorSpirit: Color } // 自分フィールドに指定色のスピリットがいる
    | { hasOwnFamily: string } // 自分フィールドに指定系統のスピリットがいる（自身を含んでよい）
    | "ownReserveNotEmpty" // 自分のリザーブが1個以上

// 常時BP修正の定義
export interface AuraDef {
    type: "bp"
    target: "self" | "ownAll" // 発生源自身のみ / 発生源の持ち主のスピリットすべて
    colorFilter?: Color // ownAll 用: この色のスピリットのみ
    battlingOnly?: boolean // バトル中（アタッカーまたはブロッカー）のスピリットのみ
    amount?: number // 固定量（condition と併用可）
    amountPer?: number // counter × amountPer の可変量
    counter?: AuraCounter
    condition?: AuraCondition // 満たすときのみ amount を適用
    summonedThisTurnOnly?: boolean // ownAll 用: 対象の summonedTurn === state.turn のスピリットのみ（このターン召喚されたスピリットに限定）
}

// ブロック可否などの制約定義（RuleValidator が参照する宣言的ルール）
export type ConstraintDef =
    | { type: "cantBlock" } // このスピリットはブロックできない
    | { type: "cantBlockLowerBp" } // 自分より実効BPが低いアタッカーをブロックできない
    | { type: "unblockableBy"; colorFilter?: Color; keywordFilter?: Keyword; maxCores?: number; levelFilter?: number[] } // このスピリットのアタックは、指定色／指定キーワード持ち／コア数がmaxCores以下／currentLevelがlevelFilterに含まれるスピリットにブロックされない
    | { type: "mustAttack" } // このスピリットはアタックできるとき、必ずアタックしなければならない
    | { type: "untargetableByOpponent" } // このスピリットは相手のスピリット/マジックの効果の対象にならない（クイーン・ワルキューレ。範囲効果には無力）
    | { type: "canDirectAttack"; targetFilter: "rested" | "singleCore" | "recovered" } // 相手スピリット1体を指定してアタックできる（targetFilter: rested=疲労状態のみ、singleCore=コア1個のみ、recovered=回復状態のみ。イリュージョナ／牛霊スモゥグ／オルカリア）
    | { type: "cantAttack" } // このスピリットはアタックできない（カイザレオン大帝Lv1）

// フィールド全体制約の定義（kind: "globalConstraint" が参照する宣言的ルール）。
// kind: "constraint" は「発生源自身」への制約だが、こちらは発生源の持ち主に関係なく
// 両陣営のスピリット／ネクサスすべてに効く（RuleValidator.hasGlobalConstraint 経由で参照）。
export type GlobalConstraintDef =
    | { type: "singleCoreCantAct" } // コア1個しか置いていないスピリットは、アタックとブロックができない（両陣営。魔帝の墓標）
    | { type: "nexusIndestructible" } // すべてのネクサスは破壊されない（両陣営。要塞皇オーディーン）

// 効果定義（kind による判別ユニオン）。
// levels は発動するレベルの配列（null = レベル不問）。
export type EffectDef =
    | {
          id: string
          kind: "keyword"
          keyword: Keyword
          levels: number[] | null
          colors?: Color[] // 装甲用: この色の相手効果を受けない
      }
    | {
          id: string
          kind: "triggered"
          trigger: TriggerEvent
          levels: number[] | null
          action: EffectAction
          optional: boolean // 「〜できる」= 任意（自動処理では常に発動）
          battleRole?: "attacker" | "blocker" // onBattle 専用：勝利したときの自分の役割がこれと一致する場合のみ発火（省略時は従来通り常に発火）
      }
    | {
          id: string
          kind: "magic"
          timing: "main" | "flash"
          action: EffectAction
      }
    | {
          id: string
          kind: "step"
          step: Phase // 発火するステップ
          turn: "own" | "opponent" | "both" // own=このインスタンスの持ち主がturnPlayerの時、opponent=持ち主が非turnPlayerの時、both=常に
          levels: number[] | null
          action: EffectAction
          condition?: "handNotGreaterThanOpponent" // 指定時はこの条件を満たすときのみ発火（主無き古城Lv2：持ち主の手札枚数が相手以下）
      }
    | {
          id: string
          kind: "aura"
          levels: number[] | null // オーラ発生源のレベル条件
          aura: AuraDef
      }
    | {
          id: string
          kind: "constraint"
          levels: number[] | null
          constraint: ConstraintDef
      }
    | {
          id: string
          kind: "battleWon"
          role: "attacker" | "blocker" // 持ち主のスピリットがこの役割で勝利したとき（ネクサスのバトル結果誘発）
          levels: number[] | null
          action: EffectAction
      }
    | {
          id: string
          kind: "fieldEvent"
          event: FieldEvent
          levels: number[] | null
          action: EffectAction
          phase?: Phase // 指定時はこのステップでのみ発火（例: 侵食されゆく銀世界Lv2＝相手のアタックステップ限定）
          turn?: "own" | "opponent" // 指定時はこの陣営条件でのみ発火（own=このインスタンスの持ち主がturnPlayerの時、opponent=持ち主が非turnPlayerの時。省略時はどちらでも発火）
          colorFilter?: Color // event: "ownSpiritDestroyed" 限定：破壊されたスピリットの色がこれと一致するときのみ発火（祝福されし大聖堂）
      }
    | {
          id: string
          kind: "globalConstraint"
          levels: number[] | null
          constraint: GlobalConstraintDef // フィールド発生源から全スピリット／全ネクサスに効く制約（発生源の持ち主を問わない）
      }
    | {
          id: string
          kind: "costMod"
          levels: number[] | null
          colorFilter: Color // このコスト修正が効く、使用されるカードの色（発生源の持ち主・対象カードの持ち主は問わない＝両陣営に効く）
          amount: number // 軽減後コストに加算する量（ルビーの太陽：白のカード全体+1）
      }
    | {
          id: string
          kind: "activated"
          timing: "flashBattle" // 発動可能タイミング（現状はフラッシュ中のバトルのみ。将来拡張用にユニオン化しておく）
          levels: number[] | null
          cost: { reserveToTrash: number } // 発動コスト（リザーブからトラッシュへ置くコア数。将来拡張しやすい形）
          condition?: "selfInBattle" // 発動条件（self が現在のバトルの当事者＝attacker/blocker）
          action: EffectAction // 発動時の効果
      }
    | {
          id: string
          kind: "coreBonus" // このスピリットに効果でコアが置かれるとき、置く数を+amount（ボイド由来）する（グラーバ）
          levels: number[] | null
          amount: number
      }

// カードマスターデータ（不変）。data.md 4 / 6.1 に対応
export interface CardData {
    cardId: string
    name: string
    type: CardType
    color: Color
    cost: number
    reduction: Color[] // 軽減シンボル（色の配列。長さ=軽減数）
    family: string[] // 系統（日本語のまま）
    levels: LevelDef[] // magic は空配列
    symbol: Color[] // magic は空配列
    flash: boolean // magic のみ: フラッシュタイミングで使用可能か
    rarity: string // C/U/R/M/X など（表示用）
    limited: boolean // 禁止カードか
    effect: string // 表示用テキスト（原文）
    effects: EffectDef[] // 構造化された効果（未対応の効果は含まれない）
}

// 盤面インスタンス（可変）。data.md 6.2 に対応
export interface CardInstance {
    instanceId: string
    cardId: string
    cores: number
    isRested: boolean
    summonedTurn: number
    tempBpBuff: number // ターン終了時まで有効なBP増減
    cantAttackThisTurn: boolean // このターンの間アタック不可（refreshAllOwn で回復した個体などに付与）
    immuneToOpponentThisTurn: boolean // このターンの間、相手のカード効果を受けない（フェザーバリア）
    blockConstraintNegatedThisTurn: boolean // このターンの間、自身の cantBlock/cantBlockLowerBp を無効化（バーストファイア）
}

// プレイヤーの状態
export interface PlayerState {
    id: PlayerId
    name: string
    life: number
    reserve: number
    trashCores: number
    deck: string[] // cardId の配列（先頭がデッキトップ）
    hand: string[]
    trashCards: string[]
    field: {
        spirits: CardInstance[]
        nexuses: CardInstance[]
    }
}

// バトル（アタック〜解決まで）の状態
export interface BattleState {
    attackerInstanceId: string
    blockerInstanceId: string | null
    flashLockedPlayer: PlayerId | null // このバトルの間フラッシュで手札のカードを使用できないプレイヤー（lockFlash 用）
    directed: boolean // 指定アタックか（true の場合 blockerInstanceId はアタッカーが指定した相手スピリット。通常アタックは false）
}

// ゲーム全体の状態（サーバーで一元管理）
export interface GameState {
    gameId: string
    turn: number // 通算ターン数（p1→1, p2→2, ...）
    turnPlayer: PlayerId
    phase: Phase
    priorityPlayer: PlayerId
    isFlashTiming: boolean
    flashCount: number
    battle: BattleState | null
    players: Record<PlayerId, PlayerState>
    log: string[]
    winner: PlayerId | null
    endAttackStepAfterBattle: boolean // 今のバトルが終了したときアタックステップを強制終了するか（サイレントウォール用）
}

// ---- クライアントへ送る公開ビュー（相手の手札・デッキ内容は隠す） ----

export interface PlayerView {
    id: PlayerId
    name: string
    life: number
    reserve: number
    trashCores: number
    deckCount: number
    hand: string[] | null // 自分のみ。相手は null
    handCount: number
    trashCards: string[]
    field: {
        spirits: CardInstance[]
        nexuses: CardInstance[]
    }
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
}

// ---- クライアント → サーバーのアクション ----

export type GameAction =
    | { type: "summon"; handIndex: number; paySources?: PaySource[] } // 召喚（神速持ちはフラッシュ時も可）
    | { type: "setNexus"; handIndex: number; paySources?: PaySource[] }
    | { type: "castMagic"; handIndex: number; targetInstanceId?: string; paySources?: PaySource[] }
    | { type: "moveCore"; instanceId: string; direction: "add" | "remove" }
    | {
          type: "awaken" // 覚醒：fromInstanceId のコアを instanceId へ移す
          instanceId: string
          fromInstanceId: string
          count: number
      }
    | { type: "attack"; instanceId: string; targetSpiritInstanceId?: string } // targetSpiritInstanceId 指定時は指定アタック（canDirectAttack 持ちのみ）
    | { type: "block"; instanceId: string }
    | { type: "activateAbility"; instanceId: string; effectId: string } // 起動能力の発動（kind:"activated"、コストを払って任意発動する能力）
    | { type: "takeLife" }
    | { type: "pass" } // フラッシュの優先権を相手に渡す
    | { type: "nextPhase" } // main → attack
    | { type: "endTurn" }
