/*
 * Branding lives in one place. Default is unbranded, as the research brief (§5)
 * advises without an agreement with Toyota: Toyota is named only to describe the
 * vehicles. Set NEXT_PUBLIC_BRAND=tfs only with Toyota Financial Services sign-off.
 */
const tfs = process.env.NEXT_PUBLIC_BRAND === "tfs";

export const brand = {
  product: "IRA",
  owner: tfs ? "Toyota Financial Services" : null,
  tagline: tfs
    ? "The car of the people helps people get ahead."
    : "See if refinancing your car makes sense, and how to get there.",
  helpLine: tfs ? "We'll help you get there." : "You can get there.",
  specialistCta: tfs ? "Talk to a loan specialist" : null,
};
