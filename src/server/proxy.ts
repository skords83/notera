import { isIP } from "node:net";

/** Only explicitly named proxy addresses/networks may supply forwarding headers. */
export function trustedProxyAddresses(value = ""): false | string[] {
  if (!value.trim()) return false;
  const addresses = value.split(",").map((address) => address.trim());
  for (const address of addresses) {
    const [ip, prefix, ...extra] = address.split("/");
    const family = isIP(ip);
    const max = family === 4 ? 32 : 128;
    if (
      !family ||
      extra.length ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > max))
    ) {
      throw new Error(
        "TRUSTED_PROXIES muss eine kommagetrennte Liste konkreter Proxy-IP-Adressen oder CIDRs sein; pauschales Vertrauen (true, *, /0) ist nicht erlaubt.",
      );
    }
  }
  return addresses;
}
