// Rauchtest für den MCP-Endpunkt. Kein Teil des Builds — von Hand gegen eine
// Wegwerf-Instanz laufen lassen:
//
//   MCP_URL=http://localhost:8099/api/mcp \
//   ADMIN_TOKEN=… VIEWER_TOKEN=… node scripts/mcp-smoke.mjs
//
// Treibt den MCP-Endpunkt über rohes Streamable-HTTP-JSON-RPC — genau der
// Draht, den ein echter Client benutzt. Prüft die Design-Invarianten aus
// Stufe 1: Auth, Rollen-Trennung, Katalog-Rundlauf, und dass ein Schreibvorgang
// durch die Pipeline geht (Präfix, Snapshot, Erlaubnisliste, Display-Ping).
const BASE = process.env.MCP_URL || "http://localhost:8099/api/mcp";
const ADMIN = process.env.ADMIN_TOKEN;
const VIEWER = process.env.VIEWER_TOKEN;

let idc = 0;
async function rpc(token, method, params) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++idc, method, params }),
  });
  if (res.status === 401) return { httpStatus: 401 };
  const text = await res.text();
  // Streamable HTTP kann als SSE antworten (data: {...}) oder als reines JSON.
  const line = text.split("\n").find((l) => l.startsWith("data:")) || text;
  const body = JSON.parse(line.replace(/^data:\s*/, ""));
  return { httpStatus: res.status, body };
}
async function callTool(token, name, args) {
  const r = await rpc(token, "tools/call", { name, arguments: args || {} });
  const c = r.body?.result?.content?.[0]?.text;
  let data = r.body;
  if (c) { try { data = JSON.parse(c); } catch { data = { raw: c }; } }
  return { isError: r.body?.result?.isError, data };
}
async function init(token) {
  return rpc(token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mf-test", version: "1" },
  });
}

let fail = 0;
const ok = (name, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fail++;
};

