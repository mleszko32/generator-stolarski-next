// scripts/swisskrono/zdjecia.js
//
// Wgrywa zdjęcia dekorów Swiss Krono do chmury (kolekcja decorTextures, klucz „SK-<kod>”), tak jak
// zdjęcia płyt Egger. Uruchamiane w konsoli aplikacji z `npm run dev`, po zalogowaniu:
//   const m = await import('/scripts/swisskrono/zdjecia.js'); await m.wgraj();
// Zdjęcia: strona producenta (swisskrono.com/pl-pl → Płyty laminowane → kolekcja ONE World, 11.2026) -
// raport dekoru z rzeczywistym wymiarem albo fragment ok. 500 mm (unikolory). Wiersz: kod|plik|szerokość
// tego, co widać na zdjęciu, w mm.
import { saveDecorTextureToCloud } from "../../src/core/storage.js";
import { SWISS_KRONO_DECORS } from "../../src/core/data/swissKronoDecors.js";

const BASE = "https://proxy-tessa.swikr-web51.eimed-server.de/webp_format_1200x1200/";
const ROWS = `D20310|925640-D20310_CX_Adoration_Rapport_2040x1400mm.webp|2070
D20320|925638-D20320_CX_Allegory_Rapport_2040x1400mm.webp|2070
U10030|785276-u10030_main_picture.webp|500
D20300|925642-D20300_CX_Amity_Rapport_2040x1400mm.webp|2070
U164|592773-164_anthracite.webp|500
U10040|785274-u10040_main_picture.webp|500
D3274|751674-D3274_Beton_BetonGrey_1300x1320mm.webp|1320
D3265|740641-mfc-d3265-concrete-dark-orig.webp|600
D1038|741767-D1038_MillenniumConcret-BetonMilenium_1300x2200mm.webp|2200
D30090|785192-D30090_CloudyGrey-BetonSzary_rapport-1300x1300mm.webp|1300
U119|592793-119_light-beige.webp|500
U570|586029-u570.webp|500
K101|592803-101_front-white.webp|500
U511|753936-u8685-02.webp|500
U8681|592493-8681_white-alaska.webp|500
K110|592799-110_interior-white.webp|500
K300|754756-k300-02.webp|500
U3293|753936-u8685-02.webp|500
U8685|697123-8685_alpine_white.webp|500
U120|592791-120_dove-blue.webp|500
U3271|592601-3271_ice-blue.webp|500
U3824|592569-3824_sea-blue.webp|500
D3806|519007-3806-ow--.webp|620
D381|610787-587_d381_buk.webp|550
D3807|519005-3807-ow--.webp|620
U3053|592641-3053_cappuccino.webp|500
U10020|785278-u10020_main_picture.webp|500
U4436|585799-u4436_vl_20_20.webp|500
D20571|926410-D20571_CherryGold_MFC_Rapport_1300x820mm.webp|820
U190|519757-190.webp|500
D3276|740709-mfc-d3276-ancona-oak-orig.webp|600
D2419|740682-mfc-d2419-antique-oak-orig.webp|600
D4225|585169-d4225_lowweb.webp|600
D4430|585037-d4430_lowweb.webp|600
D4032|740740-mfc-d4032-biscuit-oak-orig.webp|600
D3273|741823-worktops-d3273-canyon-oak-fhd.webp|600
D3275|740707-mfc-d3275-cortona-oak-orig.webp|600
D70050|857556-D70050_OV_DabDelikatny-TenderOakNatural_Rapport_1406x2074mm.webp|2074
D60654|926390-D60654_DabFornir_VeneerOak_MFC_Rapport_1300x600mm.webp|600
D1096|785224-d1096_rapport_img.webp|600
D3314|741827-worktops-d3314-giovanni-oak-orig.webp|650
D4031|740672-mfc-d4031-havana-oak-orig.webp|600
D3316|611077-506_d3316_dab_helsinki.webp|650
D9103|740773-mfc-d9103-light-oak-orig.webp|610
D2840|740688-mfc-d2840-royal-oak-orig.webp|600
D1094|785226-d1094_rapport_img.webp|600
D20230|785196-d20230_rapport_img.webp|600
D20551|820586-D20551_Grace_Oak_Gold_1300x763mm.webp|763
D20140|857792-D20140_CosyOakNatural-DabLiryczny_rapport-1300x905mm.webp|905
D3798|585413-d3798_lowweb.webp|780
D1089|785230-d1089_rapport_img.webp|690
D3801|585396-d3801_lowweb.webp|780
D1092|785228-d1092_rapport_img.webp|680
D20754|926398-D20754_DabNastrojowy_MoodyOak_MFC_Rapport_1300x610mm.webp|610
D4428|585050-d4428_lowweb.webp|600
D20110|785210-d20110_rapport_img.webp|600
D3823|585329-d3823_lowweb.webp|620
D1041|741883-D1041_EternalOak-DabOdwieczny_1306x714mm.webp|714
D3315|611070-507_d3315_dab_oslo.webp|650
D2609|740684-mfc-d2609-palermo-light-oak-orig.webp|630
D3799|585407-d3799_lowweb.webp|780
D3313|740659-mfc-d3313-st-petersburg-oak-orig.webp|650
D1035|741749-worktops-d1035-ancient-oak-orig.webp|620
D3166|740700-mfc-d3166-rijeka-light-oak-orig.webp|620
D3055|611018-538_d3055_dab_rustykalny.webp|610
D3800|585401-d3800_lowweb.webp|780
D3349|740711-mfc-d3349-san-marino-oak-orig.webp|600
D4033|634298-d4033_dab_sloneczny_60x130.webp|600
D3025|611015-539_d3025_dab_sonoma.webp|630
D5194|740770-mfc-d5194-sonoma-tabac-oak-orig.webp|630
D3821|585340-d3821_lowweb.webp|620
D3311|740655-mfc-d3311-traviata-oak-orig.webp|650
D3312|588472-14-10231-101_dab_opera_excl.webp|650
D4865|740764-mfc-d4865-versailles-oak-orig.webp|600
D9118|611423-434_d9118_dab_windsor.webp|600
D20744|926402-D20744_DabWiosenny_SpringOak_MFC_Rapport_1300x630mm.webp|630
D20734|926406-D20734_DabZimowy_WinterOak_MFC_Rapport_1300x770mm.webp|770
D4412|585147-d4412_lowweb.webp|570
D4040|741779-D4040_DrewnoRetro-RetroWood_1306x2220mm.webp|2220
D20270|925648-D20270_CX_Eden_Rapport_2040x1400mm.webp|2070
D20280|925646-D20280_CX_Embrace_Rapport_2040x1400mm.webp|2070
D20290|925644-D20290_CX_Emotion_Rapport_2040x1400mm.webp|2070
D3269|740643-mfc-d3269-enigma-orig.webp|750
D30080|785194-d30080_rapport_img.webp|620
U162|592777-162_graphite.webp|500
U3114|754890-u3114.webp|500
U4810|896533-U4810_Main-01.webp|500
D9300|740755-mfc-d9300-wild-pear-orig.webp|600
D1972|610822-574_d1972_jablon_locarno.webp|650
U3266|896633-D3266_Main.webp|500
D4426|585062-d4426_lowweb.webp|600
D3158|741811-D3158_VeronaAsh-JesionWerona_rapport-1300x690mm.webp|600
D30170|857784-D30170_StoneTex_Beige_1300x600.webp|600
D30180|857782-D30180_StoneTex_Black_1300x600.webp|600
U6933|785282-u6933_Kaszmirowy_Cashmere_main_picture.webp|500
D3820|585347-d3820_lowweb.webp|620
D4419|585106-d4419_lowweb.webp|620
D3818|585355-d3818_lowweb.webp|580
D4418|585113-d4418_lowweb.webp|620
D20130|785206-d20130_rapport_img.webp|600
D20120|785208-d20120_rapport_iimg.webp|600
D375|585632-d375_lowweb.webp|650
D440|697204-d440-pr-vancouver_maple.webp|670
D30220|785180-D30220_QuartziteGrey-KwarcytSzary_rapport-2200x1300mm.webp|2200
D20210|851002-Lamella_Terra_D20210_SD_MX.webp|650
D20200|851000-Lamella_Cream_D20200_SD_MX.webp|650
D30100|785190-d30100_rapport_img.webp|600
D4448|857697-D4448-MarmoRomeoWhite-MarmurCrema_rapport-1300x1400mm_OG.webp|1400
D881|896675-D881_Main.webp|500
U4809|896535-U4809_Main.webp|500
U4435|585807-u4435_vl_20_20.webp|500
D20240|925654-D20240_CX_Oasis_Rapport_2040x1400mm.webp|2070
D20260|925650-D20260_CX_Ocean_Rapport_2040x1400mm.webp|2070
D9310|740933-mfc-d9310-alder-orig.webp|675
D9311|740935-mfc-d9311-mountain-alder-orig.webp|600
U2508|592675-2508_olive.webp|500
D20250|925652-D20250_CX_Origin_Rapport_2040x1400mm.webp|2070
D722|697198-d722-01.webp|600
D4822|697019-4822_walnut-_ambassador_terra_ow.webp|600
D30190|857780-D30190_VL_OrzechArtDeco-ArtDecoWalnut_Rapport_1740x1410mm_OG.webp|1410
D3813|585358-d3813_lowweb.webp|620
D4409|585163-d4409_lowweb.webp|620
D2713|610930-548_d2713_orzch_california.webp|600
D9164|740931-mfc-d9164-caravaggio-walnut-orig.webp|600
D9450|740937-mfc-d9450-dark-walnut-orig.webp|600
D9163|740929-mfc-d9163-ecco-walnut-orig.webp|600
D20764|926394-D20764_OrzechKameralny_CosyWalnut_MFC_Rapport_1300x642mm.webp|642
D20150|857790-D20150-CalmWalnutBrown-OrzechKlasyczny-rapport-1310x1030mm-OG.webp|1025
D2841|740838-mfc-d2841-marino-walnut-orig.webp|600
D3810|585371-d3810_lowweb.webp|620
D1039|741781-worktops-d1039-midday-walnut-orig.webp|600
D3811|585365-d3811_lowweb.webp|620
D4410|585157-d4410_lowweb.webp|670
U4439|585782-u4439_vl_20_20.webp|500
D4096|785220-d4096_rapport_img.webp|625
U112|592797-112_gray.webp|500
U4446|585775-u4446_vl_20_20.webp|500
U141|592785-141_pink.webp|500
U10010|897854-U10010_main-01.webp|500
D3168|740840-mfc-d3168-whitewashed-pine-orig.webp|630
D4095|785222-d4095_rapport_img.webp|715
U171|586199-u171_pe_20_20.webp|500
U2653|896541-U2653_Main.webp|500
U540|592801-540_stone-grey.webp|500
U3057|896539-U3057_Main.webp|500
U544|898445-U544_VL_main_image.webp|500
D70060|857554-D70060_TO_TerrazzoFresco-TerrazzoFresh_Rapport_1406x2074mm.webp|2074
D70070|857552-D70070_TO_TkaneKwiaty-HeydayBeige_Rapport_1406x2074mm.webp|2074
U3188|585853-u3188_vl_20_20.webp|500
U6931|785284-u6931_main_picture.webp|500
U3189|592615-3189_truffle.webp|500
D4454|584935-d4454_lowweb.webp|600
D4452|584951-d4452_lowweb.webp|600
U1301|592719-1301_vanilla.webp|500
U3261|896537-U3261_Main.webp|500
D2226|740868-mfc-d2226-wenge-magic-orig.webp|600
D4432|585024-d4432_lowweb.webp|600
D2360|610846-567_d2360_wisnia_antyczna.webp|610
D30160|857786-D30160_SeasideBeige-WydmyBezowe_rapport-1300x1025mm.webp|1020
D4878|751522-D4878_SophisticatedGreyRock_rapport_image_1300x640.webp|640`;

