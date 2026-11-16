const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { otevri, detail, bezMezer } = require('./helpers');

test.describe('Kontrolní seznam brány', () => {
  test('TC-01 posun do další fáze je zakázán, dokud chybí dokument (negativní)', async ({ page }) => {
    // Arrange: INV-2026-003 je ve fázi Schválení, splněny 2 ze 3 bodů
    await otevri(page);
    await detail(page, 'INV-2026-003');

    // Act + Assert
    await expect(page.getByTestId('btn-advance')).toBeDisabled();
    await expect(page.getByTestId('gate-hint')).toContainText('Zbývá splnit: Schválení investiční komisí');
  });

  test('TC-02 posun je povolen po zaškrtnutí posledního dokumentu a zapíše se do historie (pozitivní)', async ({ page }) => {
    // Arrange
    await otevri(page);
    await detail(page, 'INV-2026-003');

    // Act
    await page.getByTestId('check-2').check();
    await expect(page.getByTestId('btn-advance')).toBeEnabled();
    await page.getByTestId('btn-advance').click();

    // Assert
    await expect(page.getByTestId('stage-INV-2026-003')).toHaveText('Projektová příprava');
    await expect(page.getByTestId('history-item').first()).toContainText('Posun z fáze „Schválení investice“ do fáze „Projektová příprava“');
    await expect(page.getByTestId('btn-advance')).toBeDisabled();
  });

  test('TC-03 odškrtnutí dokumentu znovu zakáže posun a zaznamená se do auditní stopy (hraniční)', async ({ page }) => {
    // Arrange: INV-2026-003 s kompletní bránou
    await otevri(page);
    await detail(page, 'INV-2026-003');
    await page.getByTestId('check-2').check();
    await expect(page.getByTestId('btn-advance')).toBeEnabled();

    // Act
    await page.getByTestId('check-0').uncheck();

    // Assert
    await expect(page.getByTestId('btn-advance')).toBeDisabled();
    await expect(page.getByTestId('history-item').first()).toContainText('Zrušeno zaškrtnutí: Investiční záměr');
  });
});

test.describe('Vrácení do předchozí fáze', () => {
  test('TC-04 vrácení bez důvodu nejde (negativní)', async ({ page }) => {
    // Arrange
    await otevri(page);
    await detail(page, 'INV-2026-001');

    // Act
    await page.getByTestId('btn-return').click();

    // Assert
    await expect(page.getByTestId('return-error')).toContainText('Uveďte důvod vrácení');
    await expect(page.getByTestId('stage-INV-2026-001')).toHaveText('Realizace');
  });

  test('TC-05 vrácení s důvodem projde a důvod je v historii i v počtu vrácení (pozitivní)', async ({ page }) => {
    // Arrange
    await otevri(page);
    await expect(page.getByTestId('kpi-returns')).toHaveText('1');
    await detail(page, 'INV-2026-001');

    // Act
    await page.getByTestId('return-reason').fill('Chybí výsledek výběrového řízení');
    await page.getByTestId('btn-return').click();

    // Assert
    await expect(page.getByTestId('stage-INV-2026-001')).toHaveText('Výběrové řízení');
    await expect(page.getByTestId('history-item').first()).toContainText('Důvod: Chybí výsledek výběrového řízení');
    await expect(page.getByTestId('kpi-returns')).toHaveText('2');
  });

  test('TC-06 text z důvodu vrácení se do stránky nevkládá jako HTML (negativní, bezpečnost)', async ({ page }) => {
    // Arrange
    await otevri(page);
    await detail(page, 'INV-2026-001');

    // Act
    await page.getByTestId('return-reason').fill('<b id="x">tučně</b>');
    await page.getByTestId('btn-return').click();

    // Assert
    await expect(page.locator('#x')).toHaveCount(0);
    await expect(page.getByTestId('history-item').first()).toContainText('<b id="x">tučně</b>');
  });
});

