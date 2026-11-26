import { Button, createTheme } from '@mantine/core';

const obsidian = ['#f4f4f5', '#e4e4e7', '#a1a1aa', '#8a8a94', '#383840', '#27272d',
  '#1c1c22', '#141418', '#0f0f12', '#09090b'];
const porcelain = ['#ffffff', '#fafafa', '#f4f4f5', '#eeeeef', '#e4e4e7', '#d6d3d1',
  '#a1a1aa', '#71717a', '#52525b', '#27272a'];

export const theme = createTheme({
  colors: { dark: obsidian, porcelain },
  primaryColor: 'porcelain',
  primaryShade: { light: 4, dark: 2 },
  defaultRadius: 'sm',
  fontFamily: 'Inter, "Segoe UI", sans-serif',
  fontFamilyMonospace: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
  headings: { sizes: { h1: { fontSize: '1.875rem', lineHeight: '1.2' }, h2: { fontSize: '1.375rem', lineHeight: '1.3' } } },
  components: {
    Button: Button.extend({ defaultProps: { autoContrast: true } }),
  },
});
