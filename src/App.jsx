import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

const SAMPLE_SKUS = [
  { id: "1",  sku: "CHZ-001", name: "Boston Celtics Hat",      category: "Headwear",    currentStock: 142, reorderPoint: 50,  reorderQty: 100, avgCost: 0 },
  { id: "2",  sku: "CHZ-002", name: "Patriots Hoodie - M",     category: "Apparel",     currentStock: 28,  reorderPoint: 40,  reorderQty: 80,  avgCost: 0 },
  { id: "3",  sku: "CHZ-003", name: "Red Sox T-Shirt - L",     category: "Apparel",     currentStock: 7,   reorderPoint: 30,  reorderQty: 60,  avgCost: 0 },
  { id: "4",  sku: "CHZ-004", name: "Bruins Snapback",         category: "Headwear",    currentStock: 0,   reorderPoint: 25,  reorderQty: 50,  avgCost: 0 },
  { id: "5",  sku: "CHZ-005", name: "Boston Skyline Mug",      category: "Accessories", currentStock: 310, reorderPoint: 100, reorderQty: 200, avgCost: 0 },
  { id: "6",  sku: "CHZ-006", name: "Wicked Pissah Tee - S",  category: "Apparel",     currentStock: 55,  reorderPoint: 30,  reorderQty: 60,  avgCost: 0 },
  { id: "7",  sku: "CHZ-007", name: "Mass Sticker Pack",       category: "Accessories", currentStock: 18,  reorderPoint: 75,  reorderQty: 150, avgCost: 0 },
  { id: "8",  sku: "CHZ-008", name: "Sox World Series Hat",    category: "Headwear",    currentStock: 89,  reorderPoint: 35,  reorderQty: 70,  avgCost: 0 },
  { id: "9",  sku: "CHZ-009", name: "New England Hoodie - XL", category: "Apparel",     currentStock: 3,   reorderPoint: 20,  reorderQty: 40,  avgCost: 0 },
  { id: "10", sku: "CHZ-010", name: "Boston Pin Set",          category: "Accessories", currentStock: 412, reorderPoint: 80,  reorderQty: 200, avgCost: 0 },
];

const SAMPLE_HISTORY = [
  { week: "2025-11-03", sku: "CHZ-001", unitsSold: 22 },
  { week: "2025-11-03", sku: "CHZ-002", unitsSold: 14 },
  { week: "2025-11-10", sku: "CHZ-001", unitsSold: 18 },
  { week: "2025-11-10", sku: "CHZ-002", unitsSold: 19 },
  { week: "2025-11-17", sku: "CHZ-001", unitsSold: 31 },
  { week: "2025-11-17", sku: "CHZ-005", unitsSold: 44 },
  { week: "2025-11-24", sku: "CHZ-001", unitsSold: 40 },
  { week: "2025-11-24", sku: "CHZ-005", unitsSold: 51 },
];

function statusFor(item) {
  if (item.currentStock === 0) return "out";
  if (item.currentStock <= item.reorderPoint) return "low";
  return "ok";
}

const STATUS_STYLES = {
  out: { label: "OUT OF STOCK", bg: "#fee2e2", color: "#dc2626", dot: "#dc2626" },
  low: { label: "LOW STOCK", bg: "#fff7ed", color: "#ea580c", dot: "#ea580c" },
  ok:  { label: "OK",          bg: "#dcfce7", color: "#16a34a", dot: "#16a34a" },
};

