const fs = require('fs');
const xml2js = require('xml2js');
const axios = require('axios');

const GITHUB_REPO = 'klarity-app/updates';
const APPCAST_FILE = 'appcast.xml';
const TEMPLATE_FILE = 'appcast_template.xml';

async function getReleases() {
  const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`
    }
  });
  return response.data;
}

async function updateAppcast(releases) {
  // Read existing appcast.xml
  const appcastXml = fs.readFileSync(APPCAST_FILE, 'utf-8');
  const parser = new xml2js.Parser();
  const appcast = await parser.parseStringPromise(appcastXml);

  // Read template file
  const templateXml = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
  const template = await parser.parseStringPromise(templateXml);

  // Map existing items by version
  const existingItems = new Map();
  if (appcast.rss.channel[0].item) {
    appcast.rss.channel[0].item.forEach(item => {
      const version = item['sparkle:version'][0];
      existingItems.set(version, item);
    });
  }

  // Create or update items based on releases
  releases.forEach(release => {
    const versionNumber = release.tag_name.replace('v', '').replace(/\./g, '');
    const newItem = existingItems.get(versionNumber) || JSON.parse(JSON.stringify(template.rss.channel[0].item[0]));

    newItem.title[0] = `Version ${release.tag_name}`;
    newItem['sparkle:version'][0] = versionNumber;
    newItem['sparkle:shortVersionString'][0] = release.tag_name.replace('v', '');
    newItem['sparkle:releaseNotesLink'][0] = release.html_url;
    newItem.pubDate[0] = new Date(release.published_at).toUTCString();
    newItem.enclosure[0].$.url = `https://github.com/${GITHUB_REPO}/releases/download/${release.tag_name}/Klarity.zip`;
    newItem.enclosure[0].$['sparkle:version'] = versionNumber;
    newItem.enclosure[0].$['sparkle:edSignature'] = process.env.SPARKLE_SIGNATURE || '';
    newItem.enclosure[0].$.length = release.assets[0].size;

    existingItems.set(versionNumber, newItem);
  });

  // Update the channel with the new items
  appcast.rss.channel[0].item = Array.from(existingItems.values());

  // Convert back to XML
  const builder = new xml2js.Builder();
  const updatedXml = builder.buildObject(appcast);

  // Write updated XML back to file
  fs.writeFileSync(APPCAST_FILE, updatedXml);

  console.log('Appcast updated successfully');
}

async function main() {
  try {
    const releases = await getReleases();
    await updateAppcast(releases);
  } catch (error) {
    console.error('Error updating appcast:', error);
    process.exit(1);
  }
}

main();
