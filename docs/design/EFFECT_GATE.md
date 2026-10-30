# 操作ごとの「できるか」の問い合わせ（下書き・2026-10-29）

禁止（「〜できない」）と耐性（「〜されない」「効果を受けない」）を、操作ごとの1つの問い合わせにまとめる計画。
同じ判定が「候補の列挙」「使用時・払える判定」「解決」「クライアントのボタン」に別々に書かれ、
片方の経路でだけ見落とすバグが続いた（#312・#315・#316・サテライド・バード）のが動機。

## 1. 決まったこと（2026-10-29 ユーザー合意）

- **問い合わせの単位は ACTION_VOCABULARY §3 の単純なアクション1つ**（召喚・破壊・戻す・ドロー・コアを取り除く…）。
  効果全体を実行前に1回判定するのではない（「その後」の後半は前半の結果で変わる）。操作を行うその時点で聞く
- 使用時・払える判定（COST_MODEL §1）は、同じ問い合わせを「試しに聞くだけ」（今の `probing`）で回す
- **置換効果（「代わりに〜する」）は入れない**。許す／止めるではなく中身を変えるため
- 複数の PR に分けて、操作の種類ごとに移す。この文書で問い合わせの種類と分類を先に決める
- **「〜されない／〜できない」は対象に取られることを防がない**（10-30 ユーザー確認で一般則にした。Q1711 の「破壊されない」から）。効果では候補に出し、操作の時点で止める。対象を防ぐのは「対象にならない」だけ。**コスト・【転召】は全部できる個体だけを候補にする**（COST_MODEL §1）。破壊（5b）・コア（5c）・疲労（5d）・回復・合体／分離はこれに従う
- **「〜することで」のコストは効果の一部**（10-30 ユーザー確認）。「〜の効果で／効果では」の制限はそのコストにも効き、コストの実行者・発生源の種類は効果と同じに扱う。効果ではないのは召喚・マジック・ブレイヴの使用コストの支払いとプレイヤーの操作だけ。ただし、効果が与えた払い方（ビクティムの「手札の破棄で払える」）や効果が要求するもの（「〜しなければブロックできない」）は、その効果による操作として扱う（10-30 ユーザー決定）

## 2. 問い合わせに持たせる情報（案）

今の `EffectAttempt`（`shared/rules/resistance.ts`：操作・対象指定か範囲か・誰の効果か・発生源の種類と色）に足す:

| 情報 | 例 | 読む禁止・耐性の例 |
| :-- | :-- | :-- |
| 動く元と先（`from`／`to`） | 手札→フィールド、トラッシュ→手札、デッキ→トラッシュ | 「トラッシュから手札に戻せない」「手札に戻らない」 |
| 原因（`cause`） | 効果／アタック／コスト／ルール（リフレッシュステップ・BP比較） | 「効果で」「コストで」「あらゆる原因で」 |
| 効果の種類 | バースト効果／召喚時効果／マジック／ネクサス | 「バースト効果で召喚できない」「相手の召喚時効果を受けない」 |
| 時点 | メインステップ中、自分のターン | 「メインステップ中はドローできない」 |

## 2.5 耐性の貫通（「〜の効果で防げない」）（2026-10-29 ユーザーと検討中）

例：BS45-X01 龍星の射手リュキオース【龍射撃】「この『BP破壊効果』は一切の効果で防げない」。
Q7409＝【装甲】・「効果を受けない」・「破壊されない」に防がれない。Q7415＝【影武者】【煌空蝉】で対象を変えることはできる。

- 耐性（`Resistance`）に**発生源**を持たせる：その耐性を書いているカード（種類・色・持ち主）と、キーワード（装甲系）か効果か。
  スピリット自身の効果文・キーワードの耐性は、そのスピリット自身が発生源