test.describe('Limit fáze a termín (pevné „dnes“)', () => {
  // INV-2026-003: ve fázi Schválení od 4. 11. 2026, limit 30 dní -> 30. den je 4. 12. 2026
  const hranice = [
    { dnes: '2026-12-03', dni: 29, stitek: false },
    { dnes: '2026-12-04', dni: 30, stitek: false },
    { dnes: '2026-12-05', dni: 31, stitek: true },
  ];
  for (const h of hranice) {
    test(`TC-07 hranice limitu: ${h.dni} dní ve fázi s limitem 30 -> štítek ${h.stitek ? 'je' : 'není'} (hraniční)`, async ({ page }) => {
      // Arrange: seed vznikne k 16. 11., poté změníme „dnes“
      await otevri(page);

      // Act
      await otevri(page, h.dnes);

      // Assert
      const radek = page.getByTestId('row-INV-2026-003');
      await expect(radek).toContainText(`${h.dni} / 30`);
      if (h.stitek) {
        await expect(radek.getByTestId('badge-limit')).toContainText('Překročen limit fáze o 1 den');
      } else {
        await expect(radek.getByTestId('badge-limit')).toHaveCount(0);
      }
    });
  }

  test('TC-08 akce po termínu má červený štítek, akce nad limitem oranžový (pozitivní)', async ({ page }) => {
    // Arrange + Act
    await otevri(page);

    // Assert
    await expect(page.getByTestId('row-INV-2026-005').getByTestId('badge-overdue')).toContainText('Po termínu o 5 dní');
    await expect(page.getByTestId('row-INV-2026-002').getByTestId('badge-limit')).toContainText('Překročen limit fáze o 15 dní');
    await expect(page.getByTestId('row-INV-2026-008')).toContainText('Uzavřeno');
  });

  test('TC-09 termín dokončení přesně dnes ještě není po termínu (hraniční)', async ({ page }) => {
    // Arrange: termín INV-2026-005 je 11. 11. 2026
    await otevri(page);

    // Act
    await otevri(page, '2026-11-11');

    // Assert
    await expect(page.getByTestId('row-INV-2026-005').getByTestId('badge-overdue')).toHaveCount(0);
  });
});

test.describe('Formulář nové akce', () => {
  async function otevriFormular(page) {
    await otevri(page);
    await page.getByTestId('btn-new').click();
    await expect(page.getByTestId('form-dialog')).toBeVisible();
  }
  async function vyplnit(page, { nazev = 'Nová akce', osoba = 'u1', rozpocet = '1000000', termin = '2026-12-31' } = {}) {
    await page.getByTestId('f-name').fill(nazev);
    await page.getByTestId('f-owner').selectOption(osoba);
    await page.getByTestId('f-budget').fill(rozpocet);
    await page.getByTestId('f-deadline').fill(termin);
  }

  test('TC-10 prázdný formulář ukáže chyby u všech polí (negativní)', async ({ page }) => {
    // Arrange
    await otevriFormular(page);

    // Act
    await page.getByTestId('btn-save').click();

    // Assert
    await expect(page.getByTestId('err-name')).toHaveText('Zadejte název akce.');
    await expect(page.getByTestId('err-owner')).toHaveText('Vyberte odpovědnou osobu.');
    await expect(page.getByTestId('err-budget')).toHaveText('Zadejte rozpočet v Kč.');
    await expect(page.getByTestId('err-deadline')).toHaveText('Zadejte termín dokončení.');
  });

  test('TC-11 název se čtyřmi znaky je odmítnut, s pěti znaky projde (hraniční)', async ({ page }) => {
    // Arrange
    await otevriFormular(page);
    await vyplnit(page, { nazev: 'Abcd' });

    // Act + Assert: 4 znaky
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('err-name')).toContainText('alespoň 5 znaků');
    await expect(page.getByTestId('form-dialog')).toBeVisible();

    // Act + Assert: 5 znaků
    await page.getByTestId('f-name').fill('Abcde');
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('form-dialog')).toBeHidden();
    await expect(page.getByTestId('row-INV-2026-009')).toContainText('Abcde');
  });

  for (const [popis, hodnota] of [['nula', '0'], ['záporný', '-500'], ['text', 'abc']]) {
    test(`TC-12 rozpočet ${popis} je odmítnut (negativní)`, async ({ page }) => {
      // Arrange
      await otevriFormular(page);
      await vyplnit(page, { rozpocet: hodnota });

      // Act
      await page.getByTestId('btn-save').click();

      // Assert
      await expect(page.getByTestId('err-budget')).toHaveText('Rozpočet musí být kladné číslo.');
    });
  }

  test('TC-13 termín včera je odmítnut, termín dnes projde (hraniční)', async ({ page }) => {
    // Arrange
    await otevriFormular(page);
    await vyplnit(page, { termin: '2026-11-15' });

    // Act + Assert: včera
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('err-deadline')).toHaveText('Termín nesmí být v minulosti.');

    // Act + Assert: dnes
    await page.getByTestId('f-deadline').fill('2026-11-16');
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('form-dialog')).toBeHidden();
    await expect(page.getByTestId('row-INV-2026-009')).toContainText('16. 11. 2026');
  });

  test('TC-14 platná akce vznikne ve fázi Záměr s rozpočtem formátovaným česky (pozitivní)', async ({ page }) => {
    // Arrange
    await otevriFormular(page);
    await vyplnit(page, { nazev: 'Obnova střechy depa', rozpocet: '1250000' });

    // Act
    await page.getByTestId('btn-save').click();

    // Assert
    const radek = page.getByTestId('row-INV-2026-009');
    await expect(radek).toContainText('Záměr');
    expect(bezMezer(await radek.innerText())).toContain('1 250 000 Kč');
  });
});

