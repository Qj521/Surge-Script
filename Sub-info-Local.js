/**
 * 机场流量信息（多路 + 按余量变色）
 * - 最多 3 路订阅，有有效 URL 才显示
 * - 链接无需编码
 * - 图标颜色按剩余流量比例变化
 */

function parseArgs(raw) {
  raw = String(raw || "").trim();
  const result = {
    title: "机场流量",
    icon: "externaldrive.fill.badge.icloud",
    slots: [],
  };

  // 先按「已知键」切分，urlN 可能含 &
  const known = [
    "title",
    "icon",
    "name1",
    "reset1",
    "name2",
    "reset2",
    "name3",
    "reset3",
    "url1",
    "url2",
    "url3",
  ];

  const map = {};

  // 提取 url1/url2/url3（值可含 &）
  for (const uk of ["url1", "url2", "url3"]) {
    const re = new RegExp(`(?:^|&)${uk}=`, "i");
    const m = re.exec(raw);
    if (!m) continue;
    const start = m.index + m[0].length;
    let end = raw.length;
    for (const k of known) {
      if (k === uk) continue;
      const re2 = new RegExp(`&${k}=`, "i");
      const m2 = re2.exec(raw.slice(start));
      if (m2 && start + m2.index < end) end = start + m2.index;
    }
    map[uk] = normalizeUrl(raw.slice(start, end));
  }

  // 去掉 url 段后解析其余
  let rest = raw;
  for (const uk of ["url1", "url2", "url3"]) {
    const re = new RegExp(`(?:^|&)${uk}=`, "i");
    const m = re.exec(rest);
    if (!m) continue;
    const start = m.index;
    const valStart = m.index + m[0].length;
    let end = rest.length;
    for (const k of known) {
      if (k === uk) continue;
      const re2 = new RegExp(`&${k}=`, "i");
      const m2 = re2.exec(rest.slice(valStart));
      if (m2 && valStart + m2.index < end) end = valStart + m2.index;
    }
    rest = (rest.slice(0, start) + rest.slice(end)).replace(/^&|&$/g, "");
  }

  rest.split("&").forEach((pair) => {
    if (!pair) return;
    const i = pair.indexOf("=");
    if (i === -1) return;
    const k = pair.slice(0, i).trim().toLowerCase();
    let v = pair.slice(i + 1).trim();
    if (!k || k.startsWith("url")) return;
    if (v.includes("{") && v.includes("}")) v = "";
    try {
      v = decodeURIComponent(v);
    } catch (e) {}
    map[k] = v;
  });

  if (map.title) result.title = map.title;
  if (map.icon) result.icon = map.icon;

  for (let n = 1; n <= 3; n++) {
    const url = map[`url${n}`] || "";
    if (!url) continue;
    result.slots.push({
      index: n,
      url,
      name: map[`name${n}`] || `机场${n}`,
      reset_day: map[`reset${n}`] === "0" ? "" : map[`reset${n}`] || "",
    });
  }

  return result;
}

