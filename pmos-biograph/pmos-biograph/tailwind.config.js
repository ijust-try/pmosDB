/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Hover styles apply only on devices that can hover. Without this a phone treats the first tap on an element with a
  // hover style as "hover" and needs a second tap to follow the link.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['"Lora Variable"', 'Lora', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Page: pastel blue. Highlights: deep blue. Panels stay white so data reads clearly.
        paper: '#EAF2FC',
        sand: { DEFAULT: '#DFEAF8', deep: '#CFDEF2' },
        line: { DEFAULT: '#CBDAEE', strong: '#A9C0E0' },
        ink: { DEFAULT: '#0C1F4A', soft: '#33466F', mute: '#586A91', faint: '#8798B8' },
        midnight: { DEFAULT: '#0B2A66', 2: '#12388A', 3: '#1B49A8', line: '#2D5BB9' },
        accent: { DEFAULT: '#1A4DB3', bright: '#8DBBFF', soft: '#DCE8FB' },
        sage: { DEFAULT: '#2F7D5B', soft: '#DDF0E6', light: '#8FD1B0' },
        lav: { DEFAULT: '#6C5CE7', soft: '#E9E6FD', light: '#A99BFF' },
        amber: { DEFAULT: '#A8650C', soft: '#F8EBD2' },
        rose: { DEFAULT: '#B4455B', soft: '#F8E1E6' },
      },
      boxShadow: {
        card: '0 1px 0 rgba(11,42,102,0.04), 0 1px 3px rgba(11,42,102,0.07)',
        lift: '0 2px 4px rgba(11,42,102,0.05), 0 14px 34px -14px rgba(11,42,102,0.28)',
      },
      borderRadius: { xl: '0.875rem' },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        'pulse-ring': { '0%': { transform: 'scale(0.9)', opacity: '0.55' }, '100%': { transform: 'scale(2.1)', opacity: '0' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        'dash-flow': { to: { strokeDashoffset: '-48' } },
        'nudge-down': { '0%,100%': { transform: 'translateY(0)', opacity: '0.5' }, '50%': { transform: 'translateY(6px)', opacity: '1' } },
      },
      animation: {
        'fade-up': 'fade-up 0.7s ease-out both',
        float: 'float 6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.2s ease-out infinite',
        marquee: 'marquee 38s linear infinite',
        'nudge-down': 'nudge-down 1.8s ease-in-out infinite',
        'dash-flow': 'dash-flow 7s linear infinite',
      },
    },
  },
  plugins: [],
};
