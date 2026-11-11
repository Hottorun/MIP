/**
 * Value-relevant factory options per variant, with an estimated effect on the market value
 * (0.08 = +8 % against the median). Estimates from market reports, auction results and dealer
 * listings (Hagerty, Elferspot, Classic.com, RM Sotheby's, Total 911); effects multiply.
 * Only options that buyers pay noticeably more (or less) for are listed.
 */
/** [name, impact, name of an option it requires] */
type Opt = [name: string, impact: number, requires?: string];

// Shared building blocks
const manual = (impact: number, label = "Schaltgetriebe (statt Tiptronic)"): Opt => [label, impact];
const paint = (impact = 0.08): Opt => ["Farbsonderwunsch (Sonderlack ab Werk)", impact];
const pts = (impact = 0.08): Opt => ["Paint to Sample (Sonderfarbe)", impact];
const noSunroof = (impact = 0.05): Opt => ["Ohne Schiebedach (Entfall ab Werk)", impact];
const lsd = (impact = 0.03): Opt => ["Sperrdifferenzial", impact];
const sportSeats = (impact = 0.03): Opt => ["Sportsitze (Recaro)", impact];
const m030: Opt = ["Sportfahrwerk M030", 0.04];
const aerokit = (impact = 0.06): Opt => ["Aerokit ab Werk", impact];
const pccb = (impact = 0.03): Opt => ["Keramikbremse (PCCB)", impact];
const lift = (impact = 0.03): Opt => ["Liftsystem Vorderachse", impact];
const buckets = (impact = 0.05): Opt => ["Vollschalensitze (Carbon)", impact];
const chrono = (impact = 0.02): Opt => ["Sport Chrono Paket", impact];
const exhaust = (impact = 0.02): Opt => ["Sportabgasanlage", impact];
const clubsport = (impact = 0.03): Opt => ["Clubsport-Paket (Überrollbügel, Sechspunktgurt)", impact];
const weissach = (impact = 0.1): Opt => ["Weissach-Paket (Carbon, Magnesiumräder)", impact];
const heritage = (impact = 0.08): Opt => ["Heritage Design Paket", impact];
const rudge = (impact = 0.1): Opt => ["Rudge-Zentralverschlussräder", impact];
const sunroof356 = (impact = 0.06): Opt => ["Stahlschiebedach ab Werk", impact];
const radio: Opt = ["Becker-Radio ab Werk", 0.01];
/** Automatic gearbox where most cars are manuals: trades below the median. */
const automatic = (impact: number, label = "Automatik (statt Schaltgetriebe)"): Opt => [label, impact];
/** Semi-automatic Sportomatic (1967–1980): most early 911s are manual, so it trades below the median. */
const sportomatic = (impact = -0.15): Opt => ["Sportomatic (statt Schaltgetriebe)", impact];
/** Model year 1972 only: oil filler behind the right door ("Ölklappe"). */
const oilFlap = (impact = 0.04): Opt => ["Ölklappe (nur Modelljahr 1972)", impact];

