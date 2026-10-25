/*
 * Branding lives in one place. Default is unbranded, as the research brief (§5)
 * advises without an agreement with Toyota: Toyota is named only to describe the
 * vehicles. Set NEXT_PUBLIC_BRAND=tfs only with Toyota Financial Services sign-off;
 * that is the only switch that shows Toyota's logo, links or copy.
 */
const tfs = process.env.NEXT_PUBLIC_BRAND === "tfs";

export interface NavLink { label: string; href: string }
export interface FooterColumn { title: string; links: NavLink[] }

export const brand = {
  tfs,
  product: "IRA",
  owner: tfs ? "Toyota Financial Services" : null,
  logo: (tfs ? "tfs" : "ira") as "tfs" | "ira",
  tagline: tfs
    ? "The car of the people helps people get ahead."
    : "See if refinancing your car makes sense, and how to get there.",
  helpLine: tfs ? "We'll help you get there." : "You can get there.",
  specialistCta: tfs ? "Talk to a loan specialist" : null,
  /** Extra links on the right of the nav bar (TFS: account actions). */
  navLinks: (tfs
    ? [
        { label: "Apply for Credit", href: "https://www.toyotafinancial.com/us/en/planning_tools/apply_for_credit.html" },
        { label: "Log In", href: "https://www.toyotafinancial.com/dss/login" },
      ]
    : []) as NavLink[],
  footerColumns: [
    {
      title: "Your audit",
      links: [
        { label: "Your money", href: "/setup/money" },
        { label: "Your car", href: "/setup/car" },
        { label: "Try it out", href: "/audit" },
        { label: "Your scores", href: "/scores" },
        { label: "Your plan", href: "/plan" },
      ],
    },
    {
      title: "How it works",
      links: [
        { label: "Two scores, one answer", href: "/#scores" },
        { label: "What the audit looks at", href: "/#looks-at" },
      ],
    },
    tfs
      ? {
          title: "Toyota Financial Services",
          links: [
            { label: "toyotafinancial.com", href: "https://www.toyotafinancial.com/us/en.html" },
            { label: "Planning tools", href: "https://www.toyotafinancial.com/us/en/planning_tools.html" },
            { label: "Toyota.com", href: "https://www.toyota.com/" },
          ],
        }
      : {
          title: "Good to know",
          links: [
            { label: "No impact on your credit", href: "/#looks-at" },
            { label: "Start my audit", href: "/setup/money" },
          ],
        },
  ] as FooterColumn[],
};
