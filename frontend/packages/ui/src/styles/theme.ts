import {
  createTheme,
  DEFAULT_THEME,
  rem,
  type AvatarFactory,
  type BadgeFactory,
  type CSSVariablesResolver,
  type ExtendComponent,
  type MenuFactory,
  type TableFactory,
  type TooltipFactory,
} from '@mantine/core'

import { FONT_FAMILY_MONO, FONT_FAMILY_SANS, FONT_SIZES } from './fonts'
import classes from './theme.module.css'

// Source Sans 3 sits optically small, so every step is 6% over Mantine's
// defaults, the normalization USWDS applies to the same family.
export const theme = createTheme({
  fontFamily: FONT_FAMILY_SANS,
  fontFamilyMonospace: FONT_FAMILY_MONO,
  // Ink is the ramp's darkest grey, not pure black, the way USWDS sets its body
  // text in gray-90.
  black: DEFAULT_THEME.colors.gray[9],
  // Shade 7 is where indigo reads at AA, as text on a neutral ground and as a
  // fill under white text alike.
  primaryColor: 'indigo',
  primaryShade: { light: 7, dark: 8 },
  // sm is the page's base, xs is compact controls, supporting text and
  // anything floating, xxs is the floor.
  fontSizes: {
    xxs: rem(FONT_SIZES.xxs),
    xs: rem(FONT_SIZES.xs),
    sm: rem(FONT_SIZES.sm),
    md: rem(FONT_SIZES.md),
    lg: rem(FONT_SIZES.lg),
    xl: rem(FONT_SIZES.xl),
  },
  // Mantine has no xxs step, so the floor borrows xs's ratio.
  lineHeights: { xxs: DEFAULT_THEME.lineHeights.xs },
  headings: {
    sizes: {
      h1: { fontSize: rem(36) },
      h2: { fontSize: rem(28) },
      // A whole-pixel line box; the ratio would land on 32.2 and round up.
      h3: { fontSize: rem(23), lineHeight: rem(32) },
      h4: { fontSize: rem(19) },
      h5: { fontSize: rem(17) },
      h6: { fontSize: rem(15) },
    },
  },
  // Plain objects, not Component.extend(), which pulls the component into any
  // bundle that imports the theme; `satisfies` keeps the typing.
  components: {
    Avatar: {
      classNames: { root: classes.avatar },
    } satisfies ExtendComponent<AvatarFactory>,
    Badge: {
      classNames: { root: classes.badge },
    } satisfies ExtendComponent<BadgeFactory>,
    // An item reads its classes from the menu's own styles context, so the
    // shape of a row is set here rather than on Menu.Item.
    Menu: {
      classNames: {
        item: classes.menuItem,
        itemSection: classes.menuItemSection,
      },
    } satisfies ExtendComponent<MenuFactory>,
    // A plain th is the browser's bold; column headers are emphasis.
    Table: {
      styles: { th: { fontWeight: 600 } },
    } satisfies ExtendComponent<TableFactory>,
    // A tooltip floats, so it reads at the floating size instead of Mantine's
    // own sm.
    Tooltip: {
      styles: { tooltip: { fontSize: 'var(--mantine-font-size-xs)' } },
    } satisfies ExtendComponent<TooltipFactory>,
  },
})

// Placeholder and dimmed are text a reader has to read, so they take the
// secondary grey instead of Mantine's gray.5 and gray.6, both below AA.
export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {},
  light: {
    '--mantine-color-placeholder': theme.colors.gray[7],
    '--mantine-color-dimmed': theme.colors.gray[7],
  },
  dark: {},
})
