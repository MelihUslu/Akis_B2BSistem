# Güvenlik Politikası

Akis B2B'nin güvenliğini ciddiye alıyoruz. Bir güvenlik açığı bulduğunuzu düşünüyorsanız, lütfen sorumlu biçimde bildirin.

## Açık bildirimi

- **E-posta:** security@akisb2b.com
- Açığı **herkese açık** (issue, sosyal medya vb.) paylaşmadan önce bize ulaşın ki düzeltme için makul bir süre tanıyabilelim.
- Bildirime şunları ekleyin: etkilenen uç / ekran, yeniden üretme adımları, olası etki ve varsa kavram kanıtı.
- **Lütfen yapmayın:** gerçek müşteri verisine erişmek, hizmeti bozmak (DoS), veri silmek/değiştirmek, ya da başkalarının hesaplarını denemek. Test için kendi deneme firmanızı açın.

## Kapsam

- Uygulama: `*.akisb2b.com`, `api.akisb2b.com` ve doğrulanmış özel alan adları.
- Kaynak kod: bu depo.

## Süreç

1. Bildiriminizi aldığımızı makul sürede teyit ederiz.
2. Doğrular, önem derecesini belirler ve bir düzeltme planı paylaşırız.
3. Düzeltme yayına alındıktan sonra, isterseniz katkınızı anarız.

## Otomatik taramalar

Bu depo CI'da şunları çalıştırır: CodeQL (SAST), Semgrep (SAST), gitleaks (sır taraması), Trivy (konteyner/CVE) ve `npm audit`. Ayrıntı: `docs/yapilanlar/12-guvenlik-denetimi.md`.
