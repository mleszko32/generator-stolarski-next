// Jedyne, wspólne źródło danych katalogowych dla wszystkich obsługiwanych
// systemów szuflad: odjęcia wymiarowe (dno/tył), warianty wysokości boku
// (do doboru na podstawie dostępnej przestrzeni) oraz offsety montażowe
// (pozycje otworów na prowadnice i front). Wcześniej te same dane były
// zduplikowane w drawerMath.js (CATALOG_DATA, HARDWARE_OFFSETS) oraz
// w nieużywanym module src/hardware/*.
export const drawerSystems = {
  'antaro': {
    name: 'Blum TANDEMBOX antaro',
    bottomWidthDeduct: 75,   // LW - 75 mm
    bottomLengthDeduct: 24,  // NL - 24 mm
    backWidthDeduct: 87,     // LW - 87 mm
    minClearanceTop: 2,
    minClearanceBottom: 2,
    nlSeries: [270, 300, 350, 400, 450, 500, 550, 600, 650], // katalog Blum: jedyny z tej listy, który sięga 650
    variants: {
      bardzoniska:  { type: 'N', height: 69,  minSpace: 82.5 },
      niska:        { type: 'M', height: 84,  minSpace: 98.5 },
      srednia:      { type: 'K', height: 116, minSpace: 130.5 },
      wysoka:       { type: 'C', height: 167, minSpace: 192 },
      bardzowysoka: { type: 'D', height: 199, minSpace: 224 }
    },
    mounting: { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
  },
  // NAPRAWA: Wcześniej ten wpis w ogóle nie istniał, mimo że "Blum TANDEMBOX"
  // był dostępny do wyboru w panelu właściwości (src/ui/properties.js).
  // Powodowało to, że getDrawerComponents() nie znajdowało systemu i po
  // cichu nie generowało formatek dna/tyłu szuflady. Klasyczny TANDEMBOX
  // korzysta z tych samych wymiarów odjęć i offsetów co antaro.
  'tandembox': {
    name: 'Blum TANDEMBOX',
    bottomWidthDeduct: 75,
    bottomLengthDeduct: 24,
    backWidthDeduct: 87,
    minClearanceTop: 2,
    minClearanceBottom: 2,
    nlSeries: [270, 300, 350, 400, 450, 500, 550, 600, 650],
    variants: {
      bardzoniska:  { type: 'N', height: 69,  minSpace: 82.5 },
      niska:        { type: 'M', height: 84,  minSpace: 98.5 },
      srednia:      { type: 'K', height: 116, minSpace: 130.5 },
      wysoka:       { type: 'C', height: 167, minSpace: 192 },
      bardzowysoka: { type: 'D', height: 199, minSpace: 224 }
    },
    mounting: { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
  },
  'merivobox': {
    name: 'Blum MERIVOBOX',
    bottomWidthDeduct: 51,   // LW - 51 mm
    bottomLengthDeduct: 26,  // NL - 26 mm
    backWidthDeduct: 51,     // LW - 51 mm (w Merivobox tył jest zlicowany z dnem)
    minClearanceTop: 2,
    minClearanceBottom: 2,
    nlSeries: [270, 300, 350, 400, 450, 500, 550, 600], // katalog Blum: Merivobox nie ma wariantu 650
    variants: {
      bardzoniska: { type: 'N', height: 60.5, minSpace: 85.5 },
      niska:       { type: 'M', height: 83,   minSpace: 108 },
      srednia:     { type: 'K', height: 121,  minSpace: 146 },
      wysoka:      { type: 'E', height: 184,  minSpace: 209 }
    },
    mounting: { railOffset: 54, frontHolesBase: 33.5, frontHolesXBase: 20.5 }
  },
  'legrabox': {
    name: 'Blum LEGRABOX',
    bottomWidthDeduct: 35,   // LW - 35 mm
    bottomLengthDeduct: 10,  // NL - 10 mm
    backWidthDeduct: 38,     // LW - 38 mm
    minClearanceTop: 2,
    minClearanceBottom: 2,
    nlSeries: [270, 300, 350, 400, 450, 500, 550, 600], // katalog Blum, profil 750 (40kg): bez wariantu 650
    variants: {
      bardzoniska: { type: 'N', height: 39,  minSpace: 80 },
      niska:       { type: 'M', height: 63,  minSpace: 106 },
      srednia:     { type: 'K', height: 101, minSpace: 144 },
      wysoka:      { type: 'C', height: 148, minSpace: 193 }
    },
    mounting: { railOffset: 38, frontHolesBase: 25, frontHolesXBase: 21.5 }
  },
  // ZWERYFIKOWANE z oficjalną kartą techniczną GTV ("Axis Pro karta techniczna",
  // wyd. 2020 i 2025, gtv.com.pl): bottomWidthDeduct było błędnie 74 (poprawnie
  // LW-75, GTV Axis Pro jest wymiarowo kompatybilny z Blum antaro/tandembox —
  // stąd te same odjęcia LW-75/NL-24/LW-87), brakowało wariantu "bardzo wysoka"
  // D (H=200, panel 199mm), a minSpace dla A/B/C było zaniżone względem
  // katalogowych wymiarów minimalnego otworu montażowego (patrz karta, sekcja
  // "WYMIARY MONTAŻOWE" — dla H=86/120/168/200 minimalne wysokości otworu to
  // odpowiednio 115/147/198/230 mm). Katalog 2025 rozszerzył zakres NL do
  // 250-600 (2020: 300-550); GTV nie oferuje NL 650 (to wyłącznie Blum antaro/
  // tandembox). Katalog 2025 wspomina też o piątym, jeszcze niższym wariancie
  // "H=68" — pominięty tu, bo nie udało się potwierdzić jego wymiarów dna/tyłu.
  'gtv_axis_16': {
    name: 'GTV Axis Pro (płyta 16mm)',
    bottomWidthDeduct: 75,   // LW - 75 mm
    bottomLengthDeduct: 24,  // NL - 24 mm
    backWidthDeduct: 87,     // LW - 87 mm
    minClearanceTop: 2,
    minClearanceBottom: 2,
    nlSeries: [250, 300, 350, 400, 450, 500, 550, 600],
    variants: {
      niska:        { type: 'A', height: 84,  minSpace: 115 },
      srednia:      { type: 'B', height: 116, minSpace: 147 },
      wysoka:       { type: 'C', height: 167, minSpace: 198 },
      bardzowysoka: { type: 'D', height: 199, minSpace: 230 }
    },
    mounting: { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
  },
  'gtv_axis_18': {
    name: 'GTV Axis Pro (płyta 18mm)',
    bottomWidthDeduct: 75,
    bottomLengthDeduct: 24,
    backWidthDeduct: 87,
    minClearanceTop: 2,
    minClearanceBottom: 2,
    nlSeries: [250, 300, 350, 400, 450, 500, 550, 600],
    variants: {
      niska:        { type: 'A', height: 84,  minSpace: 115 },
      srednia:      { type: 'B', height: 116, minSpace: 147 },
      wysoka:       { type: 'C', height: 167, minSpace: 198 },
      bardzowysoka: { type: 'D', height: 199, minSpace: 230 }
    },
    mounting: { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
  }
};