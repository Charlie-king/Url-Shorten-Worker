// 常量定义
const github_repo = typeof(GITHUB_REPO) !== "undefined" ? GITHUB_REPO : 'AoEiuV020/Url-Shorten-Worker';
const github_version = typeof(GITHUB_VERSION) !== "undefined" ? GITHUB_VERSION : '@main';
const password = typeof(PASSWORD) !== "undefined" ? PASSWORD : 'AoEiuV020 yes';
const shorten_timeout = typeof(SHORTEN_TIMEOUT) !== "undefined" ? SHORTEN_TIMEOUT.split("*").reduce((a, b) => parseInt(a) * parseInt(b), 1) : (1000 * 60 * 10);
const default_len = typeof(DEFAULT_LEN) !== "undefined" ? parseInt(DEFAULT_LEN) : 6;
const demo_mode = typeof(DEMO_MODE) !== "undefined" ? DEMO_MODE === 'true' : true;
const remove_completely = typeof(REMOVE_COMPLETELY) !== "undefined" ? REMOVE_COMPLETELY === 'true' : true;
const white_list = JSON.parse(typeof(WHITE_LIST) !== "undefined" ? WHITE_LIST : `["aoeiuv020.com","aoeiuv020.cn","aoeiuv020.cc","020.name"]`);
const demo_notice = typeof(DEMO_NOTICE) !== "undefined" ? DEMO_NOTICE : `注意：为防止示例服务被人滥用，故所有由demo网站生成的链接随时可能失效，如需长期使用请自行搭建。`;
const html404 = `<!DOCTYPE html><body><h1>404 Not Found.</h1><p>The url you visit is not found.</p></body>`;

// 工具函数
async function randomString(len) {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
  const maxPos = chars.length;
  const result = new Uint8Array(len);
  crypto.getRandomValues(result);
  return Array.from(result).map(i => chars.charAt(i % maxPos)).join('');
}

async function checkURL(url) {
  const Expression = /^http(s)?:\/\/(.*@)?([\w-]+\.)*[\w-]+([_\-.,~!*:#()\w\/?%&=]*)?$/;
  return new RegExp(Expression).test(url);
}

async function checkWhite(host) {
  return white_list.some(h => host === h || host.endsWith(`.${h}`));
}

async function md5(message) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('MD5', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkHash(url, hash) {
  return hash && (await md5(url + password)) === hash;
}

async function save_url(url, key, admin, len = default_len) {
  if (!admin || !key) key = await randomString(len);
  if (!admin && await load_url(key)) return await save_url(url, key, admin, len + 1);
  
  const mode = admin ? 0 : 3;
  const value = `${mode};${Date.now()};${url}`;
  const options = { expirationTtl: remove_completely && mode !== 0 && !await checkWhite(new URL(url).host) ? Math.max(60, shorten_timeout / 1000) : undefined };
  await LINKS.put(key, value, options);
  return key;
}

async function load_url(key) {
  const value = await LINKS.get(key);
  if (!value) return null;
  
  const [mode, createTime, url] = value.split(';');
  if (parseInt(mode) !== 0 && shorten_timeout > 0 && Date.now() - parseInt(createTime) > shorten_timeout && !await checkWhite(new URL(url).host)) return null;
  
  return url;
}

function handleCorsHeaders(headers = {}) {
  return {
    "content-type": "text/html;charset=UTF-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    ...headers
  };
}

async function handleRequest(request) {
  console.log(request);
  
  if (request.method === "POST") {
    const req = await request.json();
    const admin = await checkHash(req.url, req.hash);
    
    if (!await checkURL(req.url) || (!admin && !demo_mode && !await checkWhite(new URL(req.url).host))) {
      return new Response(`{"status":500,"key":": Error: Url illegal."}`, { headers: handleCorsHeaders() });
    }
    
    const random_key = await save_url(req.url, req.key, admin);
    return new Response(`{"status":200,"key":"/${random_key}"}`, { headers: handleCorsHeaders() });
  }
  
  if (request.method === "OPTIONS") {
    return new Response("", { headers: handleCorsHeaders() });
  }

  const requestURL = new URL(request.url);
  const path = requestURL.pathname.split("/")[1];
  
  if (!path) {
    const html = await fetch(`https://cdn.jsdelivr.net/gh/${github_repo}${github_version}/index.html`);
    const text = (await html.text()).replaceAll("###GITHUB_REPO###", github_repo).replaceAll("###GITHUB_VERSION###", github_version).replaceAll("###DEMO_NOTICE###", demo_notice);
    
    return new Response(text, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }

  const url = await load_url(path);
  if (!url) {
    return new Response(html404, { headers: { "content-type": "text/html;charset=UTF-8" }, status: 404 });
  }

  return Response.redirect(url, 302);
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});
