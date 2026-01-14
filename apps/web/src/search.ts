/**
 * Fuzzy search across planets, stars, constellations, and videos.
 */

export type SearchItemType = 'planet' | 'star' | 'constellation' | 'dso' | 'video';

export interface SearchItem {
  name: string;
  type: SearchItemType;
  ra: number;  // degrees
  dec: number; // degrees
  subtitle?: string;
}

export interface SearchResult extends SearchItem {
  score: number;
}

/**
 * Compute fuzzy match score between query and target string.
 * Returns 0-1 where higher is better match.
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact match
  if (q === t) return 1.0;

  // Starts with query
  if (t.startsWith(q)) return 0.9;

  // Contains query as substring
  if (t.includes(q)) return 0.7;

  // Fuzzy match: check if query characters appear in order
  let qi = 0;
  let consecutiveBonus = 0;
  let lastMatchIndex = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive matches
      if (ti === lastMatchIndex + 1) {
        consecutiveBonus += 0.1;
      }
      lastMatchIndex = ti;
      qi++;
    }
  }

  // All query characters found in order
  if (qi === q.length) {
    // Base score for fuzzy match plus bonuses
    const baseScore = 0.3;
    const lengthRatio = q.length / t.length; // Prefer shorter targets
    return Math.min(0.6, baseScore + lengthRatio * 0.2 + consecutiveBonus);
  }

  return 0;
}

/**
 * Search the index and return top matches sorted by score.
 */
export function search(
  query: string,
  index: SearchItem[],
  limit: number = 8
): SearchResult[] {
  if (!query || query.length === 0) return [];

  const results: SearchResult[] = [];

  for (const item of index) {
    // Score against name
    let score = fuzzyScore(query, item.name);

    // Also check subtitle if present
    if (item.subtitle) {
      const subtitleScore = fuzzyScore(query, item.subtitle) * 0.8;
      score = Math.max(score, subtitleScore);
    }

    if (score > 0) {
      results.push({ ...item, score });
    }
  }

  // Sort by score descending, then by name length (prefer shorter)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.length - b.name.length;
  });

  return results.slice(0, limit);
}

/**
 * Type colors for displaying results
 */
export const TYPE_COLORS: Record<SearchItemType, string> = {
  planet: '#ffcc66',
  star: '#ff8844',
  constellation: '#64a0dc',
  dso: '#88ccff',
  video: '#b366ff',
};

/**
 * Approximate center coordinates for all 88 constellations (RA/Dec in degrees)
 */
export const CONSTELLATION_CENTERS: Record<string, { ra: number; dec: number }> = {
  "Andromeda": { ra: 8, dec: 38 },
  "Antlia": { ra: 155, dec: -33 },
  "Apus": { ra: 245, dec: -75 },
  "Aquarius": { ra: 335, dec: -10 },
  "Aquila": { ra: 295, dec: 3 },
  "Ara": { ra: 260, dec: -55 },
  "Aries": { ra: 32, dec: 21 },
  "Auriga": { ra: 90, dec: 42 },
  "Bootes": { ra: 218, dec: 30 },
  "Caelum": { ra: 70, dec: -40 },
  "Camelopardalis": { ra: 85, dec: 70 },
  "Cancer": { ra: 130, dec: 20 },
  "Canes Venatici": { ra: 195, dec: 40 },
  "Canis Major": { ra: 105, dec: -22 },
  "Canis Minor": { ra: 115, dec: 6 },
  "Capricornus": { ra: 315, dec: -20 },
  "Carina": { ra: 125, dec: -63 },
  "Cassiopeia": { ra: 15, dec: 62 },
  "Centaurus": { ra: 200, dec: -45 },
  "Cepheus": { ra: 330, dec: 70 },
  "Cetus": { ra: 25, dec: -10 },
  "Chamaeleon": { ra: 165, dec: -80 },
  "Circinus": { ra: 220, dec: -63 },
  "Columba": { ra: 88, dec: -35 },
  "Coma Berenices": { ra: 190, dec: 23 },
  "Corona Australis": { ra: 280, dec: -42 },
  "Corona Borealis": { ra: 235, dec: 30 },
  "Corvus": { ra: 187, dec: -20 },
  "Crater": { ra: 172, dec: -15 },
  "Crux": { ra: 188, dec: -60 },
  "Cygnus": { ra: 310, dec: 45 },
  "Delphinus": { ra: 310, dec: 12 },
  "Dorado": { ra: 80, dec: -60 },
  "Draco": { ra: 260, dec: 65 },
  "Equuleus": { ra: 318, dec: 7 },
  "Eridanus": { ra: 55, dec: -30 },
  "Fornax": { ra: 45, dec: -32 },
  "Gemini": { ra: 110, dec: 23 },
  "Grus": { ra: 340, dec: -45 },
  "Hercules": { ra: 258, dec: 30 },
  "Horologium": { ra: 50, dec: -53 },
  "Hydra": { ra: 150, dec: -15 },
  "Hydrus": { ra: 30, dec: -70 },
  "Indus": { ra: 315, dec: -55 },
  "Lacerta": { ra: 335, dec: 45 },
  "Leo": { ra: 160, dec: 15 },
  "Leo Minor": { ra: 155, dec: 33 },
  "Lepus": { ra: 82, dec: -19 },
  "Libra": { ra: 230, dec: -16 },
  "Lupus": { ra: 233, dec: -43 },
  "Lynx": { ra: 120, dec: 48 },
  "Lyra": { ra: 284, dec: 37 },
  "Mensa": { ra: 85, dec: -78 },
  "Microscopium": { ra: 315, dec: -37 },
  "Monoceros": { ra: 110, dec: 0 },
  "Musca": { ra: 190, dec: -70 },
  "Norma": { ra: 245, dec: -52 },
  "Octans": { ra: 330, dec: -85 },
  "Ophiuchus": { ra: 260, dec: -5 },
  "Orion": { ra: 85, dec: 3 },
  "Pavo": { ra: 290, dec: -66 },
  "Pegasus": { ra: 340, dec: 18 },
  "Perseus": { ra: 50, dec: 45 },
  "Phoenix": { ra: 15, dec: -48 },
  "Pictor": { ra: 85, dec: -53 },
  "Pisces": { ra: 10, dec: 12 },
  "Piscis Austrinus": { ra: 340, dec: -32 },
  "Puppis": { ra: 115, dec: -32 },
  "Pyxis": { ra: 135, dec: -28 },
  "Reticulum": { ra: 60, dec: -62 },
  "Sagitta": { ra: 297, dec: 18 },
  "Sagittarius": { ra: 285, dec: -28 },
  "Scorpius": { ra: 252, dec: -30 },
  "Sculptor": { ra: 10, dec: -33 },
  "Scutum": { ra: 280, dec: -10 },
  "Serpens": { ra: 240, dec: 8 },
  "Sextans": { ra: 152, dec: -2 },
  "Taurus": { ra: 65, dec: 18 },
  "Telescopium": { ra: 285, dec: -50 },
  "Triangulum": { ra: 30, dec: 32 },
  "Triangulum Australe": { ra: 245, dec: -65 },
  "Tucana": { ra: 350, dec: -65 },
  "Ursa Major": { ra: 165, dec: 55 },
  "Ursa Minor": { ra: 225, dec: 78 },
  "Vela": { ra: 140, dec: -48 },
  "Virgo": { ra: 195, dec: -3 },
  "Volans": { ra: 118, dec: -68 },
  "Vulpecula": { ra: 300, dec: 24 },
};
