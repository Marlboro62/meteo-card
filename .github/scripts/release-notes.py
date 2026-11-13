"""Notes de release à partir des commits Conventional Commits depuis la release précédente.

Usage : release-notes.py <tag précédent ou vide> <nouveau tag> > notes.md
Sections : Features (feat), Bug Fixes (fix), Performance Improvements (perf), avec le scope en gras,
le lien du commit et « closes #N » quand le message cite une issue (closes, fixes, resolves ou « issue #N »).
"""
import os
import re
import subprocess
import sys

repo = os.environ.get("GITHUB_REPOSITORY", "")
prev, new = (sys.argv[1] if len(sys.argv) > 1 else ""), (sys.argv[2] if len(sys.argv) > 2 else "HEAD")
url = f"https://github.com/{repo}"
rng = f"{prev}..HEAD" if prev else "HEAD"
log = subprocess.run(["git", "log", "--no-merges", "--format=%H%x1f%s%x1f%b%x1e", rng], capture_output=True, text=True, check=True).stdout

SECTIONS = [("feat", "Features"), ("fix", "Bug Fixes"), ("perf", "Performance Improvements")]
items = {t: [] for t, _ in SECTIONS}
for entry in filter(None, (e.strip() for e in log.split("\x1e"))):
    sha, subject, body = (entry.split("\x1f") + ["", ""])[:3]
    # « fix(thème) : … » (espace avant les deux-points, à la française) est accepté
    m = re.match(r"^(\w+)(?:\s*\(([^)]*)\))?(!)?\s*:\s*(.+)$", subject)
    if not m or m.group(1) not in items:
        continue
    kind, scope, _, desc = m.groups()
    desc = re.sub(r"\s*\((?:v?\d+\.\d+\.\d+[^)]*)\)\s*$", "", desc)  # numéro de version en fin de titre
    issues = sorted({int(n) for n in re.findall(r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|issue)\s+#(\d+)", f"{subject}\n{body}", re.I)})
    line = f"* {'**' + scope + ':** ' if scope else ''}{desc} ([{sha[:7]}]({url}/commit/{sha}))"
    if issues:
        line += ", closes " + ", ".join(f"[#{n}]({url}/issues/{n})" for n in issues)
    items[kind].append((line, bool(re.match(r"version stable\b", desc, re.I))))

# commits de promotion (« version stable … ») : gardés seulement s'ils sont seuls, sinon doublons des bêtas
real = any(not promo for kind in items for _, promo in items[kind])
out = []
for kind, title in SECTIONS:
    lines = [line for line, promo in items[kind] if not (real and promo)]
    if lines:
        out += [f"### {title}", "", *lines, ""]
if not out:
    out = ["Maintenance (documentation, intégration continue).", ""]
if prev:
    out.append(f"**Full Changelog**: {url}/compare/{prev}...{new}")
# boutons de soutien, comme en tête des README (affichés aussi dans la fenêtre de mise à jour de Home Assistant)
out += [
    "",
    "---",
    "",
    "☕ **Si cette carte vous est utile, vous pouvez soutenir le projet :**",
    "",
    '<a href="https://www.buymeacoffee.com/Marlboro62"><img src="https://img.buymeacoffee.com/button-api/?text=Offrir%20un%20caf%C3%A9&emoji=%E2%98%95&slug=Marlboro62&button_colour=FF5F5F&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00" alt="Offrir un café sur Buy Me a Coffee" height="40"></a>'
    ' <a href="https://ko-fi.com/M4M2QL45X"><img src="https://storage.ko-fi.com/cdn/kofi6.png?v=6" alt="Soutenir le projet sur Ko-fi" height="40"></a>',
]
print("\n".join(out))
