// Shared Tailwind (CDN) design tokens — load right after cdn.tailwindcss.com.
// Palette is taken from the Cimory mark: navy mountain (brand) + red script (reserved for danger).
// `neon` is kept only as a legacy alias so older markup collapses onto the brand colour
// instead of producing violet/pink gradients.
(function () {
  var brand = {
    50: '#eef1fa', 100: '#dde3f4', 200: '#bcc6e8', 300: '#8f9fd6', 400: '#6175c0',
    500: '#3d52a8', 600: '#2b3d93', 700: '#233279', 800: '#1d2962', 900: '#172050'
  };
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
          display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif']
        },
        fontWeight: { bold: '650', extrabold: '700' },
        colors: {
          brand: brand,
          ink: { 900: '#151b33', 800: '#1d2547', 700: '#2a3358', 600: '#3a4468' },
          neon: { violet: brand[600], pink: brand[700], cyan: brand[500], lime: '#65a30d' }
        },
        borderRadius: { xl: '0.5rem', '2xl': '0.625rem', '3xl': '0.75rem' },
        boxShadow: {
          sm: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
          lg: '0 2px 6px -1px rgb(15 23 42 / 0.08)',
          xl: '0 10px 28px -8px rgb(15 23 42 / 0.18)',
          '2xl': '0 18px 44px -12px rgb(15 23 42 / 0.28)'
        }
      }
    }
  };
})();
