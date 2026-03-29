export default async function notarizeIfPossible(context) {
  if (process.platform !== 'darwin') {
    return;
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn('[notarize] Credenciais Apple ausentes. Pulando notarizacao.');
    return;
  }

  let notarize;
  try {
    ({ notarize } = await import('@electron/notarize'));
  } catch (error) {
    console.warn('[notarize] @electron/notarize nao instalado. Pulando notarizacao.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  await notarize({
    tool: 'notarytool',
    appBundleId: context.packager.appInfo.id,
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  });
}
