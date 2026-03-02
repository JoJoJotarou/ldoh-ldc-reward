import * as esbuild from "esbuild";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes("--watch");

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8"),
);

const banner = `// ==UserScript==
// @name         LDOH New API Helper
// @namespace    jojojotarou.ldoh.newapi.helper
// @version      ${pkg.version}
// @description  LDOH New API 助手（余额查询、自动签到、密钥管理、模型查询）
// @author       @JoJoJotarou
// @match        https://ldoh.105117.xyz/*
// @include      *
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        unsafeWindow
// @connect      *
// @run-at       document-idle
// @license      MIT
// ==/UserScript==`;

const buildOptions = {
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: false,
  outfile: "dist/ldoh-new-api-helper.user.js",
  banner: { js: banner },
};

/**
 * 执行预构建检查（Lint & Format）
 */
function preBuildCheck() {
  try {
    console.log("🧹 Formatting code with Prettier...");
    execSync("npm run format", { stdio: "inherit" });

    console.log("🔍 Linting code with ESLint...");
    execSync("npm run lint", { stdio: "inherit" });
    
    return true;
  } catch (e) {
    console.error("❌ Pre-build check failed. Fix the issues before building.");
    return false;
  }
}

async function runBuild() {
  if (isWatch) {
    // Watch 模式下不强制每次都跑 lint/format 以保持开发流畅
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("👀 watching for changes...");
  } else {
    // 正式构建必须通过检查
    if (!preBuildCheck()) {
      process.exit(1);
    }
    
    await esbuild.build(buildOptions);
    console.log("✅ build complete → dist/ldoh-new-api-helper.user.js");
  }
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
