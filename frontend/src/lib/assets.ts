function publicAsset(relativePath: string) {
  return `${import.meta.env.BASE_URL}${relativePath}`;
}

export const brandWordmarkUrl = publicAsset('logo-leg3ndy.png');
export const appIconUrl = publicAsset('leg3ndy-studio-icon.png');
export const fallbackArtworkUrl = appIconUrl;
