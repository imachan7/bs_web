# 多色カード対応の設計（BS05 以降）

作成: 2026-07-25 / 依頼元: `chatbox.md`「[設計担当→実装担当] 多色対応の設計文書だけ、先に書いておいてほしい」
**この文書は設計のみ。実装は TargetFilter 直交化の完了後、設計担当の合意を得てから着手する。**

---

## 0. 結論（先に3行）

1. **`CardData.color: Color` を `CardData.colors: Color[]` へ置換する**（別フィールド追加ではなくリネーム）。
   理由は「型で全参照箇所を炙り出せる」から。オプショナル追加だと多色カードで**静かに壊れる**箇所が15個残る
2. **すべて OR 判定**でよい。バトスピの多色は「主色＋副色」ではなく**両方の色を等しく持つ**
3. **軽減シンボル（`reduction`）とシンボル（`symbol`）は既に `Color[]` なので変更不要**。
   `countSymbols` / `instanceSymbolCount` は多色を正しく扱える。**直すのは「カードの色」を見る15箇所だけ**

---

## 1. 前提: BS05 の実データ（Wiki から実測、2026-07-25）

多色は2枚のみ。リスト行の原文は次のとおり:

| cardId | 名前 | タイプ行 | コスト/色/系統 | シンボル |
| :-- | :-- | :-- | :-- | :-- |
| BS05-X19 | 聖皇ジークフリーデン | `X [スピリット/赤・白]` | `9(赤3白3)/赤白/古竜・動器` | 赤白 |
| BS05-X20 | 大甲帝デスタウロス | `X [スピリット/紫・緑]` | `9(紫3緑3)/紫緑/呪鬼・殻虫` | 紫緑 |

ここから読み取れる重要な事実:

- **軽減シンボルが混色**（赤3＋白3 の計6個）。単色カードの `9(5)` 表記と**書式が違う**ためパーサー修正が要る
  （`(数字)` = 自色×N、`(色N色M…)` = 色ごとにN個。詳細は §5）
- **シンボルが異なる2色**（`symbol: ["red","white"]`）。ライフダメージは2、
  赤カードの軽減にも白カードの軽減にも1個ずつ寄与する。**現行の `countSymbols` はこの挙動で既に正しい**
  （シンボル配列を1個ずつ走査して一致数を数えているため）
- ダブルシンボル自体は BS04 で導入済みなので、**多色で新しいのは「カードの色」だけ**

---

## 2. 質問(1)への回答: `colors: Color[]` へのリネーム置換を推奨

### 案の比較

| 案 | 内容 | 判定 |
| :-- | :-- | :-- |
| **A. `colors: Color[]` へリネーム**（推奨） | `color` を削除し `colors` に置換。JSON も `"colors": ["red"]` へ一括移行 | **採用推奨**。tsc が全参照箇所をエラーで列挙するため、対応漏れが原理的に起きない |
| B. `color: Color \| Color[]` | 型だけユニオンにする | 参照箇所は全部エラーになるが、`Color[]` を渡された既存コードの意図が読みにくく、`Array.isArray` 分岐が15箇所に散る。Aの上位互換にならない |
| C. `color` 据え置き＋`colors?: Color[]` 追加 | 後方互換・差分最小 | **却下**。既存15箇所は型エラーにならず単色として動き続ける。多色カードだけが静かに誤動作する。過去に「cardId 全面ズレ」を起こしたこのプロジェクトで、コンパイラの助けを捨てる選択は取るべきでない |

### 推奨する形

```ts
export interface CardData {
    // ...
    colors: Color[]   // 単色なら要素1。多色は Wiki の表記順（BS05-X19 なら ["red","white"]）
    // color: Color   ← 削除
}
```

**表示用の主色は `colors[0]`** とする（CSS クラス `color-red` などの決定に使う。多色の見栄えは §4 参照）。
ルール判定で `colors[0]` を使ってはならない。

### 併せて導入する述語（設計担当の提案どおり）

