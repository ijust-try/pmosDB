/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Manrope Variable"', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        paper: '#FBF9F5',
        sand: { DEFAULT: '#F3EFE8', deep: '#EAE4D8' },
        line: { DEFAULT: '#E3DDD0', strong: '#CFC7B6' },
        ink: { DEFAULT: '#101A33', soft: '#3B4660', mute: '#6B7488', faint: '#98A0B2' },
        midnight: { DEFAULT: '#0A1330', 2: '#101C40', 3: '#18274F', line: '#26356A' },
        teal: { DEFAULT: '#1B7F7C', bright: '#43C6B6', soft: '#DCEFEC' },
        sage: { DEFAULT: '#5E8C6F', soft: '#E4EDE4', light: '#9CC5A1' },
        lav: { DEFAULT: '#6C5CE7', soft: '#E9E6FD', light: '#A99BFF' },
        amber: { DEFAULT: '#A8650C', soft: '#F7EAD3' },
        rose: { DEFAULT: '#B4455B', soft: '#F6E1E5' },
      },
      boxShadow: {
        card: '0 1px 0 rgba(16,26,51,0.04), 0 1px 3px rgba(16,26,51,0.05)',
        lift: '0 2px 4px rgba(16,26,51,0.04), 0 12px 32px -12px rgba(16,26,51,0.18)',
      },
      borderRadius: { xl: '0.875rem' },
    },
  },
  plugins: [],
};
