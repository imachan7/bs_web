#!/usr/bin/env python3
"""バトスピ Wiki（batspi.com）のカードリストをパースして cards.json 互換の JSON を出力する。

BS01〜BS05 のデータ投入で毎回セッション固有の使い捨てスクリプトを書いていたため、
踏んだ罠ごとリポジトリに残す。

使い方:
    # 取得してファイルに出す（data/cards.json には書き込まない）
    python3 scripts/fetch_wiki_cards.py --set BS05 --refer '第五弾：皇騎' --pages 2 \
        --out data/staging/BS05.json

    # 既存 data/cards.json と突き合わせて差分を出す（パーサーの正しさの検証用）
    python3 scripts/fetch_wiki_cards.py --set BS04 --refer '第四弾：龍帝' --pages 3 --verify

踏んだ罠（消さないこと）:
  * refer パラメータ必須。無いと「パラメータ不正」ページが返る
  * タグ除去 → エンティティ展開の順で処理する。先に展開すると &lt;1&gt;（Lv1のコア数）が
    タグ扱いで消える
  * 軽減シンボルの表記は2種類ある。単色は 9(5)＝自色×5、多色は 9(赤3白3)＝色ごとの個数
    （BS05 の多色カード初登場で判明。BS01〜BS04 は全カード単色だった）
  * 多色カードは色欄が「赤白」のように連結される（BS05-X19 聖皇ジークフリーデン＝赤・白）
  * タイプ行に (禁止カード) / (制限カード<1>) が付くことがある
  * レアリティはカード名の後ろの単独大文字。C,R のような複数表記あり

出力は cards.json のスキーマに合わせるが、**effects（構造化された効果）は含まない**。
効果の構造化は人手の作業なので、投入後に別途行う。
また多色対応の過渡期のため color（単数・従来）と colors（配列・新）の両方を出す。
CardData が colors へ移行したら color の出力を落とすこと（MULTICOLOR.md 参照）。
"""
import argparse
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://batspi.com/index.php"
COLOR_MAP = {"赤": "red", "紫": "purple", "緑": "green", "白": "white", "黄": "yellow", "青": "blue"}
TYPE_MAP = {"スピリット": "spirit", "ネクサス": "nexus", "マジック": "magic"}


def fetch_page(card_set, refer, page, rowid, cache_dir):
    """カードリストの1ページを取得する（cache_dir があればキャッシュを使う）"""
    cache = os.path.join(cache_dir, f"{card_set}_p{page}.html") if cache_dir else None
    if cache and os.path.exists(cache):
        with open(cache, encoding="utf-8", errors="replace") as f:
            return f.read()
    params = urllib.parse.urlencode(
        {"cmd": "listcard", "sdan": card_set, "refer": refer, "rowid": rowid, "pcnt1": page}
    )
    url = f"{BASE}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "bs-web card importer"})
    with urllib.request.urlopen(req, timeout=60) as res:
        body = res.read().decode("utf-8", errors="replace")
    if cache:
        os.makedirs(cache_dir, exist_ok=True)
        with open(cache, "w", encoding="utf-8") as f:
            f.write(body)
    return body


def strip_tags(s):
    """タグを除去してからエンティティを展開する（順序が逆だと <1> が消える）"""
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_cost_line(line, fallback_colors):
    """『9(赤3白3)/赤白/古竜・動器』→ (コスト, 軽減シンボル, 色, 系統)"""
    parts = line.split("/")
    cost_part = parts[0].strip()
    m = re.match(r"^(\d+)(?:\((.*)\))?$", cost_part)
    if not m:
        raise ValueError(f"コスト表記を解釈できない: {line!r}")
    cost = int(m.group(1))
    inner = m.group(2)

    colors = []
    if len(parts) >= 2:
        colors = [COLOR_MAP[ch] for ch in parts[1].strip() if ch in COLOR_MAP]
    if not colors:
        colors = list(fallback_colors)

    reduction = []
    if inner:
        if re.fullmatch(r"\d+", inner):
            # 単色表記 9(5)：自色×N
            reduction = [colors[0]] * int(inner)
        else:
            # 多色表記 9(赤3白3)：色ごとの個数
            for ch, n in re.findall(r"([赤紫緑白黄青])(\d+)", inner):
                reduction.extend([COLOR_MAP[ch]] * int(n))
            if not reduction:
                raise ValueError(f"軽減シンボル表記を解釈できない: {line!r}")

    family = []
    if len(parts) >= 3 and parts[2].strip():
        family = [f for f in parts[2].strip().split("・") if f]
    return cost, reduction, colors, family


def parse_levels(line):
    """『<1>Lv1 6000 <2>Lv2 7000』→ [{level, cores, bp}]（ネクサスは BP 無しで0）"""
    levels = []
    for cores, level, bp in re.findall(r"<(\d+)>Lv(\d+)(?:\s+(\d+))?", line):
        levels.append({"level": int(level), "cores": int(cores), "bp": int(bp) if bp else 0})
    return levels


