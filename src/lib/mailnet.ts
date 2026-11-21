import net from "net";

/**
 * 邮件网络层：
 * 1) 先试直连（境外服务器/干净网络下走这条）
 * 2) 直连不通时，自动走本机代理（http CONNECT 隧道），把远端端口映射到本地临时端口
 *    这样 nodemailer / imapflow 都不需要改装，只要把 host 指到 127.0.0.1:临时端口，
 *    再用 tls.servername 指回真实域名即可通过证书校验。
 */

export function parseProxy(u: string): { host: string; port: number } | null {
  if (!u) return null;
  const m = u.match(/^(?:(?:http|https|socks5|socks):\/\/)?([^\s:/]+):(\d+)\/?$/i);
  if (!m) return null;
  return { host: m[1], port: Number(m[2]) };
}

export function tcpProbe(host: string, port: number, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeout, () => finish(false));
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
  });
}

function openTunnel(targetHost: string, targetPort: number, p: { host: string; port: number }, timeout = 20000): Promise<net.Socket> {

  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: p.host, port: p.port });
    let buf = Buffer.alloc(0);
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      reject(err);
    };

    sock.setTimeout(timeout, () => fail(new Error("代理隧道超时，请检查代理是否开启")));
    sock.on("error", (e: any) => fail(new Error(`代理连接失败：${e?.code || e?.message || "未知"}`)));

    sock.once("connect", () => {
      sock.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
          `Host: ${targetHost}:${targetPort}\r\n` +
          `Proxy-Connection: keep-alive\r\n\r\n`,
        "latin1"
      );
    });

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf("\r\n\r\n");
      if (idx === -1) {
        if (buf.length > 16384) fail(new Error("代理响应异常"));
        return;
      }
      const head = buf.slice(0, idx).toString("latin1");
      const status = Number((head.match(/^HTTP\/\d\.\d\s+(\d+)/) || [])[1] || 0);
      if (status !== 200) {
        fail(new Error(`代理隧道被拒绝（HTTP ${status || "?"}）`));
        return;
      }
      settled = true;
      sock.removeListener("data", onData);
      sock.removeAllListeners("error");
      sock.setTimeout(0);
      const rest = buf.slice(idx + 4);
      if (rest.length) sock.unshift(rest);
      resolve(sock);
    };

    sock.on("data", onData);
  });
}

const forwards = new Map<string, Promise<number>>();

/** 在本地起一个转发端口，把流量经由代理隧道送到 targetHost:targetPort */
function ensureForward(targetHost: string, targetPort: number, proxy: { host: string; port: number }): Promise<number> {
  const key = JSON.stringify([targetHost, targetPort, proxy.host, proxy.port]);
  const cached = forwards.get(key);
  if (cached) return cached;

  const p = new Promise<number>((resolve, reject) => {
    const server = net.createServer(async (client) => {
      client.on("error", () => client.destroy());
      try {
        const upstream = await openTunnel(targetHost, targetPort, proxy);
        upstream.on("error", () => {
          client.destroy();
          upstream.destroy();
        });
        client.on("close", () => upstream.destroy());
        upstream.on("close", () => client.destroy());
        client.pipe(upstream);
        upstream.pipe(client);
      } catch {
        client.destroy();
      }
    });
    server.on("error", (e) => {
      forwards.delete(key);
      reject(e);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
      else reject(new Error("本地转发端口启动失败"));
    });
  });

  forwards.set(key, p);
  return p;
}

export type Endpoint = { host: string; port: number; servername: string; via: "direct" | "proxy" };

/** 决定这次连接走直连还是代理 */
export async function resolveEndpoint(host: string, port: number, proxyUrl = "", directTimeout = 5000): Promise<Endpoint> {
  if (await tcpProbe(host, port, directTimeout)) {
    return { host, port, servername: host, via: "direct" };
  }
  const proxy = parseProxy(proxyUrl);
  if (!proxy) throw new Error("无法直连邮件服务器，请检查服务器地址及端口");
  const localPort = await ensureForward(host, port, proxy);
  return { host: "127.0.0.1", port: localPort, servername: host, via: "proxy" };
}