- 貫通は問い合わせ側（`EffectAttempt`）に「無視する耐性の条件」として持たせる。判定は「効く耐性を集める → 貫通に当たるものを外す → 残れば止まる」で、§1 の2段（効果を受けない／操作ごと）を区別しない
- 貫通は効果全体ではなく、その効果の中の1つの操作に付く（「この『BP破壊効果』は」）
- **「装甲を含む」は【装甲】【重装甲】と今後の「〇〇装甲」すべて**（2026-10-29 ユーザー確認）
- **「〜できない」型の制限も貫通される**（`coresCantBeRemoved*`「コアは取り除けない」・`nexusIndestructible` など。お互いに効くものも、効果で操作を防いでいるので同じ扱い。2026-10-29 ユーザー確認）
- **ブレイヴの【合体時】効果は、合体スピリットに効果を足す扱い**。発生源はブレイヴのカードではなく合体スピリット（色・種類は合体スピリットで見る）。「スピリットの効果で防げない」はブレイヴ由来の【合体時】の耐性も貫通する（2026-10-29 ユーザー確認。根拠：効果の記述を持たないスピリットに、合体中／スピリット状態の効果を持つブレイヴを合体すると「効果の記述を持つ合体スピリット」として扱う。カブトガメ・式鬼魔神のような効果の無いブレイヴは例外）
- 「相手のブレイヴの効果を受けない」（`braveImmune`）が防ぐのは、ブレイヴのカード自身が発揮する効果（召喚時・バースト・スピリット状態の効果）。【装甲】では防げなかったこれらを防げるのが【装甲】との違い（2026-10-29 ユーザー提示）。【合体時】効果は合体スピリットの効果なので `braveImmune` では防がない。今の `resistance.ts` はこの形（合体中の効果は sourceType "spirit" で来る）
- 貫通の書き方の一覧（batspi.com「カード効果：自分の効果は相手の効果で防げない」。2026-10-29 ユーザー提供）から、貫通は**2つの軸の組み合わせ**で書ける:

  | 軸 | 値 | 例 |
  | :-- | :-- | :-- |
  | どの操作に付くか | その効果の中の操作名（「BP破壊効果」「指定アタック」「コア除去効果」「除外効果」「手札/デッキに戻す」）／発生源の効果すべて（「自分の〇〇の効果は防げない」） | 【龍射撃】＝BP破壊効果、サンダー・Z・バイソン＝指定アタック |
  | どの耐性を無視するか | すべて（「一切の」「すべての」）／陣営（「相手の効果では」「お互いの」）／耐性の名前（「装甲」を含む・【PS装甲】・【弾幕】・【転神】…）／発生源の属性（色・コスト・カードの種類）。それぞれ「〜では防げない」（それを無視）と「〜以外では防げない」（それ以外を無視）の向きがある | 【龍射撃】＝すべて、サンダー・Z・バイソン＝「効果名に『装甲』を含む効果では防げない」 |
- 「指定アタック」も貫通の対象なので、**効果による指定アタックは問い合わせに入れる**（§3 の「入れない候補」から外す。【装甲】が防いでいるのは効果による指定）
- 例外：「フィールドに残る」効果（破壊後に待機から戻る）は防ぐ効果ではないので、貫通されても働く（同ページの裁定）。効果そのものを発揮できなくする（【レーザーボレー】の無効など）も貫通とは別
- **量の制限も同じ枠に入れる**（`coreFloor*`「N個より減らない」・`millCap`・`lifeDamagePerSpiritPerTurn` など）。問い合わせの答えは「止める／許す」に加えて「Nまで許す」を返す。量の制限も防ぐ効果なので貫通される（2026-10-29 ユーザー確認）
- **防ぐ効果ではないので貫通されないもの**：対象の変更（【影武者】【煌空蝉】。Q7415）、「対象にならない」（2026-10-29 ユーザー見解：効果を防ぐところには効いていない）。今の `ResistanceCategory` では `untargetable`・`magicRedirect`・`meisai`（指定時のコスト要求）がこちら

## 3. 分類（たたき台。ユーザーと1行ずつ精査する）

今の型の名前から、どの操作の問い合わせに入るかを振り分けた。**「?」は分類に迷う行**。

