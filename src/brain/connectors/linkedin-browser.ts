import { normalizeEntity } from "../core/normalize";
import { makeEntityId } from "../core/id";
import type { BrainEntity, Person, Post } from "../types/schema";
import type { ConnectorContext, SourceConnector } from "./types";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

interface LinkedInProfileInput {
  profileId: string;
  displayName?: string;
  headline?: string;
  bio?: string;
  profileUrl?: string;
}

interface LinkedInPostInput {
  postId: string;
  profileId: string;
  content?: string;
  publishedAt?: string;
  postUrl?: string;
}

interface LinkedInProfileJson {
  profileId?: string;
  displayName?: string;
  headline?: string;
  bio?: string;
  profileUrl?: string;
}

interface LinkedInPostJson {
  postId?: string;
  content?: string;
  publishedAt?: string;
  postUrl?: string;
}

interface BrowserLinkedInPayload {
  profile?: LinkedInProfileInput;
  posts: LinkedInPostInput[];
}

interface LinkedInDebugContext {
  runDir?: string;
  log: (message: string) => void;
  writeJson: (name: string, payload: unknown) => Promise<void>;
}

const mapProfile = (item: LinkedInProfileInput): BrainEntity => {
  const data: Person = {
    id: makeEntityId("person", "linkedin", item.profileId),
    displayName: item.displayName,
    emails: [],
    usernames: [item.profileId],
    headline: item.headline,
    bio: item.bio,
    locations: [],
    links: item.profileUrl ? [item.profileUrl] : [],
  };

  return normalizeEntity({
    entityType: "person",
    source: "linkedin",
    sourceRecordId: item.profileId,
    sourceUrl: item.profileUrl,
    data,
    rawPayload: item,
  });
};

const mapPost = (item: LinkedInPostInput): BrainEntity => {
  const data: Post = {
    id: makeEntityId("post", "linkedin", item.postId),
    platform: "linkedin",
    body: item.content,
    publishedAt: item.publishedAt,
    url: item.postUrl,
  };

  return normalizeEntity({
    entityType: "post",
    source: "linkedin",
    sourceRecordId: item.postId,
    sourceUrl: item.postUrl,
    data,
    rawPayload: item,
  });
};

const safeReadJson = async <T>(path?: string): Promise<T | undefined> => {
  if (!path) return undefined;
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

const profileIdFromUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match?.[1];
};

