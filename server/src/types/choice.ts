// 選択待ち（PendingChoice）と、中断した処理の再開情報（ResumeFrame）。2026-09-28 に type.ts から切り出した（type.ts が re-export）。

import type { CardInstance, CardType, Color, DestroyContext, GameState, PaySource, PlayerId } from "../type"
import type { EffectAction } from "./effectAction"

// 効果解決中のプレイヤー選択（v1は対象選択のみ）。resolveAction が候補2件以上のときに
// requestChoice 経由でセットし、GameAction "resolveChoice" で消費される。
// queue は、選択待ち中に中断された「同一トリガー内の残りエントリ」を直列化したもの
// （fireTrigger / resolveMagic のエントリループが積む。selfInstanceId から self を復元して再開する）。
export interface PendingChoice {
    pid: PlayerId // 選択するプレイヤー
    recordScope?: string
    effectSource?: { type?: CardType; colors?: Color[] } // 中断した効果の発生源の種別・色。再開時に渡し直す（渡さないとマジックの効果が種別なしで続き、耐性や封印された魔導書が効かない）
    kind: "target" | "option" | "card" // target=フィールド上のインスタンスから選択／option=固定の選択肢ラベルから選択／card=自分の手札かトラッシュのカードから選択
    prompt: string // クライアント表示用の説明文（日本語）
    candidates: string[] // kind:"target" のとき使用する候補instanceId（kind:"option"/"card"のときは空配列）
    options?: string[] // kind:"option" のとき選択肢ラベル一覧（表示ラベル＝そのまま値として使う）
    cardZone?: "hand" | "trash" | "reveal" // kind:"card" のとき必須：どのゾーンから選ぶか（reveal=GameState.revealedCards の公開ゾーン）
    cardOwner?: PlayerId // kind:"card" のとき必須：ゾーンの持ち主（今回は常に pid 自身のゾーン＝pidと同値）
    cardIndices?: number[] // kind:"card" のとき必須：cardZone配列内の選択可能インデックス
    // （cardZone:"reveal" のときは GameState.revealedCards.cardIds のインデックス）
    optional: boolean // true ならスキップ（選ばない）可
    selectedIds?: string[] // kind:"target" のトグル選択で「いま選ばれている」候補（クライアントが選択済みとして描く）。
    // 候補（candidates）には選択済みのものも入れておき、もう一度クリックすると選択が外れる。
    // 相手視点ではマスクする（maskPendingChoiceForOpponent）
    skipLabel?: string // 「選ばない」ボタンの文言の差し替え。トグル選択の「これで破壊する」のように、
    // スキップが**中止ではなく確定**を意味するときに使う（未指定なら「選ばない」）
    stepper?: true // kind:"option" 限定：選択肢を**ボタンの列ではなく −／＋ の増減表示**で選ばせる
    // （options は "0"〜"N" のような数値ラベルの昇順で渡す）。個数を決めるだけで「どれを選ぶか」に
    // 意味が無く、候補数が多くなりうるものに使う（BS10-103グロウイングソード＝トラッシュに置くコアの数）。
    // 送られてくる値は従来どおり options のラベルそのものなので、サーバー側の解決は kind:"option" のまま
    resolveOnSkip?: true // kind:"card" / kind:"target"：スキップされたときも action を（選択なしで）解決する。
    // 「手札を好きなだけ破棄する」のように、**選び終わってから後処理がある**効果で使う。
    // 既定（未指定）はスキップ＝何もせず終了（従来どおり。BS08堕天使ミカファール）
    confirm?: true // 「〜できる」効果の発動確認（kind:"option" 限定）。選択肢は1つだけで、
    // **選んだラベルを chosenOption として action に渡さない**（渡すと選択肢を解釈するアクションが誤動作する）。
    // スキップ＝発動しない。EffectDef.triggered.optional が true のときに fireTrigger が立てる
    magicNegate?: {
        // マジックの無効化（kind:"magicNegate"）の確認待ち。**これが立っているときは action を解決しない**。
        // 「無効にする」を選べばコストを払ってマジックの効果を捨て、選ばなければ中断していた解決を続ける
        // （doResolveChoice が resolveMagicEffects を呼び直す）。BS02鏡の回廊Lv2／今後の【氷壁】
        casterPid: PlayerId // マジックの使用者
        cardId: string
        timing: "main" | "flash"
        targetInstanceId: string | undefined
        sourceInstanceId: string // 無効化する側の発生源（コストの支払い元）
        paidCost: boolean // 使用者が「コストを支払って」使用したか（BS11-X05 魔導双神ジェミナイズ用。中断をまたいで持ち回す）
    }
    handFreeSummon?: {
        // 手札のカード自身による無償召喚（kind:"freeSummonFromHandOnLifeDamaged"）の確認待ち。
        // **action は解決しない**。選べば手札のそのカードをコストを支払わず召喚する
        pid: PlayerId
        cardId: string
    }
    trashFreeSummon?: {
        // 手札から破棄されてトラッシュに置かれたカード自身による無償召喚
        // （kind:"freeSummonFromHandOnDiscardedByOpponent"）の確認待ち。**action は解決しない**。
        // 選べばトラッシュのそのカードをコストを支払わず召喚する（BS09-025忍者サルトベ）
        pid: PlayerId
        cardId: string
        trashIndex: number
    }
    reviveConfirm?: {
        // 「破壊される代わりに復活できる」の確認待ち。magicNegate と同じく **action は解決しない**。
        // 選べばコストを払って復活が確定し、選ばなければその場で破壊する
        pid: PlayerId
        instanceId: string
        effectId: string
        sourceInstanceId: string
        context?: DestroyContext
    }
    braveKeep?: {
        // 合体スピリットが場を離れたとき、「ブレイヴをスピリット状態で残しますか？」の確認待ち
        // （docs/design/BRAVE.md §6.3）。**action は解決しない**。
        // 選べば need 個のコアを置いて field.spirits へ戻し、選ばなければトラッシュへ置く。
        // 確認中のブレイヴは GameState.pendingBraveKeeps に「コアを乗せずに分けて置いた」状態でいる
        // （場のどのゾーンにも属さないので、クライアントへはこの cardId で見せる）
        pid: PlayerId
        instanceId: string
        cardId: string
        need: number // スピリット状態の Lv1 維持コスト（braveKeepCores）
    }
    blockBattlePick?: {
        // 複数体ブロック（blockRequiresCount）で宣言がそろったあと、**アタック側**が
        // どのブロッカーとバトルするかを選ぶ待ち。**action は解決しない**。
        // 選ばれなかったブロッカーは BattleState.extraBlockerIds に入り、バトルには参加しない
        blockerPid: PlayerId
    }
    fushiSummon?: {
        // 【不死】：トラッシュにあるこのカードを、コストを支払って召喚するかの確認待ち。
        // reviveConfirm と同じく **action は解決しない**（BS09。docs/design/BS09_PLAN.md §3）
        pid: PlayerId
        cardId: string
        trashIndex: number // 同名カードが複数あるときにどれを出したかを固定する
        // kind:"fushiFreeByExhaust"（BS15-064冥府へ続く魔門Lv2）：このネクサスを疲労させることで
        // コストを支払わずに召喚できるとき、その候補のinstanceId。option文言で通常/無償のどちらが
        // 選ばれたかを判定し、無償なら applyFushiSummon がこのネクサスを疲労させ召喚時効果を発揮させない
        freeNexusInstanceId?: string
    }
    spiritMillFreeSummon?: {
        // 器AR：BS13-034ミノガメン「相手のデッキ破棄効果で破棄されたこのカードは、コストを支払わずに
        // 召喚できる」の確認待ち。fushiSummonと同じく**action は解決しない**
        pid: PlayerId
        cardId: string
        trashIndex: number // resolveMilledFromDeck が splice する前のトラッシュ内位置
    }
    triggerOrder?: {
        // 同時に発揮する**誘発**のうち「どれから解決するか」の選択待ち。destroyOrder と同じく
        // **action は解決しない**。選ぶのは常にターンプレイヤーで、選ばれた番号は
        // GameState.triggerOrderPick に記録され、誘発バッチ（ResumeFrame の triggerBatch）が
        // その1件を取り出して解決し、残りが2件以上ならまた聞く。
        // 同時発揮の一般則（docs/design/TIMING_CHART.md §0-3）の実装
        count: number // 候補の件数（PendingChoice.options と同順）
    }
    destroyOrder?: {
        // 同時に破壊される複数体のうち「**どの体から破壊処理をするか**」の選択待ち。
        // reviveConfirm と同じく **action は解決しない**。選ぶのは常にターンプレイヤーで、
        // 選ばれた個体は GameState.destroyOrderPick に記録され、破壊バッチが残りの先頭へ入れ替える。
        // 同時発揮の一般則（docs/design/TIMING_CHART.md §0-3）の実装
        instanceIds: string[] // 候補の instanceId（PendingChoice.options と同順）
    }
    extraStepChoice?: {
        // アタックステップ終了後に行うステップの選択（BS15-X04 機獣要塞ナウマンガルド Lv2）。action は解決しない。
        // options は「ドローステップ／リフレッシュステップ／メインステップ」。断れない
        sourceInstanceId: string
    }
    distributeCores?: {
        // 【烈神速】：トラッシュのコアを1個ずつ好きな場所へ置く待ち（BS16-X03）。action は解決しない。
        // destinations は options と同順の置き先トークン："reserve"/"self"（このスピリット自身。まだ場にいない）／
        // 自分のスピリット・ネクサスの instanceId／一括用の "reserve_all"/"self_all"
        remaining: number // まだ置いていないコアの残数
        selfCores: number // ここまでに「このスピリット」へ置いた数（召喚時にそのままコアになる）
        destinations: string[]
        handIndex: number
        cardId: string
    }
    provocationUse?: {
        // 「相手のメインステップ終了時に使用できる」マジックの使用確認待ち（BS15-079プロボケイション）。
        // action は解決しない。選べばコストを払って使用し、選ばなければ何もせずアタックステップへ進む
        pid: PlayerId
        cardId: string
        // メインから直接ターン終了した経路。使わなければアタックステップを経てそのままターンを終える。
        // 使ったらアタックステップで止めてターンプレイヤーへ返す（指定したスピリットがアタックするため）
        endTurnIfDeclined?: true
    }
    deckMillNegate?: {
        // 「デッキの破棄を、コストを払って無効にできる」の確認待ち。reviveConfirm と同じく **action は解決しない**。
        // 選べばコストを払って破棄が無効になり、選ばなければ見送っていた破棄をここで行う
        pid: PlayerId
        sourceInstanceId: string
        effectId: string
        count: number
        actorPid: PlayerId
        sourceType?: CardType
        causingInstanceId?: string // BS15共通器：kind:"deckMillNegate".thenReturnCauseToDeckBottom用。破棄を起こした発生源インスタンスID（GameState.currentEffectSource.instanceIdから確認の時点で控える。BS15-042オリンピアの天使アラトロンLv2）
    }
    magicRedirect?: {
        // 対象の絞り込み（kind:"magicTargetRedirect"）の確認待ち。magicNegate と同じく **action は解決しない**。
        // 選べば GameState.magicRedirectDecision に承認を記録してからマジックの解決へ進み、
        // 選ばなければ拒否を記録して同じく解決へ進む（どちらも doResolveChoice が resolveMagicEffects を呼ぶ）
        casterPid: PlayerId
        cardId: string
        timing: "main" | "flash"
        targetInstanceId: string | undefined
        sourceInstanceId: string // 絞り込み先＝確認を出す側の発生源
        paidCost: boolean // magicNegate と同じ（BS11-X05 用）
    }
    magicSideChoice?: {
        // 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の対象変更の確認待ち。
        // magicRedirect と同じく **action は解決しない**（答えを GameState.magicSideDecision に
        // 記録してからマジックの解決へ進む）。選ぶのは**魔導書の持ち主**で、マジックの使用者とは限らない
        casterPid: PlayerId
        cardId: string
        timing: "main" | "flash"
        targetInstanceId: string | undefined
        sourceInstanceId: string // 魔導書＝確認を出す側の発生源
        ownerPid: PlayerId // 魔導書の持ち主（＝選ぶ人）
        paidCost: boolean // magicNegate と同じ（BS11-X05 用）
    }
    magicRepeat?: {
        // 「マジックの効果発揮後、同じ効果をもう1度だけ発揮できる」（kind:"magicRepeatGrant"）の確認待ち。
        // **action は解決しない**（選べば2周目を走らせ、選ばなければマジック使用時の誘発へ進む）。
        // 1周目が解決しきってから聞く（『効果発揮後』なので順序が決まっている）
        casterPid: PlayerId
        cardId: string
        timing: "main" | "flash"
        targetInstanceId: string | undefined
        sourceInstanceId: string // 再発揮を与えている発生源
        paidCost: boolean // magicNegate と同じ（BS11-X05 用）
    }
    magicFreeChoice?: {
        // 「マジックをコストを支払わずに使用できる」（kind:"magicFreeGrant"）の使用時確認。
        // **action は解決しない**（答えを持って doCastMagic をやり直す）。
        // 無償化の枠が1枚きりのカード（大天使イスフィール）で枠を温存できるようにするため、
        // 無償で使えるときも「あえてコストを払う」を選べる（2026-08-15 ユーザー確認）
        handIndex: number
        targetInstanceId?: string
        paySources?: PaySource[]
        fromTegamoto?: boolean
    }
    burstActivate?: {
        // バーストの発動確認待ち（docs/design/BURST.md）。**action は self=null で解決する**（マジックと同じ扱い。
        // バーストはフィールドに実体を持たないため、確認後の再開経路（selfInstanceId復元）に乗せられない）。
        // 承認されたら doResolveChoice / triggers.ts の非対話パスの両方から finishBurstActivation を呼び、
        // アクションの種別に応じてバーストエリアを空にしてから召喚 or トラッシュへ送る
        pid: PlayerId
        cardId: string
        thenPay?: "main" | "flash"
        destroyedCardId?: string // destroyedAsTarget用：このバースト発動時に破壊されたスピリットのcardId。承認後にresolveActionのtargetInstanceIdの枠で渡す
        alsoDraw?: true // alsoDrawIfDestroyedColor（docs/design/BURST.md）：宣言時点でeventColorsを判定済みのbool。承認後にactionと同時に自分は1枚ドローする（BS14-X02）
        toHand?: true // returnSelfToHandAfter（docs/design/BURST.md）：finishBurstActivationの行き先をトラッシュでなく手札にする（BS14-X02）
        burstEventCost?: number // BS15共通器：GameState.burstEventCostへ引き継ぐ値（EffectCounter "burstEventCost"。BS15-084爆砕轟神掌／BS15-X06鉄の覇王サイゴード・ゴレム）
        // BS16バッチ0：破壊後バーストが「破壊されたスピリット複数体のうちコストが割れている」場合、
        // 発動者が1体ぶんのコストを選ぶ（pending.optionsと同じ並びの候補値）。選んだ値がburstEventCostへ入る
        burstEventCostOptions?: number[]
        burstEventColors?: Color[] // BS16バッチ0：GameState.burstEventColorsへ引き継ぐ値（条件{burstDestroyedColor}用）
        burstEventLifeDamagerId?: string // BS16バッチ0：GameState.burstEventLifeDamagerIdへ引き継ぐ値
    }
    burstThenPay?: {
        // burstActivate の thenPay：解決後にコストを支払って本来のメイン/フラッシュ効果を追加発揮するかの確認待ち。
        // 承認されたら pid のリザーブから cost を払ってから action を解決する（resolveMagicは経由しない）
        pid: PlayerId
        cost: number
        cardId: string // 解決時に色と種別（マジック）を渡すため（【装甲】などの効果耐性。BURST.md §7）
    }
    revertTriggered?: {
        // 「〜できる」の確認を断ったとき、triggered / fieldEvent の「ターンに1回」の消費を巻き戻す対象
        // （revertActivated の誘発版。2026-09-16）
        instanceId: string
        effectId: string
    }
    revertActivated?: {
        // 起動能力（kind:"activated"）から出た選択を**やめた**ときに、「ターンに1回」の消費を
        // 巻き戻す先。起動ボタンを押してから対象を見てやめられるようにするためのもので、
        // やめた場合は「そもそも効果を発揮しなかった」扱いにして同じターンにもう一度起動できる
        // （2026-08-21 ユーザー確定。対象は timing:"main" の起動能力のみ＝BS08帝竜騎サイクル）。
        // doActivateAbility が resolveAction 後に立て、doResolveChoice がスキップ時に消す
        instanceId: string
        effectId: string
    }
    action: EffectAction // 選択後に resolveAction する本体
    actorPid?: PlayerId // action を「誰の効果として」解決するか。省略時は pid（選択者自身）。
    // **選択者と実行者が別**のケースで使う（BS02-012 ケンドラゴス：相手に色を選ばせて、破壊は発生源の持ち主の効果として行う）
    selfInstanceId: string | null // 発生源スピリット（self の復元用）
    // 中断された残りの処理は **GameState.resumeStack** が持つ（pendingChoice からは独立）。
    // かつてここに queue: EffectAction[] を持っていたが、EffectAction の列しか運べず、
    // 破壊ループの奥などからは中断できなかった。docs/design/RESUME_STACK.md §1
}

