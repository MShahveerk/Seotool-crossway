/**
 * Derive a Google "location" from the keyword itself, so a locally-intented query
 * like "dallas email marketing" is searched as a Dallas searcher would see it —
 * without the user having to type a location. Offline gazetteer: no API calls.
 *
 * Returns a SerpApi-compatible canonical location string (e.g.
 * "Dallas, Texas, United States") or null when no place is found.
 */

// Major US cities → SerpApi canonical location. Multi-word names are matched first.
const CITY_TO_LOCATION = {
  "new york city": "New York, New York, United States",
  "new york": "New York, New York, United States",
  "los angeles": "Los Angeles, California, United States",
  "san francisco": "San Francisco, California, United States",
  "san diego": "San Diego, California, United States",
  "san jose": "San Jose, California, United States",
  "san antonio": "San Antonio, Texas, United States",
  "fort worth": "Fort Worth, Texas, United States",
  "el paso": "El Paso, Texas, United States",
  "las vegas": "Las Vegas, Nevada, United States",
  "kansas city": "Kansas City, Missouri, United States",
  "oklahoma city": "Oklahoma City, Oklahoma, United States",
  "salt lake city": "Salt Lake City, Utah, United States",
  "new orleans": "New Orleans, Louisiana, United States",
  "colorado springs": "Colorado Springs, Colorado, United States",
  "virginia beach": "Virginia Beach, Virginia, United States",
  "long beach": "Long Beach, California, United States",
  "santa ana": "Santa Ana, California, United States",
  "st louis": "St. Louis, Missouri, United States",
  "saint louis": "St. Louis, Missouri, United States",
  "st paul": "St. Paul, Minnesota, United States",
  "st petersburg": "St. Petersburg, Florida, United States",
  "grand rapids": "Grand Rapids, Michigan, United States",
  "baton rouge": "Baton Rouge, Louisiana, United States",
  "des moines": "Des Moines, Iowa, United States",
  "fort lauderdale": "Fort Lauderdale, Florida, United States",
  dallas: "Dallas, Texas, United States",
  houston: "Houston, Texas, United States",
  austin: "Austin, Texas, United States",
  chicago: "Chicago, Illinois, United States",
  phoenix: "Phoenix, Arizona, United States",
  philadelphia: "Philadelphia, Pennsylvania, United States",
  columbus: "Columbus, Ohio, United States",
  charlotte: "Charlotte, North Carolina, United States",
  indianapolis: "Indianapolis, Indiana, United States",
  seattle: "Seattle, Washington, United States",
  denver: "Denver, Colorado, United States",
  boston: "Boston, Massachusetts, United States",
  nashville: "Nashville, Tennessee, United States",
  detroit: "Detroit, Michigan, United States",
  memphis: "Memphis, Tennessee, United States",
  portland: "Portland, Oregon, United States",
  oklahoma: "Oklahoma City, Oklahoma, United States",
  milwaukee: "Milwaukee, Wisconsin, United States",
  albuquerque: "Albuquerque, New Mexico, United States",
  tucson: "Tucson, Arizona, United States",
  fresno: "Fresno, California, United States",
  sacramento: "Sacramento, California, United States",
  mesa: "Mesa, Arizona, United States",
  atlanta: "Atlanta, Georgia, United States",
  omaha: "Omaha, Nebraska, United States",
  raleigh: "Raleigh, North Carolina, United States",
  miami: "Miami, Florida, United States",
  oakland: "Oakland, California, United States",
  minneapolis: "Minneapolis, Minnesota, United States",
  tulsa: "Tulsa, Oklahoma, United States",
  arlington: "Arlington, Texas, United States",
  tampa: "Tampa, Florida, United States",
  orlando: "Orlando, Florida, United States",
  jacksonville: "Jacksonville, Florida, United States",
  cleveland: "Cleveland, Ohio, United States",
  pittsburgh: "Pittsburgh, Pennsylvania, United States",
  cincinnati: "Cincinnati, Ohio, United States",
  henderson: "Henderson, Nevada, United States",
  anaheim: "Anaheim, California, United States",
  honolulu: "Honolulu, Hawaii, United States",
  bakersfield: "Bakersfield, California, United States",
  riverside: "Riverside, California, United States",
  wichita: "Wichita, Kansas, United States",
  aurora: "Aurora, Colorado, United States",
  irvine: "Irvine, California, United States",
  scottsdale: "Scottsdale, Arizona, United States",
  boise: "Boise, Idaho, United States",
  richmond: "Richmond, Virginia, United States",
  spokane: "Spokane, Washington, United States",
  birmingham: "Birmingham, Alabama, United States",
  rochester: "Rochester, New York, United States",
  buffalo: "Buffalo, New York, United States",
  madison: "Madison, Wisconsin, United States",
  reno: "Reno, Nevada, United States",
  chandler: "Chandler, Arizona, United States",
  plano: "Plano, Texas, United States",
  frisco: "Frisco, Texas, United States",
  irving: "Irving, Texas, United States",
  chattanooga: "Chattanooga, Tennessee, United States",
  charleston: "Charleston, South Carolina, United States",
  savannah: "Savannah, Georgia, United States",
  louisville: "Louisville, Kentucky, United States",
  baltimore: "Baltimore, Maryland, United States",
  brooklyn: "Brooklyn, New York, United States",
  tacoma: "Tacoma, Washington, United States",
  toronto: "Toronto, Ontario, Canada",
  vancouver: "Vancouver, British Columbia, Canada",
  montreal: "Montreal, Quebec, Canada",
  calgary: "Calgary, Alberta, Canada",
  london: "London, United Kingdom",
  manchester: "Manchester, United Kingdom",
  sydney: "Sydney, New South Wales, Australia",
  melbourne: "Melbourne, Victoria, Australia",
};

// Sorted longest-first so "new york city" wins over "new york" / "york".
const CITY_KEYS = Object.keys(CITY_TO_LOCATION).sort((a, b) => b.length - a.length);

/**
 * @param {string} keyword
 * @returns {{ location: string, matched: string } | null}
 */
export function deriveLocationFromKeyword(keyword) {
  const text = ` ${String(keyword || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (text.trim().length < 3) return null;

  for (const city of CITY_KEYS) {
    // Whole-word / phrase match so "reads" doesn't match "reading", etc.
    if (text.includes(` ${city} `)) {
      return { location: CITY_TO_LOCATION[city], matched: city };
    }
  }
  return null;
}

/**
 * City / region for local prospecting. Prefers a place word in the keyword,
 * then a SERP location that is more specific than a country.
 */
export function placeFromKeyword(keyword, serpLocation = "") {
  const derived = deriveLocationFromKeyword(keyword);
  if (derived?.matched) {
    return { city: derived.matched, location: derived.location };
  }
  const loc = String(serpLocation || "").trim();
  if (!loc) return null;
  const first = loc.split(",")[0].trim();
  if (!first || /^(united states|usa|uk|united kingdom|canada|australia)$/i.test(first)) {
    return null;
  }
  return { city: first.toLowerCase(), location: loc };
}
