const { BlockList } = require('net');
const ipaddr = require('ipaddr.js');
const cloudflareRanges = require('../data/cloudflare-ips.json');

/**
 * Client IP for rate limits behind Render + Cloudflare.
 *
 * Express counts req.socket.remoteAddress as hop 1, then walks X-Forwarded-For
 * from right to left (https://expressjs.com/en/guide/behind-proxies.html).
 * On onrender.com the socket is Render's load balancer. Render sends every
 * public request through Cloudflare first, then its own load balancer
 * (https://render.com/docs/ddos-protection,
 * https://render.com/articles/how-render-handles-ddos-attacks).
 * With trust proxy 1, req.ip is the address Render appended: a Cloudflare
 * edge. Those edges rotate, which is why one client saw X-RateLimit-Remaining
 * jump 91, 98, 92, 91, 98, 90.
 *
 * Default TRUST_PROXY_HOPS is 1 (Render's proxy only). When that peer is inside
 * Cloudflare's published ranges, the key is CF-Connecting-IP, then
 * True-Client-IP. Cloudflare sets CF-Connecting-IP to the visitor that
 * connected to its edge and appends to X-Forwarded-For instead of letting the
 * client replace that address
 * (https://developers.cloudflare.com/fundamentals/reference/http-request-headers/).
 * A client-supplied leftmost X-Forwarded-For or a CF-Connecting-IP that did
 * not arrive from a Cloudflare peer is ignored.
 *
 * If the peer is Cloudflare but neither header is a single IP, the key is the
 * one address that peer appended (the next X-Forwarded-For entry to the left).
 * Addresses further left stay ignored. Otherwise the key is hop-count req.ip.
 *
 * Set TRUST_PROXY_HOPS=2 only if a later Render hop means the address at hop 1
 * is no longer a Cloudflare IP. That walks req.ip one step closer to the client.
 * Invalid values fall back to 1. Values above 5 are rejected so a typo cannot
 * trust a client-supplied address.
 */

const DEFAULT_TRUST_PROXY_HOPS = 1;
const MAX_TRUST_PROXY_HOPS = 5;
const IPV6_PREFIX = 64;

const cloudflareList = new BlockList();
for (const cidr of cloudflareRanges.v4) {
  const [addr, bits] = cidr.split('/');
  cloudflareList.addSubnet(addr, Number(bits), 'ipv4');
}
for (const cidr of cloudflareRanges.v6) {
  const [addr, bits] = cidr.split('/');
  cloudflareList.addSubnet(addr, Number(bits), 'ipv6');
}

function trustProxyHops() {
  const raw = process.env.TRUST_PROXY_HOPS;
  if (raw == null || String(raw).trim() === '') return DEFAULT_TRUST_PROXY_HOPS;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return DEFAULT_TRUST_PROXY_HOPS;
  const hops = Number(text);
  if (!Number.isInteger(hops) || hops > MAX_TRUST_PROXY_HOPS) return DEFAULT_TRUST_PROXY_HOPS;
  return hops;
}

function canonicalIp(value) {
  if (value == null) return null;
  let text = String(value).trim();
  if (!text || text.includes(',')) return null;
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  if (!ipaddr.isValid(text)) return null;
  let addr = ipaddr.parse(text);
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) addr = addr.toIPv4Address();
  return addr;
}

function isCloudflareIp(value) {
  const addr = canonicalIp(value);
  if (!addr) return false;
  return cloudflareList.check(addr.toString(), addr.kind());
}

/**
 * IPv4 stays a single host. IPv6 is masked to /64 so rotating interface
 * identifiers inside one customer prefix share a bucket.
 * express-rate-limit 7.5.1 (this service's locked major) does not export
 * ipKeyGenerator; that helper arrived in v8. /64 is the same idea.
 */
function normalizeClientKey(value) {
  const addr = canonicalIp(value);
  if (!addr) return null;
  if (addr.kind() === 'ipv4') return addr.toString();
  const bytes = addr.toByteArray();
  for (let i = 8; i < 16; i += 1) bytes[i] = 0;
  return `${ipaddr.fromByteArray(bytes).toNormalizedString()}/${IPV6_PREFIX}`;
}

function headerClientIp(req, name) {
  const raw = req.headers[name];
  if (raw == null || Array.isArray(raw)) return null;
  const text = String(raw).trim();
  if (!text || text.includes(',')) return null;
  const addr = canonicalIp(text);
  return addr ? addr.toString() : null;
}

/** Socket first, then X-Forwarded-For from the right. Same order as the `forwarded` package. */
function forwardedChain(req) {
  const socket = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  const header = req.headers['x-forwarded-for'];
  const fromRight = [];
  const source = Array.isArray(header) ? header.join(',') : header;
  if (typeof source === 'string' && source) {
    const parts = source.split(',');
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i].trim();
      if (part) fromRight.push(part);
    }
  }
  return [socket, ...fromRight];
}

function selectClientIp(req) {
  const hops = trustProxyHops();
  const chain = forwardedChain(req);
  const peerIndex = Math.min(hops, Math.max(chain.length - 1, 0));
  const peer = req.ip || chain[peerIndex] || chain[0] || '';
  if (isCloudflareIp(peer)) {
    const fromCloudflare = headerClientIp(req, 'cf-connecting-ip')
      || headerClientIp(req, 'true-client-ip');
    if (fromCloudflare) return fromCloudflare;
    const appended = canonicalIp(chain[hops + 1]);
    if (appended) return appended.toString();
  }
  const hopIp = canonicalIp(peer);
  return hopIp ? hopIp.toString() : '';
}

function clientRateLimitKey(req) {
  return normalizeClientKey(selectClientIp(req)) || 'invalid';
}

module.exports = {
  DEFAULT_TRUST_PROXY_HOPS,
  MAX_TRUST_PROXY_HOPS,
  IPV6_PREFIX,
  trustProxyHops,
  isCloudflareIp,
  normalizeClientKey,
  selectClientIp,
  clientRateLimitKey,
};
