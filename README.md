# Najina časovnica

Lokalna igra za obletnico: ugani, ali je bila desna fotografija posneta prej ali
kasneje. Fotografije in podatki ostanejo na napravi; zunanjih storitev ni.

## Zagon

```sh
python3 -m http.server 8000
```

Odpri <http://localhost:8000>. Zaradi modulov JavaScript in nalaganja podatkov
uporabi lokalni strežnik. Naslov, podnaslov, število življenj, točkovanje in
osebno voščilo urejaš v `src/config.js`.

Izberi mlajšo fotografijo s klikom nanjo ali z gumbom »Leva je mlajša« oziroma
»Desna je mlajša«. Fotografiji lahko izbereš tudi s tipkovnico (Tab in Enter).
Vrstica »Napolni srček« pridobi en korak ob pravilnem odgovoru in izgubi dva
ob napačnem, do najmanj nič. Pri 20 korakih se napolni in sproži animacijo
srčka. Polna ostane do napačnega odgovora; ob ponovni zapolnitvi se animacija
ponovi. Nova igra ponastavi vrstico na nič. Prikaz niza še vedno šteje samo
zaporedne pravilne odgovore in se ob napaki ponastavi na nič.

## Uvoz fotografij

1. Izvirnike ali njihove kopije shrani v `photos-inbox/` (lahko tudi v podmape).
2. Namesti odvisnosti: `python3 -m pip install Pillow pillow-heif`.
   Za HEIC lahko namesto `pillow-heif` uporabiš tudi lokalno nameščen ImageMagick
   s podporo libheif (ukaza `identify` in `convert` oziroma `magick`).
3. Zaženi `python3 tools/import_photos.py` iz korenske mape projekta.
4. Preglej `generated/review-report.json` in `generated/manifest.json`.
5. Manjkajoče datume in opise popravi v `overrides.json`, nato ponovi uvoz:

```json
{
  "IMG_1234.JPG": {
    "date": "2023-06-10",
    "time": "18:30:00",
    "caption": "Najin poletni dan",
    "alt": "Skupaj na prostem"
  }
}
```

Kot ključ lahko uporabiš tudi celotno relativno pot iz poročila. Igra samodejno
naloži `generated/memories.json`; kopiranje v JavaScript ni potrebno.
`src/memories.js` vsebuje samo stare primere in se v igri ne uporablja.

Uvoz prebere tudi gnezdene podatke EXIF, najprej DateTimeOriginal, in ohrani
datum ter uro posnetka (HH:MM:SS). Igra primerja datum in uro ter ju po odgovoru
prikaže. Uporablja lokalni čas fotografije, brez pretvarjanja v drug časovni pas.
Če ni podatkov EXIF, preveri datum v imenu datoteke (YYYY-MM-DD ali YYYY_MM_DD)
in ga označi za pregled v `uncertain_dates`. Časa spremembe datoteke ne uporablja.
Manjkajočih datumov ne izmišljuje; te fotografije čakajo na ročni popravek.

Izvirniki ostanejo nespremenjeni. HEIC/HEIF se pretvori v JPEG za brskalnike;
ostale podprte datoteke se kopirajo. Imena so stabilna, obstoječe datoteke se
ne prepisujejo. Ponoven uvoz obnovi celoten seznam spominov iz trenutne mape
`photos-inbox/` in upošteva popravke. Fotografije, odstranjene iz vhodne mape,
ne bodo več v seznamu igre; njihove že ustvarjene kopije ostanejo na disku.

Poročilo vsebuje manjkajoče datume, natančne dvojnike (SHA-256), nepodprte
formate in napake. Več fotografij istega dne je dovoljenih, če imajo različne
ure posnetkov. Če je na isti dan več fotografij in kateri manjka ura, je ta
navedena v `missing_times` in čaka na popravek v `overrides.json`. Fotografija
brez ure je dovoljena, če je edina za tisti dan. Pri povsem enakem datumu in
uri igra uporabi prvo fotografijo po imenu vhodne datoteke; ostale so navedene
v `same_timestamp`. Vse uspešno uvožene fotografije ostanejo v manifestu.




## Za razvoj uporabljen AI