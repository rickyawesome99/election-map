/**
 * When two spellings of a state legislative candidate's name are one person.
 *
 * The sources spell one candidate many ways - "Roger A. Nutt", "Roger Allen Nutt", "Charles M
 * "Chuck" Kopp", "Chuck Kopp" - and a spelling difference must not split a career. Equally, two
 * real people can share a first and last name, and a father and son can hold the same seat, so a
 * merge needs EVIDENCE, not just a matching name. lib/stateLegCandidateIndex.ts applies these rules
 * in three tiers:
 *
 *   1. Hard blocks (never merged): middle names that disagree (Allen vs Bruce; an initial agrees
 *      with any name it starts), different generational suffixes (Jr vs Sr), or both names on
 *      ballots for two different seats in the same year.
 *   2. Merged automatically when the names agree AND the seats are linked: the same seat; two
 *      seats whose territory overlaps (a House district inside a Senate district, an old district
 *      and the one a redraw turned it into; data-entry/state-leg-seat-links.json, built by
 *      scripts/build-state-leg-seat-links.py), unless one ran as a Democrat and the other as a
 *      Republican; or two seats that both overlap one district (an incumbent a redraw put next
 *      door), with a party in common. On a shared seat a middle-name difference is not a block.
 *   3. Everything else with agreeing names stays apart and is listed for review
 *      (scripts/audit-state-leg-candidate-identity.ts); a ruling goes in
 *      data/stateLegCandidateIdentityOverrides.ts and survives every rebuild.
 */

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/**
 * Nickname -> the formal names it can stand for. Several are ambiguous across sexes (Pat, Chris,
 * Sam, Alex), so a nickname matches ANY of its formal names; the seat link still has to hold.
 */
