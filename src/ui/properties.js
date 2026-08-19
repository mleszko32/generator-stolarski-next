// src/ui/properties.js
import { state, getActiveModule } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";

function getSelectedMods() {
    if (state.selectedModules && state.selectedModules.size > 0) {
        return Array.from(state.selectedModules).map(id => state.project.modules.find(m => m.id === id)).filter(Boolean);
    }
    const active = getActiveModule();
    return active ? [active] : [];
}

export function initPropertiesPanel() {
  const rightSidebar = document.querySelector(".sidebar-right");
  const activeModule = getActiveModule(); 

  if (!activeModule) {
    rightSidebar.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #94a3b8; text-align: center; padding: 20px;">
        <span style="font-size: 40px; margin-bottom: 10px;">⚙️</span>
        <h3 style="margin: 0; color: #64748b;">Brak aktywnej szafki</h3>
        <p style="font-size: 12px; line-height: 1.5;">Dodaj nową szafkę korzystając z lewego panelu, aby rozpocząć edycję.</p>
      </div>
    `;
    return;
  }

  const multiCount = state.selectedModules && state.selectedModules.size > 1 ? state.selectedModules.size : 1;

  if (!activeModule.legs) activeModule.legs = { active: false, height: 100, plinth: false, plinthOffset: 40 };

  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(state.project.construction || {}), ...(activeModule.construction || {}) };
  const backP = activeModule.backPanel;
  
  const f = { ...(state.project.front || {}), ...(activeModule.front || {}) };
  const fc = { ...(state.project.front?.clearance || {}), ...(activeModule.front?.clearance || {}) };
  
  // ZMIANA: Zaciągamy ustawienia zawiasów lokalnie (dla aktywnej szafki)
  const fh = { topOffset: 100, bottomOffset: 100, margin: 40, ...(state.project.front?.hinges || {}), ...(activeModule.front?.hinges || {}) };

  rightSidebar.innerHTML = `
    <h2>Parametry szafki ${multiCount > 1 ? `<span style="color:#2563eb;">(Edytujesz ${multiCount} obiekty)</span>` : ''}</h2>

    <div class="property-group" style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #cbd5e1; margin-bottom: 15px;">
      <label style="font-weight: bold; color: #0f172a;">Nazwa szafki:</label>
      <input type="text" id="input-mod-name" value="${activeModule.name}" style="font-weight: bold; color: #1e293b;" />
    </div>
    
    <h3>Wymiary Modułu</h3>
    <div class="property-group">
      <label>Szerokość (mm):</label>
      <input type="number" id="input-width" value="${activeModule.dimensions.width}" />
    </div>
    <div class="property-group">
      <label>Wysokość korpusu (mm):</label>
      <input type="number" id="input-height" value="${activeModule.dimensions.height}" />
    </div>
    <div class="property-group">
      <label>Głębokość (mm):</label>
      <input type="number" id="input-depth" value="${activeModule.dimensions.depth}" />
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

    <h3 style="color: #ea580c;">Nóżki i Cokół</h3>
    <div class="property-group" style="display: flex; align-items: center; gap: 8px;">
      <input type="checkbox" id="input-legs-active" ${activeModule.legs.active ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;" />
      <label for="input-legs-active" style="cursor: pointer; margin: 0; font-weight: bold;">Szafka stoi na nóżkach</label>
    </div>
    
    <div id="legs-options" style="display: ${activeModule.legs.active ? 'block' : 'none'}; background: #fff7ed; padding: 10px; border: 1px dashed #fdba74; border-radius: 4px; margin-bottom: 15px;">
      <div class="property-group" style="margin-bottom: 8px;">
        <label style="font-size: 11px; color: #9a3412;">Wysokość nóżek (mm):</label>
        <input type="number" id="input-legs-height" value="${activeModule.legs.height}" step="1" style="border-color: #fed7aa;" />
      </div>
      <div class="property-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <input type="checkbox" id="input-plinth-active" ${activeModule.legs.plinth ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer;" />
        <label for="input-plinth-active" style="cursor: pointer; margin: 0; font-size: 12px; color: #9a3412;">Generuj cokół przedni</label>
      </div>
      <div class="property-group" style="margin-bottom: 0;">
        <label style="font-size: 11px; color: #9a3412;">Cofnięcie cokołu od krawędzi korpusu (mm):</label>
        <input type="number" id="input-plinth-offset" value="${activeModule.legs.plinthOffset}" step="1" style="border-color: #fed7aa;" />
      </div>
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

    <h3 style="color: #2563eb;">Pozycja w przestrzeni (3D)</h3>
    <div class="property-group" style="background: #eff6ff; padding: 10px; border-radius: 4px; border: 1px dashed #93c5fd;">
      <div style="margin-bottom: 8px;">
        <label style="font-size: 11px; color: #1e3a8a;">Odsunięcie od lewej (X) [mm]:</label>
        <input type="number" id="input-pos-x" value="${activeModule.position.x}" style="border-color: #bfdbfe;" />
      </div>
      <div>
        <label style="font-size: 11px; color: #1e3a8a;">Wysokość od podłogi (Y) [mm]:</label>
        <input type="number" id="input-pos-y" value="${activeModule.position.y}" style="border-color: #bfdbfe;" />
      </div>
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

    <h3>Konstrukcja Korpusu</h3>
    <div class="property-group"><label>Grubość płyty (mm):</label><input type="number" id="input-board-thick" value="${state.project.materials.boardThickness}" step="0.1" /></div>
    <div class="property-group">
      <label>Sposób łączenia:</label>
      <select id="input-join-type"><option value="boki_przelotowe" ${cons.joinType === 'boki_przelotowe' ? 'selected' : ''}>Boki do ziemi (wieńce wpuszczane)</option><option value="wience_przelotowe" ${cons.joinType === 'wience_przelotowe' ? 'selected' : ''}>Wieńce pełne (boki wpuszczane)</option></select>
    </div>
    
    <div class="property-group">
      <label>Zamknięcie góry:</label>
      <select id="input-top-type"><option value="pelny" ${cons.topType === 'pelny' ? 'selected' : ''}>Pełny wieniec</option><option value="trawersy_poziom" ${cons.topType === 'trawersy_poziom' ? 'selected' : ''}>Trawersy poziome</option><option value="trawersy_pion" ${cons.topType === 'trawersy_pion' ? 'selected' : ''}>Trawersy pionowe</option></select>
    </div>

    <div id="traverse-options" style="display: ${cons.topType !== 'pelny' ? 'block' : 'none'}; background: #f8fafc; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 4px; margin-bottom: 15px;">
      <div class="property-group" style="margin-bottom: 0;"><label style="font-size: 11px;">Szerokość trawersu (mm):</label><input type="number" id="input-traverse-width" value="${cons.traverseWidth}" step="1" /></div>
    </div>
    
    <div class="property-group">
      <label>Plecy (Tylko dla tej szafki):</label>
      <select id="input-back-type"><option value="nut" ${backP.type === 'nut' ? 'selected' : ''}>W nucie</option><option value="nakladane" ${backP.type === 'nakladane' ? 'selected' : ''}>Nakładane</option></select>
    </div>
    
    <div id="nut-options" style="display: ${backP.type === 'nut' ? 'block' : 'none'}; background: #f8fafc; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 4px; margin-bottom: 15px;">
      <div class="property-group" style="margin-bottom: 8px;"><label style="font-size: 11px; font-weight: bold;">Konstrukcja nutu:</label><select id="input-nut-build"><option value="all" ${(!backP.nutBuild || backP.nutBuild === 'all') ? 'selected' : ''}>Boki i wieńce nutowane</option><option value="sides" ${backP.nutBuild === 'sides' ? 'selected' : ''}>Boki nutowane, wieńce skracane</option><option value="top_bottom" ${backP.nutBuild === 'top_bottom' ? 'selected' : ''}>Wieńce nutowane, boki skracane</option></select></div>
      <div class="property-group" style="margin-bottom: 8px;"><label style="font-size: 11px;">Odsunięcie nutu (mm):</label><input type="number" id="input-back-offset" value="${backP.offset !== undefined ? backP.offset : 16}" step="1" /></div>
      <div class="property-group" style="margin-bottom: 0;"><label style="font-size: 11px;">Głębokość nutu w płycie (mm):</label><input type="number" id="input-back-groove" value="${backP.grooveDepth !== undefined ? backP.grooveDepth : 6}" step="1" /></div>
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">
    
    <h3 style="color: #059669;">Ustawienia Frontów i Szuflad (Lokalne)</h3>
    <div id="group-front-clearance">
      <div class="property-group"><label>Typ frontów:</label><select id="input-front-type"><option value="nakladane" ${(!f.type || f.type === 'nakladane') ? 'selected' : ''}>Nakładane</option><option value="wpuszczane" ${f.type === 'wpuszczane' ? 'selected' : ''}>Wpuszczane</option></select></div>
      <div class="property-group"><label>System szuflad:</label><select id="input-drawer-system"><option value="merivobox" ${f.drawerSystem === 'merivobox' ? 'selected' : ''}>Blum Merivobox</option><option value="legrabox" ${f.drawerSystem === 'legrabox' ? 'selected' : ''}>Blum Legrabox</option><option value="tandembox" ${f.drawerSystem === 'tandembox' ? 'selected' : ''}>Blum TANDEMBOX antaro</option><option value="gtv_axis_16" ${f.drawerSystem === 'gtv_axis_16' ? 'selected' : ''}>GTV Axis Pro (płyta 16mm)</option><option value="gtv_axis_18" ${f.drawerSystem === 'gtv_axis_18' ? 'selected' : ''}>GTV Axis Pro (płyta 18mm)</option></select></div>
      <div class="property-group"><label>Przerwa między frontami (mm):</label><input type="number" id="input-front-gap" value="${f.gap ?? 3}" step="0.5" /></div>
      <div class="property-group"><label>Luz lewy (mm):</label><input type="number" id="input-front-left" value="${fc.left ?? 1.5}" step="0.5" /></div>
      <div class="property-group"><label>Luz prawy (mm):</label><input type="number" id="input-front-right" value="${fc.right ?? 1.5}" step="0.5" /></div>
      <div class="property-group"><label>Luz góra (mm):</label><input type="number" id="input-front-top" value="${fc.top ?? 2}" step="0.5" /></div>
      <div class="property-group"><label>Luz dół (mm):</label><input type="number" id="input-front-bottom" value="${fc.bottom ?? 2}" step="0.5" /></div>
    </div>
    
    <div style="background: #ecfdf5; padding: 10px; border: 1px dashed #6ee7b7; border-radius: 4px; margin-top: 15px;">
      <h4 style="margin: 0 0 10px 0; color: #047857; font-size: 13px;">Wymiary Osi Zawiasów (Lokalne)</h4>
      <div class="property-group">
        <label style="font-size: 11px;">Od góry do środka puszki (mm):</label>
        <input type="number" id="input-hinge-top" value="${fh.topOffset}" step="1" />
      </div>
      <div class="property-group">
        <label style="font-size: 11px;">Od dołu do środka puszki (mm):</label>
        <input type="number" id="input-hinge-bottom" value="${fh.bottomOffset}" step="1" />
      </div>
      <div class="property-group" style="margin-bottom: 0;">
        <label style="font-size: 11px;">Bufor omijania półek / luz wkrętarki (mm):</label>
        <input type="number" id="input-hinge-margin" value="${fh.margin}" step="1" />
      </div>
    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  if(!getActiveModule()) return;

  const numberInputs = [
    'pos-x', 'pos-y', 'traverse-width', 'board-thick', 'width', 'height', 'depth',
    'front-gap', 'front-left', 'front-right', 'front-top', 'front-bottom', 'back-offset', 'back-groove',
    'legs-height', 'plinth-offset', 'hinge-top', 'hinge-bottom', 'hinge-margin'
  ];

  const updateAll = () => { update3D(); updateSidebar(); };
  let typingTimer;
  const debouncedUpdateAll = () => { clearTimeout(typingTimer); typingTimer = setTimeout(() => { updateAll(); }, 200); };

  const nameInput = document.getElementById('input-mod-name');
  if (nameInput) {
      nameInput.addEventListener('input', (e) => {
          getSelectedMods().forEach(mod => { mod.name = e.target.value; });
          debouncedUpdateAll(); 
      });
  }

  const legsActiveInput = document.getElementById('input-legs-active');
  const legsOptions = document.getElementById('legs-options');
  if (legsActiveInput && legsOptions) {
    legsActiveInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.legs.active = e.target.checked; });
      legsOptions.style.display = e.target.checked ? 'block' : 'none';
      updateAll();
    });
  }

  const plinthActiveInput = document.getElementById('input-plinth-active');
  if (plinthActiveInput) {
    plinthActiveInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.legs.plinth = e.target.checked; });
      updateAll();
    });
  }

  const joinTypeInput = document.getElementById('input-join-type');
  if (joinTypeInput) joinTypeInput.addEventListener('change', (e) => { 
      getSelectedMods().forEach(mod => {
          if (!mod.construction) mod.construction = {};
          mod.construction.joinType = e.target.value; 
      });
      updateAll(); 
  });

  const topTypeInput = document.getElementById('input-top-type');
  const traverseOptions = document.getElementById('traverse-options');
  if (topTypeInput && traverseOptions) topTypeInput.addEventListener('change', (e) => { 
      getSelectedMods().forEach(mod => {
          if (!mod.construction) mod.construction = {};
          mod.construction.topType = e.target.value; 
      });
      traverseOptions.style.display = e.target.value !== 'pelny' ? 'block' : 'none'; 
      updateAll(); 
  });

  const typeInput = document.getElementById('input-front-type');
  if (typeInput) typeInput.addEventListener('change', (e) => { 
      getSelectedMods().forEach(mod => {
          if(!mod.front) mod.front={}; 
          mod.front.type = e.target.value; 
      });
      updateAll(); 
  });

  const drawerSysInput = document.getElementById('input-drawer-system');
  if(drawerSysInput) drawerSysInput.addEventListener('change', (e) => { 
      getSelectedMods().forEach(mod => {
          if(!mod.front) mod.front={}; 
          mod.front.drawerSystem = e.target.value; 
      });
      updateAll(); 
  });

  const backType = document.getElementById('input-back-type');
  const nutOptions = document.getElementById('nut-options');
  if (backType && nutOptions) {
    backType.addEventListener('change', (e) => { 
        getSelectedMods().forEach(mod => { mod.backPanel.type = e.target.value; });
        nutOptions.style.display = e.target.value === 'nut' ? 'block' : 'none'; 
        updateAll(); 
    });
  }

  const nutBuildInput = document.getElementById('input-nut-build');
  if (nutBuildInput) nutBuildInput.addEventListener('change', (e) => { 
      getSelectedMods().forEach(mod => { mod.backPanel.nutBuild = e.target.value; });
      updateAll(); 
  });

  numberInputs.forEach(id => {
    const el = document.getElementById(`input-${id}`);
    if(el) {
      el.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        
        getSelectedMods().forEach(mod => {
            // ZMIANA: Zapisujemy parametry zawiasów LOKALNIE w mod.front.hinges
            if (['hinge-top', 'hinge-bottom', 'hinge-margin'].includes(id)) {
                if (!mod.front) mod.front = {};
                if (!mod.front.hinges) mod.front.hinges = {};
                if (id === 'hinge-top') mod.front.hinges.topOffset = val;
                if (id === 'hinge-bottom') mod.front.hinges.bottomOffset = val;
                if (id === 'hinge-margin') mod.front.hinges.margin = val;
            }

            if (id === 'pos-x') mod.position.x = val;
            if (id === 'pos-y') mod.position.y = val;
            
            if (id === 'legs-height') mod.legs.height = val;
            if (id === 'plinth-offset') mod.legs.plinthOffset = val;

            if (id === 'traverse-width') {
                if (!mod.construction) mod.construction = {};
                mod.construction.traverseWidth = val;
            }
            if (id === 'board-thick') state.project.materials.boardThickness = val;

            if (id === 'width') {
              const oldWidth = parseFloat(mod.dimensions.width) || 0;
              const delta = val - oldWidth; 
              mod.dimensions.width = val;
              state.project.modules.forEach(otherMod => {
                if (otherMod.id !== mod.id && otherMod.position.x >= (mod.position.x + oldWidth - 1)) {
                  otherMod.position.x += delta; 
                }
              });
            }

            if (id === 'height') mod.dimensions.height = val;
            if (id === 'depth') mod.dimensions.depth = val;

            if (!mod.front) mod.front = {};
            if (!mod.front.clearance) mod.front.clearance = {};

            if (id === 'front-gap') mod.front.gap = val;
            if (id === 'front-left') mod.front.clearance.left = val;
            if (id === 'front-right') mod.front.clearance.right = val;
            if (id === 'front-top') mod.front.clearance.top = val;
            if (id === 'front-bottom') mod.front.clearance.bottom = val;

            if (id === 'back-offset') mod.backPanel.offset = val;
            if (id === 'back-groove') mod.backPanel.grooveDepth = val;
        });

        debouncedUpdateAll();
      });
    }
  });
}