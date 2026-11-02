#!/usr/bin/env python3
"""Build data/words.json: [[word, freq10, clue], ...] from wordfreq + WordNet glosses."""
import json, re, sys
from wordfreq import top_n_list, zipf_frequency
from wn import WordNet

wn = WordNet()

BLOCK = set("""
rape raped rapes rapist slut sluts whore whores bitch bitchy bastard cunt fuck fucks fucked shit shits piss pissed dick dicks
cock cocks tits titty porn porno nazi nazis negro negros nigger fag fags faggot dyke dykes retard retards spic kike chink
gook wetback tranny homo homos sex sexy sexes anal anus penis vagina vulva clit semen sperm orgasm erotic bondage incest molest
pedo pimp pimps hooker hookers whoring slave slaves sluts jizz dildo boob boobs butt butts rectum fetish nude nudes naked nudity
suicide suicides kill kills killed killer lynch lynched hanged genocide terror terrorist bomb bombs bombing hitler stalin
cum cums horny crap crappy damn damned hell bloody arse arses ass asses
pee peed poop poops pooped turd turds fart farts snot
heroin cocaine meth crack opium
isis aids
""".split())

BAD_GLOSS = re.compile(
    r"obscen|indecen|vulgar|offensive|derogatory|disparaging|obscene|sexual|slur|insult|contemptuous|ethnic|racial|"
    r"genital|erotic|prostitut|intercourse|slang|informal|dialect|archaic|obsolete|nonstandard|"
    r"british|scottish|irish|australian|canadian|chiefly|\bUS\b|U\.S\.|brit\b|abbrev|"
    r"\bplural\b|\bsingular\b|variant|alternative|"
    r"\bletter\b.*alphabet|symbol for|chemical element|atomic number|\bsame as\b|\bsee\b",
    re.I,
)

DANGLING = set("by of to the a an that which or and in on for with as is be at from into than such like about its their his her not no if when who whom whose where while so but nor per via".split())

def british(word):
    alts = []
    if word.endswith("our") or word.endswith("ours") or word.endswith("oured"):
        alts.append(word.replace("our", "or", 1))
    for a, b in (("ise", "ize"), ("ised", "ized"), ("ising", "izing"), ("ises", "izes"), ("isation", "ization"),
                 ("tre", "ter"), ("tres", "ters"), ("lled", "led"), ("lling", "ling"), ("ogue", "og"), ("ence", "ense")):
        if word.endswith(a):
            alts.append(word[: -len(a)] + b)
    for alt in alts:
        if alt != word and zipf_frequency(alt, "en") > zipf_frequency(word, "en") - 0.3:
            return True
    return False

def clean_gloss(g, word):
    g = g.strip()
    g = re.sub(r"^\([^)]*\)\s*", "", g)          # leading (music) etc.
    g = g.split(";")[0].strip()                  # first clause only
    g = re.sub(r"\s*\([^)]*\)", "", g).strip()   # remaining parentheses
    g = re.sub(r"\s+", " ", g)
    g = g.strip(" ,:-")
    if len(g) > 86:
        cut = g[:86]
        k = cut.rfind(",")
        if k < 28:
            return ""
        g = cut[:k].strip(" ,:-")
    return g

def mask(g, word):
    stem = word if len(word) <= 4 else word[: max(4, len(word) - 2)]
    out = []
    changed = False
    for tok in g.split(" "):
        base = re.sub(r"[^a-z]", "", tok.lower())
        if base and (base.startswith(stem) or (len(base) >= 4 and word.startswith(base) and len(word) - len(base) <= 2)):
            out.append(re.sub(r"[A-Za-z]+", "____", tok))
            changed = True
        else:
            out.append(tok)
    return " ".join(out), changed

def pick_clue(word):
    """Best clue for an exact lowercase lemma, or None."""
    cands = []
    for i, s in enumerate(wn.synsets(word)):
        pos = s.pos()
        for lem in s.lemmas():
            if lem.name() == word:       # exact lowercase lemma (rules out proper nouns)
                cands.append((-lem.count(), i, s))
                break
    cands.sort(key=lambda t: (t[0], t[1]))
    if cands and cands[0][0] == 0 and len(cands) > 2:
        return None   # no frequency evidence and several senses: sense choice would be a guess
    for _, _, s in cands[:4]:
        raw = s.definition()
        if BAD_GLOSS.search(raw.split(";")[0]):
            # allow if only a leading domain tag like "(music)" tripped the filter
            stripped = re.sub(r"^\([^)]*\)\s*", "", raw).split(";")[0]
            if BAD_GLOSS.search(stripped):
                continue
        g = clean_gloss(raw, word)
        if BAD_GLOSS.search(g) or len(g) < 10 or "(" in g or ")" in g:
            continue
        g, changed = mask(g, word)
        if changed:
            continue
        last = re.sub(r"[^a-z]", "", g.split(" ")[-1].lower())
        if last in DANGLING or g.lower().startswith(("of or relating", "relating to", "being", "having to do")):
            continue
        if g.lower().startswith(("a plural", "plural", "the plural", "an abbreviation")):
            continue
        g = g[0].upper() + g[1:]
        return g, s.pos()
    return None

def main():
    zmin = float(sys.argv[1]) if len(sys.argv) > 1 else 2.9
    words = [w for w in top_n_list("en", 120000) if re.fullmatch(r"[a-z]{3,7}", w)]
    out = {}
    pos_of = {}
    for w in words:
        z = zipf_frequency(w, "en")
        if z < zmin or w in BLOCK:
            continue
        if not re.search(r"[aeiouy]", w) or re.fullmatch(r"[ivxlcdm]+", w) or british(w):
            continue
        r = pick_clue(w)
        if r:
            out[w] = [round(z * 10), r[0]]
            pos_of[w] = r[1]
    # plurals / third-person forms built from a known noun or verb lemma
    plural_added = 0
    for w in words:
        if w in out or w in BLOCK or not w.endswith("s") or len(w) < 4:
            continue
        z = zipf_frequency(w, "en")
        if z < zmin:
            continue
        for lemma in ([w[:-3] + "y"] if w.endswith("ies") else []) + [w[:-1]] + ([w[:-2]] if w.endswith("es") else []):
            if lemma in out and pos_of.get(lemma) == "n" and not lemma.endswith("s") and len(lemma) >= 3:
                base = out[lemma][1]
                if "____" in base:
                    continue
                out[w] = [round(z * 10), base + " (plural)"]
                pos_of[w] = "n"
                plural_added += 1
                break
    for w in list(out.keys()):
        if not w.endswith("s") or len(w) < 4 or w.endswith("ss"):
            continue
        for lemma in ([w[:-3] + "y"] if w.endswith("ies") else []) + [w[:-1]] + ([w[:-2]] if w.endswith("es") else []):
            if lemma in out and pos_of.get(lemma) == "n" and "(plural)" not in out[lemma][1] and out[lemma][0] >= out[w][0] - 12:
                out[w] = [out[w][0], out[lemma][1] + " (plural)"]
                break
    rows = sorted([[w, v[0], v[1]] for w, v in out.items()])
    json.dump(rows, open("data/words.json", "w"), separators=(",", ":"), ensure_ascii=False)
    by = {}
    for w, _, _ in rows:
        by[len(w)] = by.get(len(w), 0) + 1
    print("total", len(rows), "plurals", plural_added, "by length", dict(sorted(by.items())))

if __name__ == "__main__":
    main()
