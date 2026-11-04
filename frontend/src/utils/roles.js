// Girişten sonra ve yetkisiz sayfada kişinin gideceği ana sayfa
export const homeOf = (role) => ({ ADMIN: '/admin', PLASIYER: '/plasiyer', PERSONEL: '/personel' }[role] || '/bayi');