const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("nie wczytano " + url));
  img.src = url;
});

// Kierunek słojów na zdjęciu: słoje pionowo = jasność zmienia się głównie w poziomie.
function grainOf(img) {
  const n = 96, c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  const g = (x, y) => { const i = (y * n + x) * 4; return d[i] + d[i + 1] + d[i + 2]; };
  let dx = 0, dy = 0;
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { dx += Math.abs(g(x + 1, y) - g(x, y)); dy += Math.abs(g(x, y + 1) - g(x, y)); }
  // próbka n × n zniekształca proporcje - gradienty przeliczone na piksele zdjęcia
  return dx * (n / img.naturalWidth) >= dy * (n / img.naturalHeight) ? "v" : "h";
}

function toJpeg(img, maxSide = 1024) {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.75, 0.6, 0.45]) { const url = c.toDataURL("image/jpeg", q); if (url.length < 850000) return url; }
  return null;
}

// Zwraca { ok, bledy, wiersze } - bez zapisu, gdy opts.dry.
export async function wgraj(opts = {}) {
  const names = new Map(SWISS_KRONO_DECORS.map((d) => [d.code, d]));
  const rows = ROWS.split("\n").map((r) => r.split("|")).filter((r) => !opts.only || opts.only.includes(r[0]));
  const out = { ok: 0, bledy: [], wiersze: [] };
  for (const [code, file, widthMm] of rows) {
    try {
      const d = names.get(code);
      if (!d) throw new Error("brak na liście dekorów");
      const img = await loadImage(BASE + file);
      const dataUrl = toJpeg(img);
      if (!dataUrl) throw new Error("zdjęcie za duże");
      const grain = d.type === "D" ? grainOf(img) : "v";
      const photo = { key: "SK-" + code, name: `Swiss Krono ${code} ${d.name}`, dataUrl, widthMm: Number(widthMm), grain };
      out.wiersze.push(`${code} ${img.naturalWidth}x${img.naturalHeight} ${widthMm}mm ${grain} ${Math.round(dataUrl.length / 1024)}kB`);
      if (!opts.dry && !(await saveDecorTextureToCloud(photo))) throw new Error("zapis nieudany");
      out.ok++;
    } catch (e) {
      out.bledy.push(code + ": " + e.message);
    }
  }
  return out;
}
