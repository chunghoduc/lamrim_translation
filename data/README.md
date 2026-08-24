# data/

## syllables.json (committed)

16,252 distinct Tibetan syllables, derived from the Monlam lexicon. This is what the
tools actually read (`tools/19-lexicon-check.mjs`, `tools/23`, `tools/27`).

## monlam-lexicon.txt (not committed — 25 MB)

Source: https://github.com/MonlamIT/Tibetan-Lexicon (`monlam-lexicon-2.txt`, Apache-2.0,
367,010 entries). Excluded for size only; redistribution is permitted by its licence.

To restore it and regenerate `syllables.json`:

```bash
git clone --depth 1 https://github.com/MonlamIT/Tibetan-Lexicon /tmp/lex
cp /tmp/lex/monlam-lexicon-2.txt data/monlam-lexicon.txt
cp /tmp/lex/LICENSE.txt data/monlam-lexicon-LICENSE.txt
node -e "const fs=require('fs');const w=fs.readFileSync('data/monlam-lexicon.txt','utf8').split(/\r?\n/).filter(Boolean);const s=new Set();for(const x of w)for(const y of x.split(/[་།\s]+/))if(y)s.add(y);fs.writeFileSync('data/syllables.json',JSON.stringify([...s]));console.log(s.size,'syllables')"
```
