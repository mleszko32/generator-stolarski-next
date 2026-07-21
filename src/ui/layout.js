export function initLayout() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-container">
      <header class="topbar">
        <h1>Generator Stolarski Next</h1>
      </header>
      
      <div class="main-workspace">
        <aside class="sidebar-left">
          <h2>Drzewo projektu</h2>
        </aside>
        
        <section class="viewport-3d">
          <h2>Widok 3D</h2>
        </section>
        
        <aside class="sidebar-right">
          <h2>Parametry</h2>
        </aside>
      </div>
      
      <footer class="statusbar">
        <p>Status: Gotowy</p>
      </footer>
    </div>
  `;
}