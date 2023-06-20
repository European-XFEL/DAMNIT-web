import { createStyles, rem, em } from "@mantine/core";

export default createStyles((theme) => ({
  item: {
    display: "flex",
    alignItems: "center",
    minHeight: rem(20),
    overflowX: "auto",

    "& + &": {
      marginTop: theme.spacing.xs,
    },
  },

  label: {
    color: theme.colors.gray[6],
    width: rem(120),
    height: rem(20),
    lineHeight: rem(20),
  },

  value: {
    color: theme.colors.dark[9],
    // width: rem(100),
    height: rem(20),
    lineHeight: rem(20),
  },
}));
