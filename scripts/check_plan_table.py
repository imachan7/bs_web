# <弾>_PLAN_<色>.md の形の検査（アルティメットバトルの調査役が完了前に回す。docs/design/ULTIMATE_SURVEY.md）
import re, sys, json
p = sys.argv[1]
lines = open(p, encoding="utf-8").read().split("\n")
errs = []
heads = [l for l in lines if l.startswith("## ") and re.match(r"## [A-Z]+\d+-", l)]
head_ids = {l.split()[1] for l in heads}
m = re.search(r"対象：(.*)", "\n".join(lines))
want = set(re.findall(r"[A-Z]+\d+-[0-9A-Z]+", m.group(1))) if m else set()
if not want: errs.append("冒頭の「対象：」に cardId が無い")
for c in want - head_ids: errs.append(f"見出しが無い: {c}")
ids = set()
in_table = False
for i, l in enumerate(lines, 1):
    if l.startswith("| #"): in_table = True; continue
    if not l.startswith("|"): in_table = False; continue
    if not in_table or l.startswith("| :--"): continue
    cells = [c.strip() for c in l.strip().strip("|").split("|")]
    if len(cells) != 5: errs.append(f"{i}行: セルが{len(cells)}個（5個にする。| を本文に書かない）"); continue
    rid, yomi, basis, impl, test = cells
    if not re.fullmatch(r"[0-9A-Z]+-\d+", rid): errs.append(f"{i}行: 行 id の形 {rid!r}")
    if rid in ids: errs.append(f"{i}行: 行 id の重複 {rid}")
    ids.add(rid)
    if not yomi.startswith("「"): errs.append(f"{i}行 {rid}: 読みが「節の効果文」で始まっていない")
    if not basis: errs.append(f"{i}行 {rid}: 根拠が空")
    if not impl: errs.append(f"{i}行 {rid}: 実装が空")
    if "動く：" not in test or "動かない：" not in test: errs.append(f"{i}行 {rid}: テストに 動く／動かない の両方が無い")
for l in lines:
    mm = re.match(r"- \*\*([0-9A-Z]+-\d+)\*\*", l)
    if mm and mm.group(1) not in ids: errs.append(f"確かめたいこと {mm.group(1)} が表に無い")
print("\n".join(errs) if errs else f"OK: カード{len(head_ids)}・行{len(ids)}")
sys.exit(1 if errs else 0)