test.describe('Seznam, filtr a dashboard', () => {
  test('TC-15 filtr podle fáze zobrazí jen akce v dané fázi (pozitivní)', async ({ page }) => {
    // Arrange
    await otevri(page);

    // Act
    await page.getByTestId('filter-stage-4').click();

    // Assert
    await expect(page.locator('[data-testid^="row-"]')).toHaveCount(2);
    await expect(page.getByTestId('row-INV-2026-001')).toBeVisible();
    await expect(page.getByTestId('row-INV-2026-005')).toBeVisible();
  });

  test('TC-16 hledání bez ohledu na diakritiku najde akci, neexistující výraz ukáže prázdný stav (pozitivní i negativní)', async ({ page }) => {
    // Arrange
    await otevri(page);

    // Act + Assert: „tridirny“ najde „třídírny“
    await page.getByTestId('search').fill('tridirny');
    await expect(page.locator('[data-testid^="row-"]')).toHaveCount(1);
    await expect(page.getByTestId('row-INV-2026-004')).toBeVisible();

    // Act + Assert: nic nenalezeno
    await page.getByTestId('search').fill('neexistuje');
    await expect(page.getByTestId('empty')).toBeVisible();
  });

  test('TC-17 dashboard odpovídá datům (pozitivní)', async ({ page }) => {
    // Arrange + Act
    await otevri(page);

    // Assert
    await expect(page.getByTestId('kpi-total')).toHaveText('8');
    await expect(page.getByTestId('kpi-overlimit')).toHaveText('2');
    await expect(page.getByTestId('kpi-overdue')).toHaveText('1');
    expect(bezMezer(await page.getByTestId('kpi-budget').innerText())).toBe('302 550 000 Kč');
    await expect(page.getByTestId('dash-stage-4')).toHaveText('2');
    await expect(page.getByTestId('dash-stage-6')).toHaveText('1');
    await expect(page.getByTestId('bottleneck')).toContainText('Výběrové řízení');
  });

  test('TC-18 řazení podle rozpočtu dává nejvyšší rozpočet první (pozitivní)', async ({ page }) => {
    // Arrange
    await otevri(page);

    // Act
    await page.getByTestId('sort').selectOption('budget');

    // Assert
    await expect(page.locator('[data-testid^="row-"]').first()).toHaveAttribute('data-testid', 'row-INV-2026-004');
  });
});

