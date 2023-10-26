import { createStyles, rem, em } from "@mantine/core"

// TODO: Create `item` interface

export default createStyles((theme) => ({
  scalarItem: {
    display: "flex",
    alignItems: "center",
    minHeight: rem(20),
    overflowX: "auto",
    marginTop: theme.spacing.xs,

    // "& + &": {
    //   marginTop: theme.spacing.xs,
    // },
  },

  objectItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "left",
    minHeight: rem(20),
    maxHeight: rem(225),
    overflowX: "auto",
    marginTop: theme.spacing.xs,
    gap: rem(5),
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

  objectValue: {
    marginLeft: rem(10),
    marginRight: rem(10),
    maxWidth: rem(200), // TODO: Manage `maxWidth` to fit drawer (parent) width
    maxHeight: rem(200),
  },
}))