function normalizeUrl(v) {
  if (!v) return "";
  if (v.includes("{") && v.includes("}")) return "";
  let s = v.trim();
  if (/^请填写/.test(s)) return "";
  if (/^https?:\/\//i.test(s)) return s;
  try {
    const d = decodeURIComponent(s);
    if (/^https?:\/\//i.test(d)) return d;
    const d2 = decodeURIComponent(d);
    if (/^https?:\/\//i.test(d2)) return d2;
    return /^请填写/.test(d) ? "" : d;
  } catch (e) {
    return s;
  }
}

const args = parseArgs(typeof $argument !== "undefined" ? $argument : "");

function nowHM() {
  const n = new Date();
  const p = (x) => (x > 9 ? "" + x : "0" + x);
  return `${p(n.getHours())}:${p(n.getMinutes())}`;
}

function bytesToSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

function formatTime(time) {
  let t = time;
  if (typeof t === "string" && /^\d+$/.test(t)) t = Number(t);
  if (typeof t === "number" && t < 1e12) t = t * 1000;
  const d = new Date(t);
  if (isNaN(d.getTime())) return String(time);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function getRemainingDays(resetDay) {
  const day = parseInt(resetDay, 10);
  if (!day || day < 1 || day > 31) return null;
  const now = new Date();
  const today = now.getDate();
  if (day > today) return day - today;
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  return daysInMonth - today + day;
}

function pickUserInfo(headers) {
  if (!headers) return null;
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === "subscription-userinfo"
  );
  return key ? headers[key] : null;
}

function oneRequest(method, url, ua) {
  return new Promise((resolve) => {
    $httpClient[method](
      {
        url,
        timeout: 12,
        headers: { "User-Agent": ua, Accept: "*/*" },
      },
      (err, resp) => {
        if (err || !resp) {
          resolve({ ok: false, err: err || "no response" });
          return;
        }
        resolve({
          ok: true,
          status: resp.status,
          info: pickUserInfo(resp.headers || {}),
        });
      }
    );
  });
}

async function fetchUserInfo(url) {
  const methods = ["get", "head"];
  const uas = [
    "ClashforWindows/0.20.39",
    "ClashMetaForAndroid/2.8.9",
    "Quantumult%20X",
    "Surge iOS/2590",
  ];
  let lastErr = "无流量信息";
  for (const method of methods) {
    for (const ua of uas) {
      const r = await oneRequest(method, url, ua);
      if (!r.ok) {
        lastErr = String(r.err);
        continue;
      }
      if (r.info) return r.info;
      lastErr =
        r.status && r.status !== 200 && r.status !== 204
          ? `HTTP ${r.status}`
          : "无流量信息";
    }
  }
  throw new Error(lastErr);
}

function parseUserInfo(headerVal) {
  const map = {};
  String(headerVal)
    .split(/[;\s]+/)
    .forEach((part) => {
      const m = part.match(/^(\w+)=([\d.eE+-]+)$/);
      if (m) map[m[1].toLowerCase()] = Number(m[2]);
    });
  return map;
}

/** 按剩余比例选图标与颜色 */
function styleByRemain(remainRatio) {
  // remainRatio: 0–1，剩余/总量
  if (remainRatio == null || isNaN(remainRatio)) {
    return {
      icon: args.icon || "externaldrive.fill.badge.icloud",
      color: "#8E8E93",
    };
  }
  if (remainRatio >= 0.5) {
    return {
      icon: "externaldrive.fill.badge.checkmark",
      color: "#34C759", // 绿
    };
  }
  if (remainRatio >= 0.2) {
    return {
      icon: "externaldrive.fill.badge.icloud",
      color: "#FF9F0A", // 橙
    };
  }
  return {
    icon: "externaldrive.fill.badge.exclamationmark",
    color: "#FF3B30", // 红
  };
}

async function querySlot(slot) {
  try {
    const headerVal = await fetchUserInfo(slot.url);
    const info = parseUserInfo(headerVal);
    const used = (info.download || 0) + (info.upload || 0);
    const total = info.total || 0;
    const remain = total > 0 ? Math.max(total - used, 0) : null;
    const remainRatio = total > 0 ? remain / total : null;
    const usedPct = total > 0 ? ((used / total) * 100).toFixed(1) : null;

    const parts = [];
    parts.push(
      `用量：${bytesToSize(used)} | ${bytesToSize(total)}` +
        (usedPct != null ? `  (${usedPct}%)` : "")
    );
    if (remain != null) {
      parts.push(`剩余：${bytesToSize(remain)}`);
    }
    const left = getRemainingDays(slot.reset_day);
    if (left != null) parts.push(`重置：剩余${left}天`);
    if (info.expire) parts.push(`到期：${formatTime(info.expire)}`);

    return {
      ok: true,
      name: slot.name,
      text: parts.join("\n"),
      remainRatio,
    };
  } catch (e) {
    return {
      ok: false,
      name: slot.name,
      text: `获取失败：${e && e.message ? e.message : e}`,
      remainRatio: null,
    };
  }
}

(async () => {
  if (!args.slots.length) {
    $done({
      title: args.title,
      content: "请在参数 URL1/URL2/URL3 中填写订阅链接\n有链接的才会显示",
      icon: args.icon,
      "icon-color": "#8E8E93",
    });
    return;
  }

  const results = await Promise.all(args.slots.map(querySlot));

  // 面板图标：按「余量最少」的一路来警示
  let worst = 1;
  let anyRatio = false;
  for (const r of results) {
    if (r.remainRatio != null) {
      anyRatio = true;
      if (r.remainRatio < worst) worst = r.remainRatio;
    }
  }
  const style = styleByRemain(anyRatio ? worst : null);

  const blocks = results.map((r) => {
    const head = results.length > 1 ? `【${r.name}】` : "";
    return head ? `${head}\n${r.text}` : r.text;
  });

  $done({
    title: `${args.title} | ${nowHM()}`,
    content: blocks.join("\n\n"),
    icon: style.icon,
    "icon-color": style.color,
  });
})();
