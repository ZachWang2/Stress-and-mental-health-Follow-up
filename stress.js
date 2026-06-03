const KEY = "patient-monitor-preview-v2";
const sliderIds = ["sleepQuality", "somaticLevel", "rechargeEase", "mood", "anxiety", "interest", "energy", "functioning"];
const weeklyFields = ["mood", "anxiety", "interest", "energy", "functioning"];
const SCARED_ITEMS = [
  [1, "当我感到害怕时，会出现呼吸困难。"],
  [2, "我在学校时感到头痛。"],
  [3, "我不喜欢与不太熟悉的人在一起。"],
  [4, "如果我不在家里睡觉，就觉得内心不安。"],
  [5, "我经常担心别人是不是喜欢我。"],
  [6, "我害怕时，感到马上要死去似的。"],
  [7, "我总是感到紧张不安。"],
  [8, "父母无论去哪里我总是离不开他们。"],
  [9, "别人说我好像很紧张的样子。"],
  [10, "当我与不熟悉的人在一起时就感到紧张。"],
  [11, "在学校时就出现肚子痛。"],
  [12, "当我害怕时，感觉自己快要发疯、失去控制了。"],
  [13, "我总担心自己一个人睡觉。"],
  [14, "我担心自己不像其他孩子一样好。"],
  [15, "当我害怕时，感到恍恍惚惚、好像周围的一切不真实似的。"],
  [16, "我梦见父母发生了不幸的事情。"],
  [17, "我担心又要去上学。"],
  [18, "我害怕时，会心跳加快。"],
  [19, "我手脚发抖打颤。"],
  [20, "我梦见发生了对我不利的事情。"],
  [21, "我对于一些精心为我而安排的事感到不安和不自在。"],
  [22, "当我害怕时，我会出汗。"],
  [23, "我是一个忧虑的人。"],
  [24, "我无缘无故地感到害怕。"],
  [25, "我害怕一个人待在家里。"],
  [26, "我觉得和不熟悉的人说话很困难。"],
  [27, "当我害怕时，会感到难以呼吸。"],
  [28, "别人说我担心得太多了。"],
  [29, "我不愿离开自己的家。"],
  [30, "我担心以前那种紧张（或惊恐）的感觉再次出现。"],
  [31, "我总担心父母会出事。"],
  [32, "当我与不熟悉的人在一起时，会感到害羞。"],
  [33, "我担心将来会发生什么事情。"],
  [34, "当我害怕时，会感到恶心、想吐。"],
  [35, "我担心自己能不能把事情做好。"],
  [36, "我害怕去上学。"],
  [37, "我会担心已经发生了的事情。"],
  [38, "当我害怕时，会感到头昏。"],
  [39, "当我与其他伙伴或大人在一起做事情时（如大声朗读、说话、游戏或体育活动），如果他们看着我，我就感到紧张。"],
  [40, "当我去参加有很多不熟悉的人在场的活动或聚会，会感到紧张。"],
  [41, "我是一个害羞的人。"],
];
const SCARED_OPTIONS = [[0, "没有此问题"], [1, "有时有"], [2, "经常有"]];
const SCARED_SUBSCALES = [
  ["panicSomatic", "惊恐/躯体症状", 7, [1, 6, 9, 12, 15, 18, 19, 22, 24, 27, 30, 34, 38]],
  ["generalized", "广泛性焦虑", 9, [5, 7, 14, 21, 23, 28, 33, 35, 37]],
  ["separation", "分离焦虑", 5, [4, 8, 13, 16, 20, 25, 29, 31]],
  ["social", "社交焦虑", 8, [3, 10, 26, 32, 39, 40, 41]],
  ["schoolAvoidance", "学校回避", 3, [2, 11, 17, 36]],
];
const SCARED_TOTAL_CUTOFF = 25;

let state = loadState();

document.querySelector("#date").value = today();
document.querySelector("#weekDate").value = today();
document.querySelector("#scaredDate").value = today();
renderScaredInputs();

sliderIds.forEach((id) => {
  const input = document.querySelector(`#${id}`);
  const output = input.parentElement.querySelector("output");
  input.addEventListener("input", () => {
    output.value = input.value;
  });
});

