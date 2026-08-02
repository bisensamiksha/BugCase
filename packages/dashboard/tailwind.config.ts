import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{html,ts,tsx}'],
  // Key `dark:` variants on the resolved attribute the theme controller writes, not on the OS.
  // Tailwind's default `media` strategy would follow prefers-color-scheme while the --bc-* tokens
  // follow data-theme, so forcing a theme against the OS preference would render dark tokens
  // beside light `dark:` utilities on the same screen (S4-25).
  darkMode: ['selector', ':root[data-theme="dark"]'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
