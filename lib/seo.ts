export const SITE_URL = "https://snkrfeature.com";
// Generated 1200x630 social card (see app/api/og/route.tsx). The old value
// pointed at /icon.ico, which does not exist and is not a valid OG image size.
export const DEFAULT_OG_IMAGE_URL = `${SITE_URL}/api/og`;
export const SITE_NAME = "sneakerfeature";

export const HOME_TITLE = "sneakerfeature | Basketball sneaker recommendations & specs";
export const HOME_DESCRIPTION = "Personalized basketball sneaker recommendations and structured specs for every pair.";

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
