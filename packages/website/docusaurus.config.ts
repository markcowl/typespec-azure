// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

import { VersionOptions } from "@docusaurus/plugin-content-docs";
import type { Config, Plugin, ThemeConfig } from "@docusaurus/types";
import MonacoWebpackPlugin from "monaco-editor-webpack-plugin";
import { resolve } from "path";
import { themes } from "prism-react-renderer";

function getMajorMinorVersion(pkgJsonPath) {
  const version = require(pkgJsonPath).version;
  const [major, minor] = version.split(".");
  return `${major}.${minor}.x`;
}

const azureVersion = getMajorMinorVersion("../typespec-azure-core/package.json");
const compilerVersion = getMajorMinorVersion("../../core/packages/compiler/package.json");

function getLatestVersion() {
  return `Latest (Core: ${compilerVersion}, Azure: ${azureVersion})`;
}

function getVersionLabels() {
  const labels: Record<string, VersionOptions> = {
    current: {
      label: `Next 🚧`,
    },
  };
  // Workaround because docusaurus validate this version exists but it doesn't during the bumping of version as we delete it to override
  const isBumpingVersion = process.argv.includes("docs:version");
  if (!isBumpingVersion) {
    labels.latest = {
      label: getLatestVersion(),
    };
  }
  return labels;
}

const config: Config = {
  title: "TypeSpec Azure",
  tagline: "API first with TypeSpec for Azure services",
  url: "https://azure.github.io",
  baseUrl: process.env.TYPESPEC_WEBSITE_BASE_PATH ?? "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/azure.svg",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "Azure", // Usually your GitHub org/user name.
  projectName: "typespec-azure", // Usually your repo name.
  trailingSlash: false,
  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  markdown: {
    format: "detect",
  },
  scripts: [
    {
      src: "es-module-shims.js",
      type: "module",
      async: true,
    },
  ],
  headTags: [
    {
      tagName: "script",
      attributes: {
        // cspell:ignore esms
        type: "esms-options",
      },
      innerHTML: JSON.stringify({
        shimMode: true,
      }),
    },
    {
      tagName: "script",
      attributes: {
        type: "playground-options",
      },
      innerHTML: JSON.stringify({
        latestVersion: azureVersion,
      }),
    },
  ],
  staticDirectories: ["static", resolve(__dirname, "./node_modules/es-module-shims/dist")],
  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      {
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          path: "../../docs",
          versions: getVersionLabels(),
        },
        blog: {
          showReadingTime: true,
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],
  webpack: {
    jsLoader: (isServer) => ({
      loader: require.resolve("swc-loader"),
      options: {
        jsc: {
          parser: {
            syntax: "typescript",
            tsx: true,
          },
          transform: {
            react: {
              runtime: "automatic",
            },
          },
          target: "es2022",
        },
        module: {
          type: isServer ? "commonjs" : "es6",
        },
      },
    }),
  },
  themeConfig: {
    navbar: {
      title: "TypeSpec Azure",
      logo: {
        alt: "TypeSpec Azure Logo",
        src: "img/azure.svg",
      },
      items: [
        {
          type: "doc",
          docId: "intro",
          position: "left",
          label: "Docs",
        },
        { to: "/playground", label: "Playground", position: "left" },
        {
          to: "https://microsoft.github.io/typespec",
          label: "TypeSpec Core Docs",
          position: "left",
        },
        {
          type: "docsVersionDropdown",
          position: "right",
        },
        {
          href: "https://github.com/Azure/typespec-azure",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "TypeSpec Language",
          items: [
            {
              label: "TypeSpec Core Web site",
              to: "https://microsoft.github.io/typespec",
            },
          ],
        },
        {
          title: "Docs",
          items: [
            {
              label: "Tutorial",
              to: "/docs/intro",
            },
          ],
        },
        {
          title: "Community & Support",
          items: [
            {
              label: "Stack Overflow",
              href: "https://stackoverflow.microsoft.com/search?q=typespec",
            },
            {
              label: "Microsoft Teams Channel",
              href: "http://aka.ms/typespec/discussions",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Microsoft Corp. Built with Docusaurus.`,
    },
    prism: {
      theme: themes.oneLight,
      darkTheme: themes.oneDark,
      additionalLanguages: ["csharp", "java", "python"],
    },
  } satisfies ThemeConfig,
  plugins: [
    (context, options): Plugin => {
      return {
        name: "custom-configure-webpack",
        configureWebpack: (config, isServer, utils) => {
          return {
            module: {
              rules: [
                {
                  test: /\.ttf$/,
                  use: ["file-loader"],
                },
              ],
            },
            plugins: [
              new MonacoWebpackPlugin({
                languages: ["json"],
              }),
            ],
            ignoreWarnings: [
              (warning, compilation) => {
                const moduleName: string | undefined = (warning.module as any)?.resource;
                return (
                  warning.name === "ModuleDependencyWarning" &&
                  warning.message.startsWith("Critical dependency") &&
                  (moduleName?.endsWith(
                    "node_modules/vscode-languageserver-types/lib/umd/main.js"
                  ) ||
                    moduleName?.endsWith("packages/compiler/dist/src/core/node-host.js"))
                );
              },
            ],
          };
        },
      };
    },
  ],
};

export default config;