document.querySelector("#dailyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const raw = {
    date: value("date"),
    sleepHours: number("sleepHours"),
    sleepQuality: number("sleepQuality"),
    somaticLevel: number("somaticLevel"),
    rechargeEase: number("rechargeEase"),
    affirmation1: value("affirmation1"),
    affirmation2: value("affirmation2"),
    affirmation3: value("affirmation3"),
    note: value("note"),
    shortVideoMinutes: null,
    sleepDeviceStatus: "manual",
    bluetoothDeviceStatus: "not_connected",
    networkSyncStatus: "local_only",
    createdAt: new Date().toISOString(),
  };
  const record = { ...raw, dailyScore: scoreDaily(raw) };
  state.daily = [...state.daily.filter((item) => item.date !== record.date), record].sort((a, b) => a.date.localeCompare(b.date));
  persist("日常记录已保存");
});

document.querySelector("#weeklyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const raw = {
    weekDate: value("weekDate"),
    mood: number("mood"),
    anxiety: number("anxiety"),
    interest: number("interest"),
    energy: number("energy"),
    functioning: number("functioning"),
    riskFlag: document.querySelector("#riskFlag").checked,
    note: value("weeklyNote"),
    createdAt: new Date().toISOString(),
  };
  const record = { ...raw, score: scoreWeekly(raw) };
  state.weekly = [...state.weekly.filter((item) => item.weekDate !== record.weekDate), record].sort((a, b) => a.weekDate.localeCompare(b.weekDate));
  persist("周评已保存");
});

document.querySelector("#ventForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = value("ventText");
  if (!text) return;
  state.vents.push({
    id: crypto.randomUUID?.() || String(Date.now()),
    createdAt: new Date().toISOString(),
    text,
    aiConversationReady: Boolean(value("aiDraft")),
    aiDraft: value("aiDraft"),
  });
  document.querySelector("#ventText").value = "";
  document.querySelector("#aiDraft").value = "";
  persist("树洞内容已保存");
});

document.querySelector("#scaredForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const answers = {};
  SCARED_ITEMS.forEach(([id]) => {
    answers[id] = Number(document.querySelector(`#scared_${id}`).value);
  });
  const record = {
    id: crypto.randomUUID?.() || `scared-${Date.now()}`,
    date: value("scaredDate"),
    respondent: value("scaredRespondent") || "儿童/青少年自评",
    answers,
    ...scoreScared(answers),
    createdAt: new Date().toISOString(),
  };
  state.scared = [...state.scared.filter((item) => item.date !== record.date), record].sort((a, b) => a.date.localeCompare(b.date));
  persist("SCARED 量表已保存");
});

document.querySelector("#seedBtn").addEventListener("click", () => {
  state = seedState();
  persist("示例数据已生成");
});

document.querySelector("#clearBtn").addEventListener("click", () => {
  if (!state.daily.length && !state.weekly.length && !state.vents.length && !state.scared.length) return;
  if (!window.confirm("确定清空所有本地记录吗？")) return;
  state = { daily: [], weekly: [], vents: [], scared: [] };
  persist("数据已清空");
});

document.querySelector("#sleepSyncBtn").addEventListener("click", () => setStatus("睡眠质量接口已预留，尚未实装"));
document.querySelector("#bluetoothBtn").addEventListener("click", () => setStatus("蓝牙设备接口已预留，尚未实装"));
document.querySelector("#appUsageBtn").addEventListener("click", () => setStatus("App 使用监管接口已预留，尚未实装"));
document.querySelector("#exportBtn").addEventListener("click", () => download("patient-monitor-local-data.csv", toCsv()));
document.querySelector("#summaryBtn").addEventListener("click", () => download("follow-up-summary.txt", followUpSummary()));

function value(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function number(id) {
  return Number(document.querySelector(`#${id}`).value);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return { daily: saved?.daily || [], weekly: saved?.weekly || [], vents: saved?.vents || [], scared: saved?.scared || [] };
  } catch {
    return { daily: [], weekly: [], vents: [], scared: [] };
  }
}

function persist(message) {
  localStorage.setItem(KEY, JSON.stringify(state));
  setStatus(message);
  render();
}

function setStatus(message) {
  const node = document.querySelector("#saveStatus");
  node.textContent = message;
  window.setTimeout(() => {
    node.textContent = "本地保存";
  }, 1800);
}

