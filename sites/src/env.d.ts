// The stylesheet sites/build-css.mjs builds, imported as text (the Text
// rule in sites/wrangler.jsonc).
declare module '*/generated/site.css' {
  const css: string;
  export default css;
}