export const OPTIONS: Record<string, Opt[]> = {
  // 356
  "porsche-356-356-pre-a-coupe": [["Motor 1500 Super (70 PS)", 0.12], ["Faltschiebedach (Golde)", 0.06], radio, paint(0.06)],
  "porsche-356-356-a-coupe": [["Motor 1600 Super (75 PS)", 0.08], rudge(0.12), sunroof356(), radio, paint(0.06)],
  "porsche-356-356-b-coupe": [["Motor 1600 Super 90 (90 PS)", 0.09], rudge(), sunroof356(), radio, paint(0.06)],
  "porsche-356-356-c-coupe": [["Motor SC (95 PS)", 0.12], sunroof356(), radio, paint(0.06)],
  "porsche-356-356-speedster": [["Motor 1600 Super (75 PS)", 0.12], rudge(0.12), ["Werks-Hardtop", 0.04], paint(0.06)],
  "porsche-356-356-carrera-2": [rudge(0.08), ["Werks-Hardtop", 0.03], paint(0.06)],
  "porsche-356-356-b-carrera-1600-gs-gt-coupe": [["Original-Motor 692/3 (Matching Numbers)", 0.15], rudge(0.05), paint(0.06)],

  // 912
  "porsche-912-912-coupe": [["5-Gang-Getriebe (Typ 902/1)", 0.06], ["Armaturenbrett mit fünf Rundinstrumenten", 0.05], ["Stahlschiebedach", 0.03], paint(0.06)],
  "porsche-912-912-e": [sportSeats(), ["Elektrisches Schiebedach", 0.02], ["Klimaanlage", 0.02], paint(0.06)],

  // 930
  "porsche-930-turbo-3-0": [noSunroof(), sportSeats(), paint()],
  "porsche-930-turbo-3-3": [["5-Gang-Getriebe G50 (nur Modelljahr 1989)", 0.2], ["Werks-Leistungssteigerung 330 PS (WLS)", 0.08], noSunroof(), sportSeats(), paint()],
  "porsche-930-turbo-3-3-flachbau": [["5-Gang-Getriebe G50 (nur Modelljahr 1989)", 0.15], ["Werks-Leistungssteigerung 330 PS (WLS)", 0.05], noSunroof(), paint()],

  // 959
  "porsche-959-959-komfort": [paint(0.06), ["Innenausstattung in Sonderleder", 0.02]],
  "porsche-959-959-sport": [paint(0.05)],

  // Transaxle (924, 944, 968, 928): automatics trade well below manuals, except on the 928 where most were automatics.
  "porsche-924-924": [["5-Gang-Getriebe", 0.04], ["Herausnehmbares Dachteil (Targadach)", 0.02], automatic(-0.12), paint(0.04)],
  "porsche-924-924-turbo": [["Serie 2 (177 PS, ab Modelljahr 1981)", 0.05], ["Zweifarbenlackierung ab Werk", 0.06], lsd(), sportSeats(), paint(0.05)],
  "porsche-924-924-carrera-gt": [lsd(), sportSeats(), paint(0.05)],
  "porsche-924-924-carrera-gts": [["Clubsport-Ausführung (270 PS)", 0.15]],
  "porsche-924-924-s": [["Modelljahr 1988 (160 PS)", 0.04], sportSeats(), automatic(-0.1), paint(0.04)],
  "porsche-944-944": [m030, ["Modelljahr 1989 (2,7 l, 165 PS)", 0.04], sportSeats(), automatic(-0.12), paint(0.05)],
  "porsche-944-944-turbo": [["Modelljahr 1989–1991 (250 PS)", 0.08], ["Sportfahrwerk M030", 0.06], lsd(0.04), sportSeats(), paint(0.05)],
  "porsche-944-944-s": [m030, lsd(), sportSeats(), paint(0.05)],
  "porsche-944-944-turbo-s": [lsd(0.03), paint(0.04)],
  "porsche-944-944-s2": [m030, lsd(), sportSeats(), automatic(-0.1), paint(0.05)],
  "porsche-968-968": [["Sportfahrwerk M030", 0.08], lsd(0.04), sportSeats(), automatic(-0.12, "Tiptronic (statt Schaltgetriebe)"), paint(0.05)],
  "porsche-968-968-cs": [["Sportfahrwerk M030", 0.08], lsd(0.04), paint(0.05)],
  "porsche-968-968-turbo-s": [],
  "porsche-928-928": [manual(0.12, "Schaltgetriebe (statt Automatik)"), sportSeats(0.02), paint(0.05)],
  "porsche-928-928-s": [manual(0.12, "Schaltgetriebe (statt Automatik)"), ["Sportfahrwerk", 0.03], paint(0.05)],
  "porsche-928-928-s4": [manual(0.15, "Schaltgetriebe (statt Automatik)"), lsd(), sportSeats(), paint(0.05)],
  "porsche-928-928-gt": [sportSeats(), paint(0.05)],
  "porsche-928-928-gts": [manual(0.2, "Schaltgetriebe (statt Automatik)"), sportSeats(), paint(0.05)],

  // F-Modell (1964–1973)
  "porsche-911-f-modell-2-0": [["Fuchs-Schmiederäder (ab 1967)", 0.03], ["Stahlschiebedach", 0.03], radio, paint(0.06)],
  "porsche-911-f-modell-s-2-0": [sportomatic(), ["Stahlschiebedach", 0.03], radio, paint(0.06)],
  "porsche-911-f-modell-l-2-0": [sportomatic(), ["Stahlschiebedach", 0.03], radio, paint(0.06)],
  "porsche-911-f-modell-t-2-0": [sportomatic(), ["5-Gang-Getriebe", 0.04], ["Fuchs-Schmiederäder", 0.04], ["Stahlschiebedach", 0.03], paint(0.06)],
  "porsche-911-f-modell-e-2-0": [sportomatic(), ["Stahlschiebedach", 0.03], radio, paint(0.06)],
  "porsche-911-f-modell-t-2-2": [sportomatic(), ["5-Gang-Getriebe", 0.04], ["Fuchs-Schmiederäder", 0.04], ["Stahlschiebedach", 0.03], paint(0.06)],
  "porsche-911-f-modell-e-2-2": [sportomatic(), ["Stahlschiebedach", 0.03], radio, paint(0.06)],
  "porsche-911-f-modell-s-2-2": [lsd(), radio, paint(0.08)],
  "porsche-911-f-modell-t-2-4": [sportomatic(), ["5-Gang-Getriebe", 0.04], ["Fuchs-Schmiederäder", 0.04], oilFlap(), paint(0.06)],
  "porsche-911-f-modell-e-2-4": [sportomatic(), ["5-Gang-Getriebe", 0.03], oilFlap(), paint(0.06)],
  "porsche-911-f-modell-s-2-4": [["5-Gang-Getriebe", 0.03], oilFlap(0.05), lsd(), paint(0.08)],
  "porsche-911-f-modell-carrera-rs-2-7": [["Sport-Ausstattung M471 (Leichtbau, 960 kg)", 0.6], paint(0.05)],

  // G-Modell (1973–1989); 911 Turbo see 930
  "porsche-911-g-modell-2-7": [sportomatic(), ["5-Gang-Getriebe", 0.03], ["Jubiläumsmodell 25 Jahre (Modelljahr 1975, Silber)", 0.1], ["Stahlschiebedach", 0.02], paint(0.06)],
  "porsche-911-g-modell-s-2-7": [sportomatic(), ["5-Gang-Getriebe", 0.03], ["Jubiläumsmodell 25 Jahre (Modelljahr 1975, Silber)", 0.1], paint(0.06)],
  "porsche-911-g-modell-carrera-2-7": [noSunroof(0.04), lsd(), sportSeats(), paint(0.08)],
  "porsche-911-g-modell-carrera-3-0": [sportomatic(-0.2), ["5-Gang-Getriebe", 0.03], noSunroof(0.04), lsd(), sportSeats(), paint(0.06)],
  "porsche-911-g-modell-carrera-rs-3-0": [paint(0.05)],
  "porsche-911-g-modell-sc": [
    sportomatic(),
    ["Sport-Paket (Front- und Heckspoiler, Bilstein, 16-Zoll-Fuchs)", 0.05],
    ["Jubiläumsmodell 50 Jahre Porsche (Modelljahr 1982, Meteormetallic)", 0.06],
    noSunroof(0.04),
    lsd(),
    paint(0.06),
  ],
  "porsche-911-g-modell-sc-rs": [],
  "porsche-911-g-modell-carrera-3-2": [
    ["5-Gang-Getriebe G50 (ab Modelljahr 1987)", 0.15],
    ["Werks-Turbolook M491", 0.3],
    ["Jubiläumsmodell 250.000 Elfer (Modelljahr 1988, Diamantblau)", 0.08],
    noSunroof(0.05),
    lsd(),
    sportSeats(),
    paint(0.06),
  ],
  "porsche-911-g-modell-carrera-3-2-clubsport": [paint(0.05)],
  "porsche-911-g-modell-speedster": [["Schmale Karosserie (171 Exportfahrzeuge)", 0.6], paint(0.06)],

  // 964
  "porsche-911-964-carrera-2":[manual(0.12), noSunroof(0.04), lsd(), m030, sportSeats(), ["Cup-Räder 17 Zoll", 0.02], paint()],
  "porsche-911-964-carrera-4": [noSunroof(0.04), m030, sportSeats(), ["Cup-Räder 17 Zoll", 0.02], paint()],
  "porsche-911-964-turbo": [["Werks-Leistungssteigerung X33 (355 PS)", 0.1], noSunroof(), sportSeats(), paint()],
  "porsche-911-964-turbo-3-6": [["Flachbau (Exclusive X85)", 0.4], noSunroof(), sportSeats(), paint()],
  "porsche-911-964-speedster": [manual(0.1), ["Turbo-Look-Karosserie (ab Werk)", 0.6], sportSeats(), paint()],
  "porsche-911-964-carrera-rs": [
    ["Clubsport-Paket M003", 0.16],
    ["Touring-Ausstattung M002 (Komfortsitze, el. Fensterheber)", -0.03],
    paint(0.07),
  ],
  "porsche-911-964-turbo-s-leichtbau": [paint(0.05)],
  "porsche-911-964-carrera-rs-3-8": [paint(0.05)],

  // 993
  "porsche-911-993-carrera": [manual(0.15, "Schaltgetriebe (statt Tiptronic S)"), ["Werks-Leistungssteigerung X51 (300 PS)", 0.18], aerokit(0.08), noSunroof(), lsd(), sportSeats(), paint()],
  "porsche-911-993-carrera-4": [["Werks-Leistungssteigerung X51 (300 PS)", 0.15], aerokit(0.08), noSunroof(), sportSeats(), paint()],
  "porsche-911-993-carrera-4s": [["Werks-Leistungssteigerung X51 (300 PS)", 0.12], noSunroof(), sportSeats(), paint()],
  "porsche-911-993-targa": [manual(0.12, "Schaltgetriebe (statt Tiptronic S)"), ["Werks-Leistungssteigerung X51 (300 PS)", 0.12], sportSeats(), paint()],
  "porsche-911-993-carrera-s": [manual(0.12, "Schaltgetriebe (statt Tiptronic S)"), ["Werks-Leistungssteigerung X51 (300 PS)", 0.15], noSunroof(), sportSeats(), paint()],
  "porsche-911-993-carrera-rs": [["Clubsport-Paket M003", 0.2], paint(0.06)],
  "porsche-911-993-turbo": [["Werks-Leistungssteigerung X50 (430 PS)", 0.12], noSunroof(), sportSeats(), ["Carbon-Interieur", 0.02], paint()],
  "porsche-911-993-turbo-s": [paint()],
  "porsche-911-993-gt2": [clubsport(0.04), paint(0.05)],

  // 996.1 (1997–2001)
  "porsche-911-996-1-carrera": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), aerokit(), lsd(), sportSeats(), ["Hardtop (Cabriolet)", 0.02], paint(0.06)],
  "porsche-911-996-1-turbo": [manual(0.15, "Schaltgetriebe (statt Tiptronic S)"), ["Werks-Leistungssteigerung X50 (450 PS)", 0.08], aerokit(0.05), pccb(0.02), paint(0.06)],
  "porsche-911-996-1-gt3": [clubsport(0.08), ["Schalensitze", 0.04], paint(0.06)],
  "porsche-911-996-1-gt2": [clubsport(0.04), ["Schalensitze", 0.03], paint(0.05)],

  // 996.2 (2001–2005)
  "porsche-911-996-2-carrera": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), ["Werks-Leistungssteigerung X51 (345 PS)", 0.06], aerokit(), lsd(), sportSeats(), paint(0.06)],
  "porsche-911-996-2-carrera-4s": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), ["Werks-Leistungssteigerung X51 (345 PS)", 0.06], sportSeats(), paint(0.06)],
  "porsche-911-996-2-targa": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), sportSeats(), paint(0.06)],
  "porsche-911-996-2-turbo-s": [manual(0.15, "Schaltgetriebe (statt Tiptronic S)"), sportSeats(), paint(0.06)],
  "porsche-911-996-2-gt3": [clubsport(0.06), pccb(), ["Schalensitze", 0.04], paint(0.06)],
  "porsche-911-996-2-gt3-rs": [pccb(), ["Schalensitze (Carbon)", 0.03]],

  // 997.1 (2004–2008)
  "porsche-911-997-1-carrera-s": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), ["Werks-Leistungssteigerung X51 (381 PS)", 0.1], lsd(0.04), chrono(), aerokit(0.05), ["Adaptive Sportsitze", 0.02], paint(0.06)],
  "porsche-911-997-1-turbo": [manual(0.18, "Schaltgetriebe (statt Tiptronic S)"), chrono(), pccb(0.02), aerokit(0.03), paint(0.06)],
  "porsche-911-997-1-gt3": [clubsport(0.04), pccb(0.04), buckets(), paint()],
  "porsche-911-997-1-gt3-rs": [["Farbe Orange oder Grün (statt Silber/Schwarz)", 0.06], pccb(0.04)],
  "porsche-911-997-1-gt2": [clubsport(), paint(0.05)],

  // 997.2 (2008–2012)
  "porsche-911-997-2-carrera-s": [manual(0.12, "Schaltgetriebe (statt PDK)"), ["Werks-Leistungssteigerung Powerkit (408 PS)", 0.08], lsd(), chrono(), pccb(0.02), paint(0.06)],
  "porsche-911-997-2-turbo": [manual(0.2, "Schaltgetriebe (statt PDK)"), chrono(), pccb(0.02), paint(0.06)],
  "porsche-911-997-2-turbo-s": [exhaust(), buckets(0.04), paint(0.06)],
  "porsche-911-997-2-sport-classic": [pccb(), chrono()],
  "porsche-911-997-2-speedster": [["Lackierung Carraraweiß (statt Pure Blue)", 0.04], pccb(0.02)],
  "porsche-911-997-2-gt3": [clubsport(0.04), pccb(0.04), lift(), buckets(), paint()],
  "porsche-911-997-2-gt3-rs": [pccb(0.04), lift(0.04)],
  "porsche-911-997-2-gt3-rs-4-0": [pccb(), lift(0.04)],
  "porsche-911-997-2-gt2-rs": [clubsport(0.02)],

  // 991.1 (2011–2015)
  "porsche-911-991-1-carrera-s": [manual(0.1, "Schaltgetriebe (statt PDK)"), chrono(), exhaust(), pccb(0.02), buckets(0.04), aerokit(0.03), pts(0.06)],
  "porsche-911-991-1-turbo-s": [lift(), exhaust(), buckets(0.03), pts(0.06)],
  "porsche-911-991-1-50-jahre-edition": [manual(0.12, "Schaltgetriebe (statt PDK)"), chrono(), pccb(0.02)],
  "porsche-911-991-1-gt3": [clubsport(0.02), pccb(), lift(0.04), buckets(0.06), pts()],
  "porsche-911-991-1-gt3-rs": [lift(0.04), pccb(), pts()],
  "porsche-911-991-1-r": [lift(), pts(0.1)],

  // 991.2 (2015–2019)
  "porsche-911-991-2-carrera-s": [manual(0.1, "Schaltgetriebe (statt PDK)"), chrono(), exhaust(), ["Hinterachslenkung", 0.02], pccb(0.02), buckets(0.04), pts(0.06)],
  "porsche-911-991-2-carrera-t": [manual(0.1, "Schaltgetriebe (statt PDK)"), ["Hinterachslenkung", 0.02], buckets(0.04), pts(0.06)],
  "porsche-911-991-2-turbo-s": [lift(), exhaust(), buckets(0.03), pts(0.06)],
  "porsche-911-991-2-speedster": [heritage(), lift(0.02), pts(0.06)],
  "porsche-911-991-2-gt3": [
    manual(0.15, "Schaltgetriebe (statt PDK)"),
    ["Touring-Paket (ohne Heckflügel)", 0.05, "Schaltgetriebe (statt PDK)"],
    clubsport(0.02),
    pccb(),
    lift(0.04),
    buckets(0.06),
    pts(),
  ],
  "porsche-911-991-2-gt3-rs": [weissach(), lift(0.04), pccb(), pts()],
  "porsche-911-991-2-gt2-rs": [weissach(0.12), lift(), pts(0.06)],

  // 992.1 (2019–2024)
  "porsche-911-992-1-carrera-s": [manual(0.06, "Schaltgetriebe (statt PDK)"), chrono(), ["Hinterachslenkung", 0.02], pccb(0.02), lift(0.02), buckets(0.03), pts(0.06)],
  "porsche-911-992-1-carrera-gts": [manual(0.08, "Schaltgetriebe (statt PDK)"), ["Leichtbau-Paket", 0.04], lift(0.02), buckets(0.03), pts(0.06)],
  "porsche-911-992-1-turbo-s": [["Leichtbau-Design-Paket", 0.04], lift(0.02), exhaust(), pts(0.06)],
  "porsche-911-992-1-gt3": [manual(0.08, "Schaltgetriebe (statt PDK)"), ["Touring-Paket (ohne Heckflügel)", 0.1], clubsport(0.02), lift(0.04), pccb(), buckets(), pts()],
  "porsche-911-992-1-gt3-rs": [weissach(0.08), lift(0.04), clubsport(0.01), pts()],
  "porsche-911-992-1-s-t": [heritage(0.1), lift(), pts(0.06)],
  "porsche-911-992-1-sport-classic": [lift(0.02), pts(0.06)],
  "porsche-911-992-1-dakar": [["Rallye Design Paket", 0.06], buckets(0.02), ["Dachträger mit Dachzelt (Zubehör)", 0.01]],

  // 992.2 (ab 2024), noch nah am Neupreis
  "porsche-911-992-2-carrera-s": [["Hinterachslenkung", 0.02], pccb(0.02), lift(0.02), buckets(0.03), pts(0.05)],
  "porsche-911-992-2-carrera-gts": [lift(0.02), buckets(0.03), pts(0.05)],
  "porsche-911-992-2-turbo-s": [lift(0.02), buckets(0.02), pts(0.05)],
  "porsche-911-992-2-gt3": [manual(0.06, "Schaltgetriebe (statt PDK)"), ["Touring-Paket (ohne Heckflügel)", 0.06], weissach(0.05), lift(0.03), pccb(0.02), pts(0.06)],

  // Boxster 986 (1996–2004)
  "porsche-boxster-986-boxster": [manual(0.1, "Schaltgetriebe (statt Tiptronic)"), ["Hardtop ab Werk", 0.03], sportSeats(), ["Litronic-Xenonscheinwerfer", 0.01], paint(0.06)],
  "porsche-boxster-986-boxster-s": [manual(0.1, "Schaltgetriebe (statt Tiptronic)"), ["Hardtop ab Werk", 0.03], ["Sportfahrwerk (tiefer)", 0.03], sportSeats(), paint(0.06)],
  "porsche-boxster-986-boxster-s-50-jahre-550-spyder": [manual(0.1, "Schaltgetriebe (statt Tiptronic)"), ["Hardtop ab Werk", 0.03], sportSeats(0.02)],

  // Boxster 987.1 (2004–2008)
  "porsche-boxster-987-1-boxster": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), ["Hardtop ab Werk", 0.03], ["PASM (adaptives Fahrwerk)", 0.02], chrono(), paint(0.06)],
  "porsche-boxster-987-1-boxster-s": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), ["Hardtop ab Werk", 0.03], lsd(), chrono(), ["PASM (adaptives Fahrwerk)", 0.02], ["Adaptive Sportsitze", 0.02], paint(0.06)],
  "porsche-boxster-987-1-boxster-rs-60-spyder": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), ["Hardtop ab Werk", 0.03], lsd(), chrono()],

  // Boxster 987.2 (2008–2012)
  "porsche-boxster-987-2-boxster": [manual(0.08, "Schaltgetriebe (statt PDK)"), ["Hardtop ab Werk", 0.03], chrono(), ["PASM (adaptives Fahrwerk)", 0.02], paint(0.06)],
  "porsche-boxster-987-2-boxster-s": [manual(0.08, "Schaltgetriebe (statt PDK)"), ["Hardtop ab Werk", 0.03], lsd(), chrono(), exhaust(), pccb(0.02), paint(0.06)],
  "porsche-boxster-987-2-boxster-s-black-edition": [manual(0.08, "Schaltgetriebe (statt PDK)"), lsd(), chrono(), exhaust()],
  "porsche-boxster-987-2-boxster-spyder": [manual(0.1, "Schaltgetriebe (statt PDK)"), lsd(), buckets(0.04), chrono(), ["Klimaanlage und Radio (beim Spyder Option)", -0.01], paint(0.06)],

  // Boxster 981 (2012–2016)
  "porsche-boxster-981-boxster": [manual(0.08, "Schaltgetriebe (statt PDK)"), chrono(), ["PASM (adaptives Fahrwerk)", 0.02], exhaust(), paint(0.05)],
  "porsche-boxster-981-boxster-s": [manual(0.08, "Schaltgetriebe (statt PDK)"), ["Porsche Torque Vectoring (PTV)", 0.02], chrono(), exhaust(), pccb(0.02), ["Sportsitze Plus", 0.02], paint(0.05)],
  "porsche-boxster-981-boxster-gts": [manual(0.1, "Schaltgetriebe (statt PDK)"), ["Porsche Torque Vectoring (PTV)", 0.02], pccb(0.02), buckets(0.04), pts(0.06)],
  "porsche-boxster-981-boxster-spyder": [buckets(0.05), pccb(0.02), ["Klimaanlage und Radio (beim Spyder Option)", -0.01], pts(0.08)],

  // 718 Boxster / 718 Spyder (Typ 982, 2016–2025)
  "porsche-718-718-boxster": [manual(0.06, "Schaltgetriebe (statt PDK)"), chrono(), exhaust(), ["PASM-Sportfahrwerk (-20 mm)", 0.02], pts(0.05)],
  "porsche-718-718-boxster-s": [manual(0.06, "Schaltgetriebe (statt PDK)"), chrono(), exhaust(), ["Porsche Torque Vectoring (PTV)", 0.02], pccb(0.02), pts(0.05)],
  "porsche-718-718-boxster-gts-4-0": [manual(0.08, "Schaltgetriebe (statt PDK)"), buckets(0.04), pccb(0.02), lift(0.01), pts(0.06)],
  "porsche-718-718-boxster-25-jahre": [manual(0.08, "Schaltgetriebe (statt PDK)"), buckets(0.03), ["Lackierung GT-Silber (statt Schwarz/Carraraweiß)", 0.03]],
  "porsche-718-718-spyder": [manual(0.08, "Schaltgetriebe (statt PDK)"), buckets(0.05), pccb(0.02), ["Klimaanlage und Radio (beim Spyder Option)", -0.01], pts(0.08)],
  "porsche-718-718-spyder-rs": [weissach(0.06), buckets(0.02), lift(0.02), pts(0.08)],

  // Cayman 987.1 (2005–2008)
  "porsche-cayman-987-1-cayman": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), chrono(), ["PASM (adaptives Fahrwerk)", 0.02], sportSeats(0.02), paint(0.06)],
  "porsche-cayman-987-1-cayman-s": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), lsd(), chrono(), ["PASM (adaptives Fahrwerk)", 0.02], ["Adaptive Sportsitze", 0.02], paint(0.06)],

  // Cayman 987.2 (2009–2012)
  "porsche-cayman-987-2-cayman": [manual(0.08, "Schaltgetriebe (statt PDK)"), chrono(), ["PASM (adaptives Fahrwerk)", 0.02], paint(0.06)],
  "porsche-cayman-987-2-cayman-s": [manual(0.08, "Schaltgetriebe (statt PDK)"), lsd(), chrono(), exhaust(), pccb(0.02), paint(0.06)],
  "porsche-cayman-987-2-cayman-r": [manual(0.1, "Schaltgetriebe (statt PDK)"), lsd(), buckets(0.04), ["Klimaanlage und Radio (beim R Option)", -0.01], paint(0.06)],

  // Cayman 981 (2013–2016)
  "porsche-cayman-981-cayman": [manual(0.08, "Schaltgetriebe (statt PDK)"), chrono(), ["PASM (adaptives Fahrwerk)", 0.02], exhaust(), paint(0.05)],
  "porsche-cayman-981-cayman-s": [manual(0.08, "Schaltgetriebe (statt PDK)"), ["Porsche Torque Vectoring (PTV)", 0.02], chrono(), exhaust(), pccb(0.02), paint(0.05)],
  "porsche-cayman-981-cayman-gts": [manual(0.1, "Schaltgetriebe (statt PDK)"), ["Porsche Torque Vectoring (PTV)", 0.02], pccb(0.02), buckets(0.04), pts(0.06)],
  "porsche-cayman-981-cayman-gt4": [clubsport(0.03), buckets(0.04), pccb(0.02), chrono(0.01), pts(0.08)],

  // 718 Cayman (Typ 982, 2016–2025)
  "porsche-718-718-cayman": [manual(0.06, "Schaltgetriebe (statt PDK)"), chrono(), exhaust(), ["PASM-Sportfahrwerk (-20 mm)", 0.02], pts(0.05)],
  "porsche-718-718-cayman-s": [manual(0.06, "Schaltgetriebe (statt PDK)"), chrono(), exhaust(), ["Porsche Torque Vectoring (PTV)", 0.02], pccb(0.02), pts(0.05)],
  "porsche-718-718-cayman-gts-4-0": [manual(0.08, "Schaltgetriebe (statt PDK)"), buckets(0.04), pccb(0.02), lift(0.01), pts(0.06)],
  "porsche-718-718-cayman-gt4": [manual(0.08, "Schaltgetriebe (statt PDK)"), clubsport(0.02), buckets(0.04), pccb(0.02), lift(0.02), pts(0.08)],
  "porsche-718-718-cayman-gt4-rs": [weissach(0.08), clubsport(0.01), lift(0.02), pts(0.08)],

  // Supercars
  "porsche-carrera-gt-carrera-gt": [paint(), ["Leder in Sonderfarbe (z. B. Ascot-Braun, Terrakotta)", 0.03], ["Werks-Gepäckset", 0.02]],
  "porsche-918-918-spyder": [["Lackierung Liquid Metal (Chrome Blue oder Silver)", 0.08], pts(0.06), lift(0.02)],
  "porsche-918-918-spyder-weissach": [["Historisches Dekor (Martini oder Salzburg)", 0.06], lift(0.02)],
};
