// src/ui/properties.js
import { state } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { renderEditor2D } from "../render/editor2d.js"; 

export function initPropertiesPanel() {
  const rightSidebar = document.querySelector(".sidebar-right");
  const activeModule = state.project.modules[0];
  const cons = state.project.construction || { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100 };

  rightSidebar.innerHTML = `
    <h2>Parametry</h2>
    
    <h3>Konstrukcja Korpusu</h3>
    <div class="property-group">
      <label>Sposób łączenia:</label>
      <select id="input-join-type">
        <option value="boki_przelotowe" ${cons.joinType === 'boki_przelotowe' ? 'selected' : ''}>Boki do ziemi (wieńce wpuszczane)</option>
        <option value="wience_przelotowe" ${cons.joinType === 'wience_przelotowe' ? 'selected' : ''}>Wieńce pełne (boki wpuszczane)</option>
      </select>
    </div>
    
    <div class="property-group">
      <label>Zamknięcie góry:</label>
      <select id="input-top-type">
        <option value="pelny" ${cons.topType === 'pelny' ? 'selected' : ''}>Pełny wieniec</option>
        <option value="trawersy_poziom" ${cons.topType === 'trawersy_poziom' ? 'selected' : ''}>Trawersy poziome</option>
        <option value="trawersy_pion" ${cons.topType === 'trawersy_pion' ? 'selected' : ''}>Trawersy pionowe</option>
      </select>
    </div>

    <div id="traverse-options" style="display: ${cons.topType !== 'pelny' ? 'block' : 'none'}; background: #f8fafc; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 4px; margin-bottom: 15px;">
      <div class="property-group" style="margin-bottom: 0;">
        <label style="font-size: 11px;">Szerokość trawersu (mm):</label>
        <input type="number" id="input-traverse-width" value="${cons.traverseWidth}" step="1" />
      </div>
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

    <div class="property-group">
      <label>Grubość płyty (mm):</label>
      <input type="number" id="input-board-thick" value="${state.project.materials.boardThickness}" step="0.1" />
    </div>
    <div class="property-group">
      <label>Szerokość (mm):</label>
      <input type="number" id="input-width" value="${activeModule.dimensions.width}" />
    </div>
    <div class="property-group">
      <label>Wysokość (mm):</label>
      <input type="number" id="input-height" value="${activeModule.dimensions.height}" />
    </div>
    <div class="property-group">
      <label>Głębokość (mm):</label>
      <input type="number" id="input-depth" value="${activeModule.dimensions.depth}" />
    </div>
    
    <div class="property-group">
      <label>Plecy:</label>
      <select id="input-back-type">
        <option value="nut" ${state.project.backPanel.type === 'nut' ? 'selected' : ''}>W nucie</option>
        <option value="nakladane" ${state.project.backPanel.type === 'nakladane' ? 'selected' : ''}>Nakładane</option>
      </select>
    </div>
    
    <div id="nut-options" style="display: ${state.project.backPanel.type === 'nut' ? 'block' : 'none'}; background: #f8fafc; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 4px; margin-bottom: 15px;">
      <div class="property-group" style="margin-bottom: 8px;">
        <label style="font-size: 11px; font-weight: bold;">Konstrukcja nutu:</label>
        <select id="input-nut-build">
          <option value="all" ${(!state.project.backPanel.nutBuild || state.project.backPanel.nutBuild === 'all') ? 'selected' : ''}>Boki i wieńce nutowane</option>
          <option value="sides" ${state.project.backPanel.nutBuild === 'sides' ? 'selected' : ''}>Boki nutowane, wieńce skracane</option>
          <option value="top_bottom" ${state.project.backPanel.nutBuild === 'top_bottom' ? 'selected' : ''}>Wieńce nutowane, boki skracane</option>
        </select>
      </div>
      <div class="property-group" style="margin-bottom: 8px;">
        <label style="font-size: 11px;">Odsunięcie nutu od tyłu (mm):</label>
        <input type="number" id="input-back-offset" value="${state.project.backPanel.offset !== undefined ? state.project.backPanel.offset : 16}" step="1" />
      </div>
      <div class="property-group" style="margin-bottom: 0;">
        <label style="font-size: 11px;">Głębokość nutu w płycie (mm):</label>
        <input type="number" id="input-back-groove" value="${state.project.backPanel.grooveDepth !== undefined ? state.project.backPanel.grooveDepth : 6}" step="1" />
      </div>
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">
    
    <h3>Ustawienia Frontów i Szuflad</h3>
    <p style="font-size: 0.8em; color: #64748b; margin-bottom: 10px;">
      (Wstawiaj fronty, półki i szuflady klikając w puste strefy na widoku 2D)
    </p>
    
    <div id="group-front-clearance">
      <div class="property-group">
        <label>Typ frontów:</label>
        <select id="input-front-type">
          <option value="nakladane" ${(!state.project.front.type || state.project.front.type === 'nakladane') ? 'selected' : ''}>Nakładane</option>
          <option value="wpuszczane" ${state.project.front.type === 'wpuszczane' ? 'selected' : ''}>Wpuszczane</option>
        </select>
      </div>
      <div class="property-group">
        <label>System szuflad:</label>
        <select id="input-drawer-system">
          <option value="merivobox" ${state.project.front.drawerSystem === 'merivobox' ? 'selected' : ''}>Blum Merivobox</option>
          <option value="legrabox" ${state.project.front.drawerSystem === 'legrabox' ? 'selected' : ''}>Blum Legrabox</option>
          <option value="tandembox" ${state.project.front.drawerSystem === 'tandembox' ? 'selected' : ''}>Blum TANDEMBOX antaro</option>
          <option value="gtv_axis_16" ${state.project.front.drawerSystem === 'gtv_axis_16' ? 'selected' : ''}>GTV Axis Pro (płyta 16mm)</option>
          <option value="gtv_axis_18" ${state.project.front.drawerSystem === 'gtv_axis_18' ? 'selected' : ''}>GTV Axis Pro (płyta 18mm)</option>
        </select>
      </div>  
      
      <div class="property-group">
        <label>Przerwa między nimi (mm):</label>
        <input type="number" id="input-front-gap" value="${state.project.front.gap}" step="0.5" />
      </div>
      <div class="property-group">
        <label>Luz lewy (mm):</label>
        <input type="number" id="input-front-left" value="${state.project.front.clearance.left ?? state.project.front.clearance.sides ?? 1.5}" step="0.5" />
      </div>
      <div class="property-group">
        <label>Luz prawy (mm):</label>
        <input type="number" id="input-front-right" value="${state.project.front.clearance.right ?? state.project.front.clearance.sides ?? 1.5}" step="0.5" />
      </div>
      <div class="property-group">
        <label>Luz góra (mm):</label>
        <input type="number" id="input-front-top" value="${state.project.front.clearance.top}" step="0.5" />
      </div>
      <div class="property-group">
        <label>Luz dół (mm):</label>
        <input type="number" id="input-front-bottom" value="${state.project.front.clearance.bottom}" step="0.5" />
      </div>
    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const numberInputs = [
    'traverse-width',
    'board-thick', 'width', 'height', 'depth', 
    'front-gap', 'front-left', 'front-right', 'front-top', 'front-bottom',
    'back-offset', 'back-groove'
  ];
  
  const updateAll = () => { 
    renderEditor2D();
    update3D(); 
    updateSidebar(); 
  };
  
  const joinTypeInput = document.getElementById('input-join-type');
  if (joinTypeInput) {
    joinTypeInput.addEventListener('change', (e) => {
      state.project.construction.joinType = e.target.value;
      updateAll();
    });
  }

  const topTypeInput = document.getElementById('input-top-type');
  const traverseOptions = document.getElementById('traverse-options');
  if (topTypeInput && traverseOptions) {
    topTypeInput.addEventListener('change', (e) => {
      state.project.construction.topType = e.target.value;
      traverseOptions.style.display = e.target.value !== 'pelny' ? 'block' : 'none';
      updateAll();
    });
  }

  const typeInput = document.getElementById('input-front-type');
  if (typeInput) {
    typeInput.addEventListener('change', (e) => {
      state.project.front.type = e.target.value;
      updateAll();
    });
  }

  const backType = document.getElementById('input-back-type');
  const nutOptions = document.getElementById('nut-options');
  if (backType && nutOptions) {
    backType.addEventListener('change', (e) => {
      state.project.backPanel.type = e.target.value;
      nutOptions.style.display = e.target.value === 'nut' ? 'block' : 'none';
      updateAll();
    });
  }
  
  const nutBuildInput = document.getElementById('input-nut-build');
  if (nutBuildInput) {
    nutBuildInput.addEventListener('change', (e) => {
      state.project.backPanel.nutBuild = e.target.value;
      updateAll();
    });
  }

  numberInputs.forEach(id => {
    const el = document.getElementById(`input-${id}`);
    if(el) {
      el.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        const mod = state.project.modules[0]; 

        if (id === 'traverse-width') state.project.construction.traverseWidth = val;
        
        if (id === 'board-thick') state.project.materials.boardThickness = val;
        if (id === 'width') mod.dimensions.width = val;
        if (id === 'height') mod.dimensions.height = val;
        if (id === 'depth') mod.dimensions.depth = val;
        
        if (id === 'front-gap') state.project.front.gap = val;
        // Mapowanie osobnych luzów na stan aplikacji
        if (id === 'front-left') state.project.front.clearance.left = val;
        if (id === 'front-right') state.project.front.clearance.right = val;
        if (id === 'front-top') state.project.front.clearance.top = val;
        if (id === 'front-bottom') state.project.front.clearance.bottom = val;
        
        if (id === 'back-offset') state.project.backPanel.offset = val;
        if (id === 'back-groove') state.project.backPanel.grooveDepth = val;
        
        updateAll();
      });
    }
  });

  const drawerSysInput = document.getElementById('input-drawer-system');
  if(drawerSysInput) {
    drawerSysInput.addEventListener('change', (e) => {
      state.project.front.drawerSystem = e.target.value;
      updateAll(); 
    });
  }
}