export const drawerSystems = {
  'antaro': {
    name: 'Blum TANDEMBOX antaro',
    bottomWidthDeduct: 75,   // LW - 75 mm
    bottomLengthDeduct: 24,  // NL - 24 mm
    backWidthDeduct: 87,     // LW - 87 mm
    minClearanceTop: 2,
    minClearanceBottom: 2
  },
  'merivobox': {
    name: 'Blum MERIVOBOX',
    bottomWidthDeduct: 51,   // LW - 51 mm
    bottomLengthDeduct: 26,  // NL - 26 mm
    backWidthDeduct: 51,     // LW - 51 mm (w Merivobox tył jest zlicowany z dnem)
    minClearanceTop: 2,
    minClearanceBottom: 2
  },
  'legrabox': {
    name: 'Blum LEGRABOX',
    bottomWidthDeduct: 35,   // LW - 35 mm
    bottomLengthDeduct: 10,  // NL - 10 mm
    backWidthDeduct: 38,     // LW - 38 mm
    minClearanceTop: 2,
    minClearanceBottom: 2
  },
  'gtv_axis_16': {
    name: 'GTV Axis Pro (płyta 16mm)',
    bottomWidthDeduct: 74,   // Szacunkowe, do weryfikacji z katalogiem GTV
    bottomLengthDeduct: 24,  
    backWidthDeduct: 87,     
    minClearanceTop: 2,
    minClearanceBottom: 2
  },
  'gtv_axis_18': {
    name: 'GTV Axis Pro (płyta 18mm)',
    bottomWidthDeduct: 74,   // Szacunkowe, do weryfikacji z katalogiem GTV
    bottomLengthDeduct: 24,
    backWidthDeduct: 87,
    minClearanceTop: 2,
    minClearanceBottom: 2
  }
};