| 操作 | 禁止・耐性（今の型の例） | 迷う点 |
| :-- | :-- | :-- |
| 召喚 | `noBurstSpiritSummonForPid`・`noSummonByEffect`・`summonLimitByEffectForOpponent`・`summonLimitByCostForOpponent`・`maxSpiritsOnField` | `maxSpiritsOnField`（旋風渦巻く渓谷）は禁止。メインステップ中なら効果による召喚にも効き、貫通される（2026-10-29 ユーザー確認。今は通常の召喚にしか効いていない＝PR 2 で直す） |
| 破壊 | `nexusIndestructible`・`ownNexusIndestructible`・`noBpCompareDestroy`・`immunityGrant` | BP比較の破壊も同じ問い合わせ（`cause:"bpCompare"`）。耐性は効く原因を持つ：「効果で破壊されない」「効果を受けない」は効果のときだけ、`noBpCompareDestroy` と原因を限らない「破壊されない」はBP比較も防ぐ。貫通は効果の操作にだけ付く（2026-10-29 ユーザー確認） |
| 戻す | `allSpiritsCantBounce`・`immunityGrant` | |
| 手札に加える | `noHandGainByEffect`・`noTrashRecovery`・`opponentCantReturnFromTrashToHand`・`handGainBlocked` | 禁止は2種類：**行き先で効く**もの（「手札に加えられない」は、ドロー（効果）・戻す（手札へ）・手札に加えるのどれでも `to: hand` なら効く。今の `noHandGainByEffect` の形）と、**操作で効く**もの（`noDrawInMain` はドローだけ）。ドローはデッキ切れの敗北があるので操作としては別のまま（2026-10-29 ユーザー確認） |
| ドロー | `noDrawInMain`・`noDrawOutsideDrawStep` | |
| 破棄（トラッシュに置く） | `noDeckMill`・`noDeckMillByOpponent`・`noDeckMillInMain`・`millCap`・`noHandDiscardByEffect`・`noHandDiscardInMain`・`handImmuneForPid` | `millCap` は量の制限（§2.5） |
| コアを取り除く | `coresCantBeRemoved`・`coresCantBeRemovedAll`・`coresCantBeRemovedByOpponent`・`battlingCoresProtected`・`coreFloorByCost` 等 | `coreFloor*` は量の制限（§2.5） |
| コアを置く | `noVoidToLife`・`coreGainCap`・`voidCoreBlockedOutsideCoreStep` | |
| ライフを減らす | `lifeImmuneForPid`・`ownLifeFloor`・`noLifeDamageByCost`・`ownLifeImmuneToSpiritEffects`・`cantReduceOpponentLife*`・`lifeDamagePerSpiritPerTurn` | 「1回に減るのはN個まで」は量の制限（§2.5） |
| 疲労 | `exhaustImmunityGrant`・`opponentNexusesUnexhaustable`・`exhaustPreventByPay` | 払って防ぐ（`exhaustPreventByPay`・`targetNegateByHandDiscard`）は問い合わせの答えが「払えば止まる」になる |
| 回復 | `noRefresh`・`noRefreshByAnyEffect`・`noRefreshByNexusOrMagic`・`nexusesCantRefresh`・`opponentCombinedCantRefresh` | |
| 合体／分離 | `cantCombine`・`cantSeparate`・`opponentCantSpiritStateBrave` | |
| 効果を受けない（すべての操作に横断） | `immuneToOpponentEffects`・`immuneToOpponentSummonEffects`・`battlingEffectImmune`・`braveImmuneGrant` | 操作ごとではなく、全操作の問い合わせが共通に読む層か |
| **入れない候補** | アタック・ブロックの可否（`cantAttack`・`cantBlock`・`unblockableBy`…）、マジック・バーストの使用（`cantUseMagicForPid`・`noBurstEffectForPid`・`magicNegate`…）、コストの増減 | 効果の操作ではなくプレイヤーの行動の可否。別の問い合わせ（行動の可否）にするか |

## 4. PR の計画（§3 の「?」は 10-29 にすべて決着）