const PO_STATUS = {
  draft:    { label: "DRAFT",            bg: "#f1f5f9", color: "#64748b" },
  sent:     { label: "SENT TO SUPPLIER", bg: "#dbeafe", color: "#2563eb" },
  partial:  { label: "PARTIAL",          bg: "#fff7ed", color: "#ea580c" },
  received: { label: "RECEIVED",         bg: "#dcfce7", color: "#16a34a" },
};
function parseOrderDate(raw) {
  if (!raw) return null;
  const clean = raw.trim();
  // Handle YYYY/DD/MM
  const match = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    const [, year, day, month] = match;
    const d = new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  // Fallback — try native parsing
  const d = new Date(clean);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

// Get the Monday of the week for a given date string (YYYY-MM-DD)
function toWeekKey(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function generatePONumber(existing) {
  const nums = existing.map(p => parseInt((p.poNumber || "").replace("PO-", "") || "0")).filter(Boolean);
  return `PO-${nums.length ? Math.max(...nums) + 1 : 1001}`;
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [inventory, setInventory] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [orders, setOrders] = useState([]);          // { id, orderId, sku, qty, importedAt, week }
  const [uploadStep, setUploadStep] = useState("idle");  // idle | preview | committed
  const [uploadPreview, setUploadPreview] = useState(null); // parsed preview data
  const [uploadSubTab, setUploadSubTab] = useState("upload"); // upload | log | analytics
  const [orderLogSearch, setOrderLogSearch] = useState("");
  const [orderLogExpanded, setOrderLogExpanded] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [addForm, setAddForm] = useState(null);
  const [selectedSku, setSelectedSku] = useState(null);
  const fileRef = useRef();
  const [poView, setPoView] = useState("list");
  const [activePO, setActivePO] = useState(null);
  const [poFilterStatus, setPoFilterStatus] = useState("all");
  const [poForm, setPoForm] = useState(null);
  const [receiveModal, setReceiveModal] = useState(null);
  // Replenishment state
  const [replSelected, setReplSelected] = useState({});     // { skuId: qty }
  const [replSupplier, setReplSupplier] = useState("");
  const [replCreatedMsg, setReplCreatedMsg] = useState(null);
  const [replFilterUrgency, setReplFilterUrgency] = useState("all"); // all | critical | low | watch
  const [replSearchTerm, setReplSearchTerm] = useState("");
  // Forecast state
  const [fcMethod, setFcMethod] = useState("weighted");   // simple | weighted | trend | seasonality
  const [fcWindow, setFcWindow] = useState("all");        // all | yoy
  const [fcWeeks, setFcWeeks] = useState(8);
  const [fcSupplier, setFcSupplier] = useState("");
  const [fcSeasonality, setFcSeasonality] = useState({ Jan:1,Feb:1,Mar:1,Apr:1,May:1,Jun:1,Jul:1,Aug:1,Sep:1,Oct:1,Nov:1,Dec:1 });
  const [fcSearchTerm, setFcSearchTerm] = useState("");
  const [fcCreatedMsg, setFcCreatedMsg] = useState(null);
// Auth state
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const storedPassword = useRef(sessionStorage.getItem("sb_pw") || "");

  // ── API HELPERS ───────────────────────────────────────────────────────────
  async function dbGet(key) {
    const res = await fetch(`/api/data?key=${key}`, {
      headers: { "x-app-password": storedPassword.current }
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.value;
  }

  async function dbSet(key, value) {
    await fetch(`/api/data?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-password": storedPassword.current },
      body: JSON.stringify({ value })
    });
  }

  async function checkPassword(pw) {
    const res = await fetch("/api/data?key=ping", {
      headers: { "x-app-password": pw }
    });
    return res.status !== 401;
  }
useEffect(() => {
    // If password already in session, load data straight away
    if (storedPassword.current) {
      setAuthed(true);
      loadData();
    } else {
      setLoading(false);
    }
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [inv, hist, pos, ord] = await Promise.all([
        dbGet("inventory"),
        dbGet("salesHistory"),
        dbGet("purchaseOrders"),
        dbGet("orders"),
      ]);
      setInventory(inv || SAMPLE_SKUS);
      setSalesHistory(hist || SAMPLE_HISTORY);
      setPurchaseOrders(pos || []);
      setOrders(ord || []);
      if ((inv || SAMPLE_SKUS).length) setSelectedSku((inv || SAMPLE_SKUS)[0].sku);
    } catch {
      setInventory(SAMPLE_SKUS); setSalesHistory(SAMPLE_HISTORY); setPurchaseOrders([]);
      setSelectedSku(SAMPLE_SKUS[0].sku);
    }
    setLoading(false);
  }

const saveInv    = async (d) => { try { await dbSet("inventory", d); } catch {} };
  const saveHist   = async (d) => { try { await dbSet("salesHistory", d); } catch {} };
  const savePOs    = async (d) => { try { await dbSet("purchaseOrders", d); } catch {} };
  const saveOrders = async (d) => { try { await dbSet("orders", d); } catch {} };

  const alerts   = inventory.filter(i => statusFor(i) !== "ok");
  const outCount = inventory.filter(i => statusFor(i) === "out").length;
  const lowCount = inventory.filter(i => statusFor(i) === "low").length;
  const totalUnits = inventory.reduce((s, i) => s + i.currentStock, 0);
  const openPOs  = purchaseOrders.filter(p => p.status !== "received").length;

  function velocityFor(sku) {
    const rows = salesHistory.filter(r => r.sku === sku);
    if (!rows.length) return 0;
    const weeks = [...new Set(rows.map(r => r.week))].length;
    return weeks ? +(rows.reduce((s, r) => s + r.unitsSold, 0) / weeks).toFixed(1) : 0;
  }

  const chartData = (() => {
    if (!selectedSku) return [];
    const byWeek = {};
    salesHistory.filter(r => r.sku === selectedSku).forEach(r => { byWeek[r.week] = (byWeek[r.week] || 0) + r.unitsSold; });
    return Object.entries(byWeek).sort(([a],[b]) => a.localeCompare(b)).map(([week, units]) => ({ week: week.slice(5), units }));
  })();

  // ── NEW ORDER CSV UPLOAD ──────────────────────────────────────────────────
  function parseOrderCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawLines = ev.target.result.split("\n").map(l => l.trim()).filter(Boolean);
      if (!rawLines.length) { setUploadFeedback({ type:"error", msg:"Empty file." }); return; }

      // Detect header row — accept any order of columns
      const header = rawLines[0].toLowerCase().replace(/[_\s"]/g, "");
      const hasOrderCol = header.includes("order");
      const hasSkuCol   = header.includes("sku");
      const hasQtyCol   = header.includes("qty") || header.includes("quantity");
      if (!hasOrderCol || !hasSkuCol || !hasQtyCol) {
        setUploadFeedback({ type:"error", msg:`CSV must have Order#, SKU, and Quantity columns. Found: "${rawLines[0]}"` });
        return;
      }

      // Figure out column positions from header
      const cols = rawLines[0].split(",").map(c => c.trim().replace(/"/g,"").toLowerCase().replace(/[_\s]/g,""));
      const orderIdx = cols.findIndex(c => c.includes("order") && !c.includes("date"));
      const skuIdx   = cols.findIndex(c => c.includes("sku"));
      const qtyIdx   = cols.findIndex(c => c.includes("qty") || c.includes("quantity"));
      const dateIdx  = cols.findIndex(c => c.includes("date") || c.includes("orderdate") || c.includes("order_date"));

    const importedAt = new Date().toISOString().slice(0, 10);
      const importedOrderIds = new Set(orders.map(o => o.orderId));

      const validLines   = [];
      const errorLines   = [];
      const dupLines     = [];
      const orderMap     = {}; // orderId -> [lines]

      rawLines.slice(1).forEach((raw, rawIdx) => {
        const parts = raw.split(",").map(s => s.trim().replace(/"/g, ""));
        const orderId = parts[orderIdx] || "";
        const skuRaw  = parts[skuIdx]   || "";
        const qtyRaw  = parts[qtyIdx]   || "";
        const qty = parseInt(qtyRaw);

        if (!orderId && !skuRaw) return; // blank row

        // Duplicate order detection
        if (importedOrderIds.has(orderId)) {
          dupLines.push({ row: rawIdx + 2, orderId, skuRaw, qtyRaw, reason: "Order already imported" });
          return;
        }

        // Validate qty
        if (!orderId || isNaN(qty) || qty <= 0) {
          errorLines.push({ row: rawIdx + 2, orderId, skuRaw, qtyRaw, reason: !orderId ? "Missing order #" : "Invalid quantity" });
          return;
        }

        // Match SKU
        const match = inventory.find(i => i.sku.toLowerCase() === skuRaw.toLowerCase());
        if (!match) {
          errorLines.push({ row: rawIdx + 2, orderId, skuRaw, qtyRaw, reason: `Unknown SKU "${skuRaw}"` });
          return;
        }

        const rawDate = dateIdx >= 0 ? parts[dateIdx] : null;
        const orderDate = parseOrderDate(rawDate) || importedAt;
        const week = toWeekKey(orderDate);
        const line = { id: `${Date.now()}-${rawIdx}`, orderId, sku: match.sku, skuId: match.id, skuName: match.name, qty, importedAt, orderDate, week };
        validLines.push(line);
        if (!orderMap[orderId]) orderMap[orderId] = [];
        orderMap[orderId].push(line);
      });

      setUploadPreview({ validLines, errorLines, dupLines, orderMap, importedAt, week, fileName: file.name });
      setUploadStep("preview");
      setUploadFeedback(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function commitUpload() {
    if (!uploadPreview || !uploadPreview.validLines.length) return;
    const { validLines, week, importedAt } = uploadPreview;

    // Update inventory — deduct each line item individually
    const deductions = {}; // skuId -> total qty
    validLines.forEach(l => { deductions[l.skuId] = (deductions[l.skuId] || 0) + l.qty; });
    const newInv = inventory.map(item => {
      const ded = deductions[item.id] || 0;
      return ded > 0 ? { ...item, currentStock: Math.max(0, item.currentStock - ded) } : item;
    });

    // Build salesHistory entries (weekly aggregated by SKU for forecasting compat)
    const weeklyAgg = {}; // sku -> units
    validLines.forEach(l => { weeklyAgg[l.sku] = (weeklyAgg[l.sku] || 0) + l.qty; });
    const newHistEntries = Object.entries(weeklyAgg).map(([sku, unitsSold]) => ({ week, sku, unitsSold }));
    const newHist = [...salesHistory, ...newHistEntries];

    // Append to orders log
    const newOrders = [...orders, ...validLines];

    setInventory(newInv); setSalesHistory(newHist); setOrders(newOrders);
    saveInv(newInv); saveHist(newHist); saveOrders(newOrders);
    setUploadStep("committed");
    setUploadFeedback({ type:"success", msg:`Committed: ${validLines.length} line items across ${Object.keys(uploadPreview.orderMap).length} orders. Inventory updated.` });
  }

  function resetUpload() {
    setUploadStep("idle");
    setUploadPreview(null);
    setUploadFeedback(null);
  }
  // ── END ORDER CSV UPLOAD ──────────────────────────────────────────────────

  function startEdit(item) { setEditingId(item.id); setEditValues({ currentStock: item.currentStock, reorderPoint: item.reorderPoint, reorderQty: item.reorderQty }); }
  function saveEdit(item) {
    const u = inventory.map(i => i.id === item.id ? { ...i, currentStock: parseInt(editValues.currentStock)||0, reorderPoint: parseInt(editValues.reorderPoint)||0, reorderQty: parseInt(editValues.reorderQty)||0 } : i);
    setInventory(u); saveInv(u); setEditingId(null);
  }
  function addSKU() {
    if (!addForm) { setAddForm({ sku:"", name:"", category:"", currentStock:"", reorderPoint:"", reorderQty:"" }); return; }
    if (!addForm.sku || !addForm.name) return;
    const u = [...inventory, { id: Date.now().toString(), sku: addForm.sku.toUpperCase(), name: addForm.name, category: addForm.category||"Uncategorized", currentStock: parseInt(addForm.currentStock)||0, reorderPoint: parseInt(addForm.reorderPoint)||0, reorderQty: parseInt(addForm.reorderQty)||0 }];
    setInventory(u); saveInv(u); setAddForm(null);
  }
  function deleteSKU(id) { const u = inventory.filter(i => i.id !== id); setInventory(u); saveInv(u); }

  function initNewPO() {
    setPoForm({ poNumber: generatePONumber(purchaseOrders), supplier:"", status:"draft", createdAt: new Date().toISOString().slice(0,10), notes:"", lines:[{ skuId:"", qty:"", costPerUnit:"" }] });
    setPoView("create");
  }
  function poLineUpdate(idx, field, val) {
    setPoForm(f => {
      const lines = [...f.lines];
      lines[idx] = { ...lines[idx], [field]: val };
      if (field === "skuId" && val) { const inv = inventory.find(i => i.id === val); if (inv) lines[idx].qty = inv.reorderQty; }
      return { ...f, lines };
    });
  }
  function savePO() {
    const validLines = poForm.lines.filter(l => l.skuId && l.qty);
    if (!poForm.supplier || !validLines.length) return;
    const po = { ...poForm, id: Date.now().toString(), lines: validLines.map(l => { const item = inventory.find(i => i.id === l.skuId); return { skuId: l.skuId, sku: item?.sku||"", name: item?.name||"", qty: parseInt(l.qty)||0, costPerUnit: parseFloat(l.costPerUnit)||0, received: 0 }; }) };
    const u = [...purchaseOrders, po]; setPurchaseOrders(u); savePOs(u); setActivePO(po); setPoView("detail");
  }
  function updatePOStatus(po, status) {
    const u = purchaseOrders.map(p => p.id === po.id ? { ...p, status } : p);
    setPurchaseOrders(u); savePOs(u); setActivePO(prev => ({ ...prev, status }));
  }
  function deletePO(id) { const u = purchaseOrders.filter(p => p.id !== id); setPurchaseOrders(u); savePOs(u); setPoView("list"); setActivePO(null); }

  function openReceive(po, idx) { setReceiveModal({ po, lineIdx: idx, qty: po.lines[idx].qty - po.lines[idx].received }); }
  function confirmReceive() {
    if (!receiveModal) return;
    const { po, lineIdx, qty } = receiveModal;
    const qtyNum = parseInt(qty)||0; if (qtyNum <= 0) return;
    const updatedLines = po.lines.map((l, i) => i !== lineIdx ? l : { ...l, received: Math.min(l.received + qtyNum, l.qty) });
    const tot = updatedLines.reduce((s,l)=>s+l.qty,0), rec = updatedLines.reduce((s,l)=>s+l.received,0);
    const newStatus = rec === 0 ? po.status : rec >= tot ? "received" : "partial";
    const updatedPO = { ...po, lines: updatedLines, status: newStatus };
    const updPOs = purchaseOrders.map(p => p.id === po.id ? updatedPO : p);
    setPurchaseOrders(updPOs); savePOs(updPOs); setActivePO(updatedPO);
    const line = po.lines[lineIdx];
    const updInv = inventory.map(item => {
      if (item.id !== line.skuId) return item;
      const prevAvg = item.avgCost || 0;
      const prevStock = item.currentStock;
      const newStock = prevStock + qtyNum;
      // Weighted average cost: blend existing cost basis with new shipment
      const newAvgCost = newStock > 0
        ? ((prevStock * prevAvg) + (qtyNum * line.costPerUnit)) / newStock
        : line.costPerUnit;
      return { ...item, currentStock: newStock, avgCost: +newAvgCost.toFixed(4) };
    });
    setInventory(updInv); saveInv(updInv); setReceiveModal(null);
  }

  // ── FORECAST ENGINE ───────────────────────────────────────────────────────
  function getWindowedSales(skuCode, window) {
    let rows = salesHistory.filter(r => r.sku === skuCode);
    if (window === "yoy") {
      // Match the same ISO-week numbers from the prior calendar year
      const allWeeks = [...new Set(salesHistory.map(r => r.week))].sort();
      // Build a set of prior-year equivalents of the weeks we have data for
      const priorYearWeeks = new Set(allWeeks.map(w => {
        const d = new Date(w + "T00:00:00Z");
        d.setUTCFullYear(d.getUTCFullYear() - 1);
        return d.toISOString().slice(0, 10);
      }));
      rows = rows.filter(r => priorYearWeeks.has(r.week));
    }
    // Aggregate by week
    const byWeek = {};
    rows.forEach(r => { byWeek[r.week] = (byWeek[r.week] || 0) + r.unitsSold; });
    return Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, units]) => ({ week, units }));
  }

  function forecastSKU(skuCode, method, window, weeks, seasonality) {
    const series = getWindowedSales(skuCode, window);
    if (!series.length) return { weeklyRate: 0, forecastUnits: 0, trend: 0, note: "no data" };

    let weeklyRate = 0;
    let trend = 0;
    let note = "";

    if (method === "simple") {
      weeklyRate = series.reduce((s, r) => s + r.units, 0) / series.length;
      note = `avg of ${series.length} wk${series.length !== 1 ? "s" : ""}`;

    } else if (method === "weighted") {
      // Exponential weights: most recent week gets highest weight (decay = 0.85)
      const decay = 0.85;
      let weightSum = 0, valSum = 0;
      series.forEach((r, i) => {
        const w = Math.pow(decay, series.length - 1 - i);
        valSum += r.units * w;
        weightSum += w;
      });
      weeklyRate = weightSum > 0 ? valSum / weightSum : 0;
      note = `weighted avg, ${series.length} wks`;

    } else if (method === "trend") {
      // Ordinary least-squares linear regression over weeks
      const n = series.length;
      if (n < 2) {
        weeklyRate = series[0]?.units || 0;
        note = "not enough data for trend";
      } else {
        const xs = series.map((_, i) => i);
        const ys = series.map(r => r.units);
        const sumX = xs.reduce((a, b) => a + b, 0);
        const sumY = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
        const sumX2 = xs.reduce((s, x) => s + x * x, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        // Project the average weekly rate over next `weeks` periods
        trend = +slope.toFixed(2);
        const futureRates = Array.from({ length: weeks }, (_, i) => Math.max(0, intercept + slope * (n + i)));
        weeklyRate = futureRates.reduce((a, b) => a + b, 0) / weeks;
        note = `trend ${slope >= 0 ? "+" : ""}${slope.toFixed(2)} units/wk`;
      }

    } else if (method === "seasonality") {
      // Weighted base rate × average seasonality multiplier for forecast months
      const decay = 0.85;
      let weightSum = 0, valSum = 0;
      series.forEach((r, i) => {
        const w = Math.pow(decay, series.length - 1 - i);
        valSum += r.units * w;
        weightSum += w;
      });
      const baseRate = weightSum > 0 ? valSum / weightSum : 0;
      // Average the multipliers for the months covered by the forecast window
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const today = new Date();
      let multiplierSum = 0;
      for (let i = 0; i < weeks; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i * 7);
        multiplierSum += (seasonality[monthNames[d.getMonth()]] || 1);
      }
      const avgMultiplier = multiplierSum / weeks;
      weeklyRate = baseRate * avgMultiplier;
      note = `seasonal adj ×${avgMultiplier.toFixed(2)}`;
    }

    const forecastUnits = Math.max(0, Math.round(weeklyRate * weeks));
    return { weeklyRate: +weeklyRate.toFixed(2), forecastUnits, trend, note, seriesLength: series.length };
  }

  function buildForecastRows() {
    return inventory
      .filter(item => !fcSearchTerm || item.sku.toLowerCase().includes(fcSearchTerm.toLowerCase()) || item.name.toLowerCase().includes(fcSearchTerm.toLowerCase()))
      .map(item => {
        const fc = forecastSKU(item.sku, fcMethod, fcWindow, fcWeeks, fcSeasonality);
        const suggestedOrder = Math.max(0, fc.forecastUnits - item.currentStock);
        // Round up to nearest reorder qty increment
        const roundedOrder = item.reorderQty > 0
          ? Math.ceil(suggestedOrder / item.reorderQty) * item.reorderQty
          : suggestedOrder;
        return { ...item, ...fc, suggestedOrder, roundedOrder };
      })
      .sort((a, b) => b.roundedOrder - a.roundedOrder);
  }

  function createPOFromForecast() {
    const rows = buildForecastRows().filter(r => r.roundedOrder > 0);
    if (!rows.length) return;
    const po = {
      id: Date.now().toString(),
      poNumber: generatePONumber(purchaseOrders),
      supplier: fcSupplier || "TBD",
      status: "draft",
      createdAt: new Date().toISOString().slice(0, 10),
      notes: `Auto-generated from forecast: ${fcMethod} method, ${fcWeeks}-week horizon, ${fcWindow === "yoy" ? "YoY" : "all history"} data`,
      lines: rows.map(r => ({
        skuId: r.id, sku: r.sku, name: r.name,
        qty: r.roundedOrder,
        costPerUnit: r.avgCost || 0,
        received: 0,
      })),
    };
    const updated = [...purchaseOrders, po];
    setPurchaseOrders(updated); savePOs(updated);
    setFcCreatedMsg(po.poNumber);
  }
  // ── END FORECAST ENGINE ───────────────────────────────────────────────────

  // ── REPLENISHMENT HELPERS ─────────────────────────────────────────────────
  function weeksOfStockFor(item) {
    const vel = velocityFor(item.sku);
    return vel > 0 ? item.currentStock / vel : Infinity;
  }

  function urgencyFor(item) {
    const st = statusFor(item);
    if (st === "out") return "critical";
    if (st === "low") return "low";
    // "watch": OK stock but fewer than 4 weeks of runway
    if (weeksOfStockFor(item) < 4) return "watch";
    return "ok";
  }

  // SKUs that need attention: critical, low, or watch
  function getReplRows() {
    return inventory
      .map(item => {
        const vel = velocityFor(item.sku);
        const wks = weeksOfStockFor(item);
        const urg = urgencyFor(item);
        // Default suggested qty = reorderQty, or if 0 then 4 weeks of stock
        const suggested = item.reorderQty > 0 ? item.reorderQty : Math.ceil(vel * 4) || 1;
        // Check if there's already an open PO for this SKU
        const openPOsForSku = purchaseOrders
          .filter(po => po.status !== "received")
          .filter(po => po.lines.some(l => l.skuId === item.id));
        return { ...item, vel, wks, urg, suggested, openPOsForSku };
      })
      .filter(item => item.urg !== "ok")
      .filter(item => replFilterUrgency === "all" || item.urg === replFilterUrgency)
      .filter(item => !replSearchTerm || item.sku.toLowerCase().includes(replSearchTerm.toLowerCase()) || item.name.toLowerCase().includes(replSearchTerm.toLowerCase()))
      .sort((a, b) => {
        const order = { critical: 0, low: 1, watch: 2 };
        return order[a.urg] - order[b.urg];
      });
  }

  function toggleReplItem(item, defaultQty) {
    setReplSelected(prev => {
      const next = { ...prev };
      if (next[item.id] !== undefined) {
        delete next[item.id];
      } else {
        next[item.id] = defaultQty;
      }
      return next;
    });
  }

  function selectAllRepl(rows) {
    const next = {};
    rows.forEach(r => { next[r.id] = r.suggested; });
    setReplSelected(next);
  }

  function createPOFromRepl() {
    const rows = getReplRows().filter(r => replSelected[r.id] !== undefined);
    if (!rows.length) return;
    const po = {
      id: Date.now().toString(),
      poNumber: generatePONumber(purchaseOrders),
      supplier: replSupplier || "TBD",
      status: "draft",
      createdAt: new Date().toISOString().slice(0, 10),
      notes: `Replenishment PO — ${rows.length} SKU${rows.length !== 1 ? "s" : ""} flagged for reorder`,
      lines: rows.map(r => ({
        skuId: r.id, sku: r.sku, name: r.name,
        qty: parseInt(replSelected[r.id]) || r.suggested,
        costPerUnit: r.avgCost || 0,
        received: 0,
      })),
    };
    const updated = [...purchaseOrders, po];
    setPurchaseOrders(updated); savePOs(updated);
    setReplCreatedMsg(po.poNumber);
    setReplSelected({});
    setReplSupplier("");
  }
  // ── END REPLENISHMENT ─────────────────────────────────────────────────────

  function exportCSV() {
    const csv = [["SKU","Name","Category","In Stock","Reorder At","Order Qty","Status","Velocity/wk","Avg Cost","On-Hand Value"],
      ...inventory.map(i => [i.sku,i.name,i.category,i.currentStock,i.reorderPoint,i.reorderQty,statusFor(i).toUpperCase(),velocityFor(i.sku),
        i.avgCost ? `$${i.avgCost.toFixed(2)}` : "—",
        i.avgCost ? `$${(i.currentStock * i.avgCost).toFixed(2)}` : "—"
      ])
    ].map(r=>r.join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv],{type:"text/csv"})), download: `inventory-${new Date().toISOString().slice(0,10)}.csv` });
    a.click();
  }

  const filteredInventory = inventory
    .filter(i => filterStatus === "all" || statusFor(i) === filterStatus)
    .filter(i => !searchTerm || i.sku.toLowerCase().includes(searchTerm.toLowerCase()) || i.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const filteredPOs = purchaseOrders
    .filter(p => poFilterStatus === "all" || p.status === poFilterStatus)
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  // ── STYLES ────────────────────────────────────────────────────────────────
  const C = { bg: "#f1f5f9", surface: "#ffffff", border: "#e2e8f0", muted: "#94a3b8", dim: "#64748b", text: "#0f172a", amber: "#990000", blue: "#2563eb", green: "#16a34a", orange: "#ea580c", red: "#dc2626", purple: "#7c3aed" };
  const s = {
    app: { background: C.bg, minHeight: "100vh", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text },
    header: { background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 32px", display: "flex", alignItems: "center", gap: 24, height: 64, position: "sticky", top: 0, zIndex: 50 },
    logo: { fontFamily: "'Space Mono',monospace", fontSize: 17, fontWeight: 700, color: C.amber, letterSpacing: 1, whiteSpace: "nowrap" },
    navBtn: (a) => ({ padding: "6px 14px", border: "none", background: a ? "#99000015" : "transparent", color: a ? C.amber : "#64748b", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, borderBottom: a ? `2px solid ${C.amber}` : "2px solid transparent", transition: "all 0.15s" }),
    main: { padding: "28px 32px", maxWidth: 1400, margin: "0 auto" },
    card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px" },
    statCard: (a) => ({ background: C.surface, border: `1px solid ${a}30`, borderRadius: 12, padding: "20px 24px", borderLeft: `3px solid ${a}` }),
    statL: { fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.dim, textTransform: "uppercase", marginBottom: 6 },
    statV: (a) => ({ fontSize: 34, fontWeight: 800, color: a, fontFamily: "'Space Mono',monospace", lineHeight: 1 }),
    statS: { fontSize: 11, color: C.muted, marginTop: 5 },
    secTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: C.dim, textTransform: "uppercase", marginBottom: 14 },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` },
    td: { padding: "11px 12px", fontSize: 13, borderBottom: `1px solid #e2e8f0`, verticalAlign: "middle" },
    inp: { background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "7px 10px", fontSize: 13, fontFamily: "monospace" },
    inpFull: { background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
    sel: { background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
    btn: (v) => ({ padding: v==="primary"?"10px 18px":"6px 13px", background: v==="primary"?C.amber:v==="danger"?"#fee2e2":v==="blue"?"#dbeafe":C.border, color: v==="primary"?"#fff":v==="danger"?C.red:v==="blue"?C.blue:"#64748b", border:"none", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit", letterSpacing:0.5, transition:"all 0.15s", whiteSpace:"nowrap" }),
    badge: (st) => ({ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 8px", borderRadius:4, fontSize:10, fontWeight:700, letterSpacing:1, background:STATUS_STYLES[st].bg, color:STATUS_STYLES[st].color }),
    poBadge: (st) => ({ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:4, fontSize:10, fontWeight:700, letterSpacing:1, background:PO_STATUS[st]?.bg||C.border, color:PO_STATUS[st]?.color||"#94a3b8" }),
    alertRow: (st) => ({ background:STATUS_STYLES[st].bg+"44", border:`1px solid ${STATUS_STYLES[st].dot}30`, borderRadius:8, padding:"12px 16px", marginBottom:8, display:"flex", alignItems:"center", justifyContent:"space-between" }),
    mono: { fontFamily: "'Space Mono',monospace" },
    lbl: { fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
    fg: { display: "flex", flexDirection: "column", gap: 3 },
    overlay: { position:"fixed", inset:0, background:"#000000cc", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
    modal: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:32, width:420, boxShadow:"0 25px 60px #0000001a" },
  };
// Password screen
  if (!authed) return (
    <div style={{background:"#f1f5f9",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:16,padding:"48px 40px",width:360,textAlign:"center",boxShadow:"0 4px 24px #0000000a"}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:"#990000",marginBottom:8}}>⬡ STOCKBASE</div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:32}}>Enter your team password to continue</div>
        <input
          type="password"
          placeholder="Password"
          value={passwordInput}
          onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
          onKeyDown={async e => { if (e.key === "Enter") { const ok = await checkPassword(passwordInput); if (ok) { storedPassword.current = passwordInput; sessionStorage.setItem("sb_pw", passwordInput); setAuthed(true); loadData(); } else { setPasswordError(true); } } }}
          style={{width:"100%",boxSizing:"border-box",background:"#f8fafc",border:`1px solid ${passwordError?"#dc2626":"#e2e8f0"}`,color:"#0f172a",borderRadius:8,padding:"11px 14px",fontSize:14,fontFamily:"inherit",marginBottom:12,outline:"none"}}
          autoFocus
        />
        {passwordError && <div style={{color:"#dc2626",fontSize:12,marginBottom:12}}>Incorrect password — try again</div>}
        <button
          style={{width:"100%",padding:"11px",background:"#990000",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
          onClick={async () => { const ok = await checkPassword(passwordInput); if (ok) { storedPassword.current = passwordInput; sessionStorage.setItem("sb_pw", passwordInput); setAuthed(true); loadData(); } else { setPasswordError(true); } }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
  if (loading) return <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:C.amber,fontFamily:"monospace",fontSize:18,letterSpacing:4}}>LOADING...</div></div>;

  return (
    <div style={s.app}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <header style={s.header}>
        <div style={s.logo}>⬡ STOCKBASE</div>
        <nav style={{ display:"flex", gap:4 }}>
          {[["dashboard","Dashboard"],["inventory","Inventory"],["replenishment","Replenishment"],["po","Purchase Orders"],["forecast","Forecast"],["upload","Upload CSV"],["reports","Reports"]].map(([id,label]) => (
            <button key={id} style={s.navBtn(tab===id)} onClick={() => { setTab(id); if(id==="po") setPoView("list"); }}>{label}</button>
          ))}
        </nav>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          {alerts.length > 0 && <div style={{ background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:6, padding:"4px 12px", fontSize:11, color:C.red, fontWeight:700, cursor:"pointer" }} onClick={() => setTab("replenishment")}>⚠ {alerts.length} ALERT{alerts.length!==1?"S":""}</div>}
          <button style={s.btn("secondary")} onClick={exportCSV}>↓ Export</button>
        </div>
      </header>

      <main style={s.main}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard" && <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:14 }}>
            {[["Total SKUs",inventory.length,C.amber,"active products"],["Total Units",totalUnits.toLocaleString(),C.blue,"on hand"],["Open POs",openPOs,C.purple,"in progress"]].map(([l,v,a,sub]) => (
              <div key={l} style={s.statCard(a)}><div style={s.statL}>{l}</div><div style={s.statV(a)}>{v}</div><div style={s.statS}>{sub}</div></div>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:22 }}>
            {[["Low Stock",lowCount,C.orange,"below reorder point"],["Out of Stock",outCount,C.red,"need reorder now"]].map(([l,v,a,sub]) => (
              <div key={l} style={s.statCard(a)}><div style={s.statL}>{l}</div><div style={s.statV(a)}>{v}</div><div style={s.statS}>{sub}</div></div>
            ))}
            {(()=>{
              const totalValue = inventory.reduce((s,i) => s + (i.avgCost||0) * i.currentStock, 0);
              const costed = inventory.filter(i => i.avgCost > 0).length;
              return <div style={s.statCard("#059669")}>
                <div style={s.statL}>Inventory Value</div>
                <div style={{...s.statV("#059669"),fontSize:costed>0?28:34}}>{costed>0?`$${totalValue.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—"}</div>
                <div style={s.statS}>{costed>0?`${costed} SKUs with cost data`:"receive POs to track cost"}</div>
              </div>;
            })()}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
            <div style={s.card}>
              <div style={s.secTitle}>⚠ Stock Alerts</div>
              {alerts.length===0 ? <div style={{color:C.green,fontSize:14,padding:"16px 0"}}>✓ All SKUs well-stocked</div>
                : alerts.sort((a,b)=>statusFor(a)==="out"?-1:1).map(item => {
                  const st=statusFor(item);
                  return <div key={item.id} style={s.alertRow(st)}>
                    <div><div style={{fontSize:11,fontFamily:"monospace",color:C.dim,marginBottom:2}}>{item.sku}</div><div style={{fontSize:13,fontWeight:600}}>{item.name}</div></div>
                    <div style={{textAlign:"right"}}><span style={s.badge(st)}>{STATUS_STYLES[st].label}</span><div style={{fontSize:12,color:C.dim,marginTop:4,fontFamily:"monospace"}}>{item.currentStock}/{item.reorderPoint} min</div></div>
                  </div>;
                })}
            </div>
            <div style={s.card}>
              <div style={s.secTitle}>🔥 Top Velocity SKUs</div>
              {[...inventory].map(i=>({...i,vel:velocityFor(i.sku)})).sort((a,b)=>b.vel-a.vel).slice(0,8).map((item,i) => (
                <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid #e2e8f0`}}>
                  <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",width:20}}>#{i+1}</div>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{item.name}</div><div style={{fontSize:11,color:C.dim,fontFamily:"monospace"}}>{item.sku}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:700,color:C.amber,fontFamily:"monospace"}}>{item.vel}</div><div style={{fontSize:10,color:C.muted}}>units/wk</div></div>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* ── INVENTORY ── */}
        {tab==="inventory" && <div style={s.card}>
          <div style={{display:"flex",gap:12,marginBottom:18,alignItems:"center",flexWrap:"wrap"}}>
            <div style={s.secTitle}>INVENTORY — {filteredInventory.length} SKUs</div>
            <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
              <input placeholder="Search..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{...s.inp,width:180,padding:"8px 12px"}} />
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{...s.inp,width:"auto"}}>
                <option value="all">All</option><option value="out">Out</option><option value="low">Low</option><option value="ok">OK</option>
              </select>
              <button style={s.btn("primary")} onClick={addSKU}>+ Add SKU</button>
            </div>
          </div>
          {addForm && (
            <div style={{background:"#f8fafc",border:`1px solid ${C.amber}40`,borderRadius:10,padding:18,marginBottom:14,display:"grid",gridTemplateColumns:"repeat(3,1fr) repeat(3,100px) auto",gap:8,alignItems:"end"}}>
              {[["sku","SKU"],["name","Name"],["category","Category"],["currentStock","Stock"],["reorderPoint","Reorder At"],["reorderQty","Order Qty"]].map(([f,l]) => (
                <div key={f}><div style={{...s.lbl,marginBottom:4}}>{l}</div><input style={{...s.inp,width:"100%",boxSizing:"border-box"}} value={addForm[f]} onChange={e=>setAddForm(a=>({...a,[f]:e.target.value}))} placeholder={l} /></div>
              ))}
              <div style={{display:"flex",gap:6,alignSelf:"flex-end"}}><button style={s.btn("primary")} onClick={addSKU}>Save</button><button style={s.btn("secondary")} onClick={()=>setAddForm(null)}>✕</button></div>
            </div>
          )}
          <div style={{overflowX:"auto"}}>
            <table style={s.table}>
              <thead><tr>{["SKU","Product","Category","In Stock","Reorder At","Order Qty","Velocity","Avg Cost","On-Hand Value","Status","Actions"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredInventory.map(item => {
                  const st=statusFor(item), vel=velocityFor(item.sku), ed=editingId===item.id;
                  const avgCost = item.avgCost || 0;
                  const onHandValue = avgCost * item.currentStock;
                  return <tr key={item.id}>
                    <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:"#94a3b8"}}>{item.sku}</td>
                    <td style={{...s.td,fontWeight:600}}>{item.name}</td>
                    <td style={{...s.td,fontSize:12,color:C.dim}}>{item.category}</td>
                    <td style={s.td}>{ed?<input style={{...s.inp,width:70}} value={editValues.currentStock} onChange={e=>setEditValues(v=>({...v,currentStock:e.target.value}))} />:<span style={{fontFamily:"monospace",fontSize:15,fontWeight:700,color:st==="out"?C.red:st==="low"?C.orange:C.text}}>{item.currentStock}</span>}</td>
                    <td style={s.td}>{ed?<input style={{...s.inp,width:70}} value={editValues.reorderPoint} onChange={e=>setEditValues(v=>({...v,reorderPoint:e.target.value}))} />:<span style={s.mono}>{item.reorderPoint}</span>}</td>
                    <td style={s.td}>{ed?<input style={{...s.inp,width:70}} value={editValues.reorderQty} onChange={e=>setEditValues(v=>({...v,reorderQty:e.target.value}))} />:<span style={s.mono}>{item.reorderQty}</span>}</td>
                    <td style={{...s.td,fontFamily:"monospace",color:C.amber}}>{vel>0?`${vel}/wk`:"—"}</td>
                    <td style={{...s.td,fontFamily:"monospace",color:avgCost>0?"#059669":C.muted}}>{avgCost>0?`$${avgCost.toFixed(2)}`:"—"}</td>
                    <td style={{...s.td,fontFamily:"monospace",color:onHandValue>0?C.text:C.muted}}>{onHandValue>0?`$${onHandValue.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—"}</td>
                    <td style={s.td}><span style={s.badge(st)}><span style={{width:5,height:5,borderRadius:"50%",background:STATUS_STYLES[st].dot,display:"inline-block"}} />{STATUS_STYLES[st].label}</span></td>
                    <td style={s.td}><div style={{display:"flex",gap:4}}>{ed?<><button style={s.btn("primary")} onClick={()=>saveEdit(item)}>✓</button><button style={s.btn("secondary")} onClick={()=>setEditingId(null)}>✕</button></>:<><button style={s.btn("secondary")} onClick={()=>startEdit(item)}>Edit</button><button style={s.btn("danger")} onClick={()=>deleteSKU(item.id)}>Del</button></>}</div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>}

        {/* ── REPLENISHMENT ── */}
        {tab==="replenishment" && (()=>{
          const replRows = getReplRows();
          const selectedCount = Object.keys(replSelected).length;
          const selectedTotal = Object.values(replSelected).reduce((s,q)=>s+(parseInt(q)||0),0);
          const critCount = replRows.filter(r=>r.urg==="critical").length;
          const lowCount2 = replRows.filter(r=>r.urg==="low").length;
          const watchCount = replRows.filter(r=>r.urg==="watch").length;

          const URG = {
            critical: { label:"CRITICAL",  color:"#dc2626", bg:"#fee2e2", border:"#fca5a5", dot:"#dc2626", desc:"Out of stock — no units available" },
            low:      { label:"LOW STOCK", color:"#ea580c", bg:"#fff7ed", border:"#fed7aa", dot:"#ea580c", desc:"Below reorder point" },
            watch:    { label:"WATCH",     color:"#ca8a04", bg:"#fefce8", border:"#fde68a", dot:"#ca8a04", desc:"Fewer than 4 weeks of runway at current velocity" },
          };

          return <>
            {/* Summary bar */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:18}}>
              <div style={s.statCard(C.red)}>
                <div style={s.statL}>Critical</div>
                <div style={s.statV(C.red)}>{critCount}</div>
                <div style={s.statS}>out of stock</div>
              </div>
              <div style={s.statCard(C.orange)}>
                <div style={s.statL}>Low Stock</div>
                <div style={s.statV(C.orange)}>{lowCount2}</div>
                <div style={s.statS}>below reorder point</div>
              </div>
              <div style={s.statCard("#ca8a04")}>
                <div style={s.statL}>Watch</div>
                <div style={s.statV("#ca8a04")}>{watchCount}</div>
                <div style={s.statS}>&lt;4 weeks runway</div>
              </div>
              <div style={s.statCard(C.purple)}>
                <div style={s.statL}>Selected</div>
                <div style={s.statV(C.purple)}>{selectedCount}</div>
                <div style={s.statS}>{selectedTotal} units to order</div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:18,alignItems:"start"}}>

              {/* Main table */}
              <div style={s.card}>
                {/* Toolbar */}
                <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={s.secTitle}>NEEDS REPLENISHMENT — {replRows.length} SKU{replRows.length!==1?"s":""}</div>
                  <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <input placeholder="Search..." value={replSearchTerm} onChange={e=>setReplSearchTerm(e.target.value)} style={{...s.inp,width:160,padding:"6px 10px"}} />
                    {/* Urgency filter pills */}
                    {[["all","All"],["critical","Critical"],["low","Low"],["watch","Watch"]].map(([v,l])=>(
                      <button key={v} onClick={()=>setReplFilterUrgency(v)} style={{...s.btn(replFilterUrgency===v?"primary":"secondary"),fontSize:11,padding:"5px 11px"}}>{l}</button>
                    ))}
                    <button style={{...s.btn("secondary"),fontSize:11}} onClick={()=>selectAllRepl(replRows)}>Select All</button>
                    <button style={{...s.btn("secondary"),fontSize:11}} onClick={()=>setReplSelected({})}>Clear</button>
                  </div>
                </div>

                {replRows.length === 0
                  ? <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
                      <div style={{fontSize:36,marginBottom:12}}>✓</div>
                      <div style={{fontSize:16,fontWeight:700,color:C.dim,marginBottom:6}}>All Clear</div>
                      <div style={{fontSize:13}}>No SKUs currently need replenishment.</div>
                    </div>
                  : <div style={{overflowX:"auto"}}>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            <th style={{...s.th,width:36}}></th>
                            <th style={s.th}>Urgency</th>
                            <th style={s.th}>SKU</th>
                            <th style={s.th}>Product</th>
                            <th style={s.th}>Category</th>
                            <th style={s.th}>In Stock</th>
                            <th style={s.th}>Reorder At</th>
                            <th style={s.th}>Velocity</th>
                            <th style={s.th}>Wks Left</th>
                            <th style={s.th}>Avg Cost</th>
                            <th style={s.th}>Open POs</th>
                            <th style={s.th}>Order Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {replRows.map(item=>{
                            const urg = URG[item.urg];
                            const checked = replSelected[item.id] !== undefined;
                            const wksDisplay = isFinite(item.wks) ? item.wks.toFixed(1) : "∞";
                            const wksColor = item.wks < 1 ? C.red : item.wks < 2 ? C.orange : item.wks < 4 ? "#ca8a04" : C.green;

                            return <tr key={item.id} style={{background:checked?"#7c3aed10":"transparent",transition:"background 0.15s"}}>
                              {/* Checkbox */}
                              <td style={{...s.td,textAlign:"center",paddingLeft:8,paddingRight:4}}>
                                <div
                                  onClick={()=>toggleReplItem(item, item.suggested)}
                                  style={{width:18,height:18,borderRadius:4,border:`2px solid ${checked?C.purple:C.border}`,background:checked?C.purple:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",margin:"0 auto"}}
                                >
                                  {checked && <span style={{color:C.bg,fontSize:11,fontWeight:900,lineHeight:1}}>✓</span>}
                                </div>
                              </td>
                              {/* Urgency badge */}
                              <td style={s.td}>
                                <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 8px",borderRadius:4,fontSize:10,fontWeight:700,letterSpacing:1,background:urg.bg,color:urg.color,border:`1px solid ${urg.border}`,whiteSpace:"nowrap"}}>
                                  <span style={{width:5,height:5,borderRadius:"50%",background:urg.dot,display:"inline-block"}}/>
                                  {urg.label}
                                </span>
                              </td>
                              <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:"#94a3b8"}}>{item.sku}</td>
                              <td style={{...s.td,fontWeight:600,maxWidth:180}}>{item.name}</td>
                              <td style={{...s.td,fontSize:12,color:C.dim}}>{item.category}</td>
                              {/* Stock vs reorder */}
                              <td style={s.td}>
                                <div style={{fontFamily:"monospace",fontWeight:800,fontSize:15,color:item.currentStock===0?C.red:C.orange}}>{item.currentStock}</div>
                                <div style={{width:60,height:4,background:C.border,borderRadius:99,marginTop:4,overflow:"hidden"}}>
                                  <div style={{width:`${Math.min(100,(item.currentStock/Math.max(1,item.reorderPoint))*100)}%`,height:"100%",background:item.currentStock===0?C.red:C.orange,borderRadius:99}}/>
                                </div>
                              </td>
                              <td style={{...s.td,fontFamily:"monospace",color:C.muted}}>{item.reorderPoint}</td>
                              <td style={{...s.td,fontFamily:"monospace",color:C.amber}}>{item.vel>0?`${item.vel}/wk`:"—"}</td>
                              {/* Weeks left */}
                              <td style={s.td}>
                                <span style={{fontFamily:"monospace",fontWeight:700,color:wksColor}}>{wksDisplay}</span>
                                <span style={{fontSize:10,color:C.muted,marginLeft:3}}>wks</span>
                              </td>
                              <td style={{...s.td,fontFamily:"monospace",color:item.avgCost>0?"#059669":C.muted,fontSize:12}}>{item.avgCost>0?`$${item.avgCost.toFixed(2)}`:"—"}</td>
                              {/* Open POs column */}
                              <td style={s.td}>
                                {item.openPOsForSku.length>0
                                  ?<div style={{display:"flex",flexDirection:"column",gap:3}}>
                                      {item.openPOsForSku.map(po=>(
                                        <span key={po.id} onClick={()=>{setActivePO(po);setPoView("detail");setTab("po");}} style={{fontSize:10,fontFamily:"monospace",color:C.blue,cursor:"pointer",textDecoration:"underline"}}>{po.poNumber}</span>
                                      ))}
                                    </div>
                                  :<span style={{fontSize:11,color:C.muted}}>None</span>}
                              </td>
                              {/* Editable qty */}
                              <td style={s.td}>
                                {checked
                                  ?<div style={{display:"flex",alignItems:"center",gap:6}}>
                                      <input
                                        type="number" min="1"
                                        value={replSelected[item.id]}
                                        onChange={e=>setReplSelected(prev=>({...prev,[item.id]:e.target.value}))}
                                        style={{...s.inp,width:72,padding:"5px 8px",fontSize:13,fontWeight:700,color:C.purple,border:`1px solid ${C.purple}50`}}
                                      />
                                      <button
                                        onClick={()=>setReplSelected(prev=>({...prev,[item.id]:item.suggested}))}
                                        title="Reset to suggested qty"
                                        style={{...s.btn("secondary"),padding:"4px 7px",fontSize:10,color:C.dim}}
                                      >↺</button>
                                    </div>
                                  :<div style={{display:"flex",alignItems:"center",gap:6}}>
                                      <span style={{fontFamily:"monospace",color:C.muted,fontSize:13}}>{item.suggested}</span>
                                      <button
                                        onClick={()=>toggleReplItem(item,item.suggested)}
                                        style={{...s.btn("secondary"),padding:"4px 9px",fontSize:11,color:C.purple,border:`1px solid ${C.purple}40`}}
                                      >+ Add</button>
                                    </div>}
                              </td>
                            </tr>;
                          })}
                        </tbody>
                      </table>
                    </div>
                }
              </div>

              {/* Right sidebar — PO builder */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>

                {/* Legend */}
                <div style={s.card}>
                  <div style={s.secTitle}>Urgency Guide</div>
                  {Object.entries(URG).map(([key,urg])=>(
                    <div key={key} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 7px",borderRadius:4,fontSize:9,fontWeight:700,letterSpacing:1,background:urg.bg,color:urg.color,border:`1px solid ${urg.border}`,whiteSpace:"nowrap",flexShrink:0,marginTop:1}}>
                        <span style={{width:4,height:4,borderRadius:"50%",background:urg.dot,display:"inline-block"}}/>
                        {urg.label}
                      </span>
                      <span style={{fontSize:11,color:C.dim,lineHeight:1.5}}>{urg.desc}</span>
                    </div>
                  ))}
                </div>

                {/* PO builder */}
                <div style={{...s.card,border:selectedCount>0?`1px solid ${C.purple}40`:undefined}}>
                  <div style={s.secTitle}>Create Purchase Order</div>

                  {selectedCount === 0
                    ? <div style={{textAlign:"center",padding:"24px 0",color:C.muted}}>
                        <div style={{fontSize:28,marginBottom:8}}>☐</div>
                        <div style={{fontSize:12}}>Select SKUs from the table to build a PO</div>
                      </div>
                    : <>
                        {/* Selected SKUs preview */}
                        <div style={{maxHeight:280,overflowY:"auto",marginBottom:14}}>
                          {getReplRows().filter(r=>replSelected[r.id]!==undefined).map(r=>{
                            const qty = parseInt(replSelected[r.id])||0;
                            const lineTotal = qty * (r.avgCost||0);
                            return <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`,gap:8}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:11,fontFamily:"monospace",color:C.dim}}>{r.sku}</div>
                                <div style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.name}</div>
                              </div>
                              <div style={{textAlign:"right",flexShrink:0}}>
                                <div style={{fontFamily:"monospace",fontWeight:700,color:C.purple}}>{qty} units</div>
                                {lineTotal>0&&<div style={{fontSize:10,color:C.dim,fontFamily:"monospace"}}>${lineTotal.toFixed(2)}</div>}
                              </div>
                              <button onClick={()=>{const n={...replSelected};delete n[r.id];setReplSelected(n);}} style={{...s.btn("danger"),padding:"3px 7px",fontSize:11,flexShrink:0}}>✕</button>
                            </div>;
                          })}
                        </div>

                        {/* Totals */}
                        {(()=>{
                          const rows = getReplRows().filter(r=>replSelected[r.id]!==undefined);
                          const totalQty = rows.reduce((s,r)=>s+(parseInt(replSelected[r.id])||0),0);
                          const totalCost = rows.reduce((s,r)=>s+(parseInt(replSelected[r.id])||0)*(r.avgCost||0),0);
                          return <div style={{background:"#f8fafc",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                              <span style={{fontSize:11,color:C.dim}}>SKUs selected</span>
                              <span style={{fontFamily:"monospace",fontWeight:700,color:C.purple}}>{selectedCount}</span>
                            </div>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                              <span style={{fontSize:11,color:C.dim}}>Total units</span>
                              <span style={{fontFamily:"monospace",fontWeight:700}}>{totalQty}</span>
                            </div>
                            {totalCost>0&&<div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:2}}>
                              <span style={{fontSize:11,color:C.dim}}>Est. PO value</span>
                              <span style={{fontFamily:"monospace",fontWeight:800,color:"#059669"}}>${totalCost.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                            </div>}
                          </div>;
                        })()}

                        <div style={{...s.fg,marginBottom:12}}>
                          <div style={s.lbl}>Supplier (optional)</div>
                          <input style={s.inpFull} placeholder="e.g. Acme Wholesale" value={replSupplier} onChange={e=>setReplSupplier(e.target.value)} />
                        </div>
                        <button
                          style={{...s.btn("primary"),width:"100%",padding:"12px",fontSize:13}}
                          onClick={createPOFromRepl}
                        >
                          📋 Create Draft PO ({selectedCount} SKU{selectedCount!==1?"s":""})
                        </button>
                      </>
                  }

                  {replCreatedMsg && (
                    <div style={{marginTop:12,padding:"10px 12px",background:"#dcfce7",border:"1px solid #166534",borderRadius:8,fontSize:12,color:"#16a34a",fontWeight:600}}>
                      ✓ {replCreatedMsg} created —{" "}
                      <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>{setTab("po");setPoView("list");setReplCreatedMsg(null);}}>
                        view in Purchase Orders →
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick tips */}
                <div style={{...s.card,fontSize:11,color:C.dim,lineHeight:1.8}}>
                  <div style={s.secTitle}>Tips</div>
                  <div>• Click <strong style={{color:C.text}}>+ Add</strong> to include a SKU, or <strong style={{color:C.text}}>Select All</strong> to grab everything at once</div>
                  <div style={{marginTop:4}}>• Edit the quantity field directly after selecting</div>
                  <div style={{marginTop:4}}>• <strong style={{color:C.text}}>↺</strong> resets qty back to the suggested reorder amount</div>
                  <div style={{marginTop:4}}>• Suggested qty = the SKU's configured reorder quantity</div>
                  <div style={{marginTop:4}}>• Clicking a PO number in the Open POs column jumps to that PO detail</div>
                  <div style={{marginTop:4}}>• Est. PO value uses weighted avg cost — update costs via received POs</div>
                </div>
              </div>
            </div>
          </>;
        })()}

        {/* ── PURCHASE ORDERS ── */}
        {tab==="po" && <>
          {/* LIST */}
          {poView==="list" && <div style={s.card}>
            <div style={{display:"flex",alignItems:"center",marginBottom:18,gap:12,flexWrap:"wrap"}}>
              <div style={s.secTitle}>PURCHASE ORDERS — {filteredPOs.length}</div>
              <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                <select value={poFilterStatus} onChange={e=>setPoFilterStatus(e.target.value)} style={{...s.inp,width:"auto",padding:"8px 12px"}}>
                  <option value="all">All Status</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partial">Partial</option><option value="received">Received</option>
                </select>
                <button style={s.btn("primary")} onClick={initNewPO}>+ New PO</button>
              </div>
            </div>
            {filteredPOs.length===0
              ? <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
                  <div style={{fontSize:32,marginBottom:12}}>📋</div>
                  <div style={{fontSize:15,fontWeight:600,color:C.dim,marginBottom:8}}>No Purchase Orders Yet</div>
                  <div style={{fontSize:13,marginBottom:20}}>Create your first PO to track supplier orders.</div>
                  <button style={s.btn("primary")} onClick={initNewPO}>+ Create Purchase Order</button>
                </div>
              : <table style={s.table}>
                  <thead><tr>{["PO #","Supplier","Date","Lines","Total Cost","Status",""].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredPOs.map(po => {
                      const total=po.lines.reduce((s,l)=>s+l.qty*l.costPerUnit,0);
                      const rec=po.lines.reduce((s,l)=>s+l.received,0), ord=po.lines.reduce((s,l)=>s+l.qty,0);
                      return <tr key={po.id} style={{cursor:"pointer"}} onClick={()=>{setActivePO(po);setPoView("detail");}}>
                        <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700}}>{po.poNumber}</td>
                        <td style={{...s.td,fontWeight:600}}>{po.supplier}</td>
                        <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:C.dim}}>{po.createdAt}</td>
                        <td style={{...s.td,fontFamily:"monospace"}}>{po.lines.length}</td>
                        <td style={{...s.td,fontFamily:"monospace"}}>${total.toFixed(2)}</td>
                        <td style={s.td}><div style={{display:"flex",flexDirection:"column",gap:3}}><span style={s.poBadge(po.status)}>{PO_STATUS[po.status]?.label}</span>{(po.status==="partial"||po.status==="received")&&<span style={{fontSize:10,color:C.muted,fontFamily:"monospace"}}>{rec}/{ord} units</span>}</div></td>
                        <td style={s.td} onClick={e=>e.stopPropagation()}><button style={s.btn("secondary")} onClick={()=>{setActivePO(po);setPoView("detail");}}>View →</button></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
            }
          </div>}

          {/* CREATE */}
          {poView==="create" && poForm && <div style={s.card}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
              <button style={{...s.btn("secondary"),fontSize:11}} onClick={()=>setPoView("list")}>← Back</button>
              <div style={s.secTitle}>NEW PURCHASE ORDER</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:22}}>
              <div style={s.fg}><div style={s.lbl}>PO Number</div><input style={s.inpFull} value={poForm.poNumber} onChange={e=>setPoForm(f=>({...f,poNumber:e.target.value}))} /></div>
              <div style={s.fg}><div style={s.lbl}>Supplier Name *</div><input style={s.inpFull} placeholder="e.g. Acme Wholesale" value={poForm.supplier} onChange={e=>setPoForm(f=>({...f,supplier:e.target.value}))} /></div>
              <div style={s.fg}><div style={s.lbl}>Status</div><select style={s.sel} value={poForm.status} onChange={e=>setPoForm(f=>({...f,status:e.target.value}))}><option value="draft">Draft</option><option value="sent">Sent to Supplier</option></select></div>
            </div>
            <div style={s.secTitle}>LINE ITEMS</div>
            <table style={{...s.table,marginBottom:10}}>
              <thead><tr>{["SKU / Product","Qty","Cost per Unit","Line Total",""].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {poForm.lines.map((line, idx) => {
                  const tot=(parseInt(line.qty)||0)*(parseFloat(line.costPerUnit)||0);
                  return <tr key={idx}>
                    <td style={s.td}><select style={{...s.sel,width:250}} value={line.skuId} onChange={e=>poLineUpdate(idx,"skuId",e.target.value)}><option value="">— Select SKU —</option>{inventory.map(i=><option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}</select></td>
                    <td style={s.td}><input style={{...s.inp,width:70}} type="number" min="1" value={line.qty} onChange={e=>poLineUpdate(idx,"qty",e.target.value)} placeholder="Qty" /></td>
                    <td style={s.td}><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{color:C.muted}}>$</span><input style={{...s.inp,width:80}} type="number" step="0.01" min="0" value={line.costPerUnit} onChange={e=>poLineUpdate(idx,"costPerUnit",e.target.value)} placeholder="0.00" /></div></td>
                    <td style={{...s.td,fontFamily:"monospace",color:tot>0?C.amber:C.muted}}>${tot.toFixed(2)}</td>
                    <td style={s.td}>{poForm.lines.length>1&&<button style={s.btn("danger")} onClick={()=>setPoForm(f=>({...f,lines:f.lines.filter((_,i)=>i!==idx)}))}>✕</button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
            <button style={{...s.btn("secondary"),marginBottom:22}} onClick={()=>setPoForm(f=>({...f,lines:[...f.lines,{skuId:"",qty:"",costPerUnit:""}]}))}>+ Add Line</button>
            <div style={{...s.fg,marginBottom:22}}><div style={s.lbl}>Notes (optional)</div><textarea style={{...s.inpFull,height:72,resize:"vertical",fontFamily:"inherit"}} value={poForm.notes} onChange={e=>setPoForm(f=>({...f,notes:e.target.value}))} placeholder="Any notes..." /></div>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:10,color:C.dim,letterSpacing:1,textTransform:"uppercase"}}>Grand Total</div><div style={{fontSize:28,fontWeight:800,fontFamily:"monospace",color:C.amber}}>${poForm.lines.reduce((s,l)=>(s+(parseInt(l.qty)||0)*(parseFloat(l.costPerUnit)||0)),0).toFixed(2)}</div></div>
              <div style={{display:"flex",gap:10}}><button style={s.btn("secondary")} onClick={()=>setPoView("list")}>Cancel</button><button style={s.btn("primary")} onClick={savePO}>Save Purchase Order</button></div>
            </div>
          </div>}

          {/* DETAIL */}
          {poView==="detail" && activePO && (()=>{
            const po = purchaseOrders.find(p=>p.id===activePO.id) || activePO;
            const totalCost=po.lines.reduce((s,l)=>s+l.qty*l.costPerUnit,0);
            const ord=po.lines.reduce((s,l)=>s+l.qty,0), rec=po.lines.reduce((s,l)=>s+l.received,0);
            return <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,flexWrap:"wrap"}}>
                <button style={{...s.btn("secondary"),fontSize:11}} onClick={()=>setPoView("list")}>← All POs</button>
                <div style={{fontSize:20,fontWeight:800,fontFamily:"monospace",color:C.amber}}>{po.poNumber}</div>
                <span style={s.poBadge(po.status)}>{PO_STATUS[po.status]?.label}</span>
                <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
                  {po.status==="draft"&&<button style={s.btn("blue")} onClick={()=>updatePOStatus(po,"sent")}>Mark as Sent →</button>}
                  {po.status==="sent"&&<button style={s.btn("secondary")} onClick={()=>updatePOStatus(po,"draft")}>← Revert to Draft</button>}
                  <button style={s.btn("danger")} onClick={()=>deletePO(po.id)}>Delete PO</button>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
                <div style={s.card}>
                  <div style={s.secTitle}>PO Details</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    {[["Supplier",po.supplier],["Created",po.createdAt],["SKU Lines",po.lines.length],["Grand Total",`$${totalCost.toFixed(2)}`]].map(([k,v])=>(
                      <div key={k}><div style={{fontSize:10,color:C.dim,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>{k}</div><div style={{fontSize:14,fontWeight:700,fontFamily:["SKU Lines","Grand Total"].includes(k)?"monospace":"inherit",color:k==="Grand Total"?C.amber:C.text}}>{v}</div></div>
                    ))}
                  </div>
                  {po.notes&&<div style={{marginTop:14,padding:"10px 14px",background:"#f8fafc",borderRadius:8,fontSize:13,color:"#94a3b8",borderLeft:`2px solid ${C.border}`}}>{po.notes}</div>}
                </div>
                <div style={s.card}>
                  <div style={s.secTitle}>Receiving Progress</div>
                  <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:10}}>
                    <div style={{flex:1,height:10,background:C.border,borderRadius:99,overflow:"hidden"}}>
                      <div style={{width:`${ord?(rec/ord*100):0}%`,height:"100%",background:rec>=ord?C.green:C.orange,borderRadius:99,transition:"width 0.4s"}} />
                    </div>
                    <div style={{fontFamily:"monospace",fontSize:14,whiteSpace:"nowrap"}}>{rec} / {ord} units</div>
                  </div>
                  {po.status==="received"
                    ?<div style={{color:C.green,fontSize:13,fontWeight:600}}>✓ Fully received — stock updated</div>
                    :<div style={{color:"#94a3b8",fontSize:13}}>Use "Receive" on line items below to log incoming stock. Inventory updates automatically.</div>}
                </div>
              </div>
              <div style={s.card}>
                <div style={s.secTitle}>Line Items</div>
                <table style={s.table}>
                  <thead><tr>{["SKU","Product","Ordered","Cost/Unit","Line Total","Received","Remaining",""].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {po.lines.map((line,idx)=>{
                      const rem=line.qty-line.received, done=rem===0;
                      return <tr key={idx}>
                        <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:"#94a3b8"}}>{line.sku}</td>
                        <td style={{...s.td,fontWeight:600}}>{line.name}</td>
                        <td style={{...s.td,fontFamily:"monospace"}}>{line.qty}</td>
                        <td style={{...s.td,fontFamily:"monospace"}}>${line.costPerUnit.toFixed(2)}</td>
                        <td style={{...s.td,fontFamily:"monospace",color:C.amber}}>${(line.qty*line.costPerUnit).toFixed(2)}</td>
                        <td style={{...s.td,fontFamily:"monospace",color:line.received>0?C.green:C.muted}}>{line.received}</td>
                        <td style={{...s.td,fontFamily:"monospace",color:rem>0?C.orange:C.muted}}>{rem}</td>
                        <td style={s.td}>{done?<span style={{fontSize:11,color:C.green,fontWeight:700}}>✓ DONE</span>:<button style={s.btn("blue")} onClick={()=>openReceive(po,idx)}>Receive</button>}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </>;
          })()}
        </>}

        {/* ── FORECAST ── */}
        {tab==="forecast" && (()=>{
          const fcRows = buildForecastRows();
          const totalForecastUnits = fcRows.reduce((s,r)=>s+r.forecastUnits,0);
          const totalSuggestedOrder = fcRows.reduce((s,r)=>s+r.roundedOrder,0);
          const skusNeedingOrder = fcRows.filter(r=>r.roundedOrder>0).length;
          const methodLabels = { simple:"Simple Average", weighted:"Weighted Recent", trend:"Trend-Adjusted", seasonality:"Seasonality Override" };
          const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

          return <>
            {/* Controls */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:14,marginBottom:18}}>
              {/* Method */}
              <div style={s.card}>
                <div style={s.secTitle}>Forecast Method</div>
                {[["simple","Simple Average","Avg weekly sales × forecast weeks"],["weighted","Weighted Recent","Recent weeks weighted 85% decay — reacts faster to change"],["trend","Trend-Adjusted","Linear regression — detects growth or decline slope"],["seasonality","Seasonality Override","Weighted base × your monthly peak multipliers"]].map(([id,label,desc])=>(
                  <div key={id} onClick={()=>setFcMethod(id)} style={{padding:"10px 12px",borderRadius:8,cursor:"pointer",marginBottom:6,background:fcMethod===id?"#99000018":C.bg,border:`1px solid ${fcMethod===id?C.amber:C.border}`,transition:"all 0.15s"}}>
                    <div style={{fontSize:12,fontWeight:700,color:fcMethod===id?C.amber:C.text,marginBottom:3}}>{label}</div>
                    <div style={{fontSize:10,color:C.dim,lineHeight:1.5}}>{desc}</div>
                  </div>
                ))}
              </div>

              {/* Data Window + Weeks */}
              <div style={s.card}>
                <div style={s.secTitle}>Data Window</div>
                {[["all","All Available History","Uses every week of sales data uploaded so far"],["yoy","Year over Year","Matches same calendar weeks from the prior year — great for seasonal businesses"]].map(([id,label,desc])=>(
                  <div key={id} onClick={()=>setFcWindow(id)} style={{padding:"10px 12px",borderRadius:8,cursor:"pointer",marginBottom:8,background:fcWindow===id?"#2563eb15":C.bg,border:`1px solid ${fcWindow===id?C.blue:C.border}`,transition:"all 0.15s"}}>
                    <div style={{fontSize:12,fontWeight:700,color:fcWindow===id?C.blue:C.text,marginBottom:3}}>{label}</div>
                    <div style={{fontSize:10,color:C.dim,lineHeight:1.5}}>{desc}</div>
                  </div>
                ))}
                <div style={{marginTop:16}}>
                  <div style={s.secTitle}>Forecast Horizon</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {[2,4,6,8,12,16,26].map(w=>(
                      <button key={w} onClick={()=>setFcWeeks(w)} style={{...s.btn(fcWeeks===w?"primary":"secondary"),padding:"6px 12px",fontSize:12}}>{w}w</button>
                    ))}
                  </div>
                  <div style={{fontSize:11,color:C.dim,marginTop:8}}>Forecasting <strong style={{color:C.text}}>{fcWeeks} weeks</strong> of demand ahead</div>
                </div>
              </div>

              {/* Seasonality panel */}
              <div style={{...s.card,opacity:fcMethod==="seasonality"?1:0.45,pointerEvents:fcMethod==="seasonality"?"auto":"none",transition:"opacity 0.2s"}}>
                <div style={s.secTitle}>Monthly Multipliers {fcMethod!=="seasonality"&&<span style={{color:C.muted,fontWeight:400,letterSpacing:0}}>(enable Seasonality method)</span>}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  {monthNames.map(m=>(
                    <div key={m}>
                      <div style={{fontSize:9,color:C.dim,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>{m}</div>
                      <input
                        type="number" step="0.05" min="0.1" max="5"
                        value={fcSeasonality[m]}
                        onChange={e=>setFcSeasonality(prev=>({...prev,[m]:parseFloat(e.target.value)||1}))}
                        style={{...s.inp,width:"100%",boxSizing:"border-box",fontSize:12,padding:"5px 6px",color:fcSeasonality[m]>1?C.orange:fcSeasonality[m]<1?"#2563eb":C.text}}
                      />
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:C.dim,marginTop:8}}>1.0 = baseline · 1.5 = 50% above · 0.8 = 20% below</div>
              </div>

              {/* Summary + PO creation */}
              <div style={s.card}>
                <div style={s.secTitle}>Forecast Summary</div>
                <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
                  {[["Method",methodLabels[fcMethod],C.amber],["Window",fcWindow==="yoy"?"Year over Year":"All History",C.blue],["Horizon",`${fcWeeks} weeks`,C.text],["Total Demand",`${totalForecastUnits.toLocaleString()} units`,"#059669"],["SKUs to Order",`${skusNeedingOrder} of ${fcRows.length}`,C.orange],["Total to Order",`${totalSuggestedOrder.toLocaleString()} units`,C.purple]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:11,color:C.dim}}>{l}</span>
                      <span style={{fontSize:12,fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={s.secTitle}>Create Draft PO</div>
                <div style={s.fg}>
                  <div style={s.lbl}>Supplier Name (optional)</div>
                  <input style={s.inpFull} placeholder="e.g. Acme Wholesale" value={fcSupplier} onChange={e=>setFcSupplier(e.target.value)} />
                </div>
                <button
                  style={{...s.btn("primary"),width:"100%",marginTop:10,padding:"10px",opacity:skusNeedingOrder===0?0.4:1}}
                  disabled={skusNeedingOrder===0}
                  onClick={()=>{createPOFromForecast();}}
                >
                  📋 Create PO from Forecast ({skusNeedingOrder} SKUs)
                </button>
                {fcCreatedMsg&&<div style={{marginTop:10,padding:"10px 12px",background:"#dcfce7",border:"1px solid #166534",borderRadius:8,fontSize:12,color:"#16a34a",fontWeight:600}}>
                  ✓ {fcCreatedMsg} created as Draft — <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>{setTab("po");setPoView("list");setFcCreatedMsg(null);}}>view in Purchase Orders →</span>
                </div>}
              </div>
            </div>

            {/* Results table */}
            <div style={s.card}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
                <div style={s.secTitle}>Forecast Results — {fcRows.length} SKUs</div>
                <input placeholder="Filter SKU or name..." value={fcSearchTerm} onChange={e=>setFcSearchTerm(e.target.value)} style={{...s.inp,width:200,padding:"7px 12px",marginLeft:"auto"}} />
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {["SKU","Product","Current Stock","Avg/Wk","Forecast Demand","Covers Stock?","Suggested Order","Rounded to Reorder Qty","Confidence"].map(h=><th key={h} style={s.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {fcRows.map(item=>{
                      const weeksOfStock = item.weeklyRate>0 ? (item.currentStock/item.weeklyRate).toFixed(1) : "∞";
                      const covered = item.currentStock >= item.forecastUnits;
                      const confidence = item.seriesLength >= 8 ? "high" : item.seriesLength >= 4 ? "medium" : "low";
                      const confStyle = { high:{color:"#16a34a",bg:"#dcfce7"}, medium:{color:C.amber,bg:"#99000012"}, low:{color:C.red,bg:"#fee2e2"} }[confidence];
                      return <tr key={item.id}>
                        <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:"#94a3b8"}}>{item.sku}</td>
                        <td style={{...s.td,fontWeight:600,maxWidth:200}}>{item.name}</td>
                        <td style={{...s.td,fontFamily:"monospace",fontWeight:700,color:statusFor(item)==="out"?C.red:statusFor(item)==="low"?C.orange:C.text}}>{item.currentStock}</td>
                        <td style={{...s.td,fontFamily:"monospace",color:C.amber}}>
                          <div>{item.weeklyRate}/wk</div>
                          {item.trend!==0&&<div style={{fontSize:10,color:item.trend>0?"#16a34a":C.red}}>{item.trend>0?"↑":"↓"} {Math.abs(item.trend)}/wk trend</div>}
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{item.note}</div>
                        </td>
                        <td style={{...s.td,fontFamily:"monospace",fontWeight:700,fontSize:15}}>{item.forecastUnits}</td>
                        <td style={s.td}>
                          {covered
                            ?<span style={{fontSize:11,fontWeight:700,color:"#16a34a",background:"#dcfce7",padding:"3px 8px",borderRadius:4}}>✓ {weeksOfStock} wks</span>
                            :<span style={{fontSize:11,fontWeight:700,color:C.red,background:"#fee2e2",padding:"3px 8px",borderRadius:4}}>⚠ Short {item.forecastUnits-item.currentStock} units</span>}
                        </td>
                        <td style={{...s.td,fontFamily:"monospace",fontWeight:700,color:item.suggestedOrder>0?C.orange:C.muted}}>{item.suggestedOrder>0?item.suggestedOrder:"—"}</td>
                        <td style={{...s.td,fontFamily:"monospace",fontWeight:800,fontSize:15,color:item.roundedOrder>0?C.purple:C.muted}}>
                          {item.roundedOrder>0?item.roundedOrder:"—"}
                          {item.roundedOrder>0&&item.reorderQty>0&&<div style={{fontSize:10,color:C.dim,fontWeight:400}}>{Math.ceil(item.suggestedOrder/item.reorderQty)} × {item.reorderQty} units</div>}
                        </td>
                        <td style={s.td}>
                          <span style={{fontSize:10,fontWeight:700,letterSpacing:1,color:confStyle.color,background:confStyle.bg,padding:"3px 7px",borderRadius:4,textTransform:"uppercase"}}>{confidence}</span>
                          <div style={{fontSize:10,color:C.muted,marginTop:3}}>{item.seriesLength} wk{item.seriesLength!==1?"s":""} of data</div>
                        </td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{marginTop:12,padding:"10px 14px",background:"#f8fafc",borderRadius:8,fontSize:11,color:C.dim,lineHeight:1.7,borderLeft:`2px solid ${C.border}`}}>
                <strong style={{color:"#94a3b8"}}>Confidence</strong> is based on data volume: <strong style={{color:"#16a34a"}}>High</strong> = 8+ weeks · <strong style={{color:C.amber}}>Medium</strong> = 4–7 weeks · <strong style={{color:C.red}}>Low</strong> = fewer than 4 weeks. Upload more weekly sales CSVs to improve accuracy.
                {fcMethod==="trend"&&<span> · <strong style={{color:"#94a3b8"}}>Trend-Adjusted</strong> uses linear regression — the slope (↑/↓ per week) is shown under each SKU's rate.</span>}
                {fcMethod==="seasonality"&&<span> · <strong style={{color:"#94a3b8"}}>Seasonality</strong> multipliers apply to the months covered by your forecast window. Adjust multipliers in the panel to the left.</span>}
              </div>
            </div>
          </>;
        })()}

        {/* ── UPLOAD ── */}
        {tab==="upload" && (()=>{
          const allOrderIds = [...new Set(orders.map(o => o.orderId))];

          // Weekly order stats
          const ordersByWeek = {};
          orders.forEach(o => {
            if (!ordersByWeek[o.week]) ordersByWeek[o.week] = new Set();
            ordersByWeek[o.week].add(o.orderId);
          });
          const weeklyOrderCounts = Object.entries(ordersByWeek)
            .sort(([a],[b]) => b.localeCompare(a))
            .map(([week, ids]) => ({
              week,
              orders: ids.size,
              units: orders.filter(o => o.week === week).reduce((s,o) => s + o.qty, 0),
              lineItems: orders.filter(o => o.week === week).length,
            }));

          // SKU order frequency
          const skuOrderFreq = {};
          orders.forEach(o => {
            if (!skuOrderFreq[o.sku]) skuOrderFreq[o.sku] = { orderIds: new Set(), units: 0, lineItems: 0 };
            skuOrderFreq[o.sku].orderIds.add(o.orderId);
            skuOrderFreq[o.sku].units += o.qty;
            skuOrderFreq[o.sku].lineItems++;
          });
          const topSkusByFreq = Object.entries(skuOrderFreq)
            .map(([sku, d]) => ({ sku, orderCount: d.orderIds.size, units: d.units, lineItems: d.lineItems }))
            .sort((a, b) => b.orderCount - a.orderCount)
            .slice(0, 10);

          // Filtered order log
          const filteredOrderIds = allOrderIds.filter(id => {
            if (!orderLogSearch) return true;
            const lines2 = orders.filter(o => o.orderId === id);
            return id.toLowerCase().includes(orderLogSearch.toLowerCase()) ||
              lines2.some(l => l.sku.toLowerCase().includes(orderLogSearch.toLowerCase()) ||
                (l.skuName || "").toLowerCase().includes(orderLogSearch.toLowerCase()));
          }).sort((a, b) => {
            // Sort by import date desc
            const aDate = orders.find(o => o.orderId === a)?.importedAt || "";
            const bDate = orders.find(o => o.orderId === b)?.importedAt || "";
            return bDate.localeCompare(aDate);
          });

          const totalUnitsOrdered = orders.reduce((s, o) => s + o.qty, 0);
          const avgUnitsPerOrder = allOrderIds.length > 0
            ? (totalUnitsOrdered / allOrderIds.length).toFixed(1)
            : "—";

          return <>
            {/* Sub-tab nav */}
            <div style={{display:"flex",gap:2,marginBottom:22,background:C.surface,borderRadius:10,padding:4,border:`1px solid ${C.border}`,alignSelf:"flex-start",width:"fit-content"}}>
              {[["upload","📤 Upload"],["log","📋 Order Log"],["analytics","📊 Analytics"]].map(([id,label]) => (
                <button key={id} onClick={() => setUploadSubTab(id)} style={{
                  padding:"7px 18px", border:"none", borderRadius:7, cursor:"pointer",
                  fontFamily:"inherit", fontSize:13, fontWeight:600,
                  background: uploadSubTab===id ? C.amber : "transparent",
                  color: uploadSubTab===id ? "#fff" : "#64748b",
                  transition:"all 0.15s",
                }}>{label}{id==="log"&&allOrderIds.length>0&&<span style={{marginLeft:6,fontSize:10,background:uploadSubTab==="log"?"#ffffff40":"#e2e8f0",color:uploadSubTab==="log"?"#fff":C.dim,padding:"1px 6px",borderRadius:99}}>{allOrderIds.length}</span>}</button>
              ))}
            </div>

            {/* ── UPLOAD SUB-TAB ── */}
            {uploadSubTab==="upload" && <>
              {/* Step progress indicator */}
              <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:24}}>
                {[["1","Drop File",["idle"]],["2","Review & Validate",["preview"]],["3","Committed",["committed"]]].map(([num,label,activeStates],i) => {
                  const active = activeStates.includes(uploadStep);
                  const done = (num==="1"&&(uploadStep==="preview"||uploadStep==="committed")) || (num==="2"&&uploadStep==="committed");
                  return <div key={num} style={{display:"flex",alignItems:"center"}}>
                    {i > 0 && <div style={{width:48,height:2,background:done?C.amber:C.border,transition:"background 0.3s"}}/>}
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{
                        width:30,height:30,borderRadius:"50%",
                        background:done?C.amber:active?"#99000015":C.surface,
                        border:`2px solid ${done||active?C.amber:C.border}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:11,fontWeight:800,
                        color:done?C.bg:active?C.amber:C.muted,
                        transition:"all 0.3s",
                      }}>{done?"✓":num}</div>
                      <span style={{fontSize:12,fontWeight:600,color:done||active?C.text:C.muted}}>{label}</span>
                    </div>
                  </div>;
                })}
              </div>

              {/* STEP 1 — Drop */}
              {uploadStep==="idle" && <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:18}}>
                <div style={s.card}>
                  <div style={s.secTitle}>Drop Your Order Export</div>
                  <div
                    style={{border:`2px dashed ${C.border}`,borderRadius:12,padding:"52px 32px",textAlign:"center",cursor:"pointer",transition:"border-color 0.2s"}}
                    onClick={() => fileRef.current.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor=C.amber; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor=C.border; }}
                    onDrop={e => {
                      e.preventDefault(); e.currentTarget.style.borderColor=C.border;
                      const f = e.dataTransfer.files[0];
                      if (f) { const dt = new DataTransfer(); dt.items.add(f); fileRef.current.files = dt.files; parseOrderCSV({target:fileRef.current}); }
                    }}
                  >
                    <div style={{fontSize:48,marginBottom:14}}>📂</div>
                    <div style={{fontSize:16,fontWeight:700,color:"#94a3b8",marginBottom:8}}>Drop CSV here or click to browse</div>
                    <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>Your data is validated and previewed<br/>before anything touches inventory</div>
                    <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={parseOrderCSV} />
                  </div>
                  {uploadFeedback && (
                    <div style={{marginTop:14,padding:"13px 16px",borderRadius:8,background:"#fee2e2",border:"1px solid #fca5a5",color:C.red,fontSize:13,fontWeight:600,display:"flex",alignItems:"flex-start",gap:10}}>
                      <span>✕</span><span>{uploadFeedback.msg}</span>
                    </div>
                  )}
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  <div style={s.card}>
                    <div style={s.secTitle}>Required Format</div>
                    <div style={{background:"#f8fafc",borderRadius:8,padding:16,fontFamily:"monospace",fontSize:12,color:"#94a3b8",lineHeight:2,marginBottom:14}}>
                      <div style={{color:C.dim,marginBottom:2}}># Headers (column order flexible)</div>
               <div style={{color:C.amber}}>Order#,SKU,Quantity,OrderDate</div>
                    <div style={{color:C.green}}>ORD-1001,CHZ-001,2,2024/15/03</div>
                    <div style={{color:C.green}}>ORD-1001,CHZ-003,1,2024/15/03</div>
                    <div style={{color:C.green}}>ORD-1002,CHZ-001,1,2024/16/03</div>
                    <div style={{color:C.green}}>ORD-1002,CHZ-007,4,2024/16/03</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:7,fontSize:12,color:C.dim}}>
                      {["Each row = one line item from one order","Column names are flexible (OrderID, order_num etc.)","Orders with duplicate # are detected and skipped","Unknown SKUs flagged — valid rows still import","You review everything before inventory is touched"].map(tip => (
                        <div key={tip} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                          <span style={{color:C.amber,flexShrink:0,marginTop:1}}>✓</span>
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent imports summary */}
                  {weeklyOrderCounts.length > 0 && <div style={s.card}>
                    <div style={s.secTitle}>Recent Uploads</div>
                    {weeklyOrderCounts.slice(0, 4).map(({week, orders: cnt, units}) => (
                      <div key={week} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
                        <span style={{fontFamily:"monospace",color:C.dim}}>{week}</span>
                        <div style={{display:"flex",gap:14,textAlign:"right"}}>
                          <div><span style={{fontFamily:"monospace",fontWeight:700,color:C.blue}}>{cnt}</span><span style={{fontSize:10,color:C.muted,marginLeft:3}}>orders</span></div>
                          <div><span style={{fontFamily:"monospace",fontWeight:700,color:C.amber}}>{units}</span><span style={{fontSize:10,color:C.muted,marginLeft:3}}>units</span></div>
                        </div>
                      </div>
                    ))}
                  </div>}
                </div>
              </div>}

              {/* STEP 2 — Preview */}
              {uploadStep==="preview" && uploadPreview && (()=>{
                const { validLines, errorLines, dupLines, orderMap, fileName } = uploadPreview;
                const orderIds = Object.keys(orderMap);
                const previewUnits = validLines.reduce((s,l) => s+l.qty, 0);
                return <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {/* Summary cards */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
                    <div style={s.statCard("#2563eb")}>
                      <div style={s.statL}>File</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#2563eb",fontFamily:"monospace",wordBreak:"break-all",lineHeight:1.3,marginBottom:4}}>{fileName.length > 22 ? fileName.slice(0,22)+"…" : fileName}</div>
                      <div style={s.statS}>{validLines.length + errorLines.length + dupLines.length} rows parsed</div>
                    </div>
                    <div style={s.statCard("#059669")}>
                      <div style={s.statL}>Ready to Import</div>
                      <div style={s.statV("#059669")}>{orderIds.length}</div>
                      <div style={s.statS}>{validLines.length} line items · {previewUnits} units</div>
                    </div>
                    <div style={s.statCard(errorLines.length > 0 ? C.red : "#059669")}>
                      <div style={s.statL}>Errors</div>
                      <div style={s.statV(errorLines.length > 0 ? C.red : "#059669")}>{errorLines.length}</div>
                      <div style={s.statS}>{errorLines.length > 0 ? "Will be skipped" : "No issues"}</div>
                    </div>
                    <div style={s.statCard(dupLines.length > 0 ? C.orange : "#059669")}>
                      <div style={s.statL}>Duplicates</div>
                      <div style={s.statV(dupLines.length > 0 ? C.orange : "#059669")}>{dupLines.length}</div>
                      <div style={s.statS}>{dupLines.length > 0 ? "Already imported" : "No duplicates"}</div>
                    </div>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:16}}>
                    {/* Order breakdown */}
                    <div style={s.card}>
                      <div style={s.secTitle}>Order Breakdown — {orderIds.length} orders to import</div>
                      <div style={{maxHeight:360,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
                        {orderIds.map(ordId => {
                          const oLines = orderMap[ordId];
                          const total = oLines.reduce((s,l) => s+l.qty, 0);
                          const exp = orderLogExpanded === ordId;
                          return <div key={ordId} style={{borderRadius:8,border:`1px solid ${C.border}`,overflow:"hidden"}}>
                            <div onClick={() => setOrderLogExpanded(exp ? null : ordId)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",cursor:"pointer",background:exp?"#e2e8f0":C.bg,transition:"background 0.15s"}}>
                              <span style={{fontFamily:"monospace",fontWeight:700,color:C.amber,minWidth:90}}>{ordId}</span>
                              <span style={{fontSize:12,color:C.dim,flex:1}}>{oLines.length} item{oLines.length!==1?"s":""}</span>
                              <span style={{fontFamily:"monospace",fontWeight:700}}>{total} units</span>
                              <span style={{fontSize:11,color:C.muted,marginLeft:8}}>{exp?"▲":"▼"}</span>
                            </div>
                            {exp && <div style={{background:"#f8fafc"}}>
                              <table style={s.table}>
                                <thead><tr>
                                  {["SKU","Product","Qty"].map(h => <th key={h} style={{...s.th,padding:"7px 14px"}}>{h}</th>)}
                                </tr></thead>
                                <tbody>{oLines.map((l,i) => (
                                  <tr key={i}>
                                    <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:"#94a3b8",padding:"7px 14px"}}>{l.sku}</td>
                                    <td style={{...s.td,fontWeight:500,padding:"7px 14px",color:C.dim}}>{l.skuName}</td>
                                    <td style={{...s.td,fontFamily:"monospace",fontWeight:700,padding:"7px 14px"}}>{l.qty}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>}
                          </div>;
                        })}
                      </div>
                    </div>

                    {/* Errors & Dupes panel */}
                    <div style={{display:"flex",flexDirection:"column",gap:14}}>
                      {errorLines.length > 0 && <div style={s.card}>
                        <div style={{...s.secTitle,color:C.red}}>⚠ Errors — will be skipped ({errorLines.length})</div>
                        <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
                          {errorLines.map((e,i) => (
                            <div key={i} style={{padding:"8px 12px",borderRadius:6,background:"#fee2e2",border:"1px solid #fca5a5",fontSize:12}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                                <span style={{fontFamily:"monospace",color:C.muted,fontSize:10}}>Row {e.row}</span>
                                {e.skuRaw && <span style={{fontFamily:"monospace",color:"#94a3b8",fontSize:10}}>{e.skuRaw}</span>}
                              </div>
                              <div style={{color:C.red,fontWeight:600}}>{e.reason}</div>
                              {e.orderId && <div style={{color:C.muted,fontSize:10,marginTop:2}}>Order: {e.orderId}</div>}
                            </div>
                          ))}
                        </div>
                      </div>}

                      {dupLines.length > 0 && <div style={s.card}>
                        <div style={{...s.secTitle,color:C.orange}}>🔁 Duplicates — already imported ({dupLines.length})</div>
                        <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                          {[...new Set(dupLines.map(d => d.orderId))].map(ordId => (
                            <div key={ordId} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderRadius:6,background:"#fff7ed",border:"1px solid #fed7aa",fontSize:12}}>
                              <span style={{fontFamily:"monospace",fontWeight:700,color:C.orange}}>{ordId}</span>
                              <span style={{fontSize:10,color:C.muted}}>Previously imported</span>
                            </div>
                          ))}
                        </div>
                      </div>}

                      {errorLines.length === 0 && dupLines.length === 0 && (
                        <div style={{...s.card,textAlign:"center",padding:"32px 16px",border:"1px solid #166534"}}>
                          <div style={{fontSize:28,marginBottom:8}}>✅</div>
                          <div style={{fontSize:13,fontWeight:700,color:"#16a34a",marginBottom:4}}>Clean Import</div>
                          <div style={{fontSize:11,color:C.dim}}>No errors or duplicates detected</div>
                        </div>
                      )}

                      {/* Inventory impact preview */}
                      <div style={s.card}>
                        <div style={s.secTitle}>Inventory Impact Preview</div>
                        <div style={{maxHeight:180,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                          {(()=>{
                            const impact = {};
                            validLines.forEach(l => { impact[l.skuId] = (impact[l.skuId] || {sku:l.sku,name:l.skuName,deduct:0}); impact[l.skuId].deduct += l.qty; });
                            return Object.values(impact).map(({sku,name,deduct}) => {
                              const item = inventory.find(i => i.sku === sku);
                              const newStock = Math.max(0, (item?.currentStock||0) - deduct);
                              const willOut = newStock === 0;
                              const willLow = !willOut && newStock <= (item?.reorderPoint||0);
                              return <div key={sku} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",borderRadius:6,background:willOut?"#fee2e2":willLow?"#fff7ed":"transparent",fontSize:12}}>
                                <div>
                                  <div style={{fontFamily:"monospace",fontSize:10,color:"#94a3b8"}}>{sku}</div>
                                  <div style={{fontSize:11,fontWeight:600,color:C.dim}}>{name}</div>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:8,textAlign:"right"}}>
                                  <span style={{fontFamily:"monospace",color:C.muted}}>{item?.currentStock||0}</span>
                                  <span style={{color:C.muted,fontSize:10}}>→</span>
                                  <span style={{fontFamily:"monospace",fontWeight:700,color:willOut?C.red:willLow?C.orange:C.green}}>{newStock}</span>
                                  {(willOut||willLow) && <span style={{fontSize:9,fontWeight:700,color:willOut?C.red:C.orange,background:willOut?"#fee2e2":"#fff7ed",padding:"1px 5px",borderRadius:3}}>{willOut?"OUT":"LOW"}</span>}
                                </div>
                              </div>;
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Commit bar */}
                  <div style={{...s.card,display:"flex",justifyContent:"space-between",alignItems:"center",borderColor:validLines.length>0?"#86efac":C.border}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700}}>
                        {validLines.length === 0 ? "⚠ Nothing to import" : `✓ Ready to commit ${orderIds.length} order${orderIds.length!==1?"s":""}`}
                      </div>
                      <div style={{fontSize:12,color:C.dim,marginTop:3}}>
                        {validLines.length} line items · {previewUnits} units will deduct from inventory.
                        {errorLines.length > 0 && <span style={{color:C.red}}> {errorLines.length} error{errorLines.length!==1?"s":""} skipped.</span>}
                        {dupLines.length > 0 && <span style={{color:C.orange}}> {dupLines.length} duplicate{dupLines.length!==1?"s":""} skipped.</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:10}}>
                      <button style={s.btn("secondary")} onClick={resetUpload}>← Start Over</button>
                      <button
                        style={{...s.btn("primary"),padding:"10px 24px",opacity:validLines.length===0?0.4:1,fontSize:13}}
                        disabled={validLines.length===0}
                        onClick={commitUpload}
                      >✓ Commit {orderIds.length} Order{orderIds.length!==1?"s":""}</button>
                    </div>
                  </div>
                </div>;
              })()}

              {/* STEP 3 — Committed */}
              {uploadStep==="committed" && uploadPreview && (()=>{
                const { validLines, errorLines, orderMap } = uploadPreview;
                const orderIds = Object.keys(orderMap);
                const totalUnits = validLines.reduce((s,l) => s+l.qty, 0);
                return <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:18}}>
                  <div style={{...s.card,textAlign:"center",padding:"52px 32px",border:"1px solid #166534"}}>
                    <div style={{fontSize:52,marginBottom:14}}>✅</div>
                    <div style={{fontSize:22,fontWeight:800,color:"#16a34a",marginBottom:8}}>Upload Complete</div>
                    <div style={{fontSize:14,color:C.dim,marginBottom:6}}>{validLines.length} line items across {orderIds.length} order{orderIds.length!==1?"s":""}</div>
                    <div style={{fontSize:13,color:C.muted,marginBottom:28}}>{totalUnits} units deducted from inventory</div>
                    {errorLines.length > 0 && <div style={{marginBottom:20,padding:"10px 14px",background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,fontSize:12,color:C.red}}>{errorLines.length} row{errorLines.length!==1?"s":""} had errors and were skipped</div>}
                    <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
                      <button style={s.btn("primary")} onClick={resetUpload}>Upload Another File</button>
                      <button style={s.btn("secondary")} onClick={() => { setUploadSubTab("log"); resetUpload(); }}>View Order Log →</button>
                      <button style={s.btn("secondary")} onClick={() => setTab("replenishment")}>Check Replenishment →</button>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    <div style={s.card}>
                      <div style={s.secTitle}>What Happened</div>
                      {[
                        ["Orders imported", orderIds.length, "#059669"],
                        ["Line items committed", validLines.length, C.blue],
                        ["Units deducted", totalUnits, C.amber],
                        ["Errors skipped", errorLines.length, errorLines.length > 0 ? C.red : C.muted],
                      ].map(([l,v,c]) => (
                        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                          <span style={{color:C.dim}}>{l}</span>
                          <span style={{fontFamily:"monospace",fontWeight:700,color:c}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{...s.card,fontSize:12,color:C.dim,lineHeight:1.8}}>
                      <div style={s.secTitle}>Next Steps</div>
                      <div>• Check <strong style={{color:C.text}}>Replenishment</strong> for any SKUs that just went low</div>
                      <div style={{marginTop:4}}>• Visit <strong style={{color:C.text}}>Order Log</strong> to search and browse your full order history</div>
                      <div style={{marginTop:4}}>• <strong style={{color:C.text}}>Analytics</strong> updates automatically with the new data</div>
                    </div>
                  </div>
                </div>;
              })()}
            </>}

            {/* ── LOG SUB-TAB ── */}
            {uploadSubTab==="log" && <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:18}}>
                {[
                  ["Total Orders", allOrderIds.length, C.blue],
                  ["Total Line Items", orders.length, "#059669"],
                  ["Units Sold", totalUnitsOrdered, C.amber],
                  ["Avg Units / Order", avgUnitsPerOrder, C.purple],
                ].map(([l,v,a]) => (
                  <div key={l} style={s.statCard(a)}>
                    <div style={s.statL}>{l}</div>
                    <div style={s.statV(a)}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={s.card}>
                <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
                  <div style={s.secTitle}>Order History</div>
                  <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <input
                      placeholder="Search order # or SKU..."
                      value={orderLogSearch}
                      onChange={e => setOrderLogSearch(e.target.value)}
                      style={{...s.inp,width:240,padding:"7px 12px"}}
                    />
                    {orderLogSearch && <button style={{...s.btn("secondary"),fontSize:11}} onClick={() => setOrderLogSearch("")}>✕ Clear</button>}
                    <span style={{fontSize:11,color:C.muted}}>{filteredOrderIds.length} of {allOrderIds.length} orders</span>
                  </div>
                </div>

                {filteredOrderIds.length === 0
                  ? <div style={{textAlign:"center",padding:"60px",color:C.muted}}>
                      {orders.length === 0
                        ? <><div style={{fontSize:32,marginBottom:12}}>📭</div><div style={{fontWeight:600,color:C.dim,marginBottom:6}}>No Orders Yet</div><div style={{fontSize:13}}>Upload an order CSV to get started.</div><button style={{...s.btn("primary"),marginTop:16}} onClick={() => setUploadSubTab("upload")}>Upload Orders</button></>
                        : <><div style={{fontSize:28,marginBottom:10}}>🔍</div><div>No orders match "{orderLogSearch}"</div></>
                      }
                    </div>
                  : <div style={{maxHeight:600,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                      {filteredOrderIds.map(ordId => {
                        const oLines = orders.filter(o => o.orderId === ordId);
                        const totalU = oLines.reduce((s,l) => s+l.qty, 0);
                        const impDate = oLines[0]?.importedAt || "—";
                        const exp = orderLogExpanded === ordId;
                        return <div key={ordId} style={{borderRadius:8,border:`1px solid ${exp?C.border+"80":C.border}`,overflow:"hidden",transition:"all 0.15s"}}>
                          <div onClick={() => setOrderLogExpanded(exp ? null : ordId)} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 110px 30px",gap:12,alignItems:"center",padding:"11px 16px",cursor:"pointer",background:exp?"#e2e8f0":C.bg}}>
                            <span style={{fontFamily:"monospace",fontWeight:700,color:C.amber}}>{ordId}</span>
                            <span style={{fontSize:12,color:C.dim,textAlign:"center"}}>{oLines.length} SKU{oLines.length!==1?"s":""}</span>
                            <span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,textAlign:"center"}}>{totalU} units</span>
                            <span style={{fontFamily:"monospace",fontSize:11,color:C.muted}}>{impDate}</span>
                            <span style={{fontSize:11,color:C.muted,textAlign:"right"}}>{exp?"▲":"▼"}</span>
                          </div>
                          {exp && <div style={{background:"#f8fafc"}}>
                            <table style={s.table}>
                              <thead><tr>
                                {["SKU","Product","Qty","Order Date","Imported At"].map(h => <th key={h} style={{...s.th,padding:"7px 16px"}}>{h}</th>)}
                              </tr></thead>
                              <tbody>
                                {oLines.map((l,i) => (
                                  <tr key={i}>
                                    <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:"#94a3b8",padding:"8px 16px"}}>{l.sku}</td>
                                    <td style={{...s.td,fontWeight:500,padding:"8px 16px",color:C.dim}}>{l.skuName||"—"}</td>
                                    <td style={{...s.td,fontFamily:"monospace",fontWeight:700,padding:"8px 16px"}}>{l.qty}</td>
                                  <td style={{...s.td,fontFamily:"monospace",fontSize:11,color:C.dim,padding:"8px 16px"}}>{l.orderDate||l.importedAt}</td>
                                    <td style={{...s.td,fontFamily:"monospace",fontSize:11,color:C.muted,padding:"8px 16px"}}>{l.importedAt}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>}
                        </div>;
                      })}
                    </div>
                }
              </div>
            </>}

            {/* ── ANALYTICS SUB-TAB ── */}
            {uploadSubTab==="analytics" && (
              orders.length === 0
                ? <div style={{...s.card,textAlign:"center",padding:"60px",color:C.muted}}>
                    <div style={{fontSize:36,marginBottom:12}}>📊</div>
                    <div style={{fontWeight:600,color:C.dim,marginBottom:6}}>No Data Yet</div>
                    <div style={{fontSize:13,marginBottom:16}}>Upload order CSVs to see analytics here.</div>
                    <button style={s.btn("primary")} onClick={() => setUploadSubTab("upload")}>Upload Orders</button>
                  </div>
                : <>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:18}}>
                      {[
                        ["Total Orders",    allOrderIds.length, C.blue,   "imported to date"],
                        ["Total Line Items",orders.length,      "#059669","individual SKU rows"],
                        ["Units Sold",      totalUnitsOrdered,  C.amber,  "units deducted"],
                        ["Avg Units/Order", avgUnitsPerOrder,   C.purple, "order size average"],
                      ].map(([l,v,a,sub]) => (
                        <div key={l} style={s.statCard(a)}>
                          <div style={s.statL}>{l}</div>
                          <div style={s.statV(a)}>{v}</div>
                          <div style={s.statS}>{sub}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
                      {/* Orders per week bar chart */}
                      <div style={s.card}>
                        <div style={s.secTitle}>Orders & Units Per Upload Week</div>
                        {weeklyOrderCounts.length > 0 && <div style={{overflowY:"auto",maxHeight:320}}>
                          {weeklyOrderCounts.map(({week, orders:cnt, units}) => {
                            const maxOrders = Math.max(...weeklyOrderCounts.map(w => w.orders));
                            const maxUnits  = Math.max(...weeklyOrderCounts.map(w => w.units));
                            return <div key={week} style={{marginBottom:14}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                <span style={{fontFamily:"monospace",fontSize:11,color:C.dim}}>{week}</span>
                                <div style={{display:"flex",gap:14}}>
                                  <span style={{fontSize:11,color:C.blue,fontFamily:"monospace"}}>{cnt} orders</span>
                                  <span style={{fontSize:11,color:C.amber,fontFamily:"monospace"}}>{units} units</span>
                                </div>
                              </div>
                              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                                <div style={{height:6,background:C.border,borderRadius:99,overflow:"hidden"}}>
                                  <div style={{width:`${(cnt/Math.max(1,maxOrders))*100}%`,height:"100%",background:C.blue,borderRadius:99}}/>
                                </div>
                                <div style={{height:6,background:C.border,borderRadius:99,overflow:"hidden"}}>
                                  <div style={{width:`${(units/Math.max(1,maxUnits))*100}%`,height:"100%",background:C.amber,borderRadius:99}}/>
                                </div>
                              </div>
                            </div>;
                          })}
                          <div style={{display:"flex",gap:16,marginTop:8}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.dim}}><div style={{width:12,height:6,background:C.blue,borderRadius:99}}/> Orders</div>
                            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.dim}}><div style={{width:12,height:6,background:C.amber,borderRadius:99}}/> Units</div>
                          </div>
                        </div>}
                      </div>

                      {/* Top SKUs by frequency */}
                      <div style={s.card}>
                        <div style={s.secTitle}>Top SKUs by Order Frequency</div>
                        <div style={{display:"flex",flexDirection:"column",gap:0}}>
                          {topSkusByFreq.map(({sku, orderCount, units, lineItems}, i) => {
                            const itm = inventory.find(inv => inv.sku === sku);
                            const maxC = topSkusByFreq[0]?.orderCount || 1;
                            return <div key={sku} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                              <span style={{fontSize:11,color:C.muted,width:22,textAlign:"right",flexShrink:0,fontFamily:"monospace"}}>#{i+1}</span>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{itm?.name||sku}</div>
                                <div style={{fontFamily:"monospace",fontSize:10,color:"#94a3b8",marginBottom:4}}>{sku}</div>
                                <div style={{height:4,background:C.border,borderRadius:99,overflow:"hidden"}}>
                                  <div style={{width:`${(orderCount/maxC)*100}%`,height:"100%",background:C.amber,borderRadius:99}}/>
                                </div>
                              </div>
                              <div style={{textAlign:"right",flexShrink:0,minWidth:70}}>
                                <div style={{fontFamily:"monospace",fontWeight:800,color:C.amber}}>{orderCount}</div>
                                <div style={{fontSize:10,color:C.muted}}>orders</div>
                                <div style={{fontSize:10,color:C.dim,fontFamily:"monospace"}}>{units} units</div>
                              </div>
                            </div>;
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Full weekly breakdown table */}
                    <div style={s.card}>
                      <div style={s.secTitle}>Full Upload History</div>
                      <table style={s.table}>
                        <thead><tr>
                          {["Upload Week","Orders","Line Items","Units Sold","Avg Units/Order"].map(h => <th key={h} style={s.th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {weeklyOrderCounts.map(({week,orders:cnt,units,lineItems}) => (
                            <tr key={week}>
                              <td style={{...s.td,fontFamily:"monospace",color:C.dim}}>{week}</td>
                              <td style={{...s.td,fontFamily:"monospace",fontWeight:700,color:C.blue}}>{cnt}</td>
                              <td style={{...s.td,fontFamily:"monospace",color:"#94a3b8"}}>{lineItems}</td>
                              <td style={{...s.td,fontFamily:"monospace",fontWeight:700,color:C.amber}}>{units}</td>
                              <td style={{...s.td,fontFamily:"monospace",color:C.purple}}>{cnt>0?(units/cnt).toFixed(1):"—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
            )}
          </>;
        })()}

        {/* ── REPORTS ── */}
        {tab==="reports" && <>
          <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18}}>
            <div style={s.card}>
              <div style={s.secTitle}>Select SKU</div>
              <div style={{maxHeight:400,overflowY:"auto"}}>
                {inventory.map(item=>(
                  <div key={item.id} onClick={()=>setSelectedSku(item.sku)} style={{padding:"9px 12px",borderRadius:6,cursor:"pointer",background:selectedSku===item.sku?"#99000018":"transparent",borderLeft:selectedSku===item.sku?`2px solid ${C.amber}`:"2px solid transparent",marginBottom:2}}>
                    <div style={{fontSize:11,fontFamily:"monospace",color:C.dim}}>{item.sku}</div>
                    <div style={{fontSize:13,fontWeight:600,color:selectedSku===item.sku?C.amber:C.text}}>{item.name}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={s.card}>
              {selectedSku&&(()=>{
                const item=inventory.find(i=>i.sku===selectedSku);
                return item?<>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
                    <div><div style={{fontSize:11,fontFamily:"monospace",color:C.dim}}>{item.sku}</div><div style={{fontSize:20,fontWeight:800}}>{item.name}</div></div>
                    <div style={{display:"flex",gap:16,textAlign:"right"}}>
                      {[["In Stock",item.currentStock,C.blue],["Velocity",`${velocityFor(item.sku)}/wk`,C.amber],["Wks Left",velocityFor(item.sku)>0?Math.floor(item.currentStock/velocityFor(item.sku)):"∞",C.green],["Avg Cost",item.avgCost>0?`$${item.avgCost.toFixed(2)}`:"—","#059669"],["On-Hand Value",item.avgCost>0?`$${(item.currentStock*item.avgCost).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—","#7c3aed"]].map(([l,v,a])=>(
                        <div key={l}><div style={s.statL}>{l}</div><div style={{...s.statV(a),fontSize:18}}>{v}</div></div>
                      ))}
                    </div>
                  </div>
                  <div style={s.secTitle}>Weekly Units Sold</div>
                  {chartData.length>0
                    ?<ResponsiveContainer width="100%" height={180}>
                        <BarChart data={chartData} margin={{top:0,right:0,left:-20,bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                          <XAxis dataKey="week" tick={{fill:C.muted,fontSize:11,fontFamily:"monospace"}} />
                          <YAxis tick={{fill:C.muted,fontSize:11}} />
                          <Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text}} />
                          <Bar dataKey="units" fill={C.amber} radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    :<div style={{color:C.muted,fontSize:13,padding:"20px 0"}}>No sales data yet for this SKU.</div>}
                </>:null;
              })()}
            </div>
          </div>
          <div style={{...s.card,marginTop:18}}>
            <div style={s.secTitle}>All SKUs — Velocity Ranking</div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={[...inventory].map(i=>({name:i.sku,velocity:velocityFor(i.sku)})).sort((a,b)=>b.velocity-a.velocity).slice(0,15)} margin={{top:0,right:0,left:-20,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" tick={{fill:C.muted,fontSize:10,fontFamily:"monospace"}} />
                <YAxis tick={{fill:C.muted,fontSize:11}} />
                <Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text}} formatter={v=>[`${v} units/wk`,"Velocity"]} />
                <Bar dataKey="velocity" fill={C.blue} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{...s.card,marginTop:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={s.secTitle}>Inventory Cost Breakdown — Rolling Weighted Average Cost</div>
              {(()=>{
                const total = inventory.reduce((s,i)=>s+(i.avgCost||0)*i.currentStock,0);
                const costed = inventory.filter(i=>i.avgCost>0);
                return costed.length>0&&<div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:C.dim,textTransform:"uppercase",letterSpacing:1}}>Total On-Hand Value</div>
                  <div style={{fontSize:22,fontWeight:800,fontFamily:"monospace",color:"#059669"}}>${total.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                </div>;
              })()}
            </div>
            <table style={s.table}>
              <thead><tr>{["SKU","Product","Category","Units on Hand","Avg Cost/Unit","On-Hand Value","Recent PO History",""].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {[...inventory].sort((a,b)=>(b.avgCost||0)*b.currentStock-(a.avgCost||0)*a.currentStock).map(item=>{
                  const poLines = purchaseOrders
                    .filter(po=>po.status==="received"||po.status==="partial")
                    .flatMap(po=>po.lines.filter(l=>l.skuId===item.id&&l.received>0).map(l=>({...l,poNumber:po.poNumber})));
                  const onHandVal = (item.avgCost||0)*item.currentStock;
                  return <tr key={item.id}>
                    <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:"#94a3b8"}}>{item.sku}</td>
                    <td style={{...s.td,fontWeight:600}}>{item.name}</td>
                    <td style={{...s.td,fontSize:12,color:C.dim}}>{item.category}</td>
                    <td style={{...s.td,fontFamily:"monospace",fontWeight:700}}>{item.currentStock}</td>
                    <td style={{...s.td,fontFamily:"monospace",color:item.avgCost>0?"#059669":C.muted}}>{item.avgCost>0?`$${item.avgCost.toFixed(4)}`:"—"}</td>
                    <td style={{...s.td,fontFamily:"monospace",fontWeight:700,color:onHandVal>0?C.text:C.muted}}>{onHandVal>0?`$${onHandVal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—"}</td>
                    <td style={s.td}>
                      {poLines.length>0
                        ?<div style={{display:"flex",flexDirection:"column",gap:3}}>
                            {poLines.slice(-3).map((l,i)=><div key={i} style={{fontSize:10,fontFamily:"monospace",color:C.dim}}>{l.poNumber} · {l.received} units @ ${l.costPerUnit.toFixed(2)}</div>)}
                            {poLines.length>3&&<div style={{fontSize:10,color:C.muted}}>+{poLines.length-3} more receipts</div>}
                          </div>
                        :<span style={{fontSize:11,color:C.muted}}>No receipts yet</span>}
                    </td>
                    <td style={s.td}>{item.avgCost>0?<span style={{fontSize:10,fontWeight:700,color:"#059669",background:"#dcfce7",padding:"2px 7px",borderRadius:4,letterSpacing:1}}>WAC</span>:<span style={{fontSize:11,color:C.muted}}>—</span>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
            <div style={{marginTop:14,padding:"10px 14px",background:"#f8fafc",borderRadius:8,fontSize:11,color:C.dim,borderLeft:`2px solid ${C.border}`,lineHeight:1.7}}>
              <strong style={{color:"#94a3b8"}}>WAC (Weighted Average Cost)</strong> — recalculated on every PO receipt: <span style={{fontFamily:"monospace",color:C.amber}}>new avg = (units on hand × old avg cost + received qty × PO unit cost) ÷ new total units</span>. Avg cost resets to the PO price if stock was at zero.
            </div>
          </div>
        </>}
      </main>

      {/* ── RECEIVE MODAL ── */}
      {receiveModal && (
        <div style={s.overlay} onClick={()=>setReceiveModal(null)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:5}}>Receive Stock</div>
            <div style={{fontSize:13,color:C.dim,marginBottom:20}}>{receiveModal.po.lines[receiveModal.lineIdx].sku} — {receiveModal.po.lines[receiveModal.lineIdx].name}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
              {[["Ordered",receiveModal.po.lines[receiveModal.lineIdx].qty],["Received",receiveModal.po.lines[receiveModal.lineIdx].received],["Remaining",receiveModal.po.lines[receiveModal.lineIdx].qty-receiveModal.po.lines[receiveModal.lineIdx].received]].map(([l,v])=>(
                <div key={l} style={{background:"#f8fafc",borderRadius:8,padding:12,textAlign:"center"}}>
                  <div style={{fontSize:10,color:C.dim,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{l}</div>
                  <div style={{fontSize:22,fontWeight:800,fontFamily:"monospace"}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={s.fg}>
              <div style={s.lbl}>Units Being Received Now</div>
              <input style={{...s.inpFull,fontSize:22,fontWeight:800,fontFamily:"monospace",textAlign:"center",padding:12}} type="number" min="1" max={receiveModal.po.lines[receiveModal.lineIdx].qty-receiveModal.po.lines[receiveModal.lineIdx].received} value={receiveModal.qty} onChange={e=>setReceiveModal(r=>({...r,qty:e.target.value}))} />
            </div>
            <div style={{fontSize:12,color:C.muted,marginTop:8,marginBottom:20}}>✓ Adds <strong style={{color:C.green}}>{parseInt(receiveModal.qty)||0} units</strong> to current inventory stock.</div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button style={s.btn("secondary")} onClick={()=>setReceiveModal(null)}>Cancel</button>
              <button style={s.btn("primary")} onClick={confirmReceive}>Confirm Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
