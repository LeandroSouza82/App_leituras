from pathlib import Path

p = Path('src/components/LeituraFotoModal/LeituraFotoModal.jsx')
text = p.read_text(encoding='utf-8')
old = """        const valNumerico = parseFloat(String(valStr).replace(',', '.'));

        if (isNaN(valNumerico)) {
          return;
        }
"""
new = """        const valNumerico = parseLeituraNumerica(valStr);

        if (valNumerico === null || Number.isNaN(valNumerico)) {
          return;
        }
"""
if text.count(old) != 1:
    raise SystemExit(f'Esperava 1 parser legado, encontrei {text.count(old)}')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