1. ✅ サテライド・バード（#319）。`burstSummonBlocked` を召喚の全経路の候補判定から呼ぶ
2. **召喚の問い合わせ**（設計を10-29に確定）
   - `server/src/logic/summonGate.ts`（新規）に `summonDenial(state, attempt): string | null`（止める理由。null＝召喚できる）。`attempt = { pid, cardId, from: "hand"|"trash"|"burst"|"deck"|"revealed", cause: "normal"|"effect", flash?: true, braveTargetInstanceId?: string, viaBurstAction?: true }`
   - 集める禁止：`noSummonByEffect`（cause effect）・`noBurstSpiritSummonForPid`（今の `burstSummonBlocked`）・`maxSpiritsOnField`（メインステップ中、cause を問わない。ダイレクトブレイヴは体数が増えないので対象外のまま）・`summonLimitByCostForOpponent`・`summonLimitByEffectForOpponent`（from:"hand" だけ）
   - 呼ぶ所：通常の召喚（RuleValidator の validateSummon・【烈神速】）と、効果による召喚の候補判定・安全網（今 `burstSummonBlocked`／`summonByEffectBlocked` を呼んでいる所すべて）
   - **一般則（10-29、旋風渦巻く渓谷で確認）：召喚の制限は、効果文に「通常の召喚」と書かれていなければ効果による召喚にも効く**。旋風渦巻く渓谷・夢想法師サンゾール・未完成の古代戦艦：帆の3枚が、今は通常の召喚にしか効いていない
   - 2a に入れないもの：効果の種類の持ち回り（#319 の既知の制限）は 2b、`summonRepeatFromHand` の統一は 2c（挙動を変えない作業なので分ける。10-29 ユーザー了承）
   - ✅ **2b の設計（10-30 確定）**：「いまバースト効果そのものを解決中か」を `state.currentEffectSource.burst` で持つ（解決中の印 `resolvingBurstPid` の置き換え）。
     立てるのはバースト効果の入口4か所（`keywords/burst.ts` の2か所・`choice.ts` のバースト確認後・`handBurstEffect.ts`）。
     入れ子の `resolveAction` は、**発生源のインスタンスが無く同じカードの解決**（バースト効果の子のアクション）だけが引き継ぐ。召喚されたカードの召喚時効果など、別の効果の解決は発生源が変わるので引き継がない（＝#319 の既知の制限が直る。バーストで召喚されたゾロ自身の召喚時効果も、インスタンスがあるので引き継がない）。
     選択待ち（`PendingChoice`）・再開スタック（`ResumeFrame`）を作るときに `burst` を保存し、再開で戻す。
     読む側（`summonGate.ts`・`removal.ts` の `ownBurstOnly`・`triggers.ts` の `burstSummonOnly`）を `currentEffectSource.burst` に移し、`resolvingBurstPid` は消す
   - **2c の設計（10-30）**：`summonRepeatFromHand`（データは兵隊アントマン1枚）を `summon{from:"hand", repeatWhileChosen, payCost, skipOnSummon}` で書く。
     「まとめて選び、合計コストを1回で払う（【転召】の対象は決定の後・支払いの前。10-15 ユーザー確認）」は手順の違いなので、`summonRepeat.ts` はそのまま残し、内部専用の type（`summonBatchPaidInternal`）にする。`summon{from:"hand"}` の入口が `repeatWhileChosen && payCost` のときそちらへ振り分ける。`mode:"free"` は使うカードが無いので消す
3. ✅ **貫通の最初の形**（#324）：`EffectAttempt.pierce:"all"`（一切の効果で防げない）だけを入れた。耐性の発生源（色・種類で絞る貫通に要る）は、該当カードを取り込むときに足す。元の案：**耐性に発生源、問い合わせに貫通**（§2.5）。今のプールに貫通のカードは無いので、型と判定の形だけ入れ、場面テストは【龍射撃】相当を組んで確かめる
4. ライフを減らす（ライフのコストと `lifeCrush` が同じ問い合わせを呼ぶ。量の制限を含む）
   - **ライフを減らす処理なら原因を問わず（アタック・効果・コスト）、ライフの制限はすべて効く**。減ったコアの行き先（リザーブ・ボイド・トラッシュ）も問わない。効果文の「スピリット」はお互いのスピリットを指すので、自分のスピリットの効果のコストで自分のライフを置くのも「そのスピリットから減らされた」に数える（10-30 ユーザー確認）
   - 「お互いのライフは、ターンごとにスピリット1体から1まで」は**プレイヤーごと**に数える（スピリットXが相手のライフを1減らした後でも、自分のライフはXからまだ減らされていない。10-30 ユーザー確認）。記録は「スピリット×減らされた側」の組ごとに持つ（今は `lifeDealtThisTurn` がスピリットごとに1つ）
   - ✅ **4 の設計（10-30 確定。#325）**：`server/src/logic/lifeGate.ts`（新規）に `lifeLossAllowed(state, a): number`（0〜amount。量で答える）。`a = { pid（減る側）, amount, cause: "attack"|"effect"|"cost", actorPid, sourceType?, sourceInstance?（アタッカーや効果の発生源のスピリット）, floor?（その効果だけの下限。neverZero 用） }`。
     集める制限：`lifeImmuneThisTurn`（原因を問わない）・`cantReduceOpponentLife`（actor≠pid）・`ownLifeImmuneToOpponentSpiritEffects`（cause effect・sourceType spirit・actor≠pid）・下限（`lifeFloorByEffect`・`ownLifeFloorContinuous`・永久凍土の王都の `ownLifeFloor`。今の `lifeCostBlocked` の床もここへ）・スピリット1体からの上限2種（`lifeDamagePerSpiritRemaining`・`ownLifeDamageCapRemaining`。原因を問わず、記録は組ごと）。
     アタックだけの制限（`negateLifeDamageFromTarget`・`lifeDamageMaxForPid`・`noLifeDamageByCost` など）は今の `lifeDamageLimit` に残し、共通の分は `lifeDamageLimit` から `lifeLossAllowed` を呼ぶ。
     減らした後の記録（`recordLifeLost`・組ごとの累計）も1つの関数にする。呼ぶ所：ライフを減らす全11か所（`grep -rn "\.life -=" server/src/logic`）。コストは「全部払えるか」（`lifeLossAllowed < amount` なら払えない）で、`lifeCostBlocked` はこれで置き換える
   - 4 の裁定（10-30 ユーザー確認）：「ターンごとにスピリット1体から1までしか減らされない」は、チャンプボンゴル型（お互い）もシーマ・クリーク型（自分だけ）も、そのスピリットのアタックと効果を合算して数える（今はシーマ・クリーク型がアタックだけ）