```ts
// shared/rules.ts
// カード（手札・デッキ・トラッシュ＝インスタンスが無い経路）の色判定
export function cardHasColor(cardData: CardData, color: Color): boolean {
    return cardData.colors.includes(color)
}
// 場のインスタンスの色判定（既存。中身だけ差し替え）
export function instHasColor(inst: CardInstance, color: Color): boolean {
    if (cardHasColor(card(inst.cardId), color)) return true          // ← ここだけ変わる
    if (inst.tempColors.includes(color)) return true                 // アディショナルカラー(BS02)
    return (inst.colorsAsContinuous ?? []).includes(color)           // フラットフェイス(BS03)
}
```

> **規律**: 色の一致判定は必ずこの2つを通す。`getCard(x).colors.includes(c)` の直書きも禁止
> （`instHasColor` を通さないと付与色を取りこぼす。BS02/BS03 の色付与効果が既に存在する）。

---

## 3. 質問(2)への回答: OR 判定でよい。ただし3箇所は OR にしてはいけない

### OR でよいもの（＝「この色を持つか」の判定）

公式ルール上、多色カードは**両方の色を完全に持つ**（「赤のスピリット」を参照する効果の対象にもなるし、
「白のスピリット」を参照する効果の対象にもなる）。したがって色を条件にする効果はすべて OR。

- 効果の `colorFilter` / `ownColorTotalAtLeast` / `hasOwnColor` / `ownFieldHasColorSpirit` など全部
- **装甲**: 【装甲：赤】を持つスピリットは、赤/白の多色カードの効果を**受けない**
  （発生源の色のいずれかが装甲色に一致すれば防ぐ）
- **デッキビルダーの色フィルタ**: 赤/白のカードは「赤」でも「白」でも引っかかる

### OR にしてはいけないもの（3箇所）

| 箇所 | 正しい扱い | 理由 |
| :-- | :-- | :-- |
| **軽減シンボルの集計**（`countSymbols`） | **変更不要**。`symbol: Color[]` を1個ずつ走査する現行のまま | 赤/白のスピリットは「赤シンボル1個」と「白シンボル1個」を別々に供給する。OR で「赤の軽減に2個効く」としてはいけない |
| **ライフダメージ**（`instanceSymbolCount`） | **変更不要**。`symbol.length` のまま | シンボル2個＝ダメージ2。色は無関係 |
| **デッキビルダーのプリセット生成**（`buildPreset`） | `colors.length === 1 && colors[0] === color` | 「単色サンプルデッキ」の生成なので、多色カードを混ぜてはいけない。**ここだけ `cardHasColor` に置換すると壊れる** |

### デッキビルダーの色内訳統計について

`byColor` の集計（`deck.ts:449`）で多色を両方に加算すると**合計が40枚を超えて見える**。
`colors.join("・")` を1つのキーにして「赤・白: 1枚」と複合ラベルで1件計上するのを推奨
（枚数の総和が守られ、多色であることも一目で分かる）。判断は UI 担当（Gemini）に委ねてよい。

---

## 4. 質問(3)への回答: 箇所別の移行方針（全15箇所）

`tsc` が出すエラーはこの表で機械的に潰せる。**「場のインスタンス」か「手札等のカード」かで述語が変わる**のが唯一の判断点。

### shared/（ルール層・5箇所）

| 箇所 | 現在 | 移行後 | 種別 |
| :-- | :-- | :-- | :-- |
| `rules.ts:70` | `card(inst.cardId).color === color` | `cardHasColor(card(inst.cardId), color)` | 述語本体 |
| `rules.ts:267` | `card(inst.cardId).color === condition.hasOwnColor` | `instHasColor(inst, …)` | 場 |
| `rules.ts:271` | `card(s.cardId).color === condition.hasOwnColorSpirit` | `instHasColor(s, …)` | 場 |
| `cost.ts:76` | `card(s.cardId).color === color`（ownColorSpiritsAtLeast） | `instHasColor(s, color)` | 場 |
| `cost.ts:81` | `card(s.cardId).color === color`（ownColorTotalAtLeast） | `instHasColor(s, color)` | 場 |

> `rules.ts:267/271` と `cost.ts:76/81` は**現状バグ**でもある: 場のインスタンスなのに直接比較しているため、
> アディショナルカラー（BS02）やフラットフェイス（BS03）で付与された色を取りこぼしている。
> 多色対応とは独立に直す価値がある（設計担当が「ついでに述語経由へ寄せる」と書いていた2箇所がこれ）。

