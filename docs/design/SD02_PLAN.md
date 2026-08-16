# SD02「轟天のヘヴンズドア」の取り込み計画

構築済みデッキ SD02（全21種）。**主題は【転召】**で、「【転召】の対象（生贄）になったとき」を
引き金にするスピリットが5枚入っている。既存の `onTenshoTarget` トリガー
（BS08-040 天使オリフィア／BS08-049 獣司祭ガーネスで実績あり）の上に載る。

## 0. 進め方（2026-08-16 ユーザー判断）

**軽いものから段階的に入れる。** 新しい器が19件あり、一度に入れると問題が出たときの切り分けが難しいため。

| 段階 | 中身 | 状態 |
| :-- | :-- | :-- |
| **1** | 既存の器で書ける6種 ＋ 小さい器で済む7種（001/002/003/006/010/015/016） | **完了**（13種。テストは `part203.ts`） |
| **2** | 重いもの8種（004 / 005 / 007 / 009 / 011 / 012 / 013 / 014） | **完了**（テストは `part204.ts`） |

## 1. 確認して確定した解釈（2026-08-16 ユーザー確認）

### SD02-013 転召の祭壇 Lv2 の「コスト+3」は、生贄にできる対象を広げる効果

> 『自分のメインステップ』【転召】を持つスピリットカードを召喚するとき、
> そのスピリットカードと同じ系統を持つ自分のスピリットすべてをコスト+3する。

**目的は【転召：コスト3以上】の条件を満たしやすくすること。** 召喚コストが上がるのではなく、
自分のスピリットが「コスト+3されたもの」として扱われ、**低コストのスピリットも生贄にできるようになる**。

実装は既存の `alsoCostGrant`（道化師クラン＝「コストNのスピリットとしても扱う」）の**相対値版**。
`instHasCost` / `instMatchesCostFilter` が見る `CardInstance.alsoCostsContinuous` に足す。

### SD02-012 天の城門 Lv1 は、そのアタック分を丸ごと防ぐ

> 【転召】を持たない相手のLv1スピリットのアタックによって自分のライフが減らされるとき、
> 自分のデッキを上から1枚破棄する。そのカードがスピリットカードのとき、自分のライフは減らされない。
> さらに、【転召】を持っていたとき手札に加える。

- **シンボル数に関係なく、そのアタックではライフが1も減らない**（`lifeDamageLimit` の `max:0`）。
  「1個だけ防ぐ」ではない
- 「手札に加える」は**スピリットカードだった場合のさらなる条件**。
  破棄したカードがスピリットカードで、かつ【転召】を持っているときに手札へ加える
- 「さらに」は同時発揮（[CONJUNCTION.md](./CONJUNCTION.md)）なので、
  ライフを守るのと手札に加えるのは分けない

⚠️ ライフの「減らない／〇しか減らない」は**すべて `shared/rules.lifeDamageLimit` に集約する**。
門番を並べない（HANDOFF §9 の設計）。ただしこの効果は**デッキ破棄という副作用を伴う**ので、
純粋な述語である `lifeDamageLimit` には入れられない。
副作用のあるものは `GameEngine.resolveLifeDamage` 側で見る（六花の司書長サーガと同じ扱い）。

### SD02-009 獣将軍クジャルタ：手札に戻ったとき、コアは**リザーブ**へ

> このスピリットが【転召】の対象になったとき、このスピリットを手札に戻すことで、
> このスピリット上のコアすべてを指定場所に置いたものとして扱う。

「指定場所に置いたものとして扱う」は**【転召】の条件を満たすための扱い**であって、
実際にトラッシュ/ボイドへ送るわけではない。手札に戻る＝通常のバウンスなので、
**上のコアはリザーブへ行く**。BS05 の竜使い6枚（疲労版）が「実際にはコアを失わない代替」なのと同じ考え方で、
既存の `tenshoCoreSubstitute` に mode を足す形で実装する。

### SD02-007 犬兵バーナルド：**自分が疲労していてもブロックできる**

> このスピリットは、コスト3以下の相手のスピリットすべてを疲労状態でブロックできる。

「疲労状態で」の主語は**このスピリット**。通常は回復状態でないとブロックできないが、
このスピリットは疲労中でもブロックできる（相手がコスト3以下のときだけ）。
ブロックした相手を疲労させる効果ではない。

### SD02-014 魔法監視塔 Lv2：無効にしたら**必ず**デッキの下へ戻る

> 相手がマジックの効果を使用したとき、その効果を無効にできる。その後、このネクサスをデッキの下に戻す。

無効にするかどうかは任意（「できる」）だが、**無効にしたら「その後」の前後関係で必ず戻る**。
戻すことがコストではない（先払いではない）。使い捨てのカウンター。

## 2. 器の割り当て

### 既存の器だけで書ける（6種）

