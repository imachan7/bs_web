// プレイヤー1人の状態 PlayerState（ライフ・リザーブ・手札・デッキ・フィールド）
import { CardInstance } from "./cardInstance"
import { Keyword } from "./keyword"
import { PlayerId, SoulCoreLocation } from "../type"

// プレイヤーの状態
export interface PlayerState {
    id: PlayerId
    name: string
    life: number
    reserve: number
    trashCores: number
    // 「デッキの横に置く」コア（BS12-078 カシオペアシール）。個々のコアを区別しないので個数だけ持つ。
    // **どのゾーンにも属さない**ので、コストの支払い・コア移動・効果の対象から自然に見えない
    // （「このコアは、この効果以外に使用することはできない」）。持ち主のエンドステップに1個ずつボイドへ戻す。
    // ボイドは残量を持たない無限の供給源として実装しているため、置くときも戻すときもボイド側の増減は無い
    deckSideCores: number
    deck: string[] // cardId の配列（先頭がデッキトップ）
    hand: string[]
    trashCards: string[]
    excludedCards: string[] // 除外ゾーン（ゲーム外）。《継召》でトラッシュのEXシンボルを除外して軽減したカードなどが入る
    tegamoto: string[] // 公開ゾーン「手元」（cardId配列）。マジックブックの手元配置・ミカファールLv2の無償使用対象・エクリアの破壊効果が参照する。公開ゾーンのためviewForは両者分をそのまま配信する
    // 手元のカードのうち「手札にあるときと同様に使用できる」ものの cardId 多重集合
    // （BS06混迷する魔法実験場Lv2 が相手の効果によるデッキ破棄から手元へ置いたぶん）。
    // **tegamoto の並びとは独立に持つ**：同じ cardId ならどれを使っても同じなので、
    // 並び替えやインデックスのズレに強い。使用・破棄のたびに1件ずつ取り除く。
    // マジックブックが置いたカードはここに入らない（あちらはミカファールLv2の無償化がないと使えない）
    tegamotoPlayable: string[]
    field: {
        spirits: CardInstance[]
        nexuses: CardInstance[]
        combinedBraves: CardInstance[] // 合体中のブレイヴの実体置き場（docs/design/BRAVE.md §2.3・§2.4）。
        // **フィールド走査の対象に入れない**（spirits に置くと合体スピリットが2体に数えられ、
        // シンボルの二重計上・destroy{all} の二重ヒット・コア0での維持コア割れ消滅が起きる）
    }
    tempHandKeywordGrants?: { cardId: string; keyword: Keyword }[] // 手札のカードに一時付与されたキーワード（grantKeywordToHandCard。ターン終了でリセット。ビートプリースト）
    minAttackCostThisTurn?: number // このターンにアタックしたスピリットのコスト（付与込みの最小値）の最小。globalConstraint "attackOncePerTurnTotalByCost" が読む。ターン終了でリセット
    turnVirtualInstances: CardInstance[] // このターンの間だけ「フィールドにあるもの」として扱う仮想の効果発生源（マジックが貸した継続効果。lendSelfThisTurn）。
    // ターン終了でリセット（PhaseManager.endTurn）。フィールドには実在しないため、シンボル集計（countSymbols / ownFieldSymbolColors）の対象にはならない（TURN_EFFECT_SOURCES.md §1・§2.1）
    peekedOpponentCardIds?: string[] // 「相手の手札1枚の内容を見る」（peekOpponentHand）で見たカードの cardId。
    // **持ち主の PlayerView にだけ返す**（相手には見せない）。同じカードを二重に見た場合も素直に積む。
    // 見たあとにそのカードが手札から離れても消さない簡略化（何を見たかの記録として残す。BS09-039探偵ペンタン）
    noRestWhenBlockingUsedThisTurn?: string[] // 「ターンに1回、ブロックしても疲労しない」（constraint の oncePerTurn）を、このターン使った**発生源の instanceId**。ネクサス1枚につき1回なので、同名を2枚置けば2回使える。ターン終了でリセット（BS07ブリシンガメンの首飾りLv2）
    // ⚠️ **廃止予定・もう読まれない**（2026-08-17）。効果ごとに聞く形（askPayToNegateIfNeeded →
    // payNegateDecide → payNegateDecision）へ移したため、この方針は判定に使われない。
    // クライアントがまだトグルを送ってくるので受け皿だけ残してある。
    // UI からトグルが消えたら、この項目と GameAction "setPayToNegate" を一緒に削除すること
    payToNegate?: boolean // 「自分の手札1枚を破棄することで、その効果を受けない」（BS08竜騎集う円卓Lv2）を払うかどうかの方針。
    // **未指定は true（払う）＝従来どおり**。耐性の判定は装甲と同じ同期の述語なので、その場で選択を挟めない。
    // 代わりにこの方針をプレイヤーがあらかじめ切り替えておき（GameAction "setPayToNegate"）、判定はそれを読むだけにする

    battleVirtualInstances: CardInstance[] // 上の「このバトルの間」版（lendSelfThisBattle）。effectSources が turnVirtualInstances と一緒に返すので、
    // 効果エントリ側（lentOnly / levels:null）の書き方は同じ。違いは寿命だけで、こちらは clearBattle でリセットされる（同じターンの2回目のバトルには効かない）
    onceByNameUsed?: Record<string, number> // 「同名で1回」。キー=名前+効果ID末尾
    burst: string | null // バーストエリアに伏せているカードのcardId（非公開。docs/design/BURST.md）
    // 「セットしているか」の公開情報版（burst !== null と常に一致するよう mutation 側で同期する）。
    // shared/board.ts の BoardPlayer が持つのはこちらだけ（burstはGameViewで相手はnullに隠されるため、
    // 共有ルール層＝クライアントからも呼ばれる判定にburstを使うと相手側の判定が常にfalseになってしまう）
    burstSet: boolean
    burstSetThisTurn: boolean // このターンにセット済みか（ターン終了でリセット。setBurstFromHandはこの制限を受けない）
    // ソウルコア（26系）。公開情報（盤上で区別できる形で置かれるため両者に見える）。初期値はリザーブ
    soulCore: SoulCoreLocation | null
}
