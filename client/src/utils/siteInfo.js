import {
  LucideDatabase,
  LucideFacebook,
  LucideFilm,
  LucideGlobe,
  LucideInstagram,
  LucideLink,
  LucideTwitter,
  LucideVideo,
} from "lucide-react";

/**
 * Site information for URL display
 * Returns name, icon component, and brand color for known sites
 */
export const getSiteInfo = (url) => {
  const urlLower = url.toLowerCase();

  // === Social Media ===
  if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) {
    return { name: "Twitter", icon: LucideTwitter, color: "#1DA1F2" };
  }
  if (urlLower.includes("instagram.com")) {
    return { name: "Instagram", icon: LucideInstagram, color: "#E4405F" };
  }
  if (urlLower.includes("facebook.com")) {
    return { name: "Facebook", icon: LucideFacebook, color: "#1877F2" };
  }
  if (urlLower.includes("onlyfans.com")) {
    return { name: "OnlyFans", icon: LucideVideo, color: "#00AFF0" };
  }

  // === Entertainment Databases ===
  if (urlLower.includes("imdb.com")) {
    return { name: "IMDb", icon: LucideFilm, color: "#F5C518" };
  }

  // === Adult Industry Databases ===
  if (urlLower.includes("iafd.com")) {
    return { name: "IAFD", icon: LucideDatabase, color: "#9B59B6" };
  }
  if (urlLower.includes("adultfilmdatabase.com")) {
    return { name: "AFDB", icon: LucideDatabase, color: "#16A085" };
  }
  if (urlLower.includes("freeones.com")) {
    return { name: "FreeOnes", icon: LucideDatabase, color: "#E67E22" };
  }
  if (urlLower.includes("babepedia.com")) {
    return { name: "Babepedia", icon: LucideDatabase, color: "#E91E63" };
  }
  if (urlLower.includes("data18.com")) {
    return { name: "Data18", icon: LucideDatabase, color: "#27AE60" };
  }
  if (urlLower.includes("indexxx.com")) {
    return { name: "Indexxx", icon: LucideDatabase, color: "#8E44AD" };
  }
  if (urlLower.includes("thenude.com")) {
    return { name: "The Nude", icon: LucideDatabase, color: "#1ABC9C" };
  }
  if (urlLower.includes("pornteengirl.com")) {
    return { name: "PornTeenGirl", icon: LucideGlobe, color: "#2ECC71" };
  }

  // === Major Studio Networks ===
  if (urlLower.includes("brazzers.com")) {
    return { name: "Brazzers", icon: LucideGlobe, color: "#FFA500" };
  }
  if (urlLower.includes("realitykings.com")) {
    return { name: "Reality Kings", icon: LucideGlobe, color: "#FFD700" };
  }
  if (urlLower.includes("bangbros.com")) {
    return { name: "Bang Bros", icon: LucideGlobe, color: "#FF6B6B" };
  }
  if (urlLower.includes("naughtyamerica.com")) {
    return { name: "Naughty America", icon: LucideGlobe, color: "#E74C3C" };
  }
  if (urlLower.includes("mofos.com")) {
    return { name: "Mofos", icon: LucideGlobe, color: "#3498DB" };
  }
  if (urlLower.includes("digitalplayground.com")) {
    return { name: "Digital Playground", icon: LucideGlobe, color: "#9B59B6" };
  }
  if (urlLower.includes("wicked.com")) {
    return { name: "Wicked Pictures", icon: LucideGlobe, color: "#E91E63" };
  }

  // === Premium/Artistic Studios ===
  if (urlLower.includes("vixen.com")) {
    return { name: "Vixen", icon: LucideGlobe, color: "#000000" };
  }
  if (urlLower.includes("tushy.com")) {
    return { name: "Tushy", icon: LucideGlobe, color: "#FF69B4" };
  }
  if (urlLower.includes("blacked.com")) {
    return { name: "Blacked", icon: LucideGlobe, color: "#1C1C1C" };
  }
  if (urlLower.includes("deeper.com")) {
    return { name: "Deeper", icon: LucideGlobe, color: "#2C3E50" };
  }
  if (urlLower.includes("slayed.com")) {
    return { name: "Slayed", icon: LucideGlobe, color: "#8B0000" };
  }
  if (urlLower.includes("bellesa.co") || urlLower.includes("bellesafilms.com")) {
    return { name: "Bellesa", icon: LucideGlobe, color: "#FF6B9D" };
  }
  if (urlLower.includes("x-art.com")) {
    return { name: "X-Art", icon: LucideGlobe, color: "#C0C0C0" };
  }
  if (urlLower.includes("sexart.com")) {
    return { name: "SexArt", icon: LucideGlobe, color: "#D4AF37" };
  }

  // === Unknown site - extract domain ===
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    return { name: domain, icon: LucideLink, color: "#95A5A6", useFavicon: true };
  } catch {
    return { name: "Link", icon: LucideLink, color: "#95A5A6" };
  }
};

/**
 * Extract domain from URL for favicon fetching
 */
export const getDomainFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return null;
  }
};
