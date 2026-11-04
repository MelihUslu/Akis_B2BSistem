// Girişten sonra ve yetkisiz sayfada kişinin gideceği ana sayfa
export const homeOf = (role) => (role === 'ADMIN' ? '/admin' : role === 'PLASIYER' ? '/plasiyer' : '/bayi');