(async () => {
  // 1. Auth
  ok("kein Token → 401", (await rpc(null, "initialize", {})).httpStatus === 401);
  ok("zu kurzes Token → 401", (await rpc("short", "initialize", {})).httpStatus === 401);
  ok("Admin-Token → initialize ok", (await init(ADMIN)).body?.result?.serverInfo?.name === "magic-frame");

  // 2. Rollen-Trennung: Viewer sieht keine Schreib-Werkzeuge
  await init(VIEWER);
  const vTools = (await rpc(VIEWER, "tools/list", {})).body.result.tools.map((t) => t.name);
  const aTools = (await rpc(ADMIN, "tools/list", {})).body.result.tools.map((t) => t.name);
  ok("Viewer: keine Einrichtungs-Werkzeuge", !vTools.includes("edit_widgets") && !vTools.includes("control_displays") && vTools.includes("get_view"), `(${vTools.length} Werkzeuge)`);
  ok("Viewer: Haushalts-Werkzeuge sichtbar", ["post_message", "add_shopping_items", "add_todo", "start_timer"].every((n) => vTools.includes(n)));
  ok("Admin: Schreib-Werkzeuge sichtbar", aTools.includes("edit_widgets") && aTools.includes("manage_view"), `(${aTools.length} Werkzeuge)`);

  // 2b. Haushalt — bewusst mit dem VIEWER-Token: dieselben Rechte wie die
  // Companion-Routen, die jeder Token schreiben darf.
  const msg = await callTool(VIEWER, "post_message", { text: "mcp-smoke", ttlMinutes: 5 });
  ok("post_message (Viewer)", msg.data.ok && !!msg.data.message?.id, JSON.stringify(msg.data).slice(0, 80));
  const msgs = await callTool(VIEWER, "list_messages", {});
  ok("list_messages zeigt die Notiz", Array.isArray(msgs.data) && msgs.data.some((m) => m.id === msg.data.message?.id));
  ok("dismiss_message", (await callTool(VIEWER, "dismiss_message", { id: msg.data.message?.id })).data.ok === true);
  const msgsAfter = await callTool(VIEWER, "list_messages", {});
  ok("Notiz ist weg", !msgsAfter.data.some((m) => m.id === msg.data.message?.id));
  const badMsg = await callTool(VIEWER, "post_message", { text: "x", dashboardId: "gibts-nicht" });
  ok("post_message an fremde Ansicht → Fehler mit Liste", badMsg.isError && /Valid view ids/.test(badMsg.data.hint || ""), badMsg.data.error);
  ok("dismiss_message mit falscher ID → Fehler", (await callTool(VIEWER, "dismiss_message", { id: "gibts-nicht" })).isError === true);

  const shop = await callTool(VIEWER, "add_shopping_items", { items: ["mcp-smoke-milch", "  "] });
  const shopId = shop.data.items?.[0]?.id;
  ok("add_shopping_items (leere Einträge fallen weg)", shop.data.ok && shop.data.items?.length === 1, JSON.stringify(shop.data).slice(0, 80));
  const c1 = await callTool(VIEWER, "check_shopping_item", { id: shopId });
  const c2 = await callTool(VIEWER, "check_shopping_item", { id: shopId });
  ok("check_shopping_item zweimal → bleibt abgehakt", c1.data.item?.checked === true && c2.data.item?.checked === true);
  ok("check_shopping_item checked:false → wieder offen", (await callTool(VIEWER, "check_shopping_item", { id: shopId, checked: false })).data.item?.checked === false);
  await callTool(VIEWER, "check_shopping_item", { id: shopId });
  await callTool(VIEWER, "clear_checked_shopping", {});
  ok("clear_checked_shopping räumt Abgehaktes weg", !(await callTool(VIEWER, "list_shopping", {})).data.some((i) => i.id === shopId));

  const todo = await callTool(VIEWER, "add_todo", { title: "mcp-smoke", assignee: "Alex", dueDate: "2026-10-21" });
  const todoId = todo.data.todo?.id;
  ok("add_todo", todo.data.ok && todo.data.todo?.dueDate?.startsWith("2026-10-21"), JSON.stringify(todo.data).slice(0, 80));
  const d1 = await callTool(VIEWER, "complete_todo", { id: todoId });
  const d2 = await callTool(VIEWER, "complete_todo", { id: todoId });
  ok("complete_todo zweimal → bleibt erledigt", !!d1.data.todo?.completedAt && d2.data.todo?.completedAt === d1.data.todo?.completedAt);
  ok("erledigtes To-do fällt aus der offenen Liste", !(await callTool(VIEWER, "list_todos", {})).data.some((t) => t.id === todoId));
  const badTodo = await callTool(VIEWER, "add_todo", { title: "x", dueDate: "morgen" });
  ok("add_todo mit Unsinns-Datum → Fehler mit Beispiel", badTodo.isError && /ISO 8601/.test(badTodo.data.hint || ""));

  const timer = await callTool(VIEWER, "start_timer", { label: "mcp-smoke", seconds: 90 });
  const timerId = timer.data.timer?.id;
  ok("start_timer", timer.data.ok && timer.data.timer?.durationMs === 90000, JSON.stringify(timer.data).slice(0, 80));
  ok("list_timers zeigt ihn", (await callTool(VIEWER, "list_timers", {})).data.some((t) => t.id === timerId));
  ok("stop_timer", (await callTool(VIEWER, "stop_timer", { id: timerId })).data.ok === true);
  ok("gestoppter Timer ist weg", !(await callTool(VIEWER, "list_timers", {})).data.some((t) => t.id === timerId));
  ok("start_timer ohne Dauer → Fehler", (await callTool(VIEWER, "start_timer", { label: "x" })).isError === true);

  // 3. Katalog-Rundlauf
  const cat = await callTool(ADMIN, "get_widget_catalog", {});
  ok("Katalog listet 20 Kern-Typen", cat.data.coreTypes?.length === 20);
  const clockSchema = await callTool(ADMIN, "get_widget_catalog", { type: "ClockWidget.tsx" });
  ok("Typ-Schema kommt als JSON Schema", !!clockSchema.data.configSchema?.properties);

  // 4. Eine frische View anlegen
  await callTool(ADMIN, "manage_view", { action: "delete", id: "mcp-test", confirm: true }).catch(() => {});
  const created = await callTool(ADMIN, "manage_view", { action: "create", id: "mcp-test", name: "MCP Test" });
  ok("manage_view create", created.data.ok && created.data.id === "mcp-test");

  // 5. edit_widgets: Uhr + Button, der auf die Uhr zeigt (Remap-Prüfung)
  const edit = await callTool(ADMIN, "edit_widgets", {
    dashboardId: "mcp-test",
    operations: [
      { op: "add", widget: { i: "mcpclock", type: "ClockWidget.tsx", x: 0, y: 0, w: 6, h: 4, config: {} } },
      { op: "add", widget: { i: "mcpbtn", type: "ButtonWidget.tsx", x: 6, y: 0, w: 4, h: 2, config: { actionType0: "toggle", targets0: ["mcpclock"] } } },
    ],
  });
  ok("edit_widgets add (batch)", edit.data.ok, JSON.stringify(edit.data).slice(0, 80));

  // 6. get_view: IDs sind präfixiert, Button-Ziel wurde mitremappt
  const view = await callTool(ADMIN, "get_view", { dashboardId: "mcp-test" });
  const ids = (view.data.layout || []).map((w) => w.i);
  ok("Widget-IDs sind view-präfixiert", ids.includes("mcp-test_mcpclock"), ids.join(","));
  const btn = (view.data.layout || []).find((w) => w.i === "mcp-test_mcpbtn");
  ok("Button-Ziel wurde auf präfixierte ID remappt", btn?.config?.targets0?.[0] === "mcp-test_mcpclock", JSON.stringify(btn?.config?.targets0));

  const dupe = await callTool(ADMIN, "edit_widgets", {
    dashboardId: "mcp-test",
    operations: [{ op: "add", widget: { i: "mcpclock", type: "ClockWidget.tsx", x: 0, y: 12, w: 4, h: 3, config: {} } }],
  });
  ok("doppelte ID → erklärender Fehler statt Absturz", dupe.isError && /already exists/.test(dupe.data.error || ""), (dupe.data.error||"").slice(0,50));

  const auto = await callTool(ADMIN, "edit_widgets", {
    dashboardId: "mcp-test",
    operations: [{ op: "add", widget: { type: "QrWidget.tsx", x: 0, y: 16, w: 4, h: 4, config: {} } }],
  });
  ok("ID weglassen → Server vergibt eine", auto.data.ok === true, JSON.stringify(auto.data).slice(0,60));

  // 7. Validierungs-Fehler bringt bei (teachError mit hint)
  const bad = await callTool(ADMIN, "edit_widgets", {
    dashboardId: "mcp-test",
    operations: [{ op: "add", widget: { i: "x", type: "ClockWidget.tsx", x: 999, y: 0, w: 6, h: 4, config: {} } }],
  });
  ok("Geometrie ausser Grenzen → isError + hint", bad.isError && !!bad.data.hint, bad.data.error);

  // 8. Viewer darf nicht schreiben (Werkzeug ist gar nicht registriert)
  const vWrite = await callTool(VIEWER, "edit_widgets", { dashboardId: "mcp-test", operations: [] });
  ok("Viewer edit_widgets → Werkzeug unbekannt", vWrite.data?.error?.code === -32602 || vWrite.data?.error?.message?.match(/not found|unknown|Invalid/i), JSON.stringify(vWrite.data?.error || vWrite.data).slice(0, 80));

  // 9. diagnose_ha_action erklärt eine Ablehnung
  const diag = await callTool(ADMIN, "diagnose_ha_action", { entityId: "lock.nirgends", domain: "lock", service: "unlock" });
  ok("diagnose_ha_action: fremde Entität wird abgelehnt", diag.data.verdict === "would be refused" && diag.data.reasons.length > 0);

  // 10. Nächstes Hintergrundbild — nur Admin, wie die übrigen Display-Befehle
  const nw = await callTool(ADMIN, "control_displays", { action: "next_wallpaper", dashboardId: "mcp-test" });
  ok("control_displays next_wallpaper", nw.data.ok === true, JSON.stringify(nw.data).slice(0, 80));

  // aufräumen
  await callTool(ADMIN, "manage_view", { action: "delete", id: "mcp-test", confirm: true });

  console.log(fail === 0 ? "\nALLE MCP-INVARIANTEN GRÜN" : `\n${fail} FEHLER`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
