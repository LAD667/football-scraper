const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const port = process.env.PORT || 3000;

app.get('/scrape', async (req, res) => {
  const club = req.query.club;
  const team = req.query.team;

  if (!club || !team) {
    return res.status(400).json({ error: 'Missing "club" or "team" query parameter' });
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://www.football.ch/sfv.aspx', { waitUntil: 'networkidle2' });

    // Suche öffnen
    await page.click('#ctl00_PlaceHolderMain_gvVerband_ctl02_lnkVereinssuche');
    await page.waitForSelector('#ctl00_PlaceHolderMain_ucVereinsuche_txtName');

    // Verein eingeben
    await page.type('#ctl00_PlaceHolderMain_ucVereinsuche_txtName', club);
    await page.click('#ctl00_PlaceHolderMain_ucVereinsuche_btnSuchen');
    await page.waitForTimeout(3000);

    // Ersten Verein auswählen
    await page.click('#ctl00_PlaceHolderMain_ucVereinsuche_gvResult_ctl02_lnkName');
    await page.waitForTimeout(3000);

    // Teamseite finden
    const links = await page.$$eval('a', anchors => {
      return anchors
        .filter(a => a.textContent.toLowerCase().includes('junioren'))
        .map(a => ({ href: a.href, text: a.textContent }));
    });

    const match = links.find(l => l.text.toLowerCase().includes(team.toLowerCase()));
    if (!match) {
      await browser.close();
      return res.status(404).json({ error: 'Team not found on football.ch' });
    }

    // Zur Teamseite navigieren
    await page.goto(match.href, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);

    // Spielplan extrahieren
    const matches = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("table tr"));
      return rows.slice(1).map(row => {
        const tds = row.querySelectorAll("td");
        return {
          title: tds[2]?.innerText || '',
          date: tds[0]?.innerText.split(" ")[0] || '',
          time: tds[0]?.innerText.split(" ")[1] || '',
          location: tds[4]?.innerText || ''
        };
      });
    });

    await browser.close();
    res.json(matches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  }
});

app.listen(port, () => {
  console.log(`Scraper server running on port ${port}`);
});