test.describe('Export, perzistence a obnovení', () => {
  test('TC-19 export CSV má BOM, hlavičku, středníky a diakritiku (pozitivní)', async ({ page }) => {
    // Arrange
    await otevri(page);

    // Act
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-export').click(),
    ]);
    const obsah = fs.readFileSync(await download.path(), 'utf8');

    // Assert
    expect(obsah.charCodeAt(0)).toBe(0xfeff);
    expect(obsah).toContain('ID;Název akce;Odpovědná osoba;Rozpočet (Kč);Fáze;');
    expect(obsah).toContain('Rekonstrukce odbavovacích stání skupiny B');
    expect(obsah).toContain('Výběrové řízení');
    expect(obsah.trim().split(/\r?\n/)).toHaveLength(9);
  });

  test('TC-20 změna přežije obnovení stránky (pozitivní)', async ({ page }) => {
    // Arrange
    await otevri(page);
    await detail(page, 'INV-2026-003');
    await page.getByTestId('check-2').check();
    await page.getByTestId('btn-advance').click();

    // Act
    await otevri(page);

    // Assert
    await expect(page.getByTestId('stage-INV-2026-003')).toHaveText('Projektová příprava');
  });

  test('TC-21 obnovení ukázkových dat vrátí původní stav (pozitivní)', async ({ page }) => {
    // Arrange: změníme data
    await otevri(page);
    await detail(page, 'INV-2026-003');
    await page.getByTestId('check-2').check();
    await page.getByTestId('btn-advance').click();
    await page.getByTestId('detail-close').click();
    page.once('dialog', (d) => d.accept());

    // Act
    await page.getByTestId('btn-reset').click();

    // Assert
    await expect(page.getByTestId('stage-INV-2026-003')).toHaveText('Schválení investice');
    await expect(page.getByTestId('kpi-total')).toHaveText('8');
  });

  test('TC-22 zrušení potvrzení obnovení data nezmění (negativní)', async ({ page }) => {
    // Arrange
    await otevri(page);
    await page.getByTestId('search').fill('LED');
    page.once('dialog', (d) => d.dismiss());

    // Act
    await page.getByTestId('btn-reset').click();

    // Assert
    await expect(page.getByTestId('search')).toHaveValue('LED');
    await expect(page.locator('[data-testid^="row-"]')).toHaveCount(1);
  });
});

test.describe('Navigace a motiv', () => {
  test('TC-23 odkaz na procesní analýzu a zpět do aplikace (pozitivní)', async ({ page }) => {
    // Arrange
    await otevri(page);

    // Act
    await page.getByTestId('link-proces').click();

    // Assert
    await expect(page.getByTestId('proces-title')).toBeVisible();
    await page.getByTestId('link-app').click();
    await expect(page.getByTestId('app-title')).toHaveText('Tracker investičních akcí');
  });

  test('TC-24 přepínač motivu přepne a zapamatuje motiv (pozitivní)', async ({ page }) => {
    // Arrange
    await otevri(page);
    const motiv = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

    // Act
    await page.getByTestId('theme-toggle').click();
    const prvni = await motiv();
    await page.getByTestId('theme-toggle').click();

    // Assert
    expect(['light', 'dark']).toContain(prvni);
    expect(await motiv()).not.toBe(prvni);
    await otevri(page);
    expect(await motiv()).not.toBe(prvni);
  });
});

test.describe('Zachování práce při vrácení', () => {
  test('TC-25 po vrácení do předchozí fáze zůstanou dříve splněné dokumenty zaškrtnuté (pozitivní)', async ({ page }) => {
    // Arrange: INV-2026-003 dokončí bránu Schválení a posune se dál
    await otevri(page);
    await detail(page, 'INV-2026-003');
    await page.getByTestId('check-2').check();
    await page.getByTestId('btn-advance').click();
    await expect(page.getByTestId('stage-INV-2026-003')).toHaveText('Projektová příprava');

    // Act
    await page.getByTestId('return-reason').fill('Doplnit odhad nákladů');
    await page.getByTestId('btn-return').click();

    // Assert
    await expect(page.getByTestId('stage-INV-2026-003')).toHaveText('Schválení investice');
    for (const k of [0, 1, 2]) await expect(page.getByTestId(`check-${k}`)).toBeChecked();
    await expect(page.getByTestId('btn-advance')).toBeEnabled();
  });
});
