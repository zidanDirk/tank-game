// scripts/loop/lib/sources.mjs
// Allowlist of web sources the harvester is permitted to fetch from.
// Whitelist-only: any domain not in ALLOWED_SOURCES is rejected.
// Mirrors lib/capture.mjs style: top-level const + named exports.

export const ALLOWED_SOURCES = [
  // Tier 1 — high trust (gamedev design canon + standards bodies)
  { domain: "gdcvault.com",          category: "design", trust: 0.9  },
  { domain: "developer.mozilla.org", category: "tech",   trust: 0.95 },
  { domain: "web.dev",               category: "tech",   trust: 0.9  },
  // Tier 2 — focused tech communities (Three.js, WebGL, WebAudio)
  { domain: "discourse.threejs.org", category: "tech",   trust: 0.85 },
  { domain: "threejs.org",           category: "tech",   trust: 0.9  },
  // Tier 3 — indie / curated design blogs (lower trust, must be flagged)
  { domain: "indiegameplus.com",     category: "design", trust: 0.6  },
  { domain: "playdate.com",          category: "design", trust: 0.7  },
];

// Explicit denylist. These would normally also fail the allowlist, but listing
// them explicitly makes the rejection reason more debuggable.
export const DENIED_DOMAINS = [
  "reddit.com",
  "twitter.com",
  "x.com",
  "medium.com",
  "tiktok.com",
  "facebook.com",
  "instagram.com",
];

// GitHub is conditionally allowed: only repos whose topic includes "three.js"
// or "webgame" pass. Topic check is done in runHarvest (harvester agent),
// not here — this module only owns domain-level policy.
export const GITHUB_POLICY = {
  domain: "github.com",
  category: "code",
  trust: 0.7,
  requiredTopics: ["three.js", "webgame", "webgl", "gamedev"],
};

const ALL_DOMAINS = [
  ...ALLOWED_SOURCES.map((s) => s.domain),
  GITHUB_POLICY.domain,
];

// Parse a URL and return its host (lowercased, no "www.").
function hostOf(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Returns { allowed: boolean, reason: string, source?: object }.
export function isAllowed(url) {
  const host = hostOf(url);
  if (!host) return { allowed: false, reason: "unparseable-url" };

  if (DENIED_DOMAINS.some((d) => host === d || host.endsWith("." + d))) {
    return { allowed: false, reason: "denied-domain", host };
  }

  const direct = ALLOWED_SOURCES.find((s) => s.domain === host);
  if (direct) {
    return { allowed: true, reason: "allowlisted", source: direct };
  }

  if (host === GITHUB_POLICY.domain) {
    // GitHub: allowed at domain level; topic filter enforced at fetch time.
    return { allowed: true, reason: "github-conditional", source: GITHUB_POLICY };
  }

  return { allowed: false, reason: "not-allowlisted", host };
}

// For tests and the harvester agent — list of accepted domain strings.
export function acceptedDomains() {
  return ALL_DOMAINS.slice();
}