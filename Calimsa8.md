B. Admin Tarafı: Manuel Bayi Ekleme ve Profil Yönetimi
Admin, başvuruyu beklemeden kendi de içeriden bayi tanımlayabilmelidir:

Manuel Bayi Ekleme: Admin panelinden 'Yeni Bayi Ekle' formu ile bilgileri girerek bayi oluşturabilme. Oluşturulan bayiye yine giriş şifresi otomatik mail olarak gitsin.

Detaylı Bayi Profili: Sistemde kayıtlı bir bayinin detayına girildiğinde admin şu ayarları yapabilmeli:

Şifre Sıfırlama: Admin tek tıkla bayinin şifresini sıfırlayıp yeni şifreyi mail atabilmeli.

Bayi Grubu Atama: Bayiyi Standart, Gold veya VİP gibi fiyatlandırmayı etkileyecek gruplara atayabilmeli.

Durum Değiştirme: Sorunlu bir bayinin hesabını tek tuşla Pasif konuma alarak sisteme girişini engelleyebilmeli (Suspend).

C. UI ve Kodlama Beklentileri
Arayüz: Bayi listesi tablosunda; Şirket Unvanı, Yetkili Kişi, Durum (Aktif/Pasif/Bekliyor) net şekilde görünsün. Hızlı arama çubuğu ile Vergi No veya Unvana göre saniyeler içinde bayi bulunabilsin.

Güvenlik: Şifreler kesinlikle düz metin olarak değil, bcrypt ile hashlenerek saklanmalıdır (Mail ile gönderildikten sonra bile admin dahil kimse şifreyi görememeli, sadece sıfırlayabilmelidir).

Lütfen mevcut veritabanı yapısını bozmadan Users ve Companies tabloları üzerinde bu Onay/Mail iş akışını React ve Node.js ile entegre bir şekilde oluştur."