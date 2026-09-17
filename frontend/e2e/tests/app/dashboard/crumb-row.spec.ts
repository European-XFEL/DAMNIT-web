import { type Locator } from '@playwright/test'

import { test, expect } from '#fixtures'
import { breadcrumb, navBurger } from '#support/dashboard'
import { plotVariable } from '#support/plots'
import { openProposal } from '#support/table'

// The row has 227 px here for crumbs that want more, so this is the width where
// what it keeps and what it gives up is decided.
test.use({ viewport: { width: 414, height: 896 } })

// `toBeVisible` cannot see this: an ancestor's `overflow: hidden` clips the
// glyphs while the element keeps its box.
function clipped(crumb: Locator) {
  return crumb.evaluate((el) => el.scrollWidth > el.clientWidth)
}

test('the crumb row keeps the proposal whole and lets the view name give way', async ({
  page,
  example,
}) => {
  const proposal = example.proposalMetadata[0]
  await openProposal(page, example)

  // A plot crumb is its name and its runs, which is more than the row holds
  await navBurger(page).click()
  await plotVariable(page, { example, variable: 'n_trains' })

  // The view name is what ran out of room
  const view = breadcrumb(page).locator('[aria-current="page"]')
  await expect(view).toBeVisible()
  await expect.poll(() => clipped(view)).toBe(true)

  // The proposal beside it kept every glyph
  const identity = breadcrumb(page).getByRole('button')
  await expect.poll(() => clipped(identity)).toBe(false)
  await expect(
    identity.getByText(proposal.instrument, { exact: true })
  ).toBeVisible()
  await expect(
    identity.getByText(`p${proposal.number}`, { exact: true })
  ).toBeVisible()
})
