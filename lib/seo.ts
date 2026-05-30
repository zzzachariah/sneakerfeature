export const SITE_URL = "https://sneakerfeature.com";
export const DEFAULT_OG_IMAGE_URL = `${SITE_URL}/icon.ico`;
export const SITE_NAME = "SNKR Feature";

export const HOME_TITLE = "SNKR Feature | Basketball sneaker recommendations & specs";
export const HOME_DESCRIPTION = "Personalized basketball sneaker recommendations and structured specs for every pair.";

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