5a. ✅ **手札に加える問い合わせ**（設計を10-30に確定。#326）
   - `server/src/logic/handGate.ts`（新規）に `handGainDenial(state, { pid, from: "deck"|"trash"|"revealed"|"field"|"other", cause: "effect"|"rule" }): string | null`。集める禁止：`noHandGainByEffect`（cause effect。今の `handGainBlocked`）・`noTrashRecovery`／`opponentCantReturnFromTrashToHand`（from trash）
   - 「トラッシュから手札に戻せない」は、今は `moveCards` だけが見ている。トラッシュから手札へ移す経路（`returnTrashCardToHand`・【光芒】・`takeLast`・エンドステップの戻し・ショーグンペンタンの `thenHandIfNameIncludes`）すべてに効かせる
   - **破壊時に「このスピリットは手札に戻る」は対象外**：破壊されたスピリットは破壊待機状態で、トラッシュに行っていない（ACTION_VOCABULARY §2。10-30 ユーザー再確認）
   - 天蒼元帥チョウハッカイの公式Q&A（10-30 に照合。smoke part696）：手札に加えられないオープン中のカードは、残りの行き先（デッキの上など）へは行かず破棄される（Q3589・Q4506。以前は「選ばれなかった扱い」で残りと同じ行き先へ送っていた）。「手札を増やせない」はプレイヤーに掛かり、手札に戻す効果はまるごと解決されない（Q3590・Q5341）。ドローステップの「ドローの枚数+1」は手札を増やす効果ではない（Q3592。灼熱の谷のデータを `drawStepBonus` に直した）。ドローできないなら「〜しないことで、ドローする」は選べない（Q22193）
   - 保留：使ったマジックを効果発揮後に手札へ戻す（`returnLastUsedMagicToHand`。26RBS01-X14 巨雷ゼーロトルだけ＝このリポジトリのプールに無い）
5b. ✅ **破壊の問い合わせ**（設計を10-30に確定。#327）
   - `server/src/logic/destroyGate.ts`（新規）に `destroyDenial(state, { ownerPid, target, cause: "effect"|"cost"|"bpCompare", actorPid, sourceType?, sourceColors? }): string | null`。集める禁止：`nexusIndestructible`・`ownNexusIndestructible`（ネクサス）・`noBpCompareDestroy`（cause bpCompare）。効果を受けない系は今の `resistanceAgainst` のまま
   - **「破壊されない」は対象に取られることは防がない**：効果での破壊では、破壊されないネクサスも候補に出して選べ、選んだら破壊されない。マジックも使える。根拠は Q1711（要塞皇オーディーンがいるとき、相手が使ったバスタースピアでネクサスは破壊されない＝使用はできる。10-30 ユーザー了承）
   - **コストの破壊**（「自分のネクサスを破壊することで」）は、破壊されないネクサスを候補から外す（全部払えなければ払えない。COST_MODEL §1）
   - データの食い違い：ノルンの泉 Lv2・巨人騎士アルダス・サファイアの城壁 Lv2 は「相手のスピリット/ネクサス/マジックの効果では」なのに `sourceTypes` が無く、自分の効果や相手のブレイヴの効果まで止めていた。`sourceTypes:["spirit","nexus","magic"]` を足す