def parse_row(row_html):
    """カード1件分の <li> を CardData 互換の dict にする"""
    card_id = row_html.split("</span>", 1)[0].strip()
    head, _, rest = row_html.partition("<ul>")

    name_m = re.search(r'title="([^"]*)"', head)
    if not name_m:
        raise ValueError(f"カード名が取れない: {card_id}")
    name = html.unescape(name_m.group(1))

    # 『</a> X&emsp;[スピリット/赤・白]』の X がレアリティ（空のこともある）
    tail = strip_tags(head.split("</a>", 1)[1]) if "</a>" in head else ""
    bracket_m = re.search(r"\[([^\]]*)\]", tail)
    bracket = bracket_m.group(1) if bracket_m else ""
    rarity = tail[: bracket_m.start()] if bracket_m else ""
    # 禁止／制限の注記がレアリティ欄に混ざることがあるので落とす（BS04-096 は『禁止カード R』）
    rarity = re.sub(r"制限カード<\d+>|禁止カード", "", rarity)
    rarity = re.sub(r"\s+", " ", rarity).strip()

    # [スピリット/赤・白] の色（コスト行が優先。ここはフォールバック兼検証用）
    bracket_colors = [COLOR_MAP[ch] for ch in bracket.split("/")[-1] if ch in COLOR_MAP]

    body = rest.split('<br style="clear:both">')[0]
    body = re.sub(r"<a [^>]*>.*?</a>", "", body, flags=re.S)  # 画像リンクを落とす
    lines = [strip_tags(x) for x in re.split(r"<br\s*/?>", body)]
    lines = [x for x in lines if x]
    if not lines:
        raise ValueError(f"本文が空: {card_id}")

    # 『ネクサス(制限カード<1>)』のように、種別行に禁止／制限の注記が付くことがある
    type_line = lines[0]
    card_type = TYPE_MAP.get(re.sub(r"\(.*\)\s*$", "", type_line).strip())
    if card_type is None:
        raise ValueError(f"カード種別を解釈できない: {card_id} {type_line!r}")

    symbol = []
    if lines[-1].startswith("シンボル："):
        symbol = [COLOR_MAP[ch] for ch in lines[-1].split("：", 1)[1] if ch in COLOR_MAP]
        lines = lines[:-1]

    cost, reduction, colors, family = parse_cost_line(lines[1], bracket_colors)

    levels = []
    effect_start = 2
    if card_type != "magic":
        levels = parse_levels(lines[2])
        if not levels:
            raise ValueError(f"レベル表記を解釈できない: {card_id} {lines[2]!r}")
        effect_start = 3

    effect = "\n".join(lines[effect_start:])
    notes = type_line + tail + bracket
    limited = "禁止カード" in notes
    limit_m = re.search(r"制限カード<(\d+)>", notes)

    card = {
        "cardId": card_id,
        "name": name,
        "type": card_type,
        "color": colors[0],  # 過渡期の互換フィールド（MULTICOLOR.md 参照）
        "colors": colors,
        "cost": cost,
        "reduction": reduction,
        "family": family,
        "levels": levels,
        "symbol": symbol,
        "flash": "フラッシュ：" in effect,
        "rarity": rarity,
        "limited": limited,
        "effect": effect,
    }
    if limit_m:
        card["limitCount"] = int(limit_m.group(1))
    return card


def parse_html(page_html):
    rows = page_html.split('<li><span class="cardno">')[1:]
    return [parse_row(r) for r in rows]


def verify_against_cards_json(parsed, cards_json_path):
    """既存 data/cards.json と突き合わせて差分を報告する（パーサーの正しさの検証）"""
    with open(cards_json_path, encoding="utf-8") as f:
        existing = {c["cardId"]: c for c in json.load(f)}
    fields = ["name", "type", "color", "cost", "reduction", "family", "levels", "symbol", "flash", "rarity", "limited", "effect"]
    diffs = 0
    missing = 0
    for card in parsed:
        old = existing.get(card["cardId"])
        if old is None:
            print(f"  [未収録] {card['cardId']} {card['name']}")
            missing += 1
            continue
        for key in fields:
            if card.get(key) != old.get(key):
                diffs += 1
                print(f"  [差分] {card['cardId']} {card['name']} .{key}")
                print(f"      パース: {card.get(key)!r}")
                print(f"      既存  : {old.get(key)!r}")
    print(f"検証: {len(parsed)}枚中 未収録{missing}件 / 差分{diffs}件")
    return diffs == 0 and missing == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", dest="card_set", required=True, help="弾のID（BS05 など）")
    ap.add_argument("--refer", required=True, help="Wiki の refer パラメータ（第五弾：皇騎 など）")
    ap.add_argument("--pages", type=int, required=True, help="ページ数（1ページ50枚）")
    ap.add_argument("--rowid", default="59632", help="Wiki のリストID（既定値で BS02 以降は通る）")
    ap.add_argument("--out", help="出力先 JSON。省略時は標準出力へは書かず件数だけ表示")
    ap.add_argument("--verify", action="store_true", help="data/cards.json と突き合わせて差分を報告する")
    ap.add_argument("--cache-dir", help="取得した HTML のキャッシュ先")
    args = ap.parse_args()

    cards = []
    for page in range(1, args.pages + 1):
        page_html = fetch_page(args.card_set, args.refer, page, args.rowid, args.cache_dir)
        got = parse_html(page_html)
        print(f"{args.card_set} page{page}: {len(got)}枚")
        cards.extend(got)
        if page < args.pages:
            time.sleep(1)

    ids = [c["cardId"] for c in cards]
    if len(ids) != len(set(ids)):
        print("エラー: cardId が重複している", file=sys.stderr)
        return 1
    print(f"合計 {len(cards)}枚 / 多色 {sum(1 for c in cards if len(c['colors']) > 1)}枚")

    if args.verify:
        ok = verify_against_cards_json(cards, os.path.join(os.path.dirname(__file__), "..", "data", "cards.json"))
        if not ok:
            return 1

    if args.out:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(cards, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print(f"出力: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