| カード | 使う器 |
| :-- | :-- |
| SD02-008 犀銃士グライノス | `destroy` + `costFilter` ／【強襲】 |
| SD02-017 ストロングドロー | `draw` + `discardSelfChoose` ／ `bpBuff` |
| SD02-018 猛将ドラグロン | `onTenshoTarget` + `destroy` `filter{maxBp, keywordExclude}` |
| SD02-019 黒騎士シュヴァルト | `onTenshoTarget` + `coreRemoveMulti` `dest:"trash"` `keywordExclude` |
| SD02-020 虹翼のジュエルグ | `onTenshoTarget` + `coreGain` |
| SD02-021 獣機セイ・ドリル | `onTenshoTarget` + `returnToDeckTop` `filter` |

### 新しい器が要る（12種・16件）— 段階1でさらに2件が「既存で足りた」

**段階1（小さいもの）**

| カード | 要るもの |
| :-- | :-- |
| 001 奇獣プーシャン | **不要だった**。既存の `colorAs`（継続。百面相のフラットフェイス／妖精ティングリー）でそのまま書ける |
| 002 ミザール | **既存の `sameCostAsBlocker` が転用できた**。ただし実体は「イベント対象と同じコスト」で名前と食い違っていたため `sameCostAsEventTarget` へ改名した（onBlocked＝ブロッカー／onBlock＝アタックしている相手）。あわせて `exhaustAll` が `filter` の cost 軸を見るようにした |
| 003 天使デュナミス | **不要だった**。`endAttackStepAfterBattle` アクションは既にある（サイレントウォール）。条件は既存の `targetMaxCost` |
| 006 鼬の暗殺者ウィゼーブ | `deployNexus` の `colors` を任意にした（省略時は色不問） |
| 010 轟剣士レーヴェン | `destroyOnePerCost` を新設（コストごとに `destroy count:1` へ委譲し、中断したら残りのコストを再開フレームへ）。Lv3 の `aura` は既存の `keywordFilter` で足りた |
| 015 フレンドリーパワー | EffectCounter `targetSameFamilyOwn` を新設。**対象自身も数える**（効果文が「このスピリット以外の」と書いていないため） |
| 016 ウィングブーツ | `treatAsUnblockedIfLevelAtLeastBlocker` を新設（既存の Lv1 固定版の一般化） |
| | （既存 `treatAsUnblockedIfBlockerLevel1` は「ブロッカーがLv1なら」固定。BS09-044 ハマ・ドリュアス） |

**段階2（重いもの）**

| カード | 要るもの |
| :-- | :-- |
| 004 神獣ハクタク | ①`drawPerChosenFamily` を新設（**発生源自身も数える**） ②fieldEvent の condition に `targetMaxCostOfEventTarget` を足した |
| 005 天使ヘルヴィム | ①`deckReveal.countPer` に `{ownSymbols}` を足した（軽減と同じ `countSymbols` を使う） ②`levelAs` に `target:"opponentBlockersOfOwnKeyword"` を足した |
| 007 犬兵バーナルド | **不要だった**。既存の `canBlockWhileRested` に `targetMaxCost` があった（BS06計画された場外乱闘） |
| 009 獣将軍クジャルタ | `tenshoCoreSubstitute` に `mode:"returnToHand"` を足した。**副産物**：`aura` の `battlingOnly` が `target:"self"` では黙って無視されていたのが判明し、`phaseTurn` と同じく target を問わない位置へ移した |
| 011 獣皇子バハムンド | `magicRestriction` に `trashColorLockOpponent` を足した（`colorLockOpponent` の裏返し）。召喚時の破棄は既存の `discardOpponent.cardTypeFilter` で足りた |
| 012 天の城門 | ①既存の `lifeDamageMillGuard`（六花の司書長サーガ）に `attackerFilter` / `keepToHandIfKeyword` / `turn` と「色を問わない match」を足した ②`unblockableBy.levelAtMostAttacker` を新設（`costAtMostAttacker` の Lv 版） |
| 013 転召の祭壇 | ①`opponentSummonCostIncrease` を新設（`effectiveCost` の最後に加算） ②`alsoCostGrant` に `plus`（相対値）と `familyFilter` を足した |
| 014 魔法監視塔 | ①既存の `reviveLastDestroyedNexus`（破壊待機からの復活）に `costFrom:"ownFieldOrReserve"` を足した ②`magicNegate` に `cost:{none}` と `afterNegate:"selfToDeckBottom"` を足した |

## 3. デッキレシピ（追加済み）

SD02 は1種類（轟天のヘヴンズドア〜ROARING HEAVEN'S DOOR〜。**44枚**）。
`data/constants.ts` に `sd02` として追加済みで、**21種を過不足なく使い切る**。
構成は Wiki の商品ページから取り、カードIDと名前を全21種カードデータと突き合わせて機械検証した。

## 関連

- 効果文の接続詞・『』ブロックの範囲: [CONJUNCTION.md](./CONJUNCTION.md)
- ライフの減少量の設計: HANDOFF §9（`shared/rules.lifeDamageLimit`）
- 【転召】の手順: [RESUME_STACK.md](./RESUME_STACK.md) §6
