import { StashApp } from "stashapp-api";

let stashInstance: any = null;

const getStash = () => {
  if (!stashInstance) {
    console.log("Initializing Stash - STASH_URL:", process.env.STASH_URL);
    console.log(
      "Initializing Stash - STASH_API_KEY exists:",
      !!process.env.STASH_API_KEY
    );

    if (!process.env.STASH_URL) {
      throw new Error("STASH_URL environment variable is required");
    }

    if (!process.env.STASH_API_KEY) {
      throw new Error("STASH_API_KEY environment variable is required");
    }

    stashInstance = StashApp.init({
      url: process.env.STASH_URL,
      apiKey: process.env.STASH_API_KEY,
    });
  }

  return stashInstance;
};

export default getStash;