const createLinkedInDebugContext = async (
  context: ConnectorContext
): Promise<LinkedInDebugContext> => {
  const baseDebugDir = context.sources.linkedinDebugDir;
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = baseDebugDir ? join(baseDebugDir, `linkedin-${runStamp}`) : undefined;
  if (runDir) {
    await mkdir(runDir, { recursive: true });
  }

  const log = (message: string): void => {
    const line = `[linkedin] ${new Date().toISOString()} ${message}`;
    console.log(line);
  };

  const writeJson = async (name: string, payload: unknown): Promise<void> => {
    if (!runDir) return;
    await writeFile(join(runDir, `${name}.json`), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  };

  return { runDir, log, writeJson };
};

const scrapeWithPlaywright = async (
  context: ConnectorContext
): Promise<BrowserLinkedInPayload> => {
  const debug = await createLinkedInDebugContext(context);
  debug.log("scrape:start mode=browser");
  const profileUrl = context.sources.linkedinProfileUrl;
  if (!profileUrl) {
    debug.log("scrape:skip missing LINKEDIN_PROFILE_URL");
    return { profile: undefined, posts: [] };
  }

  const userDataDir = context.sources.linkedinBrowserUserDataDir;
  if (!userDataDir) {
    throw new Error(
      "LINKEDIN_BROWSER_USER_DATA_DIR is required for browser mode."
    );
  }

  const playwrightModule = await import("playwright").catch(() => undefined);
  if (!playwrightModule?.chromium) {
    throw new Error(
      "Playwright not found. Install with: npm i -D playwright"
    );
  }

  const { chromium } = playwrightModule;
  debug.log(`browser:launch userDataDir=${userDataDir}`);
  const browserContext = await chromium
    .launchPersistentContext(userDataDir, {
      headless: context.sources.linkedinBrowserHeadless,
      channel: "chrome",
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "unknown browser launch error";
      if (message.includes("ProcessSingleton")) {
        throw new Error(
          "LinkedIn scrape failed because Chrome profile is in use. Close all Chrome windows OR set LINKEDIN_BROWSER_USER_DATA_DIR to a separate profile copy."
        );
      }
      throw error;
    });

  try {
    const page = browserContext.pages()[0] ?? (await browserContext.newPage());
    debug.log("profile:open");
    await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    if (debug.runDir) {
      await page.screenshot({ path: join(debug.runDir, "01-profile-page.png"), fullPage: true });
    }

    const profile = await page.evaluate((url) => {
      const fullName =
        document
          .querySelector("h1")
          ?.textContent?.trim() || undefined;
      const headline =
        document
          .querySelector(".text-body-medium.break-words")
          ?.textContent?.trim() || undefined;
      const aboutSection =
        Array.from(document.querySelectorAll("section"))
          .find((section) =>
            section.textContent?.toLowerCase().includes("about")
          )
          ?.textContent?.trim() || undefined;
      const idMatch = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
      const profileId = idMatch?.[1] ?? "linkedin-user";
      return {
        profileId,
        displayName: fullName,
        headline,
        bio: aboutSection,
        profileUrl: url,
      };
    }, profileUrl);
    debug.log(`profile:parsed profileId=${profile.profileId}`);
    await debug.writeJson("profile", profile);

    const postsUrl = `${profileUrl.replace(/\/$/, "")}/recent-activity/all/`;
    debug.log(`posts:open url=${postsUrl}`);
    await page.goto(postsUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    if (debug.runDir) {
      await page.screenshot({ path: join(debug.runDir, "02-posts-page-initial.png"), fullPage: true });
    }

    const maxPosts = Math.max(1, context.sources.linkedinMaxPosts);
    const scrollIterations = Math.ceil(maxPosts / 5);
    debug.log(`posts:scroll iterations=${scrollIterations}`);
    for (let index = 0; index < scrollIterations; index += 1) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1000);
      if (debug.runDir) {
        await page.screenshot({
          path: join(debug.runDir, `03-posts-scroll-${String(index + 1).padStart(2, "0")}.png`),
          fullPage: false,
        });
      }
    }

    const posts = await page.evaluate((limit) => {
      const cards = Array.from(
        document.querySelectorAll("div.feed-shared-update-v2")
      );
      return cards.slice(0, limit).map((card, index) => {
        const anchor = card.querySelector("a[href*='/feed/update/']");
        const postUrl = anchor?.getAttribute("href") ?? undefined;
        const text =
          card
            .querySelector(".update-components-text")
            ?.textContent?.trim() ||
          card.textContent?.trim() ||
          undefined;
        const timeNode = card.querySelector("span.update-components-actor__sub-description");
        const publishedAt = timeNode?.textContent?.trim();
        return {
          postId: postUrl ? postUrl.split("/").filter(Boolean).pop() ?? `post-${index + 1}` : `post-${index + 1}`,
          content: text,
          publishedAt,
          postUrl,
        };
      });
    }, maxPosts);
    debug.log(`posts:parsed count=${posts.length}`);
    await debug.writeJson("posts", posts);

    const payload = {
      profile,
      posts: posts.map((post) => ({
        ...post,
        profileId: profile.profileId,
      })),
    };
    await debug.writeJson("payload", payload);
    debug.log(`scrape:done profile=${payload.profile ? "yes" : "no"} posts=${payload.posts.length}`);
    return payload;
  } finally {
    debug.log("browser:close");
    await browserContext.close();
  }
};

const fetchLinkedInJsonData = async (context: ConnectorContext): Promise<{
  profile?: LinkedInProfileInput;
  posts: LinkedInPostInput[];
}> => {
  const profileJson = await safeReadJson<LinkedInProfileJson>(
    context.sources.linkedinProfileJsonPath
  );
  const postsJson = await safeReadJson<LinkedInPostJson[]>(
    context.sources.linkedinPostsJsonPath
  );

  const profileId =
    profileJson?.profileId ??
    profileIdFromUrl(context.sources.linkedinProfileUrl) ??
    "linkedin-user";

  const profile: LinkedInProfileInput | undefined =
    profileJson || context.sources.linkedinProfileUrl
      ? {
          profileId,
          displayName: profileJson?.displayName,
          headline: profileJson?.headline,
          bio: profileJson?.bio,
          profileUrl:
            profileJson?.profileUrl ?? context.sources.linkedinProfileUrl,
        }
      : undefined;

  const posts: LinkedInPostInput[] =
    postsJson?.map((post, index) => ({
      postId: post.postId ?? `post-${index + 1}`,
      profileId,
      content: post.content,
      publishedAt: post.publishedAt,
      postUrl: post.postUrl,
    })) ?? [];

  return {
    profile,
    posts,
  };
};

const fetchLinkedInBrowserData = async (context: ConnectorContext): Promise<{
  profile?: LinkedInProfileInput;
  posts: LinkedInPostInput[];
}> => {
  if (context.sources.linkedinIngestionMode === "browser") {
    return scrapeWithPlaywright(context);
  }

  return fetchLinkedInJsonData(context);
};

export const linkedinBrowserConnector: SourceConnector = {
  name: "linkedin-browser",
  async collect(context: ConnectorContext): Promise<BrainEntity[]> {
    console.log(
      `[linkedin] ${new Date().toISOString()} collect:start mode=${context.sources.linkedinIngestionMode}`
    );
    const payload = await fetchLinkedInBrowserData(context);
    const entities: BrainEntity[] = payload.posts.map(mapPost);
    if (payload.profile) {
      entities.unshift(mapProfile(payload.profile));
    }
    console.log(
      `[linkedin] ${new Date().toISOString()} collect:done entities=${entities.length}`
    );
    return entities;
  },
};
