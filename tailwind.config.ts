/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // CrewForm brand tokens — aligned with crewform-brand-guidelines.md
        brand: {
          primary: '#5B6EF5',
          secondary: '#8B5CF6',
          hover: '#8B5CF6',
          muted: 'rgba(91, 110, 245, 0.1)',
        },
        surface: {
          primary: '#0D0F1A',
          card: '#141828',
          raised: '#1C2035',
          elevated: '#212640',
          overlay: '#212640',
        },
        status: {
          success: '#22C55E',
          'success-text': '#4ADE80',
          warning: '#EAB308',
          'warning-text': '#FACC15',
          error: '#EF4444',
          'error-text': '#F87171',
          idle: '#4B5563',
        },
        border: {
          DEFAULT: '#2E3450',
          muted: '#1E2235',
          emphasis: '#8B949E',
        },
        priority: {
          urgent: '#FF7B72',
          high: '#D29922',
          medium: '#5B6EF5',
          low: '#8B949E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      borderRadius: {
        'brand-sm': '10px',
        'brand': '12px',
        'brand-lg': '16px',
        'brand-pill': '20px',
      },
      animation: {
        'pulse-slow': 'pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
