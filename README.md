# 🧮 Magyar Iskolai Kvízek – Matematika

Ez a projekt böngészőben futtatható, teljesen offline is működő matematika gyakorló kvízeket tartalmaz általános iskolás (3–8. osztály) és középiskolás (9–12. osztály) diákok számára, valamint a közép- és emelt szintű matematika érettségire készülőknek. 

A projekt főoldala (`index.html`) egy modern, reszponzív és sötét módot is támogató választófelületként (wrapper) funkcionál, amelyen keresztül elérhetőek az egyes évfolyamok feladatsorai.

## Főbb jellemzők

- **Egyszerű felépítés**: Keretrendszerek, npm csomagok vagy build eszközök nélkül készült – tiszta HTML, CSS és JavaScript.
- **Offline működés**: A letöltést követően semmilyen hálózati kapcsolatot nem igényelnek a kvízek, így akár internet nélkül is használhatóak. Weben (pl. GitHub Pages) egy service worker (`sw.js`) az első betöltéskor gyorsítótárazza az összes oldalt és ikont, így az évfolyamok közötti navigáció is működik internet nélkül.
- **Telepíthető (PWA)**: A `manifest.json` révén az oldal alkalmazásként a kezdőképernyőre menthető, saját ikonnal, böngésző-keret nélkül.
- **Reszponzív megjelenés**: Mobiltelefonokon, táblagépeken és asztali számítógépeken egyaránt kiválóan használható.
- **Nyomtatható feladatlapok (PDF)**: Ideális tanároknak és szülőknek. A generált feladatsorokból esztétikus, kétoszlopos feladatlap nyomtatható QR-kóddal.
- **Reprodukálható tesztek (Seeded PRNG)**: A `xorshift32` véletlenszám-generátor segítségével minden tesztlaphoz egyedi kód generálódik. E kód beírásával pontosan ugyanaz a feladatsor és a megoldási kulcsa bármikor újragenerálható.
- **Automatikus sötét mód**: Rendszerszintű beállítás alapján automatikusan sötét témát alkalmaz (`prefers-color-scheme`).
- **Analitika**: GoatCounter (adatvédelmi szempontból biztonságos, sütiket nem használó látogatottság-mérő).

## A projekt szerkezete

- `index.html` — A főoldal és évfolyam-választó felület (wrapper).
- `grade3.html` — 3. osztályos matematika kvíz.
- `grade4.html` — 4. osztályos matematika kvíz.
- `grade5.html` — 5. osztályos matematika kvíz.
- `grade6.html` — 6. osztályos matematika kvíz.
- `grade7.html` — 7. osztályos matematika kvíz.
- `grade8.html` — 8. osztályos matematika kvíz.
- `grade9.html` — 9. osztályos (középiskola) matematika kvíz.
- `grade10.html` — 10. osztályos matematika kvíz.
- `grade11.html` — 11. osztályos matematika kvíz.
- `grade12.html` — 12. osztályos matematika kvíz.
- `kozepszint.html` — középszintű matematika érettségi felkészítő kvíz.
- `emelt.html` — emelt szintű matematika érettségi felkészítő kvíz.
- `sw.js` — Service worker az offline gyorsítótárazáshoz.
- `manifest.json` — Web app manifest (telepíthető PWA).
- `README.md` — Ez a leíró fájl.
- `PROJECT_INSTRUCTION` — Fejlesztési és technikai útmutató a projekthez.

## Futtatás és Hosztolás

Mivel a projekt tisztán statikus fájlokból áll:
1. **Helyi futtatás**: Nyisd meg az `index.html` fájlt bármelyik modern webböngészőben (pl. Chrome, Firefox, Safari).
2. **Hosztolás GitHub Pages-en**:
   - Hozz létre egy új GitHub tárhelyet (repository-t).
   - Töltsd fel a fájlokat a `main` ágra.
   - A tárhely beállításaiban (Settings -> Pages) engedélyezd a GitHub Pages szolgáltatást a `main` ágon.
   - A weboldal azonnal elérhetővé válik a megadott nyilvános címen.

> **Frissítéskor**: ha bármely fájlt módosítasz, növeld a `CACHE` verziószámot a `sw.js`-ben (pl. `matek-v1` → `matek-v2`), különben a visszatérő látogatók böngészője a korábbi, gyorsítótárazott változatot tölti be. A service worker csak HTTPS-en fut (a GitHub Pages ezt biztosítja); `file://` megnyitásnál nincs hatása.

---

## Licensz

© 2026 Vágó Csaba — [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)  
Nem kereskedelmi célra szabadon felhasználható, a szerző megjelölésével.

---

## Támogatás

Ha hasznosnak találtad a projektet, itt tudod támogatni a munkámat:  
☕ [buymeacoffee.com/huvagoc](https://buymeacoffee.com/huvagoc) · 💸 [revolut.me/huvagoc](https://revolut.me/huvagoc)  
✉️ Visszajelzés és kapcsolat: matek-kviz@pm.me