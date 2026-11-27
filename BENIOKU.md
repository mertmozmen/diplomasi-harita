# Diplomasi Haritası

Simülasyon için boş dünya haritası + toprak boyama + sınır kaydırma aracı. İnternetsiz çalışır (harita verisi ve d3 `vendor/` içinde).

**Açmak:** `baslat.command` dosyasına çift tıkla → tarayıcıda `http://localhost:8791` açılır.

## Araçlar
| Araç | Kısayol | Ne yapar |
|---|---|---|
| Taşı | H | Haritayı sürükler (Boşluk tuşunu basılı tutarak her araçta) |
| Doldur | G | Ülkeye tıkla → seçili renge boyar. "Tüm ülke" adalarıyla birlikte, "Bağlı alan" sadece tıklanan parça |
| Fırça | B | Serbest toprak boyama (sadece kara). `[` `]` boyut |
| Sınır çek | S | İki ülke arasındaki çizgiyi tut, sürükle → arkadaki ülke ilerler, renk ve çizgi birlikte gelir. Üçüncü ülkeye ve denize dokunmaz |
| Silgi | E | Toprağı sahipsiz bırakır |
| Kalem | P | Harita üstüne serbest çizim (cephe hattı, ok) |
| Seç | I / Alt+tık | Tıklanan yerin sahibini seçer |

⌘Z geri al · ⇧⌘Z yinele · 1–9 ülke seç · 0 tüm dünya · ⌘S dosyaya kaydet

## Kayıt
- Her değişiklik tarayıcıya otomatik kaydedilir (aynı tarayıcıda kaldığın yerden devam).
- **Dosya → Dosyaya kaydet** ile `.json` al (birkaç on KB); başka bilgisayarda **Kayıtlı haritayı aç** ile yükle.
- **Dosya → PNG olarak indir** 4096×2048 görüntü verir.

## Teknik
- Miller projeksiyonu, 84°K–57,8°G, 4096×2048 piksel ızgara (≈10 km/piksel). Antarktika yok.
- Her piksel: bugünkü ülke (bölge) + simülasyon ülkesi (sahip). Sınır çekme ikisini birlikte taşır.
- Çizim WebGL2 ile; çizgiler her yakınlıkta ekran çözünürlüğünde, sabit kalınlıkta.
- Alanlar km² olarak gerçek küre alanıyla hesaplanır (Türkiye ≈ 781 bin km²).