5c. ✅ **コアを取り除く問い合わせ**（設計を10-30に確定）
   - `server/src/logic/coreGate.ts`（新規）に `coreRemovalAllowed(state, a): number`（0〜amount。量で答える）。`a = { ownerPid, target, amount, cause: "effect"|"cost"|"tensho"|"player", actorPid, sourceType?, pierce?: "all" }`。`player`＝プレイヤーの操作（コアの移動・ソウルコアの交換）
   - 0 にする禁止：`coresCantBeRemoved`（個体。原因を問わない）・`coresCantBeRemovedAll`（`exceptOwnerEffects` が通すのは cause effect かつ actor＝持ち主だけ。持ち主自身の支払い・コアの移動・【転召】は止まる＝RULES_BATSPI_WIKI「コストの支払いも止める」09-09。cause tensho は通す＝セフィロ・アリエスの「【転召】以外で」）・`coresCantBeRemovedByOpponent`／`coresImmovableByOpponent`（cause effect・actor≠持ち主）・バトル中の保護 `battlingCoresProtected`／`blockerCoresProtected`（原因を問わない）。それ以外は下限 `coreFloorFor` まで。`pierce:"all"` は cause effect のとき全部を無視（§2.5）
   - **「取り除けない」は対象に取られることを防がない**（Q1711 の「破壊されない」と同じ。10-30 ユーザー確認）：効果のコア除去では候補に出し、取り除く時点で止める。`resistance.ts` の `coresLocked` 3行は消す（【装甲】など「効果を受けない」は残す）。**コストと【転召】は、全部動かせる個体だけを候補にする**（COST_MODEL §1・SOULCORE §2）
   - 原因を問わず効く（下限は08-24「動かし方を問わず」、取り除けないは RULES_BATSPI_WIKI「コストの支払いも止める」）。待機状態の個体にも効く（待機前からの常時効果は発揮したまま。PENDING_STATE §1）。魔影街（【呪撃】で破壊される個体のコアをボイドへ）は効果のコア除去として扱う
   - 呼ぶ所：`removal.ts` の取り除く4関数（今の保護と下限の判定を置き換え）、`removeCores.ts`・`cores.ts` の下限の直接判定、プレイヤーの支払い（`validatePaySources`・`autoPayPlan`・`brave.ts` の2か所）、効果のコスト（`moveRichestSpiritCoresToTrash`・`fieldCoresSpendable`・起動の `selfCoresToTrash`・`selfCoresToVoid`・復活のコスト・`reviveLastDestroyedNexus`）、プレイヤーの操作（RuleValidator のコア移動・交換・【覚醒】の移動元）、【転召】の候補（`tenshoCandidates`）、`jugeki.ts`
   - 既知の限界：ネクサス上のコアは問い合わせを通さない（ネクサスのコアを守る効果がプールに無い）。破壊待機の個体のコアを効果で移す `destructionCoresToOwnSpirit` は通さない。起動能力のボタンは、取り除けない状態でもクライアントでは消えない（共有層から `coreRemovalAllowed` を呼べないので、押すとサーバーが拒否する）。`pierce` を渡すカードはまだ無い
5d. ✅ **疲労の問い合わせ**（設計を10-30に確定）
   - `server/src/logic/exhaustGate.ts`（新規）に `exhaustDenial(state, { ownerPid, target, actorPid?, sourceType? }): string | null`。actorPid／sourceType の省略＝ルールやプレイヤー自身の操作による疲労（アタック・ブロック・コスト）
   - 集める禁止：`exhaustImmunityGrant`（actor≠持ち主かつ sourceType があるときだけ。軸 `sourceTypes?: CardType[]` を足し、トランプの王国は `["spirit","nexus","magic"]`＝ブレイヴ自身の効果は通す）・`opponentNexusesUnexhaustable`（発生源から見た相手のネクサス。原因を問わない）
   - 呼ぶ所：`state/exhaust.ts` の `exhaustSpirit`／`exhaustNexus`（入口がここだけなので、中で聞く）。`exhaustSpirit`／`exhaustNexus` は実際に疲労したかを boolean で返し、数を数えてログに出す呼び出し側はそれを使う。`canExhaustNexus`（コストの候補）は `exhaustDenial` を呼ぶ形にする。`resistance.ts` の `exhaustImmune` は消す（対象には取れる）
   - 発生源の種類が分からない相手の効果（発生源なしの解決）は、`sourceTypes` があっても耐性を効かせる側に倒す。トランプの王国の「ブレイヴ自身の効果は通す」を確かめる場面は無い（持ち主のアタックステップ中に相手がブレイヴを召喚できないため）
   - 入れないもの：ブロック時に疲労しない4枚（`noRestWhenBlocking*`。ブロックの手順で、効果の疲労ではない）・払って防ぐ `exhaustPreventByPay`（置換に近い選択なので `exhaustSpirit` の中のまま）
