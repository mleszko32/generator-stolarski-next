// src/ui/helpContent.js
//
// Treść instrukcji obsługi (okno „Pomoc”, ui/helpModal.js). Stały tekst pisany tutaj -
// HTML jest zaufany (nie pochodzi od użytkownika). Przy zmianie nazwy przycisku albo
// nowej funkcji zaktualizuj odpowiednią sekcję, żeby instrukcja zgadzała się z ekranem.
// Każda sekcja: { id, title, icon (Tabler), body (HTML) }.

export const HELP_SECTIONS = [
  {
    id: "start",
    title: "Pierwsze kroki",
    icon: "rocket",
    body: `
      <p>Program służy do projektowania zabudów (kuchnie, szafy) i przygotowania produkcji:
      list formatek, planu rozkroju, rysunków z wierceniami, listy okuć i wyceny.</p>
      <h4>Układ ekranu</h4>
      <ul>
        <li><b>Lewy panel</b> - lista szafek, boków dokładanych i blend oraz Narzędzia.</li>
        <li><b>Środek</b> - widok 3D pomieszczenia (albo edytor „Wnętrze 2D”).</li>
        <li><b>Prawy panel</b> - właściwości zaznaczonej szafki, boku albo blendy.</li>
        <li><b>Górny pasek</b> - tryby <b>Projekt / Produkcja / Wycena</b>, cofnij/ponów,
        Pomieszczenie, logowanie i zapis w chmurze.</li>
      </ul>
      <h4>Typowa kolejność pracy</h4>
      <ol>
        <li>Ustaw wymiary pomieszczenia i otwory (okna, drzwi) - przycisk <b>Pomieszczenie</b>.</li>
        <li>Dodaj szafki ręcznie albo użyj <b>Rozmieść szafki (ściana / L / U)</b>.</li>
        <li>Dopasuj wymiary i wnętrza szafek (prawy panel, <b>Wnętrze 2D</b>).</li>
        <li>Sprawdź projekt: tryb <b>Produkcja</b> → <b>Kontrola projektu</b>.</li>
        <li>Pobierz listy, rozkrój i rysunki (tryb <b>Produkcja</b>), przygotuj wycenę (tryb <b>Wycena</b>).</li>
        <li>Zapisz projekt w chmurze (<b>Zapisz projekt</b>).</li>
      </ol>
      <p class="help-note">Wszystkie wymiary podaje się w milimetrach. W polach wymiarów można wpisać
      działanie, np. <code>400+18</code> albo <code>1200/2-18</code>.</p>`,
  },
  {
    id: "pomieszczenie",
    title: "Pomieszczenie i otwory",
    icon: "home",
    body: `
      <p>Przycisk <b>Pomieszczenie</b> na górnym pasku otwiera okno z szerokością, głębokością
      i wysokością pokoju. Punkt (0, 0) to tylny lewy narożnik.</p>
      <p>W tym samym oknie dodaje się <b>otwory</b>: okna, drzwi i inne przeszkody na ścianach
      (ściana, odległość od lewego końca ściany patrząc z wnętrza pokoju, szerokość, wysokość,
      parapet). Otwory są rysowane w 3D i na rzutach ścian, a kontrola projektu ostrzega, gdy
      szafka na nie nachodzi. Rozmieszczanie szafek na ścianie omija je automatycznie.</p>`,
  },
  {
    id: "szafki",
    title: "Dodawanie szafek",
    icon: "layout-bottombar",
    body: `
      <p>W lewym panelu, w sekcji <b>Szafki</b>:</p>
      <ul>
        <li><b>Dolna</b>, <b>Wisząca</b>, <b>Słupek</b> - zwykłe szafki; nowa staje na prawo od ostatniej.</li>
        <li><b>Narożna</b> - szafka narożna L (dwa ramiona); ustawia się ją w konfiguratorze (przycisk <b>Konfiguruj szafkę narożną</b> w prawym panelu).</li>
        <li><b>Skos</b> - szafka pod skos dachu.</li>
      </ul>
      <p>Przy każdej szafce na liście są przyciski <b>kopiuj</b> i <b>usuń</b>. Usuwanie jest
      tylko na liście, nie w prawym panelu.</p>
      <h4>Narzędzia</h4>
      <ul>
        <li><b>Rozmieść szafki (ściana / L / U)</b> - wypełnia ścianę albo całą kuchnię szafkami (patrz rozdział „Rozmieszczanie na ścianie”).</li>
        <li><b>Zabudowa wnęki pod skosem</b> - rząd prostokątnych szafek pod skosem (poddasze). Podajesz ścianę kolanową, gdzie skos dochodzi do sufitu, wysokość sufitu, luz pod skosem i szerokości szafek; „Kształt szafek”: <i>dopasowane do skosu</i> - szafki pod skosem są szafkami pod skos (trapez: niski bok = sufit nad lewą krawędzią minus luz, wysoki = nad prawą), a szafka z siedziskiem i szafki pod płaskim sufitem zostają prostokątne; wszystkie stoją na nóżkach z jednym cokołem, więc szuflady są w jednej linii; <i>prostokątne (schodki)</i> - wysokość każdej szafki to najniższy punkt sufitu nad nią minus luz. Każdą szafkę można zmienić: nazwa, szerokość, „Siedzisko / blat” (odznaczone = szafka do samego skosu) i sekcje od dołu (szuflady z ilością, drzwi, drzwi L+P, otwarta; wysokość albo „Półka nad na” od podłogi, półki w środku, drążek); szafki i sekcje można dodawać, usuwać i przesuwać, a „Układ domyślny (A-E)” przywraca startowy układ. Okno pokazuje widok z przodu z wymiarami (też do druku) i zestawienie formatek. Po pomiarze na miejscu otwórz okno ponownie, popraw liczby i kliknij „Przelicz zabudowę” - szafki zabudowy zostaną zastąpione nowymi.</li>
        <li><b>Biblioteka szafek</b> - zapisane szablony szafek (z wnętrzem); eksport i import pliku JSON przenosi je na inny komputer.</li>
        <li><b>Zbuduj projekt ze zdjęcia (AI)</b> - zdjęcie odręcznego szkicu zamienia się w szafki. Wymaga zalogowania.</li>
        <li><b>Produkcja i raporty</b> - listy, rysunki, rozkrój, okucia, kontrola i kosztorys.</li>
      </ul>`,
  },
  {
    id: "widok3d",
    title: "Widok 3D i ustawianie szafek",
    icon: "cube",
    body: `
      <ul>
        <li><b>Obracanie widoku</b> - przeciągnij lewym przyciskiem w pustym miejscu; <b>przybliżanie</b> - kółko myszy; <b>przesuwanie widoku</b> - prawy przycisk.</li>
        <li><b>Zaznaczenie</b> - kliknij szafkę. <b>Shift + klik</b> dodaje kolejne do zaznaczenia; klik w puste miejsce odznacza.</li>
        <li><b>Przesuwanie szafki</b> - przeciągnij ją. Przyciąga się do ścian i krawędzi sąsiadów (także do lica frontów) i zatrzymuje na sąsiadach, nie przepycha ich.</li>
        <li><b>Shift</b> w trakcie przeciągania - ruch tylko wzdłuż jednej osi.</li>
        <li><b>Alt</b> przy chwyceniu - przesuwanie w górę / w dół.</li>
        <li><b>R</b> - obrót zaznaczonej szafki o 90°.</li>
        <li>Dokładną pozycję i obrót wpisuje się w prawym panelu (sekcja Wymiary → Pozycja w przestrzeni).</li>
      </ul>
      <h4>Pasek widoku (prawy górny róg)</h4>
      <ul>
        <li><b>Przezroczysty / Realistyczny</b> - szkic z widocznymi wierceniami albo pełne bryły.</li>
        <li><b>Ukryj fronty zewn.</b>, <b>Ukryj boki</b>, <b>Ukryj blendy</b>, <b>Ukryj blaty</b> - osobne przełączniki widoczności.</li>
        <li><b>Ukryj nazwy</b> - etykiety z nazwami nad szafkami.</li>
        <li><b>Wnętrze 2D</b> - edytor wnętrza zaznaczonej szafki (widok od frontu).</li>
        <li><b>Miarka</b> - kliknij dwa punkty, żeby zmierzyć odległość; przyciąga do narożników płyt.</li>
      </ul>
      <h4>Grupy</h4>
      <p>Kilka zaznaczonych szafek (Shift + klik) można połączyć przyciskiem <b>Połącz zaznaczone w grupę</b>
      w prawym panelu - wtedy zaznaczają się i przesuwają razem (np. słupek z nadstawką).
      <b>Rozbij grupę</b> je rozdziela.</p>`,
  },
  {
    id: "wlasciwosci",
    title: "Właściwości szafki",
    icon: "adjustments",
    body: `
      <p>Prawy panel pokazuje zaznaczoną szafkę. Na górze karta <b>Informacje o szafce</b>
      (wymiary korpusu i wnętrza, drzwi z zawiasami, szuflady, półki), niżej zwijane sekcje:</p>
      <ul>
        <li><b>Wymiary</b> - szerokość, wysokość, głębokość, pozycja i obrót. Tu też przyciski
        <b>Zmień podział rzędu</b> i <b>Zmień podział kuchni L/U</b>.</li>
        <li><b>Front</b> - nakładane / wpuszczane, luzy, szczelina, materiał frontu.</li>
        <li><b>Szuflady</b> - system szuflad (Blum, GTV, MOVENTO) i ustawienia ręczne
        (wariant wysokości, długość prowadnicy NL, wymiary frontu, szuflada wewnętrzna).</li>
        <li><b>Konstrukcja</b> - łączenie boków i wieńców, wieniec górny pełny albo trawersy, plecy (nakładane / w nucie).</li>
        <li><b>Nóżki</b> - wysokość nóżek i cokół.</li>
        <li><b>Zawiasy</b> - odsunięcia, liczba zawiasów i ręczna pozycja każdego z nich.</li>
        <li><b>Narożnik</b> - szafka ślepa i okucia narożne.</li>
      </ul>
      <p class="help-note">Kropka przy nazwie sekcji oznacza, że ta szafka ma własne ustawienia,
      inne niż domyślne dla projektu.</p>`,
  },
  {
    id: "wnetrze",
    title: "Wnętrze 2D - półki, przegrody, fronty",
    icon: "layout-list",
    body: `
      <p>Przycisk <b>Wnętrze 2D</b> pokazuje zaznaczoną szafkę od frontu. Kliknij wnękę, żeby
      zobaczyć pasek akcji:</p>
      <ul>
        <li><b>Podziel poziomo</b> (półka) / <b>Podziel pionowo</b> (przegroda).</li>
        <li><b>Drzwi - zawias z lewej / z prawej</b>, <b>Drzwi L/P</b> (para drzwi),
        <b>Szuflady zewn.</b>, <b>Szuflady wewn.</b> - obsadzenie wnęki frontem.</li>
        <li><b>Półki równo</b> - rozmieszcza podaną liczbę półek ruchomych.</li>
        <li><b>Usuń front</b> - wnęka zostaje pusta.</li>
      </ul>
      <p>Kliknięcie dzielnika (półki / przegrody) pozwala go <b>przeciągnąć</b>, zmienić na
      <b>ruchomą / konstrukcyjną</b>, ustawić mocowanie na kołek + wkręt, <b>wyrównać do innej
      szafki</b> albo <b>usunąć podział</b>. Wymiary przy krawędziach są klikalne - wpisz
      dokładną wartość.</p>
      <p><b>Shift + klik</b> zaznacza kilka sąsiednich wnęk, a <b>Scal</b> łączy je w jedną.
      Kółko myszy przybliża, przeciąganie tła przesuwa widok.</p>
      <p class="help-note">Podział frontów wpisuje się jak proporcje: <code>1:1:1</code> (równo),
      <code>1:2</code>, albo mieszanie z wymiarem w mm, np. <code>3fr:100</code>.</p>`,
  },
  {
    id: "boki",
    title: "Boki dokładane i blendy",
    icon: "layout-board",
    body: `
      <p><b>Bok dokładany</b> to samodzielna płyta w dekorze frontów (np. zakończenie zabudowy).
      <b>Blenda</b> to listwa maskująca między szafką a ścianą albo w narożniku - czoło z
      dekoru frontów i kołnierz mocujący (wybierasz, z której strony).</p>
      <p>Dodaje się je przyciskami <b>Dodaj</b> w lewym panelu. Przy przeciąganiu przyciągają się
      do boków szafek i do ścian, a nachodzące na szafkę same się z niej wysuwają. Materiał
      wybiera się z cennika materiałów frontów.</p>`,
  },
  {
    id: "rozmieszczanie",
    title: "Rozmieszczanie na ścianie, kuchnia L/U",
    icon: "layout-columns",
    body: `
      <p><b>Rozmieść szafki (ściana / L / U)</b> wypełnia wolne miejsce na ścianie jednym rzędem
      (dolne, wiszące albo słupki). Program sam omija inne szafki, otwory i strefę przed
      drzwiami. Sposoby podziału:</p>
      <ul>
        <li><b>Szerokości katalogowe</b> - typowe szerokości z najmniejszą resztą.</li>
        <li><b>Równy podział</b> - N szafek tej samej szerokości.</li>
        <li><b>Stałe + reszta</b> - np. <code>600, 800, *, *</code> (gwiazdka dzieli resztę).</li>
        <li><b>Proporcje</b> - jak przy frontach, np. <code>1:2:1</code>.</li>
      </ul>
      <p>Reszta może trafić na blendę albo zostać rozdzielona na szafki. Można ustawić odsunięcie
      szafek od ściany (szczelina na instalacje), odstęp od otworów i strefę przed drzwiami.</p>
      <p>Tryb <b>Kuchnia L/U</b> układa szafki na kilku ścianach naraz, zaczynając od narożników
      (szafka narożna L, szafka ślepa albo martwy narożnik z blendą).</p>
      <p>Istniejący rząd albo kuchnię zmienia się przyciskami <b>Zmień podział rzędu</b> /
      <b>Zmień podział kuchni L/U</b> w prawym panelu - szafki zachowują swoje wnętrza.</p>`,
  },
  {
    id: "specjalne",
    title: "Szafka narożna, ślepa i pod skos",
    icon: "corner-up-right",
    body: `
      <ul>
        <li><b>Szafka narożna L</b> - przycisk <b>Konfiguruj szafkę narożną</b> w prawym panelu:
        głębokości ramion, wycięcie, fronty w rogu (dwa osobne albo łamany), plecy, półki narożne
        w kształcie L i wnętrze każdego ramienia.</li>
        <li><b>Szafka ślepa</b> - zwykła szafka z włączoną opcją w sekcji <b>Narożnik</b>: strona
        ślepa, szerokość drzwi, sposób mocowania drzwi (listwa, zaślepka, bok) i okucie narożne.</li>
        <li><b>Szafka pod skos</b> - wymiary wysokiej i niskiej strony; wnętrze dzieli się jak w
        zwykłej szafce, a skos przycina półki i fronty. Rysunki cięć skosu są w prawym panelu. W sekcji
        Wymiary <b>Łączenie korpusu</b>: kołek + wkręt albo Lamello Tenso / Clamex (rowki frezarką Zeta P2,
        bez wkrętów na wierzchu skosu) - rysunki nawiertów, instrukcja montażu i okucia liczą się wg wyboru.</li>
      </ul>`,
  },
  {
    id: "produkcja",
    title: "Produkcja i raporty",
    icon: "list-details",
    body: `
      <p>Tryb <b>Produkcja</b> (albo przycisk <b>Produkcja i raporty</b>) otwiera hub z sekcjami:</p>
      <ul>
        <li><b>Formatki</b> - zbiorcza lista formatek z okleiną (kliknij krawędź ikonki, żeby ją
        przełączyć; środek ikonki = dookoła / brak) i eksport CSV.</li>
        <li><b>Rozkrój i etykiety</b> - plan rozkroju na arkusze, etykiety do druku.</li>
        <li><b>Rysunki 2D</b> - rysunki formatek z wierceniami (przycisk „Drukuj… (A4)” otwiera listę formatek - boki, przegrody, wieńce, fronty z nawiertami zawiasów i szuflad - zaznaczone drukują się razem, każda na swoich kartkach).</li>
        <li><b>Skrzynki szuflad</b> - rysunki skrzynek drewnianych (MOVENTO) z otworami łączników.</li>
        <li><b>Instrukcje montażu</b> - kolejność składania i rysunki każdej szafki. Po zaznaczeniu
        „Wiercę na stole RC System” dochodzi karta wiercenia: która krawędź do pinów, otwór bazowy z pinem
        i ustawienie wiertarek dla każdego zestawu łączników - z numerem pinu i stroną szyny (np. „pin 7 po prawej”,
        „od zera prawej listwy, bez pinu”). Przód formatki zawsze do zderzaka przedniej wiertarki (37 mm). Program
        zna listwę: pin n opiera wiertarkę 16·n mm od zera, pin ma Ø5 mm, od pinu do wiertła jest 37 mm, a między
        zerami listew 667 mm (z pomiaru: przednia pin 3, formatka 510 mm, tylna pin 7 → 470 mm). Środkowe łączniki
        wierci tylna wiertarka przesunięta do przodu, przednią stroną do pinu (bok 510 mm: 245/277 mm, pin 16 po
        lewej). Dla głębokich formatek program sam schodzi z przednią wiertarką na niższy pin; stół przyjmuje
        formatki do 650 mm. Wpisz pin, na którym zwykle pracujesz, w „Pin przedniej wiertarki przy pracy”
        (0 = do zera listwy bez pinu), a stronę stołu w „Przednia wiertarka stoi”. Numery pinów są też na
        rysunkach boków (rysunek 2D i instrukcja): nad każdym zestawem łączników np. „pin 3 L”, „pin 16 L”, „pin 7 P”
        (L / P - lewa / prawa strona szyny).</li>
        <li><b>Rzuty ścian</b> - widok każdej ściany z szafkami i otworami.</li>
        <li><b>Blaty</b> - odcinki blatów i łączenia w narożnikach.</li>
        <li><b>Okucia i okleina</b> - lista zakupów (nóżki, łączniki, komplety szuflad, zawiasy, okleina w mb).</li>
        <li><b>Kontrola projektu</b> - kolizje, szafki poza pokojem, za szerokie drzwi i półki,
        za długie prowadnice, formatki większe niż płyta, problemy w narożnikach.</li>
      </ul>
      <p class="help-note">Przed wysłaniem zlecenia zawsze zajrzyj do <b>Kontroli projektu</b>.</p>`,
  },
  {
    id: "wycena",
    title: "Kosztorys i oferta",
    icon: "calculator",
    body: `
      <p>Tryb <b>Wycena</b> otwiera <b>Kosztorys</b>: ceny płyt (zł/m²), cennik materiałów frontów,
      cięcie formatek, ceny okuć, robocizna, lakiernia, montaż, transport, narzut na materiały,
      marża na pracę, rabat i VAT. Wszystko liczy się na bieżąco i zapisuje w projekcie.</p>
      <p><b>Baza cen</b> (przyciski na górze kosztorysu) zapamiętuje ceny z jednego projektu, żeby
      nałożyć je na kolejny bez przepisywania.</p>
      <p>Karta <b>Oferta dla klienta</b> drukuje ofertę z zakresem, ceną i (opcjonalnie) zdjęciem
      bieżącego widoku 3D - bez kosztów i marży.</p>`,
  },
  {
    id: "zapis",
    title: "Zapis, chmura i historia",
    icon: "device-floppy",
    body: `
      <ul>
        <li><b>Zaloguj</b> kontem Google z listy dozwolonych - bez tego chmura i import AI są niedostępne.</li>
        <li><b>Zapisz projekt</b> - pierwszy zapis pyta o nazwę. Przy wczytanym projekcie: nadpisz
        albo zapisz jako nowy (pod istniejącą nazwą program zapyta o nadpisanie).</li>
        <li><b>Autozapis</b> co 2 minuty, gdy projekt ma już nazwę i coś się zmieniło.</li>
        <li><b>Wczytaj projekt</b> - lista projektów w chmurze (także usuwanie).</li>
        <li><b>Historia</b> - poprzednie wersje projektu; każdą można przywrócić (bieżący stan trafia do historii, więc to też da się cofnąć).</li>
        <li><b>Kopia lokalna</b> - niezapisana praca jest trzymana w przeglądarce; po ponownym otwarciu program zaproponuje jej przywrócenie.</li>
      </ul>`,
  },
  {
    id: "skroty",
    title: "Skróty klawiszowe",
    icon: "keyboard",
    body: `
      <table class="help-keys">
        <tr><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td><td>Cofnij</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td><td>Ponów</td></tr>
        <tr><td><kbd>R</kbd></td><td>Obrót zaznaczonej szafki o 90°</td></tr>
        <tr><td><kbd>Shift</kbd> + klik</td><td>Zaznaczanie kilku szafek / kilku wnęk w Wnętrzu 2D</td></tr>
        <tr><td><kbd>Shift</kbd> przy przeciąganiu</td><td>Ruch tylko wzdłuż jednej osi</td></tr>
        <tr><td><kbd>Alt</kbd> przy chwyceniu</td><td>Przesuwanie szafki w górę / w dół</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Zamyka okno na wierzchu</td></tr>
        <tr><td><kbd>F1</kbd></td><td>Ta instrukcja</td></tr>
      </table>
      <p class="help-note">Skróty nie działają, gdy kursor jest w polu tekstowym albo otwarte jest okno.</p>`,
  },
];
