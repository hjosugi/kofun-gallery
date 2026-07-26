#!/usr/bin/env node

import { access, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";

const userAgent = "KofunAtlas/0.1 (+https://github.com/hjosugi/kofun-photo)";
const root = new URL("../", import.meta.url);
const outputPath = new URL("data/kofun.json", root);
const panoramaDir = new URL("site-src/assets/kofun360/", root);

const sparql = `
SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?article
       ?adminLabel ?prefLabel ?inception ?length ?aliases
WHERE {
  {
    SELECT ?item
           (SAMPLE(?coord0) AS ?coord)
           (SAMPLE(?image0) AS ?image)
           (SAMPLE(?article0) AS ?article)
           (SAMPLE(?admin0) AS ?admin)
           (SAMPLE(?pref0) AS ?pref)
           (SAMPLE(?inception0) AS ?inception)
           (SAMPLE(?length0) AS ?length)
           (GROUP_CONCAT(DISTINCT STR(?alias0); separator="|") AS ?aliases)
    WHERE {
      ?item wdt:P31/wdt:P279* wd:Q1141225;
            wdt:P17 wd:Q17;
            wdt:P625 ?coord0.
      OPTIONAL { ?item wdt:P18 ?image0. }
      OPTIONAL {
        ?article0 schema:about ?item;
                  schema:isPartOf <https://ja.wikipedia.org/>.
      }
      OPTIONAL { ?item wdt:P131 ?admin0. }
      OPTIONAL {
        ?item wdt:P131* ?pref0.
        ?pref0 wdt:P31 wd:Q50337.
      }
      OPTIONAL { ?item wdt:P571 ?inception0. }
      OPTIONAL { ?item wdt:P2043 ?length0. }
      OPTIONAL {
        ?item skos:altLabel ?alias0.
        FILTER(LANG(?alias0) = "ja")
      }
    }
    GROUP BY ?item
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "ja,en".
  }
}
ORDER BY ?itemLabel
`;

const prefectures = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

async function request(url, options = {}, retries = 3) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent,
      ...(options.headers || {})
    }
  });
  if ((response.status === 429 || response.status >= 500) && retries > 0) {
    const wait = Number(response.headers.get("retry-after") || 2) * 1000;
    await new Promise(resolve => setTimeout(resolve, wait));
    return request(url, options, retries - 1);
  }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

function value(binding, key) {
  return binding[key]?.value || "";
}

function point(text) {
  const match = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(text);
  return match ? { lng: Number(match[1]), lat: Number(match[2]) } : null;
}

function entityId(uri) {
  return uri.split("/").pop();
}

function commonsFilename(uri) {
  if (!uri) return "";
  const tail = new URL(uri).pathname.split("/").pop();
  return decodeURIComponent(tail).replaceAll("_", " ");
}

function plainText(html = "") {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();
}

function yearLabel(time) {
  if (!time) return "";
  const match = /^([+-]?\d{1,})-/.exec(time);
  if (!match) return "";
  const year = Number(match[1]);
  if (!Number.isFinite(year)) return "";
  return year < 0 ? `紀元前${Math.abs(year)}年頃` : `${year}年頃`;
}

function inferPrefecture(text) {
  return prefectures.find(pref => text.includes(pref)) || "";
}

async function fetchWikidata() {
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", sparql);
  url.searchParams.set("format", "json");
  console.log("Fetching CC0 kofun records from Wikidata…");
  const response = await request(url);
  const payload = await response.json();

  return payload.results.bindings.map(binding => {
    const coordinates = point(value(binding, "coord"));
    const imageName = commonsFilename(value(binding, "image"));
    const admin = value(binding, "adminLabel");
    const pref = value(binding, "prefLabel") || inferPrefecture(admin);
    const length = value(binding, "length");
    const id = entityId(value(binding, "item"));
    return {
      id: `wikidata-${id}`,
      name: value(binding, "itemLabel") || id,
      reading: "",
      aliases: value(binding, "aliases").split("|").filter(Boolean),
      group: "",
      description: value(binding, "itemDescription"),
      lat: coordinates?.lat,
      lng: coordinates?.lng,
      prefecture: pref,
      location: admin,
      shape: "",
      length: length ? `${Math.round(Number(length) * 10) / 10} m` : "",
      period: yearLabel(value(binding, "inception")),
      sources: ["wikidata"],
      sourceUrl: `https://www.wikidata.org/wiki/${id}`,
      articleUrl: value(binding, "article"),
      imageName,
      image: null,
      panoramaUrl: "",
      hasImage: Boolean(imageName),
      isPanorama: false
    };
  }).filter(record => Number.isFinite(record.lat) && Number.isFinite(record.lng));
}