5e. ✅ **回復の禁止**（10-30）
   - 新しいファイルは作らない。回復の入口 `refreshSpirit`（`state/exhaust.ts`）が問い合わせを兼ねる：原因を問わない禁止（`noRefreshUntilOwnEndSteps`・スクルディアの指定）と効果に限った禁止（`noRefreshByNexusOrMagic`・`noRefreshByAnyEffect`）はここで止める。sourceType の省略＝リフレッシュステップ
   - 『リフレッシュステップ』に限った禁止（`noRefresh`・`skipRefresh`・`nexusesCantRefresh`・`opponentCombinedCantRefresh`）と `refreshOnlyOneUncombined` は、リフレッシュステップの手順（`PhaseManager.ts`）に残す。「次のリフレッシュステップで」の記録をそのステップで使い切る作りのため
   - 直したもの：スクルディアの指定がリフレッシュステップでしか効いていなかった／【超覚醒】とモクバオーの回復が発生源の種類を渡さず、渦巻く大海峡を素通りしていた。モクバオーは回復できなければ合体もしない（CONJUNCTION「Aし、Bできる」）
   - 入れないもの：ネクサスを効果で回復させる経路（`exhaustRefresh.ts`）は、効く禁止が無いので入口を通さない
5f. ✅ **戻すの問い合わせ**（10-30。#332）
   - `server/src/logic/bounceGate.ts`（新規）に `bounceDenial(state, { ownerPid, target, to: "hand"|"deckTop"|"deckBottom"|"burst", actorPid?, sourceType? }): string | null`。actorPid 省略＝プレイヤー自身のコスト
   - 集める禁止：`allSpiritsCantBounce`（金狐角。to hand だけ、原因を問わない）・`immunityGrant{against:"bounce"}`（to hand だけ、actor≠持ち主。軸 `sourceTypes?: CardType[]` を足し、恐竜姫ジュラ・転生の谷・タルタルガーは `["spirit","nexus","magic"]`＝ブレイヴ自身の効果は通す）
   - **「手札に戻らない」はデッキへ戻す効果を止めない**。今は耐性の判定（op "bounce"）がデッキへ戻す効果にも効き、金狐角は行き先を問わず止めていた
   - 呼ぶ所：`removal.ts` の `markBounce`（戻すはすべてここを通る。誰の効果かは `currentEffectSource` で見る。止めたら false を返す）。`resistance.ts` の `bounceImmune` は消す（対象には取れる）。コストで戻す候補は止められる個体を外す
5g. **ドロー・合体／分離**：直すものなし（10-30 に洗った）。ドローは入口 `draw()` が2つの禁止を見ていて、デッキから手札へ移す別経路も無い。分離は `detachBraveByEffect`／`detachBraveByOwnerChoice` の両方で `cantSeparate` を見ている。合体は候補（`braveCombineCandidates`）で `cantCombine` を外す（合体はプレイヤーの行動の一部なので候補で外す）。スピリット状態の禁止は検証と残す確認の両方で見ている
5c'. **コアの問い合わせのコストの区別**（10-30。**入れない**）：上の一般則に合わせるなら、「Nコストを支払うことで」・起動能力・復活のコアのコストは `coreRemovalAllowed` に cause effect で聞くことになる。変わるのは八分儀の祠 Lv2 だけで、それが働く『相手のメインステップ』にターンプレイヤーがこれらのコストをスピリットのコアから払う場面が今のプールに無い（起動能力はアタックステップ限定、「コストを支払うことで」はバースト効果だけ）。該当カードを取り込むときに足す。「コアを〜置くことで」（エリミネイション型）は 5c の時点で効果として扱われていて、八分儀の下でも払える（smoke part693）
5h. ✅ **デッキの破棄の問い合わせ**（10-30）
   - `server/src/logic/zones/mill.ts` に `millAllowed(state, { pid, count, actorPid?, sourceType? }): number`（0〜count）。`millDeck` の中の判定を移す
   - 0 にする禁止：エンドステップの封印（`deckMill`）・`noDeckMill`・`noDeckMillInMain`（main）・期間つき `noDeckMillForPid`・`noDeckMillByOpponent`（ディスコンティニュー・鳳翼の聖剣。**効果文に「相手の効果で」が無いので、自分の効果・コストも止める**＝パイルドラコの `noDeckMillForPid` と同じ読み。今は相手の効果だけ止めていた）
   - 量の制限：`millCap`（1回・perTurn・bothSides は actor≠持ち主のとき。軸 `sourceTypes?: CardType[]` を足し、侵されざる聖域・エターナルシールドは `["spirit","nexus","magic"]`）・mutual（キグナ・スワン Mk-II・リトル・ビッケン。誰の効果・コストでも）
   - 呼ぶ所：`millDeck`、`millDeck` を通らずにデッキを破棄している経路（`actions/mill.ts` の `runMillUntilMagicCastFree`・`revive.ts` の `millSelfOneMatching`／`millSelfCount`・`EffectModules.ts` の `lifeDamageMillGuard`・`keywords/funsai.ts`）と、払えるかの判定（`actions/pay.ts`）。できるだけ `millDeck` を通す形にして、累計（perTurn・mutual）も数える
   - 累計：`noteMilled` が数える。perTurn の上限の種類の指定はブレイヴを外す形しか無いので、ブレイヴの効果の分だけ別に数える（`millCountThisTurnBrave`）
   - 入れないもの：`deckMillNegate`（払って無効にする選択。`millDeck` の中のまま）。エターナルシールドの「6枚以上破棄されない」は1回あたりのまま（累計かは未確認）。`shared/cost.ts` の払えるかの判定（クライアントの表示用。`noDeckMill` だけ見る。サーバーが最後に止める）
