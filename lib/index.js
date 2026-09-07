// dsh-input-history — bundle plugin (host half).
//
// Pure client UI plugin: the empty apply exists so the plugin appears in the
// host cordis.yml / Loader; the browser half ships via exports["./client"],
// discovered through the package.json dsh.client declaration (see
// @deepseek-ai/dsh-client-modules). All behavior lives in the browser half.
export function apply() {}