// 中断した処理の再開情報（GameState.resumeStack の要素）。
// **pendingChoice から独立している**のが要点：選択待ちの内側に継続を持つと、
// 選択待ちを立てられない深い場所では継続も保存できない。docs/design/RESUME_STACK.md §2
export type ResumeFrame =
    | {
          kind: "action" // 効果アクションを1つ解決し直す
          selfInstanceId: string | null // 発生源（self の復元用）
          action: EffectAction
          actorPid?: PlayerId // 省略時は再開を駆動している側の pid として解決する
          recordScope?: string
          // ここから下は fieldEvent 誘発の残りを積むときに使う（2026-08-17）。
          // fieldEvent は「self＝イベント対象／発生源＝エントリを持つカード」がずれることがあり、
          // 発生源の色・種別を渡さないと装甲やマジック効果耐性の判定が self 側から導出されて誤る
          // 「〜できる」（optional）の誘発の残りを積むときに入れる。再開時は**発動確認から始める**。
          // 入れないと2枚目以降が確認なしで自動発動してしまう（同名ネクサスを並べたときに出る）
          confirmPrompt?: string
          // 解決の直前に出すログ（ステップ誘発の「〜の効果が発動した」を再開経路でも残すため）
          logText?: string
          // この instanceId が**破壊待機状態でなければ何もしない**（docs/design/TIMING_CHART.md）。
          // 破壊で誘発した効果を1列に並べたとき、途中で「フィールドに残る／戻る」が解決すると
          // その破壊は無かったことになり、列の残りは空振りする。
          // ⚠️ 再開スタックからフレームを**消さない**のが要点。resolveInOrder の「残りは必ず積む」保証は
          // 積み忘れで実バグ4件を出して作られたものなので穴を開けず、消化時に無効化する
          requiresPendingDestructionOf?: string
          // 名前スコープの「ターンに1回」（onceScope:"name"）の効果。消化時に枠を取り、取れなければ何もしない
          onceClaim?: { instanceId: string; effectId: string }
          targetInstanceId?: string // 効果の対象（イベント対象を引き継ぐ）
          sourceColors?: Color[] // 発生源の色（self とずれるとき）
          sourceType?: CardType // 発生源の種別（同上）
      }
    | {
          // 列を**使い切ったあと**に実行するフレーム（省略可）。破壊で誘発した効果の列では
          // 「破壊の確定（トラッシュ行き）」をここに入れる。バッチは解決のたびに自分を積み直すので、
          // 外側から固定位置に積むと追い越されてしまう（docs/design/RESUME_STACK.md §3）
          after?: ResumeFrame
          kind: "triggerBatch" // 同時に発揮する誘発の束。1グループずつ解決し、2グループ以上残っていれば
          // そのたびにターンプレイヤーへ解決順を聞く（docs/design/TIMING_CHART.md §0-3）
          askPid: PlayerId // 解決順を決める側（＝ターンプレイヤー）
          // **グループは「カード単位」**。同じカードの複数エントリは「ドロー後、〜する」のように
          // テキストで順序が決まっているので、まとめて1つの選択肢として扱い、中は元の順で解決する
          groups: { label: string; frames: ResumeFrame[] }[]
      }
    | {
          // 【転召】の対象選択で中断した召喚の続き。
          // 手順（docs/design/RESUME_STACK.md §6）は
          // 「コストを支払う → 転召 → 維持コアを置く → 召喚完了 → 召喚時効果」なので、
          // 転召が選択待ちになった時点で**スピリットはまだ場に出ていない**。
          // 選択が解決したらここで場に出し、召喚時効果へ進む（2026-08-20）
          kind: "placeSummon"
          pid: PlayerId
          inst: CardInstance // まだ場に出していないインスタンス（維持コアは載っている）
          reserveDelta: number // 場に出すときリザーブから引く数（フィールドのコアで賄えた分を差し引いた残り）
          logText: string // 「〜を召喚した」のログ（場に出た時点で出す）
          cardName: string // クライアント演出用イベントに載せる名前
          braveTargetInstanceId?: string // ダイレクトブレイヴのとき、合体先スピリットの instanceId（BRAVE.md §5.2）
      }
    | {
          kind: "endTurn" // メインステップから直接ターンを終了し、経由したアタックステップの開始時誘発が選択待ちになったときの続き（PhaseManager.endTurn をやり直す）
      }
    | {
          kind: "turnStart" // ターン開始処理（start→core→draw前→ドロー→refresh→main）の続き。
          // ステップ誘発が選択待ちを立てたときに、次のステップ番号を積む
          step: number
          until?: number // 指定時はこの区間までで止める（BS15-X04 のアタックステップ後に行う1ステップ）
      }
    | {
          // 複数体をまとめて破壊する処理の続き。1体ごとに「破壊される代わりに復活**できる**」の
          // 確認で中断しうるので、**どこまで進んだか（index）と実際に破壊できた数（destroyed）**を持ち回る。
          // 数を持ち回るのは「この効果で破壊したスピリット1体につき」を中断をまたいで正しく数えるため
          // （docs/design/RESUME_STACK.md §7 ①）
          kind: "destroyBatch"
          ownerPid: PlayerId // after を解決する側（効果の持ち主）
          // context を対象ごとに変えられる（省略時はバッチ共通の context）。
          // バトルの相打ちは「ブロッカーを破壊したのはアタッカー／アタッカーを破壊したのはブロッカー」と
          // 破壊元が対象ごとに違うため、1つの同時破壊の中で使い分ける必要がある
          targets: { pid: PlayerId; instanceId: string; context?: DestroyContext }[]
          index: number
          destroyed: number
          context?: DestroyContext
          // このバッチが始まる前の state.destroyGroup（入れ子の破壊があっても正しく戻すため。
          // 完了時に state.destroyGroup へ書き戻す）
          prevGroup?: GameState["destroyGroup"]
          after?: {
              // 全体を破壊し終えたあとの処理（破壊できた数を使うもの）
              drawPerDestroyed?: true
              voidCoreToSelfPerDestroyed?: true
              selfInstanceId?: string // voidCoreToSelfPerDestroyed の置き先
              thenDrawFixed?: number // destroy.thenDrawFixed：破壊できた数によらず固定枚数ドロー（「その後」。BS14-010）
          }
      }
    | {
          // 破壊待機状態の続き（＞６）。破壊時の誘発が中断したときに、
          // **カードを破壊待機状態のまま**残して、残りの処理を後へ送るために積む。
          // step:1＝フィールドイベント誘発から／step:2＝破壊の確定（トラッシュ行き）だけ。
          // docs/design/TIMING_CHART.md §1.5
          kind: "destroyCommit"
          pid: PlayerId
          instanceId: string
          step: number
          byBattle: boolean // 誘発の絞り込み（byBattleOnly）用。破壊時の DestroyContext から取る
          wasAttacker: boolean // 同上（attackerOnly）。バトルが終わると判定できないので破壊時に控える
          bySpiritEffect: boolean // 同上（byOpponentSpiritEffectOnly）。相手のスピリットの効果による破壊だったか
          byOpponentEffect: boolean // 同上（byOpponentEffectOnly）。相手によって破壊された（効果 or バトル敗北）か。BS12-005星角獣ユニゴーント
          sourceInstanceId?: string // 同上。その効果を発揮したスピリットのインスタンスID（DestroyContext.sourceInstanceId）
      }
    | { kind: "burstFinish"; stage: "finish" | "settle" | "notify"; pid: PlayerId; cardId: string; actionType: EffectAction["type"]; thenPay?: "main" | "flash"; toHand?: true; alsoDraw?: true; before: string[] }
    | {
          // バウンス待機状態の続き。**移動はすでに済んでいて、残りの誘発だけ**を後へ送る。
          // 戻ったカードはもうフィールドに無いので、誘発に渡すインスタンスをそのまま持ち回る
          kind: "bounceFlush"
          moved: { pid: PlayerId; inst: CardInstance; to: "hand" | "deckTop" | "deckBottom" }[]
          index: number
      }
    | {
          // ネクサスの破壊処理（＞６）の続き。誘発が中断したときに、
          // **ネクサスを破壊待機状態のまま**残して残りを後へ送る。docs/design/TIMING_CHART.md §1.5
          kind: "destroyNexusCommit"
          pid: PlayerId
          instanceId: string
          step: number
          byOpponentEffect: boolean // 「相手の効果で破壊されたとき」限定エントリの判定材料
      }
    | {
          // バトル解決（＞５のBP比較が終わった後 〜 ＞７のバトル終了宣言）の続き。
          // 破壊処理・各誘発・【呪撃】・【光芒】のどこでも選択待ちが立ちうるので、
          // **1ステップ＝中断しうる呼び出し1つ**に割って step で再入する。
          // docs/design/TIMING_CHART.md（＞５〜＞７）／RESUME_STACK.md §7
          kind: "battleResolve"
          step: number // 次に実行するステップ番号（BATTLE_STEPS の並び）
          attackerPid: PlayerId
          attackerInstanceId: string
          blockerInstanceId: string
          outcome: "attackerWins" | "blockerWins" | "mutual" | "none" // ＞５のBP比較の結果（＞６以降で覆らない）。none＝器AV（BS13-082）でBP比較自体を飛ばした
          attackerColors: Color[]
          blockerColors: Color[]
          attackerLevel: number
          blockerLevel: number
          attackerBp: number
          blockerBp: number
          // 破壊された個体は場から消えるが、『相手のスピリットに破壊されたとき』（onBattleLose）や
          // ログのカード名は破壊後にも参照する。中断をまたぐと元の参照が失われるので、
          // ＞６に入る直前の写しを持ち回る（coresAtDestruction は destroySpirit と同じく破壊直前のコア数）
          attackerSnapshot: CardInstance
          blockerSnapshot: CardInstance
      }
    | {
          // ライフで受けたバトルの、ライフが減ったあと 〜 ＞７のバトル終了宣言の続き。
          // ライフ減少後バースト（＞５ ２Ｌ）はバトル中に解決するので、その確認で中断してもバトルを終わらせない。
          // 終わらせると「このバトルが終了したとき」を指定する効果（絶甲氷盾）が空振りする（2026-09-28 発覚）
          kind: "lifeDamageResolve"
          step: number
          attackerPid: PlayerId
          attackerSnapshot: CardInstance
          dealt: number
          lifeTriggers: boolean // 「ライフが減ったとき」系を発火するか（ライフ0で敗北が決まったときは発火しない）
      }
