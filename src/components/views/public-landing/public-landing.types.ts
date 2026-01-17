export type PublicLandingViewModel = {
  hero: PublicLandingHeroVm
  primaryCtas: PublicLandingCtaVm[]
  privacy: PublicLandingPrivacyVm
  helpLinks?: PublicLandingHelpLinkVm[]
}

export type PublicLandingHeroVm = {
  title: string
  subtitle: string
  howItWorksSteps?: string[]
}

export type PublicLandingCtaVm = {
  label: string
  href: `/${string}`
  variant: "primary" | "secondary"
  ariaLabel?: string
}

export type PublicLandingPrivacyVm = {
  note: string
  privacyHref?: `/${string}`
  privacyLabel?: string
}

export type PublicLandingHelpLinkVm = {
  label: string
  href: `/${string}`
}
