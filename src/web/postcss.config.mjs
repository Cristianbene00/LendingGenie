// Next loads this from the web project dir, but Tailwind's own config search
// starts at cwd (the project root), so point it at the root config explicitly.
export default {
  plugins: {
    tailwindcss: { config: './tailwind.config.ts' },
    autoprefixer: {},
  },
};