const NICKNAMES: Record<string, string[]> = {
  bill: ["william"], billy: ["william"], will: ["william"], willie: ["william"], liam: ["william"],
  bob: ["robert"], bobby: ["robert"], rob: ["robert"], robbie: ["robert"], bert: ["robert", "albert", "herbert"],
  dick: ["richard"], rick: ["richard", "frederick", "eric"], ricky: ["richard"], rich: ["richard"], richie: ["richard"],
  jim: ["james"], jimmy: ["james"], jamie: ["james"],
  mike: ["michael"], mickey: ["michael"],
  tom: ["thomas"], tommy: ["thomas"],
  dan: ["daniel"], danny: ["daniel"],
  dave: ["david"], davey: ["david"],
  joe: ["joseph"], joey: ["joseph"],
  chris: ["christopher", "christine", "christina"], kris: ["kristopher", "kristin", "kristen"],
  steve: ["steven", "stephen"], stephen: ["steven"],
  ed: ["edward", "edwin"], eddie: ["edward"], ted: ["edward", "theodore"], teddy: ["edward", "theodore"],
  tony: ["anthony"],
  andy: ["andrew"], drew: ["andrew"],
  matt: ["matthew"],
  nick: ["nicholas"], nicky: ["nicholas"],
  ben: ["benjamin"], benny: ["benjamin"],
  sam: ["samuel", "samantha"], sammy: ["samuel"],
  pat: ["patrick", "patricia"], patty: ["patricia"], trish: ["patricia"], tricia: ["patricia"],
  jack: ["john"], johnny: ["john"], jon: ["jonathan", "john"],
  ron: ["ronald"], ronnie: ["ronald"],
  don: ["donald"], donnie: ["donald"],
  ken: ["kenneth"], kenny: ["kenneth"],
  larry: ["lawrence"],
  jeff: ["jeffrey"], geoff: ["geoffrey"],
  greg: ["gregory"],
  doug: ["douglas"],
  tim: ["timothy"], timmy: ["timothy"],
  pete: ["peter"],
  frank: ["francis", "franklin"],
  liz: ["elizabeth"], beth: ["elizabeth"], betsy: ["elizabeth"], betty: ["elizabeth"], libby: ["elizabeth"], eliza: ["elizabeth"],
  kate: ["katherine", "kathryn", "catherine"], kathy: ["katherine", "kathryn", "kathleen"], katie: ["katherine", "kathryn"],
  cathy: ["catherine"], cat: ["catherine"],
  peggy: ["margaret"], maggie: ["margaret"], meg: ["margaret"], marge: ["margaret"],
  sue: ["susan", "suzanne"], susie: ["susan"],
  debbie: ["deborah", "debra"], deb: ["deborah", "debra"], debra: ["deborah"],
  jen: ["jennifer"], jenny: ["jennifer"],
  becky: ["rebecca"],
  vicki: ["victoria"], vicky: ["victoria"],
  chuck: ["charles"], charlie: ["charles"],
  al: ["albert", "alan", "allen", "alfred"],
  fred: ["frederick"], freddie: ["frederick"],
  gene: ["eugene"],
  hank: ["henry"],
  jerry: ["gerald", "jerome", "jeremiah"],
  ray: ["raymond"],
  russ: ["russell"],
  terry: ["terrence", "terence", "theresa"],
  walt: ["walter"],
  abe: ["abraham"],
  alex: ["alexander", "alexandra"],
  nate: ["nathan", "nathaniel"],
  max: ["maxwell", "maximilian"],
  kim: ["kimberly"],
  sandy: ["sandra"],
  mandy: ["amanda"],
  mel: ["melvin", "melissa"], missy: ["melissa"],
  gabe: ["gabriel"],
  zach: ["zachary"], zack: ["zachary"],
  josh: ["joshua"],
  jake: ["jacob"],
  ike: ["isaac"],
  lou: ["louis"],
  vince: ["vincent"],
  wes: ["wesley"],
  phil: ["philip", "phillip"], phillip: ["philip"],
  leo: ["leonard"], lenny: ["leonard"],
  tina: ["christina"],
  cindy: ["cynthia"],
  barb: ["barbara"],
  pam: ["pamela"],
  ginny: ["virginia"],
  connie: ["constance"],
  dot: ["dorothy"], dottie: ["dorothy"],
  manny: ["manuel"],
  rudy: ["rudolph"],
  stan: ["stanley"],
  herb: ["herbert"],
  randy: ["randall", "randolph"],
  jeremy: ["jeremiah"],
  toby: ["tobias"],
  mitch: ["mitchell"],
  marty: ["martin"],
  sid: ["sidney"],
  cliff: ["clifford"],
  rod: ["rodney"],
  rex: ["reginald"], reggie: ["reginald"],
  lonnie: ["alonzo"],
  van: ["vanessa"],
};

/** Names in a NICKNAMES formal list that are themselves spelled two ways. */
const FORMAL_ALIASES: Record<string, string> = { stephen: "steven", phillip: "philip", debra: "deborah", kathryn: "katherine", catherine: "katherine", terence: "terrence" };

function formalForms(t: string): Set<string> {
  const out = new Set<string>([FORMAL_ALIASES[t] ?? t]);
  for (const f of NICKNAMES[t] ?? []) out.add(FORMAL_ALIASES[f] ?? f);
  return out;
}

export type ParsedName = {
  /** Every first name the spelling can go by: the first token, a quoted nickname, and - when the
   *  first token is a bare initial ("J. Noah Spinner") - the middle name it goes by. */
  firsts: string[];
  middles: string[];
  last: string;
  suffix: string | null;
};

