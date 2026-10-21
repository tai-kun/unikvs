import {
  FAKE_DEFAULT_LOCALE,
  typeTableDetailsIds,
  routeByBrowserLanguage,
} from "@tai-kun/blume-integrations";
import { defineConfig } from "blume";
import { filesystem, githubReleases } from "blume/sources";

const PROJET_NAME = "UniKVS";
const GITHUB_REPO = "unikvs";
const GITHUB_OWNER = "tai-kun";

export default defineConfig({
  integrations: [typeTableDetailsIds(), routeByBrowserLanguage()],

  content: {
    sources: [
      filesystem({
        root: "content",
      }),
      githubReleases({
        prefix: "changelog",
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
      }),
    ],
  },

  title: PROJET_NAME,
  description: `Documentation for ${PROJET_NAME}`,
  deployment: {
    site: `https://${GITHUB_OWNER}.github.io`,
    base: `/${GITHUB_REPO}`,
  },
  navigation: {
    repo: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
    // タブのラベルは必ず en を一番上にしてください。
    // ドキュメント以外のページでは英語版の UI にフォールバックされるようにします。
    tabs: [
      {
        label: {
          en: "Documents",
          ja: "ドキュメント",
        },
        path: "/",
      },
      {
        label: {
          en: "Changelog",
          ja: "変更履歴",
        },
        path: "/changelog",
      },
    ],
  },
  i18n: {
    locales: [
      {
        code: "ja",
        label: "日本語",
      },
      {
        code: "en",
        label: "English",
      },
      FAKE_DEFAULT_LOCALE,
    ],
    defaultLocale: FAKE_DEFAULT_LOCALE.code,
  },
});
