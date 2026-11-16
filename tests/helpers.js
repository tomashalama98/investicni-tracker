const path = require('path');
const { pathToFileURL } = require('url');

const APP = pathToFileURL(path.join(__dirname, '..', 'docs', 'index.html')).href;
const DNES = '2026-11-16';

/** Otevře aplikaci s pevným datem „dnes“. */
async function otevri(page, dnes = DNES) {
  await page.goto(`${APP}?dnes=${dnes}`);
  await page.getByTestId('actions-table').waitFor();
}

/** Otevře detail akce podle ID. */
async function detail(page, id) {
  await page.getByTestId(`open-${id}`).click();
  await page.getByTestId('detail').waitFor({ state: 'visible' });
}

/** Odstraní pevné i nezlomitelné mezery pro porovnání textu. */
const bezMezer = (s) => s.replace(/[\s ]+/g, ' ').trim();

module.exports = { APP, DNES, otevri, detail, bezMezer };