### shared/cost.ts（手札カード判定・3箇所）

| 箇所 | 現在 | 移行後 |
| :-- | :-- | :-- |
| `cost.ts:26` | `cardData.color !== effect.colorFilter`（costMod） | `!cardHasColor(cardData, effect.colorFilter)` |
| `cost.ts:62` | `cardData.color !== effect.cardColor`（reductionGrant） | `!cardHasColor(cardData, effect.cardColor)` |
| `cost.ts:141` | `effect.colorFilter !== cardData.color`（magicFreeGrant） | `!cardHasColor(cardData, effect.colorFilter)` |

> 意味論: 「黄のマジックのコストを軽減」は、黄を含む多色マジックにも適用される（OR）。
> BS05 の多色はスピリット2枚のみなのでマジック側は当面影響しないが、規律として揃える。

### server/src/（4箇所）

| 箇所 | 現在 | 移行後 | 備考 |
| :-- | :-- | :-- | :-- |
| `actions/battleFlow.ts:302` | `candidate.color !== action.colorFilter` | `!cardHasColor(candidate, …)` | `summonFromHandFree` の**手札**カード判定 |
| `actions/handDeck.ts:178` | `getCard(s.cardId).color === action.countPer.ownColorTotal` | `instHasColor(s, …)` | 場 |
| `EffectModules.ts:1593` | `getCard(n.cardId).color === color`（ownFieldHasColorNexus） | `instHasColor(n, color)` | 場 |
| `GameEngine.ts:779` | `c.color === attackerColor`（noRestWhenBlockingColor） | `instHasColor(attacker, c.color)` | **比較の向きが変わる**。アタッカーが赤/白なら【赤をブロックしても疲労しない】が成立する |

### 装甲の発生源色（1箇所＋シグネチャ変更）

現状は発生源の色を単一の `Color` として持ち回っている:

```ts
// EffectModules.ts:1383
const srcColor = sourceColor ?? (self ? getCard(self.cardId).color : undefined)
// shared/rules.ts:429
export function hasArmorAgainst(inst: CardInstance, sourceColor: Color | undefined): boolean
```

**移行**: `Color | undefined` → `Color[] | undefined` にし、`hasArmorAgainst` は
「発生源色のいずれかが装甲色に含まれるか」で判定する。

```ts
export function hasArmorAgainst(inst: CardInstance, sourceColors: Color[] | undefined): boolean {
    if (!sourceColors || sourceColors.length === 0) return false
    // 静的装甲・一時付与装甲とも e.colors と sourceColors の積集合が空でなければ防ぐ
}
```

影響する呼び出し元は `ActionContext.sourceColor`（`actions/types.ts:44`）と
`pickEnemyCandidates` / `pickEnemyByBp`（`EffectModules.ts:1041/1062`）、`exhaustRefresh.ts:196` の計5〜6箇所。
**フィールド名も `sourceColors` へ複数形に変えると、渡し漏れが型で出る。**

> 発生源が多色になるのは BS05-X19/X20 の召喚時・アタック時効果（相手スピリット破壊）で、
> 【装甲：赤】でも【装甲：白】でも防がれるようになる。これが公式挙動。

### public/src/deck.ts（2箇所・Gemini 領域）

| 箇所 | 現在 | 移行後 |
| :-- | :-- | :-- |
| `deck.ts:103` | `!filterColors.has(card.color)` | `![...filterColors].some((c) => cardHasColor(card, c))`（OR） |
| `deck.ts:736` | `c.color === color`（`buildPreset`） | `c.colors.length === 1 && c.colors[0] === color`（**OR にしない**。§3 参照） |

加えて表示系（`deck.ts:126/240/365/449`・`renderer.ts` のカード色クラス）は `colors[0]` で暫定表示。
多色を視覚的に出す（斜め2分割グラデーション等）かは UI 担当の判断。

### scripts/smoke（2箇所）

