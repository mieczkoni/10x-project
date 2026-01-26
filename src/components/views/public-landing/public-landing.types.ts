export interface PublicLandingViewModel {
  hero: PublicLandingHeroVm;
  primaryCtas: PublicLandingCtaVm[];
  privacy: PublicLandingPrivacyVm;
  helpLinks?: PublicLandingHelpLinkVm[];
}

export interface PublicLandingHeroVm {
  title: string;
  subtitle: string;
  howItWorksSteps?: string[];
}

export interface PublicLandingCtaVm {
  label: string;
  href: `/${string}`;
  variant: "primary" | "secondary";
  ariaLabel?: string;
}

export interface PublicLandingPrivacyVm {
  note: string;
  privacyHref?: `/${string}`;
  privacyLabel?: string;
}

export interface PublicLandingHelpLinkVm {
  label: string;
  href: `/${string}`;
}
