import { Button, createTheme, PasswordInput, TextInput } from '@mantine/core';

const inputStyles = { input: { '--input-bg': '#373a40', '--input-bd': '#61646b' } };

export const theme = createTheme({
  primaryColor: 'yellow',
  primaryShade: { light: 4, dark: 4 },
  defaultRadius: 'sm',
  fontFamily: '"Segoe UI", sans-serif',
  components: {
    Button: Button.extend({
      defaultProps: { color: 'yellow', autoContrast: true },
    }),
    TextInput: TextInput.extend({ styles: inputStyles }),
    PasswordInput: PasswordInput.extend({ styles: inputStyles }),
  },
});
