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
- **防ぐ効果ではないので貫通されないもの**：対象の変更（【影武者】【煌空蝉】。Q7415）、「対象にならない」（2026-10-29 ユーザー見解：効果を防ぐところには効いていない）。今の `ResistanceCategory` では `untargetable`・`magicRedirect`・`meisai`（指定時のコスト要求）がこちら

## 3. 分類（たたき台。ユーザーと1行ずつ精査する）

今の型の名前から、どの操作の問い合わせに入るかを振り分けた。**「?」は分類に迷う行**。

| 操作 | 禁止・耐性（今の型の例） | 迷う点 |
| :-- | :-- | :-- |
| 召喚 | `noBurstSpiritSummonForPid`・`noSummonByEffect`・`summonLimitByEffectForOpponent`・`summonLimitByCostForOpponent`・`maxSpiritsOnField` | ? `maxSpiritsOnField`（場の上限）は禁止か、ルールの上限か |
| 破壊 | `nexusIndestructible`・`ownNexusIndestructible`・`noBpCompareDestroy`・`immunityGrant` | ? BP比較の破壊（原因＝ルール）も同じ問い合わせに入れるか |
| 戻す | `allSpiritsCantBounce`・`immunityGrant` | |
| 手札に加える | `noHandGainByEffect`・`noTrashRecovery`・`opponentCantReturnFromTrashToHand`・`handGainBlocked` | ? ドロー（デッキが無いと敗北）は「手札に加える」と別の問い合わせか |
| ドロー | `noDrawInMain`・`noDrawOutsideDrawStep` | |
| 破棄（トラッシュに置く） | `noDeckMill`・`noDeckMillByOpponent`・`noDeckMillInMain`・`millCap`・`noHandDiscardByEffect`・`noHandDiscardInMain`・`handImmuneForPid` | ? `millCap`（枚数の上限）は禁止か、量を変えるもの（置換寄り）か |
| コアを取り除く | `coresCantBeRemoved`・`coresCantBeRemovedAll`・`coresCantBeRemovedByOpponent`・`battlingCoresProtected`・`coreFloorByCost` 等 | ? `coreFloor*`（N個より減らない）は量の制限で、許す／止めるではない |
| コアを置く | `noVoidToLife`・`coreGainCap`・`voidCoreBlockedOutsideCoreStep` | |
| ライフを減らす | `lifeImmuneForPid`・`ownLifeFloor`・`noLifeDamageByCost`・`ownLifeImmuneToSpiritEffects`・`cantReduceOpponentLife*`・`lifeDamagePerSpiritPerTurn` | ? 「1回に減るのはN個まで」は量の制限 |
| 疲労 | `exhaustImmunityGrant`・`opponentNexusesUnexhaustable`・`exhaustPreventByPay` | 払って防ぐ（`exhaustPreventByPay`・`targetNegateByHandDiscard`）は問い合わせの答えが「払えば止まる」になる |
| 回復 | `noRefresh`・`noRefreshByAnyEffect`・`noRefreshByNexusOrMagic`・`nexusesCantRefresh`・`opponentCombinedCantRefresh` | |
| 合体／分離 | `cantCombine`・`cantSeparate`・`opponentCantSpiritStateBrave` | |
| 効果を受けない（すべての操作に横断） | `immuneToOpponentEffects`・`immuneToOpponentSummonEffects`・`battlingEffectImmune`・`braveImmuneGrant` | 操作ごとではなく、全操作の問い合わせが共通に読む層か |
| **入れない候補** | アタック・ブロックの可否（`cantAttack`・`cantBlock`・`unblockableBy`…）、マジック・バーストの使用（`cantUseMagicForPid`・`noBurstEffectForPid`・`magicNegate`…）、コストの増減 | 効果の操作ではなくプレイヤーの行動の可否。別の問い合わせ（行動の可否）にするか |

## 4. PR の計画（案）

1. サテライド・バードの修正（HANDOFF §1）。「バースト効果の中か」を再開スタックに持たせ、召喚の全経路の候補判定から1つの関数を呼ぶ。この関数を「召喚できるか」の問い合わせの最初の形にする
2. 召喚の残りの禁止（§3 の召喚の行）を同じ問い合わせへ
3. ライフを減らす（ライフのコストと `lifeCrush` が同じ問い合わせを呼ぶ）
4. 以降、§3 の行ごとに1 PR
