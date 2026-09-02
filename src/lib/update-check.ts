export const RELEASES_URL =
  "https://github.com/husterhyx/pet-observation-assistant/releases";
export const LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/husterhyx/pet-observation-assistant/releases/latest";
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type ReleaseInfo = {
  version: string;
  title: string;
  notes: string;
  publishedAt?: string;
  url: string;
};

type GithubReleasePayload = {
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  published_at?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
};

function parseVersion(value: string) {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

export function compareVersions(left: string, right: string) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error("版本号格式无效");
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function isTrustedReleaseUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith(
        "/husterhyx/pet-observation-assistant/releases/"
      )
    );
  } catch {
    return false;
  }
}

export function parseGithubRelease(payload: unknown): ReleaseInfo {
  if (!payload || typeof payload !== "object") {
    throw new Error("GitHub 返回了无效的版本信息");
  }
  const release = payload as GithubReleasePayload;
  if (release.draft === true || release.prerelease === true) {
    throw new Error("GitHub 返回的不是正式版本");
  }
  if (typeof release.tag_name !== "string") {
    throw new Error("GitHub Release 缺少版本号");
  }
  const parsed = parseVersion(release.tag_name);
  if (!parsed) throw new Error("GitHub Release 版本号格式无效");
  if (
    typeof release.html_url !== "string" ||
    !isTrustedReleaseUrl(release.html_url)
  ) {
    throw new Error("GitHub Release 下载地址无效");
  }
  return {
    version: parsed.join("."),
    title:
      typeof release.name === "string" && release.name.trim()
        ? release.name.trim()
        : `版本 ${parsed.join(".")}`,
    notes: typeof release.body === "string" ? release.body.trim() : "",
    publishedAt:
      typeof release.published_at === "string"
        ? release.published_at
        : undefined,
    url: release.html_url,
  };
}

export async function fetchLatestRelease(
  request: typeof fetch = fetch
): Promise<ReleaseInfo> {
  const response = await request(LATEST_RELEASE_API_URL, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (response.status === 404) {
    throw new Error("GitHub 暂无可用的正式版本");
  }
  if (!response.ok) {
    throw new Error(`检查更新失败（HTTP ${response.status}）`);
  }
  return parseGithubRelease(await response.json());
}

export function shouldRunDailyCheck(lastCheckAt: string | null, now = Date.now()) {
  if (!lastCheckAt) return true;
  const last = Date.parse(lastCheckAt);
  return !Number.isFinite(last) || now - last >= UPDATE_CHECK_INTERVAL_MS;
}
