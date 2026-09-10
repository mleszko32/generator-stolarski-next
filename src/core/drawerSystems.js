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
    variants: {
      bardzoniska: { type: 'N', height: 39,  minSpace: 80 },
      niska:       { type: 'M', height: 63,  minSpace: 106 },
      srednia:     { type: 'K', height: 101, minSpace: 144 },
      wysoka:      { type: 'C', height: 148, minSpace: 193 }
    },
    mounting: { railOffset: 38, frontHolesBase: 25, frontHolesXBase: 21.5 }
  },
  'gtv_axis_16': {
    name: 'GTV Axis Pro (płyta 16mm)',
    bottomWidthDeduct: 74,   // Szacunkowe, do weryfikacji z katalogiem GTV
    bottomLengthDeduct: 24,
    backWidthDeduct: 87,
    minClearanceTop: 2,
    minClearanceBottom: 2,
    variants: {
      niska:   { type: 'A', height: 84,  minSpace: 105 },
      srednia: { type: 'B', height: 116, minSpace: 138 },
      wysoka:  { type: 'C', height: 167, minSpace: 195 }
    },
    mounting: { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
  },
  'gtv_axis_18': {
    name: 'GTV Axis Pro (płyta 18mm)',
    bottomWidthDeduct: 74,   // Szacunkowe, do weryfikacji z katalogiem GTV
    bottomLengthDeduct: 24,
    backWidthDeduct: 87,
    minClearanceTop: 2,
    minClearanceBottom: 2,
    variants: {
      niska:   { type: 'A', height: 84,  minSpace: 105 },
      srednia: { type: 'B', height: 116, minSpace: 138 },
      wysoka:  { type: 'C', height: 167, minSpace: 195 }
    },
    mounting: { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
  }
};