`part2.ts:604` / `part18.ts:15` の `getCard(...).color === "yellow"` は
`cardHasColor(getCard(...), "yellow")` へ。**多色の回帰テストを1本足す**こと（§6）。

---

## 5. データ投入側（パーサー）の変更点

**単色前提が崩れるのはパーサーの2箇所だけ。**

1. **色欄**: タイプ行 `X [スピリット/赤・白]` の `・` 区切り、または コスト行の `/赤白/` を分解する。
   **コスト行の色欄（`9(赤3白3)/赤白/古竜・動器` の2番目）を使うのが堅い**（タイプ行は
   `(禁止カード)` などの付加表記が混ざるため）
2. **軽減シンボル**: 書式が2種類ある
   - 単色: `9(5)` → 自色 × 5個 → `["red","red","red","red","red"]`
   - 多色: `9(赤3白3)` → 色ごとの個数 → `["red","red","red","white","white","white"]`
   - 正規表現の目安: `\((\d+)\)` にマッチしたら前者、`\(((?:[赤紫緑白黄青]\d+)+)\)` なら後者

`symbol` は `シンボル：赤白` を1文字ずつ色に変換すれば従来どおり（`シンボル：赤赤` のダブルシンボルと同じ処理）。

> **提案**: 今回はパーサーを `scripts/` にコミットしておくこと。BS01〜BS05 で毎回セッション固有の
> スクラッチパッドに書いては消えており、BS05 でも「パース結果が失われた」ため再取得している。
> `scripts/` はロック対象外なので先行して置ける。

---

## 6. 移行手順と検証

TargetFilter 直交化の**後**に、次の順で1コミットずつ進めるのが安全。

| # | 作業 | 検証 |
| :-- | :-- | :-- |
| 1 | `cardHasColor` を新設し、`instHasColor` から呼ぶ（まだ `color` は単数のまま） | smoke 全緑（挙動不変） |
| 2 | §4 の「場」5箇所を `instHasColor` へ寄せる（**付与色の取りこぼしバグ修正**を含む） | smoke 全緑＋付与色の回帰1本追加 |
| 3 | `hasArmorAgainst` を `sourceColors: Color[]` 化 | smoke 全緑（単色配列で挙動不変） |
| 4 | `CardData.color` → `colors: Color[]` へリネーム。cards.json を python で一括変換（521枚） | **tsc のエラーが0になるまで**が作業定義。smoke 全緑 |
| 5 | BS05 データ投入（多色2枚を含む88枚） | cardId・名前・色を python で機械検証（過去のID全面ズレ事故の再発防止） |
| 6 | デッキビルダー（Gemini へ依頼） | `npm run build:client` |

### 追加すべきテスト（多色の回帰）

1. 赤/白スピリットが「赤のスピリット」参照効果と「白のスピリット」参照効果の**両方**で対象になる
2. 【装甲：赤】持ちが、赤/白スピリットの効果を**受けない**
3. 赤/白スピリット1体が場にいるとき、赤カードの軽減も白カードの軽減も**それぞれ1**（2にならない）
4. 赤/白スピリットのアタックでライフダメージが**2**
5. デッキビルダーの単色プリセットに多色カードが**混ざらない**

---

## 7. TargetFilter 直交化との関係

**衝突しない。** 直交化が触るのは「アクションのフィルタ軸」で、本件が触るのは「色の一致判定の実装」。
`colorFilter?: Color` という**型はそのまま**で、比較の中身が `===` から述語呼び出しに変わるだけ。

ただし直交化で `colorFilter` を共通の `TargetFilter` に括り出すなら、**その一箇所で `instHasColor` を
呼ぶ形にしておいてほしい**（各アクションに散らばったままだと、本件の作業4で15箇所を個別に直すことになる）。
逆に言えば、**直交化が先に入るほど本件のコストは下がる**。

### 設計担当への確認事項

1. `colors: Color[]` へのリネーム（案A）で合意してよいか。cards.json 521枚の一括変換を伴う
2. `hasArmorAgainst` の `sourceColors: Color[]` 化を、直交化の中に含めるか本件で別途やるか
3. 直交化後の `TargetFilter` に色軸を含めるなら、色比較は `instHasColor` 経由に統一してほしい
