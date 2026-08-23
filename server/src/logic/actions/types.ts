// resolveAction を分割したアクションハンドラの共通型。
//
// 旧実装は 3,000行超・105 case の単一 switch だった。分割にあたり、
// 各 case 本体が参照していた closure ローカル（state / owner / opp / self / sourceName /
// srcColors / srcType / destroyContext / targetInstanceId / chosenOption / chosenCardIndex）を
// このコンテキストオブジェクト1個にまとめ、本体はそのまま移設できるようにしている。
import type {
    CardInstance,
    Color,
    DestroyContext,
    EffectAction,
    GameState,
    PaySource,
    PlayerId,
} from "../../type"

export interface ActionCtx {
    state: GameState
    owner: PlayerId
    opp: PlayerId
    self: CardInstance | null
    sourceName: string
    srcColors: Color[] | undefined
    srcType: "spirit" | "nexus" | "magic" | undefined
    sourceCardId: string | undefined // 発生源のカードID。マジックはselfがnullのため、resolveMagicが使用中のカードのcardIdをここに入れる
    // （スピリット/ネクサス発生源はself.cardIdからのフォールバックで自動的に入る）。lendSelfThisTurn専用（TURN_EFFECT_SOURCES.md §3.3）
    destroyContext: DestroyContext
    targetInstanceId: string | undefined
    chosenOption: string | undefined
    chosenCardIndex: number | undefined
    // 選択の解決時にクライアントが添えてきたコアの支払い元（自分のフィールドのスピリット/ネクサス）。
    // 「コストを支払って召喚する」起動効果（summonFromHandFree の payCost）でだけ使う。
    // 通常の召喚と同じく、リザーブで足りないぶんをフィールドのコアから払うための指定
    // （2026-08-23 追加。それまではリザーブからしか払えず、盤面のコアで払えるカードが
    // 候補にすら出なかった＝利用者報告）
    paySources: PaySource[] | undefined
    // 効果解決中の再入（同一アクションの繰り返し・別アクションへの委譲）に使う。
    // 旧実装の `resolveAction(state, owner, self, action, ...)` の置き換え。
    // **self だけは省略時に呼び出し元の self を引き継ぎ**（旧実装が常に self を渡していたため）、
    // targetInstanceId / sourceColors / sourceType / chosenOption / chosenCardIndex は
    // **省略すると undefined が渡る**（呼び出し元の値を暗黙に引き継がない）。
    // 引き継ぎたい場合は opts に明示的に渡すこと。移設前の挙動をそのまま保つための設計
    resolve: (action: EffectAction, opts?: ResolveOpts) => void
}

// ctx.resolve の任意引数。旧 resolveAction の第3・5〜9引数に対応する
export interface ResolveOpts {
    // exactOptionalPropertyTypes 下でも ctx の値（undefined を含みうる）をそのまま渡せるよう
    // 明示的に undefined を許容する
    // self のみ「省略時は呼び出し元の self を引き継ぐ」（null を渡せば self なしにできる）
    self?: CardInstance | null | undefined
    targetInstanceId?: string | undefined
    sourceColors?: Color[] | undefined
    sourceType?: "spirit" | "nexus" | "magic" | undefined
    chosenOption?: string | undefined
    chosenCardIndex?: number | undefined
}

// 単一アクションのハンドラ。action は type で絞り込まれた具体型が渡る
export type ActionHandler<K extends EffectAction["type"]> = (
    ctx: ActionCtx,
    action: Extract<EffectAction, { type: K }>,
) => void

// 全 EffectAction.type を網羅するハンドラ表。
// 分割モジュールは Partial<ActionRegistry> を返し、合成結果をこの型に代入することで
// **case の書き漏れをコンパイル時に検出する**（旧 switch が持っていた網羅性チェックの代替）
export type ActionRegistry = {
    [K in EffectAction["type"]]: ActionHandler<K>
}
