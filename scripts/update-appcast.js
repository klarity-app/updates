const fs = require('fs');
const xml2js = require('xml2js');
const axios = require('axios');

const GITHUB_REPO = 'klarity-app/updates';
const APPCAST_FILE = 'appcast.xml';
const TEMPLATE_FILE = 'appcast_template.xml';

async function getLatestRelease() {
  const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
  return response.data;
}

async function updateAppcast(release) {
  // Read existing appcast.xml
  const appcastXml = fs.readFileSync(APPCAST_FILE, 'utf-8');
  const parser = new xml2js.Parser();
  const appcast = await parser.parseStringPromise(appcastXml);

  // Read template file
  const templateXml = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
  const template = await parser.parseStringPromise(templateXml);

  // Create new item from template
  const newItem = template.rss.channel[0].item[0];

  // Update new item with release information
  newItem.title[0] = `Version ${release.tag_name}`;
  newItem['sparkle:version'][0] = release.tag_name.replace('v', '').replace(/\./g, '');
  newItem['sparkle:shortVersionString'][0] = release.tag_name.replace('v', '');
  newItem['sparkle:releaseNotesLink'][0] = release.html_url;
  newItem.pubDate[0] = new Date(release.published_at).toUTCString();
  newItem.enclosure[0].$.url = `https://github.com/${GITHUB_REPO}/releases/download/${release.tag_name}/Klarity.zip`;
  newItem.enclosure[0].$['sparkle:version'] = release.tag_name.replace('v', '').replace(/\./g, '');
  newItem.enclosure[0].$['sparkle:edSignature'] = process.env.SPARKLE_SIGNATURE;
  newItem.enclosure[0].$.length = release.assets[0].size;

  // Add new item to the channel
  appcast.rss.channel[0].item = [newItem, ...(appcast.rss.channel[0].item || [])];

  // Convert back to XML
  const builder = new xml2js.Builder();
  const updatedXml = builder.buildObject(appcast);

  // Write updated XML back to file
  fs.writeFileSync(APPCAST_FILE, updatedXml);

  console.log('Appcast updated successfully');
}

async function main() {
  try {
    const latestRelease = await getLatestRelease();
    await updateAppcast(latestRelease);
  } catch (error) {
    console.error('Error updating appcast:', error);
    process.exit(1);
  }
}

main();