5i. ✅ **手札の破棄の問い合わせ**（10-30）
   - 入口は `shared/rules/constraints.ts` の `canDiscardHand(board, pid)`（クライアントの起動能力のボタンも読むので共有層のまま）。`noHandDiscardInMain`（満天の牧草地「手札を破棄できない」）は原因を問わず止め、`noHandDiscardByEffect`（天蒼元帥チョウハッカイ「効果で」）も、今ある手札の破棄はすべて効果に当たるので常に止める
   - 効果に当たるもの：効果と「〜することで」のコスト（起動能力・手札の能力・BS10-X05 のコストを含む）に加え、ビクティムの「召喚コストを手札の破棄で払える」（効果が与えた払い方）とブロックのコスト（「手札のマジックを破棄しなければブロックできない」＝効果が要求する破棄）（10-30 ユーザー決定）
   - 足す所：起動能力の手札コスト（`RuleValidator` の `discardHandFamily`／`Color`／`Keyword`／`discardHandOne` と、`shared/rules/activation.ts` の同じ判定）・手札の能力（`validateUseHandAbility` の `discardSelf`）・ビクティム（`validateSummonHandDiscard`）・ブロック（`validateBlock` の `blockCost` のマジック破棄）・BS10-X05（`actions/mill.ts`）
   - 相手の手札を破棄する効果は、`handImmuneFor`（月光集める塔・五角形の砦「自分の手札は相手の〜の効果を受けない」）も見る。今は `discardHand` だけが見ていて、`randomOpponentHandMagicDiscard` が素通り
5. 以降、§3 の行ごとに1 PR（手札に加える＝行き先で効く禁止、破壊＝BP比較を含む、コアを取り除く＝量の制限、…）
5j. ✅ **コアを置くの問い合わせ**（10-30）
   - `server/src/logic/coreGainCap.ts` に `coreGainAllowed(state, { pid, from: "void"|"trash"|"reserve", to: "life"|"field"|"reserve", count, srcType? }): number`（0〜count）。止める禁止：モンゴクウ（ボイド→フィールド/リザーブ、コアステップ以外。原因を問わない）・古代戦艦：船尾／熊人ラーテシード（`noVoidToLife`）・エンドステップの封印（`lifeChargeFromVoidOrReserve`）。量の上限：黒き聖杯・魂の海塔（`coreGainCap`。今の `coreGainAllowance`）
   - 呼ぶ所：`placeCoresLegacy` の冒頭の3つの判定、`pay` の `placeCores` の払える判定（上限で count に足りなければ払えない）、復活に付く「ボイドからリザーブへ」（`revive.ts` の `alsoVoidCoreToReserve`）、【烈神速】の検証（トラッシュのコアすべてをフィールド/リザーブへ、スピリットの効果）
   - 公式Q&A（10-30 に照合）：魂の海塔「ボイドからコアを増やせない」はライフに置くことも止める（Q22432）・プレイヤーに掛かるので【装甲】で防げない（Q22434）。船尾の下では「ライフに置くことで」の続き（シユウのデッキ破棄とブロックされない・オフィエルのバーストの破棄）も起きない（Q20150・Q3721）。夢幻祈祷はライフに置けなくてもフラッシュ効果は発揮できる（Q24967）。黒き聖杯の下では【烈神速】（スピリットの効果）はコアが1個しか動かせず使えない（Q22409）。モンゴクウには該当するQ&Aが無い