function clean(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function words(s: string): string[] {
  // Apostrophes and hyphens join ("O'Mara", "Hill-Evans" are one surname); anything else splits.
  return s.replace(/['’-]/g, "").replace(/[^A-Za-z\s]/g, " ").toLowerCase().split(/\s+/).filter(Boolean);
}

/** Surname particles that belong to the name after them: "von Gillern", "De Stefano", "O Day". */
const PARTICLES = new Set(["o", "de", "la", "le", "van", "von", "der", "den", "du", "di", "da", "del", "della", "des", "dos", "st", "mc", "mac", "ten", "ter"]);

const QUOTED = /["“”](.+?)["“”]|\((.+?)\)/g;

export function parseName(name: string): ParsedName | null {
  const raw = clean(name);
  // A quoted or bracketed nickname; an all-caps bracket is a ballot line ("(CON)", "(WOR)"), not a name.
  const quoted = [...raw.matchAll(QUOTED)]
    .filter((m) => !(m[2] && /^[A-Z]{2,5}$/.test(m[2].trim())))
    .flatMap((m) => words(m[1] ?? m[2] ?? ""));
  let t = words(raw.replace(QUOTED, " "));
  let suffix: string | null = null;
  // A suffix sits at the end ("Smith Jr", "Smith III").
  while (t.length > 2 && SUFFIXES.has(t[t.length - 1])) { suffix = t[t.length - 1]; t = t.slice(0, -1); }
  // A lone trailing letter is a middle initial from a last-name-first source ("Mooney, James V"),
  // not a surname and not a fifth generation.
  if (t.length > 2 && t[t.length - 1].length === 1) t = [t[0], t[t.length - 1], ...t.slice(1, -1)];
  // One misplaced mid-name ("Smith Jr Robert" from a last-name-first source) still counts.
  const inner = t.find((w) => SUFFIXES.has(w));
  if (inner) { suffix = suffix ?? inner; t = t.filter((w) => !SUFFIXES.has(w)); }
  while (t.length > 2 && PARTICLES.has(t[t.length - 2])) t = [...t.slice(0, -2), t[t.length - 2] + t[t.length - 1]];
  if (t.length < 2) return null;
  const first = t[0], last = t[t.length - 1], middles = t.slice(1, -1);
  const firsts = [first, ...quoted.filter((q) => q.length > 1)];
  if (first.length === 1 && middles[0] && middles[0].length > 1) firsts.push(middles[0]);
  // A middle that is just a nickname of the first name ("Steven Steve Choi") is no middle.
  const realMiddles = middles.filter((m) => !firstNamesAgree([first], [m]));
  return { firsts, middles: realMiddles, last, suffix };
}

export function firstNamesAgree(a: string[], b: string[]): boolean {
  for (const x of a) for (const y of b) {
    if (x.length === 1 || y.length === 1) continue;
    const fx = formalForms(x), fy = formalForms(y);
    if ([...fx].some((f) => fy.has(f))) return true;
  }
  return false;
}

function middleAgrees(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return a[0] === b[0];
  return [...formalForms(a)].some((f) => formalForms(b).has(f));
}

/** Missing middles agree with anything; otherwise some middle of one must agree with one of the
 *  other ("Kathleen R. J. Dillingham" and "Kathleen Jackson Dillingham" share the J). */
function middlesAgree(a: string[], b: string[]): boolean {
  return a.length === 0 || b.length === 0 || a.some((x) => b.some((y) => middleAgrees(x, y)));
}

/** Why two spellings cannot be one person, or null when the names agree. */
export function nameConflict(a: ParsedName, b: ParsedName): string | null {
  if (a.last !== b.last) return "surname";
  if (!firstNamesAgree(a.firsts, b.firsts)) {
    // "J. Noah Spinner" and "John Noah Spinner": an initial agrees with a first name it starts
    // only when a full middle name agrees too - a bare "J. Spinner" is too little to go on.
    const [fa, fb] = [a.firsts[0], b.firsts[0]];
    const initialMatch = (fa.length === 1 || fb.length === 1) && fa[0] === fb[0];
    const fullMiddle = (n: ParsedName) => n.middles.some((m) => m.length > 1);
    if (!(initialMatch && fullMiddle(a) && fullMiddle(b) && middlesAgree(a.middles, b.middles))) return "first name";
  }
  if (!middlesAgree(a.middles, b.middles)) return "middle name";
  if (a.suffix && b.suffix && a.suffix !== b.suffix) return "suffix";
  return null;
}
