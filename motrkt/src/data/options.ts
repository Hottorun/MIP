/**
 * Value-relevant factory options per variant, with an estimated effect on the market value
 * (0.08 = +8 % against the median). Estimates from market reports, auction results and dealer
 * listings (Hagerty, Elferspot, Classic.com, RM Sotheby's, Total 911); effects multiply.
 * Only options that buyers pay noticeably more (or less) for are listed.
 */
type Opt = [name: string, impact: number];

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

export const OPTIONS: Record<string, Opt[]> = {
  // 356
  "porsche-356-356-pre-a-coupe": [["Motor 1500 Super (70 PS)", 0.12], ["Faltschiebedach (Golde)", 0.06], radio, paint(0.06)],
  "porsche-356-356-a-coupe": [["Motor 1600 Super (75 PS)", 0.08], rudge(0.12), sunroof356(), radio, paint(0.06)],
  "porsche-356-356-b-coupe": [["Motor 1600 Super 90 (90 PS)", 0.09], rudge(), sunroof356(), radio, paint(0.06)],
  "porsche-356-356-c-coupe": [["Motor SC (95 PS)", 0.12], sunroof356(), radio, paint(0.06)],
  "porsche-356-356-speedster": [["Motor 1600 Super (75 PS)", 0.12], rudge(0.12), ["Werks-Hardtop", 0.04], paint(0.06)],
  "porsche-356-356-carrera-2": [rudge(0.08), ["Werks-Hardtop", 0.03], paint(0.06)],

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

  // 964
  "porsche-911-964-carrera-2": [manual(0.12), noSunroof(0.04), lsd(), m030, sportSeats(), ["Cup-Räder 17 Zoll", 0.02], paint()],
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

  // 996
  "porsche-911-996-carrera": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), aerokit(), lsd(), sportSeats(), ["Hardtop (Cabriolet)", 0.02], paint(0.06)],
  "porsche-911-996-carrera-4s": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), ["Werks-Leistungssteigerung X51 (345 PS)", 0.06], sportSeats(), paint(0.06)],
  "porsche-911-996-targa": [manual(0.1, "Schaltgetriebe (statt Tiptronic S)"), sportSeats(), paint(0.06)],
  "porsche-911-996-turbo": [manual(0.15, "Schaltgetriebe (statt Tiptronic S)"), ["Werks-Leistungssteigerung X50 (450 PS)", 0.08], aerokit(0.05), pccb(0.02), paint(0.06)],
  "porsche-911-996-turbo-s": [manual(0.15, "Schaltgetriebe (statt Tiptronic S)"), sportSeats(), paint(0.06)],
  "porsche-911-996-gt3": [clubsport(0.08), pccb(), ["Schalensitze", 0.04], paint(0.06)],
  "porsche-911-996-gt3-rs": [pccb(), ["Schalensitze (Carbon)", 0.03]],
  "porsche-911-996-gt2": [clubsport(0.04), ["Schalensitze", 0.03], paint(0.05)],

  // 997
  "porsche-911-997-carrera-s": [manual(0.1), ["Werks-Leistungssteigerung X51 (381 PS)", 0.1], lsd(0.04), chrono(), aerokit(0.05), ["Adaptive Sportsitze", 0.02], paint(0.06)],
  "porsche-911-997-turbo": [manual(0.18), chrono(), pccb(0.02), aerokit(0.03), paint(0.06)],
  "porsche-911-997-turbo-s": [exhaust(), buckets(0.04), paint(0.06)],
  "porsche-911-997-sport-classic": [pccb(), chrono()],
  "porsche-911-997-speedster": [["Lackierung Carraraweiß (statt Pure Blue)", 0.04], pccb(0.02)],
  "porsche-911-997-gt3": [clubsport(0.04), pccb(0.04), lift(), buckets(), paint()],
  "porsche-911-997-gt3-rs": [pccb(0.04), lift(0.04)],
  "porsche-911-997-gt3-rs-4-0": [pccb(), lift(0.04)],
  "porsche-911-997-gt2": [clubsport(), paint(0.05)],
  "porsche-911-997-gt2-rs": [clubsport(0.02)],

  // 991
  "porsche-911-991-carrera-s": [manual(0.1, "Schaltgetriebe (statt PDK)"), chrono(), exhaust(), pccb(0.02), buckets(0.04), aerokit(0.03), pts(0.06)],
  "porsche-911-991-carrera-t": [manual(0.1, "Schaltgetriebe (statt PDK)"), ["Hinterachslenkung", 0.02], buckets(0.04), pts(0.06)],
  "porsche-911-991-turbo-s": [lift(), exhaust(), buckets(0.03), pts(0.06)],
  "porsche-911-991-50-jahre-edition": [manual(0.12, "Schaltgetriebe (statt PDK)"), chrono(), pccb(0.02)],
  "porsche-911-991-speedster": [heritage(), lift(0.02), pts(0.06)],
  "porsche-911-991-gt3": [manual(0.15, "Schaltgetriebe (nur 991.2, statt PDK)"), clubsport(0.02), pccb(), lift(0.04), buckets(0.06), pts()],
  "porsche-911-991-gt3-rs": [weissach(), lift(0.04), pccb(), pts()],
  "porsche-911-991-r": [lift(), pts(0.1)],
  "porsche-911-991-gt3-touring": [lift(0.04), pccb(), buckets(), pts()],
  "porsche-911-991-gt2-rs": [weissach(0.12), lift(), pts(0.06)],

  // 992
  "porsche-911-992-carrera-s": [manual(0.06, "Schaltgetriebe (statt PDK)"), chrono(), ["Hinterachslenkung", 0.02], pccb(0.02), lift(0.02), buckets(0.03), pts(0.06)],
  "porsche-911-992-carrera-gts": [manual(0.08, "Schaltgetriebe (statt PDK)"), ["Leichtbau-Paket", 0.04], lift(0.02), buckets(0.03), pts(0.06)],
  "porsche-911-992-turbo-s": [["Leichtbau-Design-Paket", 0.04], lift(0.02), exhaust(), pts(0.06)],
  "porsche-911-992-gt3": [manual(0.08, "Schaltgetriebe (statt PDK)"), clubsport(0.02), lift(0.04), pccb(), buckets(), pts()],
  "porsche-911-992-gt3-touring": [manual(0.08, "Schaltgetriebe (statt PDK)"), lift(0.04), pccb(), buckets(), pts()],
  "porsche-911-992-gt3-rs": [weissach(0.08), lift(0.04), clubsport(0.01), pts()],
  "porsche-911-992-s-t": [heritage(0.1), lift(), pts(0.06)],
  "porsche-911-992-sport-classic": [lift(0.02), pts(0.06)],
  "porsche-911-992-dakar": [["Rallye Design Paket", 0.06], buckets(0.02), ["Dachträger mit Dachzelt (Zubehör)", 0.01]],

  // Supercars
  "porsche-carrera-gt-carrera-gt": [paint(), ["Leder in Sonderfarbe (z. B. Ascot-Braun, Terrakotta)", 0.03], ["Werks-Gepäckset", 0.02]],
  "porsche-918-918-spyder": [["Lackierung Liquid Metal (Chrome Blue oder Silver)", 0.08], pts(0.06), lift(0.02)],
  "porsche-918-918-spyder-weissach": [["Historisches Dekor (Martini oder Salzburg)", 0.06], lift(0.02)],
};