function scoreDaily(record) {
  const sleepPenalty = record.sleepHours < 6 ? (6 - record.sleepHours) * 9 : record.sleepHours > 9.5 ? (record.sleepHours - 9.5) * 4 : 0;
  const score = 20 + sleepPenalty + (4 - record.sleepQuality) * 10 + record.somaticLevel * 14 - record.rechargeEase * 8;
  return Math.round(Math.max(0, Math.min(100, score)));
}

function scoreWeekly(record) {
  return Math.round((weeklyFields.reduce((sum, id) => sum + Number(record[id]), 0) / 20) * 100);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function render() {
  const daily = state.daily.sort((a, b) => a.date.localeCompare(b.date));
  const weekly = state.weekly.sort((a, b) => a.weekDate.localeCompare(b.weekDate));
  const latest = daily[daily.length - 1];
  const recent = daily.slice(-7);
  document.querySelector("#latestScore").textContent = latest ? latest.dailyScore : "--";
  document.querySelector("#weekScore").textContent = recent.length ? Math.round(mean(recent.map((item) => item.dailyScore))) : "--";
  document.querySelector("#sleepAvg").textContent = recent.length ? mean(recent.map((item) => item.sleepHours)).toFixed(1) : "--";
  document.querySelector("#somaticAvg").textContent = recent.length ? mean(recent.map((item) => item.somaticLevel)).toFixed(1) : "--";
  document.querySelector("#weeklyDue").textContent = `下一次建议日期：${nextWeeklyDue(weekly)}`;
  renderSignal(recent, weekly);
  renderExplain(latest);
  renderScaredResult();
  renderList(daily);
  drawChart(daily.slice(-30));
}

function renderScaredInputs() {
  document.querySelector("#scaredList").innerHTML = SCARED_ITEMS.map(([id, text]) => `
    <label class="scared-item">
      <span>${id}. ${text}</span>
      <select id="scared_${id}">
        ${SCARED_OPTIONS.map(([value, label]) => `<option value="${value}">${value} - ${label}</option>`).join("")}
      </select>
    </label>
  `).join("");
}

function scoreScared(answers) {
  const total = SCARED_ITEMS.reduce((sum, [id]) => sum + Number(answers[id] || 0), 0);
  const subscales = SCARED_SUBSCALES.map(([key, label, cutoff, ids]) => {
    const score = ids.reduce((sum, id) => sum + Number(answers[id] || 0), 0);
    return { key, label, cutoff, score, elevated: score >= cutoff };
  });
  return { total, totalElevated: total >= SCARED_TOTAL_CUTOFF, subscales };
}

function renderScaredResult() {
  const latest = state.scared.sort((a, b) => a.date.localeCompare(b.date))[state.scared.length - 1];
  if (!latest) {
    document.querySelector("#scaredSummary").innerHTML = "<strong>尚未保存 SCARED 记录</strong><span>保存后会显示总分和五个分量表。</span>";
    document.querySelector("#scaredSubscales").innerHTML = "";
    return;
  }
  document.querySelector("#scaredSummary").innerHTML = `<strong>最近一次：${latest.total}/82</strong><span>${latest.totalElevated ? "达到筛查关注线" : "未达筛查关注线"} · 总分关注线 ${SCARED_TOTAL_CUTOFF}</span>`;
  document.querySelector("#scaredSubscales").innerHTML = latest.subscales.map((scale) => `
    <article class="${scale.elevated ? "subscale elevated" : "subscale"}">
      <span>${scale.label}</span>
      <strong>${scale.score}</strong>
      <small>关注线 ${scale.cutoff}</small>
    </article>
  `).join("");
}

function renderSignal(recent, weekly) {
  const latestWeekly = weekly[weekly.length - 1];
  const poorSleep = recent.filter((item) => item.sleepHours < 6 || item.sleepQuality <= 1).length;
  const highSomatic = recent.filter((item) => item.somaticLevel >= 3).length;
  let title = "近期相对平稳";
  let text = "继续低负担记录，重点观察睡眠、身体不舒服和恢复行为的关系。";
  if (!recent.length && !weekly.length) {
    title = "等待记录";
    text = "每日只记录睡眠、躯体化/疼痛和一点点恢复情况，每周再做一次标准周评。";
  } else if (latestWeekly?.riskFlag) {
    title = "高优先级复核";
    text = "周评出现风险勾选。正式产品必须显示求助路径，并建议联系医生或可信赖的人。";
  } else if (highSomatic >= 4) {
    title = "躯体化/疼痛持续偏高";
    text = "最近一周身体不舒服、疼痛或紧绷感偏高，建议在复诊摘要中标记。";
  } else if (poorSleep >= 3) {
    title = "睡眠是当前重点";
    text = "最近一周睡眠偏短或质量较差。睡眠变化常常比单日情绪更早暴露波动。";
  }
  document.querySelector("#signalTitle").textContent = title;
  document.querySelector("#signalText").textContent = text;
}

function renderExplain(record) {
  const list = document.querySelector("#explainList");
  if (!record) {
    list.innerHTML = '<p class="empty">暂无日常记录。</p>';
    return;
  }
  const sleepPenalty = record.sleepHours < 6 ? (6 - record.sleepHours) * 9 : record.sleepHours > 9.5 ? (record.sleepHours - 9.5) * 4 : 0;
  const rows = [
    ["躯体化/疼痛", `+${record.somaticLevel * 14}`, `身体不舒服、疼痛或紧绷 ${record.somaticLevel}/4`],
    ["睡眠质量", `+${(4 - record.sleepQuality) * 10}`, `睡眠质量 ${record.sleepQuality}/4`],
    ["睡眠时长", `+${Math.round(sleepPenalty)}`, `睡眠 ${record.sleepHours} 小时`],
    ["缓过来一点", `${record.rechargeEase * -8}`, `今天能喘口气、放松一点 ${record.rechargeEase}/4`],
    ["最终负荷", `${record.dailyScore}`, `${record.dailyScore}/100`],
  ];
  list.innerHTML = rows.map(([a, b, c]) => `<div class="explain-row"><strong>${a}</strong><span>${b}</span><p>${c}</p></div>`).join("");
}

function renderList(daily) {
  const list = document.querySelector("#recordList");
  if (!daily.length) {
    list.innerHTML = '<p class="empty">暂无日常记录。</p>';
    return;
  }
  list.innerHTML = daily
    .slice()
    .reverse()
    .slice(0, 8)
    .map((item) => `<article class="record"><strong>${item.date}</strong><span class="score">${item.dailyScore}</span><p>睡眠 ${item.sleepHours}h · 躯体化 ${item.somaticLevel}/4</p></article>`)
    .join("");
}

function drawChart(items) {
  const canvas = document.querySelector("#trendChart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pad = { top: 34, right: 32, bottom: 52, left: 54 };
  const w = canvas.width - pad.left - pad.right;
  const h = canvas.height - pad.top - pad.bottom;
  ctx.fillStyle = "rgba(197,82,69,.08)";
  ctx.fillRect(pad.left, pad.top, w, h * 0.3);
  ctx.strokeStyle = "#d9e1df";
  ctx.fillStyle = "#66737c";
  ctx.font = "14px system-ui";
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = pad.top + h - (v / 100) * h;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + w, y);
    ctx.stroke();
    ctx.fillText(String(v), 14, y + 5);
  });
  if (!items.length) {
    ctx.font = "24px system-ui";
    ctx.fillText("保存日常记录后显示趋势", pad.left + 18, pad.top + 56);
    return;
  }
  const step = items.length > 1 ? w / (items.length - 1) : w;
  ctx.strokeStyle = "#19735f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  items.forEach((item, index) => {
    const x = pad.left + index * step;
    const y = pad.top + h - (item.dailyScore / 100) * h;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  items.forEach((item, index) => {
    const x = pad.left + index * step;
    const y = pad.top + h - (item.dailyScore / 100) * h;
    ctx.fillStyle = item.dailyScore >= 70 ? "#c55245" : item.dailyScore >= 45 ? "#c9851a" : "#19735f";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function nextWeeklyDue(weekly) {
  if (!weekly.length) return "今天可以做第一次周评";
  const latest = new Date(weekly[weekly.length - 1].weekDate);
  latest.setDate(latest.getDate() + 7);
  return latest.toISOString().slice(0, 10);
}

function seedState() {
  const daily = [];
  const weekly = [];
  const vents = [{ id: "seed", createdAt: new Date().toISOString(), text: "今天很烦，但我先把它写下来。", aiConversationReady: true, aiDraft: "请先倾听，不要急着给建议。" }];
  const now = new Date();
  for (let i = 27; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const wave = Math.sin((27 - i) / 3.1);
    const raw = {
      date: date.toISOString().slice(0, 10),
      sleepHours: Math.round((7.1 - Math.max(0, wave) * 1.3 + Math.random() * 0.7) * 2) / 2,
      sleepQuality: Math.max(0, Math.min(4, Math.round(2.4 - wave * 0.8 + Math.random()))),
      somaticLevel: Math.max(0, Math.min(4, Math.round(1.8 + wave * 1.2 + Math.random()))),
      rechargeEase: Math.max(0, Math.min(4, Math.round(2.2 - wave * 0.5 + Math.random()))),
      affirmation1: "愿意记录状态",
      affirmation2: "完成了一件小事",
      affirmation3: "给自己留了一点空间",
      note: wave > 0.7 ? "压力较高，头痛和肩颈不舒服。" : "状态相对平稳。",
      shortVideoMinutes: wave > 0.7 ? 95 : 35,
    };
    daily.push({ ...raw, dailyScore: scoreDaily(raw) });
  }
  for (let i = 3; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i * 7);
    const raw = { weekDate: date.toISOString().slice(0, 10), mood: 2, anxiety: 2, interest: 1, energy: 2, functioning: 1, riskFlag: false, note: "示例周评" };
    weekly.push({ ...raw, score: scoreWeekly(raw) });
  }
  const answers = Object.fromEntries(SCARED_ITEMS.map(([id]) => [id, 0]));
  [2, 5, 7, 17, 23, 28, 33, 35, 37].forEach((id) => {
    answers[id] = 1;
  });
  [1, 3, 10, 18, 39].forEach((id) => {
    answers[id] = 2;
  });
  const scared = [{ id: "seed-scared", date: today(), respondent: "儿童/青少年自评", answers, ...scoreScared(answers), createdAt: new Date().toISOString() }];
  return { daily, weekly, vents, scared };
}

function toCsv() {
  const rows = [
    ["type", "date", "score", "sleepHours", "sleepQuality", "somaticLevel", "rechargeEase", "shortVideoMinutes", "affirmation1", "affirmation2", "affirmation3", "note", "treeHoleText", "aiConversationReady", "aiDraft", "respondent", "scaredTotal", "scaredElevated", "scaredSubscales", "scaredAnswers"],
    ...state.daily.map((item) => ["daily", item.date, item.dailyScore, item.sleepHours, item.sleepQuality, item.somaticLevel, item.rechargeEase, item.shortVideoMinutes, item.affirmation1, item.affirmation2, item.affirmation3, item.note, "", "", "", "", "", "", "", ""]),
    ...state.weekly.map((item) => ["weekly", item.weekDate, item.score, "", "", "", "", "", "", "", "", item.note, "", "", "", "", "", "", "", ""]),
    ...state.vents.map((item) => ["treehole", item.createdAt.slice(0, 10), "", "", "", "", "", "", "", "", "", "", item.text, item.aiConversationReady, item.aiDraft, "", "", "", "", ""]),
    ...state.scared.map((item) => ["scared", item.date, item.total, "", "", "", "", "", "", "", "", "", "", "", "", item.respondent, item.total, item.totalElevated, item.subscales.map((scale) => `${scale.label}:${scale.score}/${scale.cutoff}`).join("; "), JSON.stringify(item.answers)]),
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function followUpSummary() {
  const daily = state.daily;
  const recent = daily.slice(-7);
  return [
    "复诊摘要（本地生成）",
    `生成日期：${today()}`,
    `最近 7 日日常负荷均值：${recent.length ? Math.round(mean(recent.map((item) => item.dailyScore))) : "--"}`,
    `最近 7 日平均睡眠：${recent.length ? mean(recent.map((item) => item.sleepHours)).toFixed(1) : "--"} 小时`,
    `最近 7 日平均躯体化/疼痛：${recent.length ? mean(recent.map((item) => item.somaticLevel)).toFixed(1) : "--"}/4`,
    `最近一次 SCARED：${state.scared.length ? `${state.scared[state.scared.length - 1].date}，总分 ${state.scared[state.scared.length - 1].total}/82` : "暂无"}`,
    "",
    "最近三条日常记录：",
    ...daily.slice(-3).reverse().map((item) => `${item.date}：负荷 ${item.dailyScore}/100，睡眠 ${item.sleepHours}h，躯体化/疼痛 ${item.somaticLevel}/4，随心记录：${item.note || "无"}`),
  ].join("\n");
}

function download(name, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

render();
