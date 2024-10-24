const fs = require('fs');
const xml2js = require('xml2js');
const axios = require('axios');

const GITHUB_REPO = 'klarity-app/updates';
const APPCAST_FILE = 'appcast.xml';
const TEMPLATE_FILE = 'appcast_template.xml';

async function getReleases() {
  const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`
    }
  });
  return response.data;
}

function parseVersion(versionString) {
  // Match version patterns like "desktop-v0.0.1-dev.1" or "v0.0.1-dev.1"
  const match = versionString.match(/(?:desktop-)?v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?/);
  if (!match) return null;

  const [, major, minor, patch, prerelease] = match;
  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease: prerelease || '',
    originalTag: versionString // Keep the original tag name
  };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return b.major - a.major;
  if (a.minor !== b.minor) return b.minor - a.minor;
  if (a.patch !== b.patch) return b.patch - a.patch;
  if (a.prerelease === '' && b.prerelease !== '') return -1;
  if (a.prerelease !== '' && b.prerelease === '') return 1;
  if (a.prerelease !== '' && b.prerelease !== '') {
    const aParts = a.prerelease.split('.');
    const bParts = b.prerelease.split('.');
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] ? parseInt(aParts[i], 10) : 0;
      const bVal = bParts[i] ? parseInt(bParts[i], 10) : 0;
      if (aVal !== bVal) return bVal - aVal;
    }
  }
  return 0;
}

async function updateAppcast(releases) {
  const parser = new xml2js.Parser();
  const templateXml = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
  const template = await parser.parseStringPromise(templateXml);

  const items = [];

  releases.sort((a, b) => {
    const versionA = parseVersion(a.tag_name);
    const versionB = parseVersion(b.tag_name);
    return compareVersions(versionA, versionB);
  });

  releases.forEach((release, index) => {
    const parsedVersion = parseVersion(release.tag_name);
    if (!parsedVersion) {
      console.warn(`Skipping release ${release.tag_name}: Invalid version format`);
      return;
    }

    const versionNumber = `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}${parsedVersion.prerelease ? '-' + parsedVersion.prerelease : ''}`;
    const sparkleVersion = (releases.length - index).toString().padStart(5, '0');
    
    const newItem = JSON.parse(JSON.stringify(template.rss.channel[0].item[0]));

    const downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/${parsedVersion.originalTag}/klarity-${versionNumber}-macos.zip`;

    newItem.title[0] = `Version ${versionNumber}`;
    newItem.link[0] = 'https://www.klarity.app'; // Add website link
    newItem['sparkle:version'][0] = sparkleVersion;
    newItem['sparkle:shortVersionString'][0] = versionNumber;
    newItem['sparkle:releaseNotesLink'][0] = release.html_url;
    newItem.pubDate[0] = new Date(release.published_at).toUTCString();
    newItem.enclosure[0].$.url = downloadUrl;
    newItem.enclosure[0].$['sparkle:version'] = sparkleVersion;
    newItem.enclosure[0].$['sparkle:edSignature'] = process.env.SPARKLE_SIGNATURE || '';
    newItem.enclosure[0].$.length = release.assets[0]?.size || 0;

    items.push(newItem);
  });

  const appcast = {
    rss: {
      $: {
        version: '2.0',
        'xmlns:sparkle': 'http://www.andymatuschak.org/xml-namespaces/sparkle'
      },
      channel: [{
        title: ['Klarity App Updates'],
        description: ['Most recent updates to Klarity'],
        language: ['en'],
        link: ['https://www.klarity.app'], // Add website link at channel level
        item: items
      }]
    }
  };

  const builder = new xml2js.Builder();
  const updatedXml = builder.buildObject(appcast);

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