async function fetchCommonsMetadata(records) {
  const names = [...new Set(records.map(r => r.imageName).filter(Boolean))];
  const metadata = new Map();
  console.log(`Fetching license metadata for ${names.length} Wikimedia Commons images…`);

  for (let index = 0; index < names.length; index += 50) {
    const chunk = names.slice(index, index + 50);
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|extmetadata");
    url.searchParams.set("iiurlwidth", "960");
    url.searchParams.set("maxlag", "5");
    url.searchParams.set("titles", chunk.map(name => `File:${name}`).join("|"));
    const payload = await (await request(url)).json();

    for (const page of payload.query?.pages || []) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const ext = info.extmetadata || {};
      const name = page.title.replace(/^File:/, "");
      metadata.set(name, {
        previewUrl: info.thumburl || info.url,
        originalUrl: info.url,
        pageUrl: info.descriptionurl,
        author: plainText(ext.Artist?.value || ext.Credit?.value || "投稿者情報は元ページを参照"),
        license: plainText(ext.LicenseShortName?.value || ext.UsageTerms?.value || "個別ライセンス"),
        licenseUrl: ext.LicenseUrl?.value || info.descriptionurl,
        credit: plainText(ext.Credit?.value || ""),
        alt: plainText(ext.ImageDescription?.value || "")
      });
    }
  }

  for (const record of records) {
    if (record.imageName) {
      record.image = metadata.get(record.imageName) || {
        previewUrl: `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(record.imageName)}?width=960`,
        originalUrl: "",
        pageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(record.imageName)}`,
        author: "作者情報は元ページを参照",
        license: "個別ライセンス",
        licenseUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(record.imageName)}`,
        credit: "",
        alt: ""
      };
    }
    delete record.imageName;
  }
}

function dms(value) {
  const degreeDigits = value.length === 6 ? 2 : 3;
  const degrees = Number(value.slice(0, degreeDigits));
  const minutes = Number(value.slice(degreeDigits, degreeDigits + 2));
  const seconds = Number(value.slice(degreeDigits + 2));
  return degrees + minutes / 60 + seconds / 3600;
}

function encodeGitHubPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function cleanName(name) {
  return name
    .replace(/[（(].*$/, "")
    .replace(/古墳群$/, "")
    .replace(/古墳$/, "")
    .replace(/[・\s　]/g, "")
    .toLowerCase();
}

function distanceMeters(a, b) {
  const radius = 6371e3;
  const rad = degrees => degrees * Math.PI / 180;
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const deltaLat = rad(b.lat - a.lat);
  const deltaLng = rad(b.lng - a.lng);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function createThumbnail(originalUrl, slug) {
  const target = new URL(`${slug}.webp`, panoramaDir);
  try {
    await access(target);
    return `./assets/kofun360/${slug}.webp`;
  } catch {
    // Generate the preview below.
  }
  const temp = join(tmpdir(), `kofun360-${process.pid}-${basename(slug)}.jpg`);
  const response = await request(originalUrl, { headers: { Accept: "image/*" } });
  await writeFile(temp, Buffer.from(await response.arrayBuffer()));
  await run("magick", [
    temp,
    "-auto-orient",
    "-thumbnail", "1200x700>",
    "-strip",
    "-quality", "74",
    target.pathname
  ]);
  return `./assets/kofun360/${slug}.webp`;
}

async function fetchKofun360(records) {
  console.log("Fetching the CC0 Kofun360 inventory…");
  const treeUrl = "https://api.github.com/repos/TeamTest57/Kofun360/git/trees/main?recursive=1";
  const payload = await (await request(treeUrl, {
    headers: { Accept: "application/vnd.github+json" }
  })).json();
  const photos = payload.tree
    .filter(item => /^photos\/\d{2}[^/]+\/N\d{6}_E\d{7}_[^/]+\/[^/]+\.jpg$/i.test(item.path))
    .sort((a, b) => a.path.localeCompare(b.path, "ja"));

  const firstByTomb = new Map();
  for (const photo of photos) {
    const tombPath = photo.path.split("/").slice(0, -1).join("/");
    if (!firstByTomb.has(tombPath)) firstByTomb.set(tombPath, photo.path);
  }

  await mkdir(panoramaDir, { recursive: true });
  let sequence = 0;
  for (const [tombPath, photoPath] of firstByTomb) {
    sequence += 1;
    const [, prefectureFolder, folder] = tombPath.split("/");
    const match = /^N(\d{6})_E(\d{7})_(.+)$/.exec(folder);
    if (!match) continue;
    const parts = match[3].split("_");
    const name = parts[0];
    const group = parts.slice(1).join("・");
    const pref = prefectureFolder.replace(/^\d{2}/, "");
    const originalUrl = `https://raw.githubusercontent.com/TeamTest57/Kofun360/main/${encodeGitHubPath(photoPath)}`;
    const slug = `${prefectureFolder.slice(0, 2)}-${match[1]}-${String(sequence).padStart(2, "0")}`;
    const previewUrl = await createThumbnail(originalUrl, slug);
    const panorama = {
      id: `kofun360-${slug}`,
      name,
      reading: "",
      aliases: [],
      group,
      description: `${group ? `${group}に属する` : ""}${name}。Kofun360がCC0で公開する現地パノラマで景観を見渡せます。`,
      lat: dms(match[1]),
      lng: dms(match[2]),
      prefecture: pref,
      location: pref,
      shape: "",
      length: "",
      period: "",
      sources: ["kofun360"],
      sourceUrl: `https://github.com/TeamTest57/Kofun360/tree/main/${encodeGitHubPath(tombPath)}`,
      articleUrl: "",
      image: {
        previewUrl,
        originalUrl,
        pageUrl: `https://github.com/TeamTest57/Kofun360/blob/main/${encodeGitHubPath(photoPath)}`,
        author: "Kofun360 contributors",
        license: "CC0 1.0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.ja",
        credit: "TeamTest57/Kofun360",
        alt: `${name}の360度写真`
      },
      panoramaUrl: originalUrl,
      hasImage: true,
      isPanorama: true
    };

    const normalized = cleanName(name);
    const candidates = records
      .filter(record => cleanName(record.name).includes(normalized) || normalized.includes(cleanName(record.name)))
      .map(record => ({ record, distance: distanceMeters(record, panorama) }))
      .sort((a, b) => a.distance - b.distance);
    const existing = candidates[0]?.distance < 750 ? candidates[0].record : null;

    if (existing) {
      existing.sources.push("kofun360");
      existing.image = panorama.image;
      existing.panoramaUrl = panorama.panoramaUrl;
      existing.hasImage = true;
      existing.isPanorama = true;
      if (!existing.prefecture) existing.prefecture = pref;
      if (!existing.group) existing.group = group;
    } else {
      records.push(panorama);
    }
  }
}

async function main() {
  const records = await fetchWikidata();
  await fetchCommonsMetadata(records);
  await fetchKofun360(records);
  records.sort((a, b) =>
    (a.prefecture || "ZZ").localeCompare(b.prefecture || "ZZ", "ja")
    || a.name.localeCompare(b.name, "ja")
  );
  await mkdir(new URL("data/", root), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`);

  const photos = records.filter(record => record.hasImage).length;
  const panoramas = records.filter(record => record.isPanorama).length;
  console.log(`Wrote ${records.length} records (${photos} images, ${panoramas} panoramas).`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
