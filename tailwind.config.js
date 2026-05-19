/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: '#1B2559',
        'navy-dark': '#111A42',
        accent: '#4F63D2',
        'accent-light': '#EEF0FB',
        bg: '#F5F7FA',
        card: '#FFFFFF',
        border: '#E5E7EB',
        text: '#0D1117',
        muted: '#6B7280',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      borderRadius: {
        card: '8px',
        badge: '6px',
      },
    },
  },
  plugins: [],
};
