import { useEffect, useMemo, useState } from "react";
import AuthPanel from "./components/AuthPanel.jsx";
import { supabase, isSupabaseConfigured } from "./lib/supabase.js";
import { clearRemoteState, hasRecords, loadRemoteState, syncStateToRemote } from "./lib/remoteStore.js";
import { SCARED_ITEMS, SCARED_OPTIONS, SCARED_TOTAL_CUTOFF, createEmptyScaredAnswers, scoreScared } from "./scaredScale.js";

const STORAGE_KEY = "patient-monitor-records-v2";
const today = () => new Date().toISOString().slice(0, 10);

const defaultDailyForm = {
  date: today(),
  sleepHours: 7,
  sleepQuality: 2,
  somaticLevel: 2,
  rechargeEase: 2,
  affirmation1: "",
  affirmation2: "",
  affirmation3: "",
  note: "",
};

const defaultWeeklyForm = {
  weekDate: today(),
  mood: 2,
  anxiety: 2,
  interest: 2,
  energy: 2,
  functioning: 2,
  riskFlag: false,
  note: "",
};

const defaultScaredForm = {
  date: today(),
  respondent: "儿童/青少年自评",
  answers: createEmptyScaredAnswers(),
};

const dailySliders = [
  ["sleepQuality", "睡眠质量"],
  ["somaticLevel", "躯体化/疼痛"],
  ["rechargeEase", "给今天打个分吧"],
];

const weeklyItems = [
  ["mood", "情绪低落/压抑"],
  ["anxiety", "焦虑/担忧"],
  ["interest", "兴趣下降"],
  ["energy", "精力不足"],
  ["functioning", "学习、工作或生活功能受影响"],
];

const integrationCards = [
  ["睡眠质量接口", "待接入", "未来可从手环、手机健康数据或睡眠 App 读取睡眠时长、醒来次数、睡眠评分。"],
  ["蓝牙设备接口", "待接入", "预留 BLE 设备连接入口，可接肌电、心率、皮电或疼痛相关可穿戴设备。"],
  ["联网同步接口", "本地模式", "当前数据只保存在浏览器。未来可接登录、数据库、医生端和加密同步。"],
  ["App 使用监管接口", "待接入", "预留每日短视频、社交软件、游戏等使用时长字段，后续可由系统权限或手动导入。"],
];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { daily: saved?.daily || [], weekly: saved?.weekly || [], vents: saved?.vents || [], scared: saved?.scared || [] };
  } catch {
    return { daily: [], weekly: [], vents: [], scared: [] };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function somaticLevel(record) {
  return Number(record.somaticLevel ?? record.muscleTension ?? 0);
}

function rechargeEase(record) {
  return Number(record.rechargeEase ?? record.recovery ?? 0);
}

function scoreDaily(record) {
  const sleepPenalty = record.sleepHours < 6 ? (6 - record.sleepHours) * 9 : record.sleepHours > 9.5 ? (record.sleepHours - 9.5) * 4 : 0;
  const qualityPenalty = (4 - record.sleepQuality) * 10;
  const somaticPenalty = somaticLevel(record) * 14;
  const rechargeBuffer = rechargeEase(record) * 8;
  return Math.round(clamp(20 + sleepPenalty + qualityPenalty + somaticPenalty - rechargeBuffer, 0, 100));
}

function scoreWeekly(record) {
  const symptomTotal = weeklyItems.reduce((sum, [id]) => sum + Number(record[id]), 0);
  return Math.round((symptomTotal / 20) * 100);
}

function severity(score) {
  if (score >= 75) return "高负荷";
  if (score >= 50) return "中等负荷";
  if (score >= 25) return "轻度负荷";
  return "低负荷";
}

function dailyExplanation(record) {
  if (!record) return [];
  const sleepPenalty = record.sleepHours < 6 ? (6 - record.sleepHours) * 9 : record.sleepHours > 9.5 ? (record.sleepHours - 9.5) * 4 : 0;
  return [
    { label: "躯体化/疼痛", value: somaticLevel(record) * 14, text: `身体不舒服、疼痛或紧绷 ${somaticLevel(record)}/4` },
    { label: "睡眠质量", value: (4 - record.sleepQuality) * 10, text: `睡眠质量 ${record.sleepQuality}/4` },
    { label: "睡眠时长", value: sleepPenalty, text: `睡眠 ${record.sleepHours} 小时` },
    { label: "缓过来一点", value: rechargeEase(record) * -8, text: `今天能喘口气、放松一点 ${rechargeEase(record)}/4` },
  ];
}

function reliabilitySignal(daily, weekly) {
  if (!daily.length) return { title: "暂无一致性信息", text: "连续记录几天后，系统会提示数据是否足够稳定。", level: "neutral" };
  const recent = daily.slice(-7);
  const missingAffirmations = recent.filter((item) => !item.affirmation1 && !item.affirmation2 && !item.affirmation3).length;
  const repeated = recent.length >= 4 && new Set(recent.map((item) => `${item.sleepHours}-${somaticLevel(item)}-${rechargeEase(item)}`)).size <= 2;
  const latestWeekly = weekly[weekly.length - 1];
  const latestDaily = daily[daily.length - 1];

  if (latestWeekly?.riskFlag) {
    return { title: "需要人工复核", text: "周评里出现了风险勾选。真实产品中应提示联系医生、家属或本地急救资源，不能由系统单独处理。", level: "high" };
  }
  if (repeated || missingAffirmations >= 5) {
    return { title: "记录质量可能偏低", text: "最近记录存在高度重复或积极记录缺失。这里不判断真假，只提示数据可能需要复核或降低填写负担。", level: "medium" };
  }
  if (latestWeekly && latestWeekly.score >= 70 && latestDaily?.dailyScore <= 35) {
    return { title: "主观周评与日常状态不一致", text: "周评症状较高，但最新日常负荷较低。可能是状态波动、填写情境不同，或日常指标不足以覆盖症状。", level: "medium" };
  }
  return { title: "记录可用于趋势观察", text: "当前数据没有明显质量警号。仍应把它视为随访线索，而不是诊断结论。", level: "low" };
}

function clinicalSignal(daily, weekly) {
  if (!daily.length && !weekly.length) {
    return { title: "等待记录", text: "每日只记录睡眠、躯体化/疼痛和一点点恢复情况，每周再做一次标准量表，可以减少负担并保留趋势信息。" };
  }
  const recent = daily.slice(-7);
  const latestWeekly = weekly[weekly.length - 1];
  const dailyAverage = recent.length ? mean(recent.map((item) => item.dailyScore)) : 0;
  const highSomaticDays = recent.filter((item) => somaticLevel(item) >= 3).length;
  const poorSleepDays = recent.filter((item) => item.sleepHours < 6 || item.sleepQuality <= 1).length;

  if (latestWeekly?.riskFlag) return { title: "高优先级复核", text: "周评出现风险勾选。面向患者的正式版本必须显示清晰的求助路径，并建议联系医生或可信赖的人。" };
  if (dailyAverage >= 70 || highSomaticDays >= 4) return { title: "躯体化/疼痛持续偏高", text: "最近一周身体不舒服、疼痛或紧绷感偏高。建议在复诊摘要中标记，并记录疼痛部位、姿势、药物变化和压力事件。" };
  if (poorSleepDays >= 3) return { title: "睡眠是当前重点", text: "最近一周睡眠偏短或质量较差。睡眠变化常常比单日情绪更早暴露波动。" };
  if (latestWeekly && latestWeekly.score >= 55) return { title: "周评提示症状负荷", text: "周评分数处于中高区间，但日常监测仍要看趋势。可以把睡眠、躯体化/疼痛和功能受损一起带给医生讨论。" };
  return { title: "近期相对平稳", text: "日常指标没有明显升高。可以继续低负担记录，重点观察睡眠、身体不舒服和恢复行为的关系。" };
}

function createSeedState() {
  const daily = [];
  const weekly = [];
  const vents = [];
  const now = new Date();
  for (let i = 27; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const wave = Math.sin((27 - i) / 3.1);
    const record = {
      date: date.toISOString().slice(0, 10),
      sleepHours: Math.round((7.1 - Math.max(0, wave) * 1.3 + Math.random() * 0.7) * 2) / 2,
      sleepQuality: clamp(Math.round(2.4 - wave * 0.8 + Math.random()), 0, 4),
      somaticLevel: clamp(Math.round(1.8 + wave * 1.2 + Math.random()), 0, 4),
      rechargeEase: clamp(Math.round(2.2 - wave * 0.5 + Math.random()), 0, 4),
      affirmation1: wave > 0.7 ? "按时吃饭" : "完成了一件小事",
      affirmation2: wave > 0.7 ? "愿意记录状态" : "给自己留了休息时间",
      affirmation3: wave > 0.7 ? "撑过了难的一天" : "睡前放下手机一会儿",
      note: wave > 0.7 ? "压力较高，头痛和肩颈不舒服。" : "状态相对平稳。",
      shortVideoMinutes: wave > 0.7 ? 95 : 35,
      createdAt: new Date().toISOString(),
    };
    daily.push({ ...record, dailyScore: scoreDaily(record) });
  }
  for (let i = 3; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i * 7);
    const wave = Math.sin((3 - i) / 1.3);
    const record = {
      weekDate: date.toISOString().slice(0, 10),
      mood: clamp(Math.round(1.7 + wave + Math.random()), 0, 4),
      anxiety: clamp(Math.round(1.8 + wave + Math.random()), 0, 4),
      interest: clamp(Math.round(1.4 + wave * 0.8 + Math.random()), 0, 4),
      energy: clamp(Math.round(1.8 + wave + Math.random()), 0, 4),
      functioning: clamp(Math.round(1.3 + wave * 0.8 + Math.random()), 0, 4),
      riskFlag: false,
      note: "示例周评记录",
      createdAt: new Date().toISOString(),
    };
    weekly.push({ ...record, score: scoreWeekly(record) });
  }
  vents.push({ id: "seed", createdAt: new Date().toISOString(), text: "今天很烦，但我先把它写下来。", aiConversationReady: true, aiDraft: "请先倾听，不要急着给建议。" });
  const scaredAnswers = createEmptyScaredAnswers();
  [2, 5, 7, 17, 23, 28, 33, 35, 37].forEach((id) => {
    scaredAnswers[id] = 1;
  });
  [1, 3, 10, 18, 39].forEach((id) => {
    scaredAnswers[id] = 2;
  });
  const scaredScore = scoreScared(scaredAnswers);
  const scared = [
    {
      id: "seed-scared",
      date: today(),
      respondent: "儿童/青少年自评",
      answers: scaredAnswers,
      ...scaredScore,
      createdAt: new Date().toISOString(),
    },
  ];
  return { daily, weekly, vents, scared };
}

function toCsv(daily, weekly, vents, scared) {
  const headers = ["type", "date", "score", "sleepHours", "sleepQuality", "somaticLevel", "rechargeEase", "shortVideoMinutes", "affirmation1", "affirmation2", "affirmation3", "note", "treeHoleText", "aiConversationReady", "aiDraft", "riskFlag", "respondent", "scaredTotal", "scaredElevated", "scaredSubscales", "scaredAnswers"];
  const rows = [
    ...daily.map((item) => ({ type: "daily", date: item.date, score: item.dailyScore, ...item })),
    ...weekly.map((item) => ({ type: "weekly", date: item.weekDate, score: item.score, ...item })),
    ...vents.map((item) => ({ type: "treehole", date: item.createdAt.slice(0, 10), treeHoleText: item.text, aiConversationReady: item.aiConversationReady, aiDraft: item.aiDraft })),
    ...scared.map((item) => ({
      type: "scared",
      date: item.date,
      score: item.total,
      respondent: item.respondent,
      scaredTotal: item.total,
      scaredElevated: item.totalElevated,
      scaredSubscales: item.subscales.map((scale) => `${scale.label}:${scale.score}/${scale.cutoff}`).join("; "),
      scaredAnswers: JSON.stringify(item.answers),
    })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function nextWeeklyDue(weekly) {
  if (!weekly.length) return "今天可以做第一次周评";
  const latest = new Date(weekly[weekly.length - 1].weekDate);
  latest.setDate(latest.getDate() + 7);
  return latest.toISOString().slice(0, 10);
}

function TrendChart({ daily, weekly }) {
  const items = daily.slice(-30);
  const width = 920;
  const height = 420;
  const padding = { top: 34, right: 32, bottom: 52, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const xStep = items.length > 1 ? chartWidth / (items.length - 1) : chartWidth;
  const points = items.map((item, index) => ({
    ...item,
    x: padding.left + index * xStep,
    y: padding.top + chartHeight - (item.dailyScore / 100) * chartHeight,
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const weeklyByDate = new Map(weekly.map((item) => [item.weekDate, item]));

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="睡眠与躯体化日常负荷趋势图">
      <rect width={width} height={height} fill="#fbfcfb" />
      <rect x={padding.left} y={padding.top} width={chartWidth} height={chartHeight * 0.3} fill="rgba(197,82,69,0.08)" />
      <text x={padding.left + 10} y={padding.top + 22} fill="#c55245" fontSize="15">需关注</text>
      {[0, 25, 50, 75, 100].map((value) => {
        const y = padding.top + chartHeight - (value / 100) * chartHeight;
        return (
          <g key={value}>
            <line x1={padding.left} y1={y} x2={padding.left + chartWidth} y2={y} stroke="#d9e1df" />
            <text x="14" y={y + 5} fill="#66737c" fontSize="14">{value}</text>
          </g>
        );
      })}
      {!items.length && <text x={padding.left + 18} y={padding.top + 56} fill="#66737c" fontSize="24">保存日常记录后显示趋势</text>}
      {items.length > 0 && (
        <>
          <path d={path} fill="none" stroke="#19735f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point) => {
            const hasWeekly = weeklyByDate.has(point.date);
            return (
              <g key={point.date}>
                <circle cx={point.x} cy={point.y} r={hasWeekly ? 8 : 6} fill={point.dailyScore >= 70 ? "#c55245" : point.dailyScore >= 45 ? "#c9851a" : "#19735f"} />
                {hasWeekly && <circle cx={point.x} cy={point.y} r="12" fill="none" stroke="#315f9f" strokeWidth="2" />}
              </g>
            );
          })}
          <text x={padding.left} y={height - 18} fill="#66737c" fontSize="15">{items[0].date.slice(5)}</text>
          <text x={width - padding.right} y={height - 18} fill="#66737c" fontSize="15" textAnchor="end">{items[items.length - 1].date.slice(5)}</text>
        </>
      )}
    </svg>
  );
}

export default function App() {
  const [dailyForm, setDailyForm] = useState(defaultDailyForm);
  const [weeklyForm, setWeeklyForm] = useState(defaultWeeklyForm);
  const [scaredForm, setScaredForm] = useState(defaultScaredForm);
  const [ventText, setVentText] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [state, setState] = useState(() => loadState());
  const [session, setSession] = useState(null);
  const [authBusy, setAuthBusy] = useState(isSupabaseConfigured);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [status, setStatus] = useState("本地保存");

  const daily = useMemo(() => [...state.daily].sort((a, b) => a.date.localeCompare(b.date)), [state.daily]);
  const weekly = useMemo(() => [...state.weekly].sort((a, b) => a.weekDate.localeCompare(b.weekDate)), [state.weekly]);
  const vents = useMemo(() => [...(state.vents || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [state.vents]);
  const scared = useMemo(() => [...(state.scared || [])].sort((a, b) => a.date.localeCompare(b.date)), [state.scared]);
  const latestDaily = daily[daily.length - 1];
  const latestWeekly = weekly[weekly.length - 1];
  const latestScared = scared[scared.length - 1];
  const recentDaily = daily.slice(-7);
  const dailyAverage = recentDaily.length ? Math.round(mean(recentDaily.map((item) => item.dailyScore))) : "--";
  const sleepAverage = recentDaily.length ? mean(recentDaily.map((item) => item.sleepHours)).toFixed(1) : "--";
  const somaticAverage = recentDaily.length ? mean(recentDaily.map((item) => somaticLevel(item))).toFixed(1) : "--";
  const signal = clinicalSignal(daily, weekly);
  const reliability = reliabilitySignal(daily, weekly);
  const explanation = dailyExplanation(latestDaily);
  const busy = authBusy || remoteBusy;

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuthBusy(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthBusy(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;

    async function hydrateFromCloud() {
      setRemoteBusy(true);
      setStatus("正在读取云端数据");
      try {
        const remoteState = await loadRemoteState();
        if (!active) return;
        if (hasRecords(remoteState)) {
          setState(remoteState);
          saveState(remoteState);
          setStatus("云端数据已加载");
        } else if (hasRecords(state)) {
          await syncStateToRemote(state);
          setStatus("本地历史数据已同步到云端");
        } else {
          setStatus("云端同步已开启");
        }
      } catch (error) {
        if (active) setStatus(`云端读取失败：${error.message}`);
      } finally {
        if (active) setRemoteBusy(false);
      }
    }

    hydrateFromCloud();
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  function baseStatus() {
    return session ? "云端同步已开启" : "本地保存";
  }

  function showTemporaryStatus(message, delay = 2200) {
    setStatus(message);
    window.setTimeout(() => setStatus(baseStatus()), delay);
  }

  function persist(nextState, message) {
    const ordered = {
      daily: [...nextState.daily].sort((a, b) => a.date.localeCompare(b.date)),
      weekly: [...nextState.weekly].sort((a, b) => a.weekDate.localeCompare(b.weekDate)),
      vents: [...(nextState.vents || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      scared: [...(nextState.scared || [])].sort((a, b) => a.date.localeCompare(b.date)),
    };
    setState(ordered);
    saveState(ordered);
    if (!session) {
      showTemporaryStatus(message);
      return;
    }
    setStatus(`${message}，正在同步云端`);
    syncStateToRemote(ordered)
      .then(() => showTemporaryStatus(`${message}，已同步云端`))
      .catch((error) => setStatus(`${message}，云端同步失败：${error.message}`));
  }

  function updateDailyField(name, value) {
    setDailyForm((current) => ({ ...current, [name]: value }));
  }

  function updateWeeklyField(name, value) {
    setWeeklyForm((current) => ({ ...current, [name]: value }));
  }

  function updateScaredAnswer(id, value) {
    setScaredForm((current) => ({
      ...current,
      answers: { ...current.answers, [id]: Number(value) },
    }));
  }

  function saveDaily(event) {
    event.preventDefault();
    const raw = {
      ...dailyForm,
      sleepHours: Number(dailyForm.sleepHours),
      sleepQuality: Number(dailyForm.sleepQuality),
      somaticLevel: Number(dailyForm.somaticLevel),
      rechargeEase: Number(dailyForm.rechargeEase),
      shortVideoMinutes: null,
      sleepDeviceStatus: "manual",
      bluetoothDeviceStatus: "not_connected",
      networkSyncStatus: "local_only",
      note: dailyForm.note.trim(),
      createdAt: new Date().toISOString(),
    };
    const record = { ...raw, dailyScore: scoreDaily(raw) };
    persist({ ...state, daily: [...daily.filter((item) => item.date !== record.date), record] }, "日常记录已保存");
  }

  function saveWeekly(event) {
    event.preventDefault();
    const raw = {
      ...weeklyForm,
      mood: Number(weeklyForm.mood),
      anxiety: Number(weeklyForm.anxiety),
      interest: Number(weeklyForm.interest),
      energy: Number(weeklyForm.energy),
      functioning: Number(weeklyForm.functioning),
      note: weeklyForm.note.trim(),
      createdAt: new Date().toISOString(),
    };
    const record = { ...raw, score: scoreWeekly(raw) };
    persist({ ...state, weekly: [...weekly.filter((item) => item.weekDate !== record.weekDate), record] }, "周评已保存");
  }

  function saveScared(event) {
    event.preventDefault();
    const result = scoreScared(scaredForm.answers);
    const record = {
      id: crypto.randomUUID?.() || `scared-${Date.now()}`,
      date: scaredForm.date,
      respondent: scaredForm.respondent,
      answers: scaredForm.answers,
      ...result,
      createdAt: new Date().toISOString(),
    };
    persist({ ...state, scared: [...scared.filter((item) => item.date !== record.date), record] }, "SCARED 量表已保存");
  }

  function saveVent(event) {
    event.preventDefault();
    const text = ventText.trim();
    if (!text) return;
    const entry = {
      id: crypto.randomUUID?.() || String(Date.now()),
      createdAt: new Date().toISOString(),
      text,
      aiConversationReady: Boolean(aiDraft.trim()),
      aiDraft: aiDraft.trim(),
    };
    persist({ ...state, vents: [...vents, entry] }, "树洞内容已保存");
    setVentText("");
    setAiDraft("");
  }

  function seedData() {
    persist(createSeedState(), "示例数据已生成");
  }

  async function signOut() {
    if (!supabase) return;
    setRemoteBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      setStatus("已退出，切回本地保存");
    } catch (error) {
      setStatus(`退出失败：${error.message}`);
    } finally {
      setRemoteBusy(false);
    }
  }

  function exportCsv() {
    if (!daily.length && !weekly.length && !vents.length && !scared.length) {
      setStatus("暂无数据可导出");
      return;
    }
    const blob = new Blob([toCsv(daily, weekly, vents, scared)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "patient-monitor-local-data.csv";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("CSV 已导出");
  }

  function exportSummary() {
    const lines = [
      "复诊摘要（本地生成）",
      `生成日期：${today()}`,
      "",
      `最近 7 日日常负荷均值：${dailyAverage}`,
      `最近 7 日平均睡眠：${sleepAverage} 小时`,
      `最近 7 日平均躯体化/疼痛：${somaticAverage}/4`,
      `最近一次周评：${latestWeekly ? `${latestWeekly.weekDate}，${latestWeekly.score}/100（${severity(latestWeekly.score)}）` : "暂无"}`,
      `最近一次 SCARED：${latestScared ? `${latestScared.date}，总分 ${latestScared.total}/${SCARED_ITEMS.length * 2}（${latestScared.totalElevated ? "达到筛查关注线" : "未达筛查关注线"}）` : "暂无"}`,
      "",
      `当前提示：${signal.title}`,
      signal.text,
      "",
      "最近三条日常记录：",
      ...daily.slice(-3).reverse().map((item) => `${item.date}：负荷 ${item.dailyScore}/100，睡眠 ${item.sleepHours}h，躯体化/疼痛 ${somaticLevel(item)}/4，随心记录：${item.note || "无"}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "follow-up-summary.txt";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("复诊摘要已导出");
  }

  function clearAll() {
    if (!daily.length && !weekly.length && !vents.length && !scared.length) return;
    if (!window.confirm(session ? "确定清空本地和当前账号的云端记录吗？" : "确定清空所有本地记录吗？")) return;
    persist({ daily: [], weekly: [], vents: [], scared: [] }, "数据已清空");
    if (session) {
      clearRemoteState()
        .then(() => showTemporaryStatus("本地和云端数据已清空"))
        .catch((error) => setStatus(`本地已清空，云端清空失败：${error.message}`));
    }
  }

  function placeholder(message) {
    showTemporaryStatus(message);
  }

  return (
    <main className="app">
      <section className="topbar">
        <div>
          <p className="eyebrow">Low Burden Patient Monitor</p>
          <h1>精神心理随访demo</h1>
          <p className="lead">日常记录睡眠、躯体化/疼痛和三件自我肯定；每周一次标准化周评，减少填写负担。</p>
        </div>
        <div className="top-actions">
          <button type="button" onClick={seedData}>生成示例数据</button>
          <button type="button" onClick={exportCsv}>导出 CSV</button>
          <button type="button" onClick={exportSummary}>导出复诊摘要</button>
        </div>
      </section>

      <AuthPanel session={session} busy={busy} onSignOut={signOut} onMessage={setStatus} />

      <section className="summary" aria-live="polite">
        <article><span>最新日常负荷</span><strong>{latestDaily ? latestDaily.dailyScore : "--"}</strong></article>
        <article><span>7 日均值</span><strong>{dailyAverage}</strong></article>
        <article><span>平均睡眠</span><strong>{sleepAverage}</strong></article>
        <article><span>平均躯体化</span><strong>{somaticAverage}</strong></article>
      </section>

      <section className="workspace">
        <form className="entry" onSubmit={saveDaily}>
          <div className="form-head">
            <div><p className="eyebrow">Daily 60 Seconds</p><h2>日常低负担记录</h2></div>
            <label>日期<input value={dailyForm.date} onChange={(event) => updateDailyField("date", event.target.value)} type="date" required /></label>
          </div>

          <div className="number-row single">
            <label>睡眠小时<input value={dailyForm.sleepHours} onChange={(event) => updateDailyField("sleepHours", event.target.value)} type="number" min="0" max="14" step="0.5" /></label>
          </div>

          <div className="slider-list compact">
            {dailySliders.map(([id, label]) => (
              <label key={id}>
                <span>{label}</span>
                <input value={dailyForm[id]} onChange={(event) => updateDailyField(id, Number(event.target.value))} type="range" min="0" max="4" />
                <output>{dailyForm[id]}</output>
              </label>
            ))}
          </div>

          <fieldset className="affirmations">
            <legend>今天值得肯定自己的三件事</legend>
            <input value={dailyForm.affirmation1} onChange={(event) => updateDailyField("affirmation1", event.target.value)} placeholder="比如：按时吃饭" />
            <input value={dailyForm.affirmation2} onChange={(event) => updateDailyField("affirmation2", event.target.value)} placeholder="比如：完成了一件小事" />
            <input value={dailyForm.affirmation3} onChange={(event) => updateDailyField("affirmation3", event.target.value)} placeholder="比如：愿意记录今天的状态" />
          </fieldset>

          <label className="note-field">随心记录<textarea value={dailyForm.note} onChange={(event) => updateDailyField("note", event.target.value)} rows="3" placeholder="想写什么都可以：身体哪里不舒服、今天发生了什么、服药变化、压力事件" /></label>
          <button className="primary" type="submit">保存日常记录</button>
        </form>

        <section className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Trend</p><h2>最近 30 天睡眠与躯体化趋势</h2></div>
            <button className="danger" type="button" onClick={clearAll}>清空数据</button>
          </div>
          <TrendChart daily={daily} weekly={weekly} />
        </section>
      </section>

      <section className="integration-grid">
        {integrationCards.map(([title, cardStatus, text]) => (
          <article className="integration-card" key={title}>
            <div><p className="eyebrow">Interface</p><h2>{title}</h2></div>
            <span>{title === "联网同步接口" ? (session ? "云端同步" : "本地模式") : cardStatus}</span>
            <p>{title === "联网同步接口" ? (session ? "已接入 Supabase Auth 与数据库，同账号可跨设备读取记录。" : text) : text}</p>
            {title === "睡眠质量接口" && <button type="button" onClick={() => placeholder("睡眠质量接口已预留，尚未实装")}>同步睡眠</button>}
            {title === "蓝牙设备接口" && <button type="button" onClick={() => placeholder("蓝牙设备接口已预留，尚未实装")}>连接蓝牙</button>}
            {title === "App 使用监管接口" && <button type="button" onClick={() => placeholder("App 使用监管接口已预留，尚未实装")}>读取使用时长</button>}
          </article>
        ))}
      </section>

      <section className="weekly-card">
        <form className="weekly-form" onSubmit={saveWeekly}>
          <div className="form-head">
            <div><p className="eyebrow">Weekly Scale</p><h2>每周一次标准化周评</h2><p className="subtle">下一次建议日期：{nextWeeklyDue(weekly)}</p></div>
            <label>周评日期<input value={weeklyForm.weekDate} onChange={(event) => updateWeeklyField("weekDate", event.target.value)} type="date" required /></label>
          </div>

          <div className="scale-grid">
            {weeklyItems.map(([id, label]) => (
              <label key={id}>
                <span>{label}</span>
                <input value={weeklyForm[id]} onChange={(event) => updateWeeklyField(id, Number(event.target.value))} type="range" min="0" max="4" />
                <output>{weeklyForm[id]}</output>
              </label>
            ))}
          </div>

          <label className="risk-check"><input checked={weeklyForm.riskFlag} onChange={(event) => updateWeeklyField("riskFlag", event.target.checked)} type="checkbox" /><span>本周出现需要医生或可信赖的人尽快知道的风险想法/行为</span></label>
          <label className="note-field">周评备注<textarea value={weeklyForm.note} onChange={(event) => updateWeeklyField("note", event.target.value)} rows="3" placeholder="可选：本周变化、诱因、药物副作用、想和医生讨论的问题" /></label>
          <button className="primary" type="submit">保存周评</button>
        </form>
      </section>

      <section className="scared-card">
        <form className="scared-form" onSubmit={saveScared}>
          <div className="form-head">
            <div>
              <p className="eyebrow">SCARED Scale</p>
              <h2>儿童青少年焦虑性情绪筛查量表</h2>
              <p className="subtle">根据最近 3 个月的实际感受填写：0 = 没有此问题，1 = 有时有，2 = 经常有。筛查结果只作为临床沟通线索。</p>
            </div>
            <div className="scared-meta">
              <label>
                填写日期
                <input value={scaredForm.date} onChange={(event) => setScaredForm((current) => ({ ...current, date: event.target.value }))} type="date" required />
              </label>
              <label>
                填写人
                <input value={scaredForm.respondent} onChange={(event) => setScaredForm((current) => ({ ...current, respondent: event.target.value }))} />
              </label>
            </div>
          </div>

          <div className="scared-summary">
            {latestScared ? (
              <>
                <strong>最近一次：{latestScared.total}/82</strong>
                <span>{latestScared.totalElevated ? "达到筛查关注线" : "未达筛查关注线"} · 总分关注线 {SCARED_TOTAL_CUTOFF}</span>
              </>
            ) : (
              <>
                <strong>尚未保存 SCARED 记录</strong>
                <span>保存后会显示总分和五个分量表。</span>
              </>
            )}
          </div>

          {latestScared && (
            <div className="subscale-grid">
              {latestScared.subscales.map((scale) => (
                <article className={scale.elevated ? "subscale elevated" : "subscale"} key={scale.key}>
                  <span>{scale.label}</span>
                  <strong>{scale.score}</strong>
                  <small>关注线 {scale.cutoff}</small>
                </article>
              ))}
            </div>
          )}

          <details className="scared-items">
            <summary>展开 41 个题目</summary>
            <div className="scared-list">
              {SCARED_ITEMS.map((item) => (
                <label className="scared-item" key={item.id}>
                  <span>{item.id}. {item.text}</span>
                  <select value={scaredForm.answers[item.id]} onChange={(event) => updateScaredAnswer(item.id, event.target.value)}>
                    {SCARED_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>{option.value} - {option.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </details>

          <button className="primary" type="submit">保存 SCARED 量表</button>
        </form>
      </section>

      <section className="tree-hole">
        <form onSubmit={saveVent}>
          <div className="form-head">
            <div><p className="eyebrow">Private Outlet</p><h2>树洞</h2><p className="subtle">可以发泄情绪、输出负能量或写下不想整理的话。登录后会同步到当前账号。</p></div>
            <span className="save-status">{session ? "云端同步 + AI 接口预留" : "AI 接口预留"}</span>
          </div>
          <textarea value={ventText} onChange={(event) => setVentText(event.target.value)} rows="5" placeholder="把今天憋着的话写在这里。这里不是诊断，也不会评价你。" />
          <label className="note-field">未来 AI 对话上下文接口<textarea value={aiDraft} onChange={(event) => setAiDraft(event.target.value)} rows="3" placeholder="可选：未来接入 AI 时，希望它如何回应？比如只倾听、帮我整理、提醒我联系医生。" /></label>
          <button className="primary" type="submit">存入树洞</button>
        </form>
      </section>

      <section className="insight-grid">
        <article className="insight"><p className="eyebrow">Current Signal</p><h2>{signal.title}</h2><p>{signal.text}</p></article>
        <article className={`insight reliability ${reliability.level}`}><p className="eyebrow">Data Quality</p><h2>{reliability.title}</h2><p>{reliability.text}</p></article>
      </section>

      <section className="analysis-grid">
        <article className="panel">
          <div className="panel-head"><div><p className="eyebrow">Score Explanation</p><h2>最新评分解释</h2></div><span className="save-status">{status}</span></div>
          {!latestDaily && <p className="empty">暂无日常记录。</p>}
          {latestDaily && (
            <div className="explain-list">
              {explanation.map((item) => (
                <div className="explain-row" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value > 0 ? `+${Math.round(item.value)}` : Math.round(item.value)}</strong>
                  <p>{item.text}</p>
                </div>
              ))}
              <div className="score-total"><span>最终日常负荷</span><strong>{latestDaily.dailyScore}/100 · {severity(latestDaily.dailyScore)}</strong></div>
            </div>
          )}
        </article>

        <article className="records">
          <div className="panel-head"><h2>最近记录</h2><span className="save-status">{status}</span></div>
          <div className="record-list">
            {!daily.length && <p className="empty">暂无日常记录。</p>}
            {daily.slice().reverse().slice(0, 8).map((item) => (
              <article className="record" key={item.date}>
                <strong>{item.date}</strong>
                <span className="score">{item.dailyScore}</span>
                <p title={item.note || `睡眠 ${item.sleepHours}h，躯体化/疼痛 ${somaticLevel(item)}/4`}>睡眠 {item.sleepHours}h · 躯体化 {somaticLevel(item)}/4</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="research-note">
        <h2>定位说明</h2>
        <p>这个版本面向“已确诊患者的日常随访练习”：日常指标只做趋势监测，每周周评用于标准化回顾。Supabase 已用于账号和云端数据保存；蓝牙、AI 对话和 App 使用监管目前仍是接口占位。它不是诊断工具，也不能替代医生评估；风险勾选只作为复核提示，正式产品必须接入明确的危机处理流程。</p>
      </section>
    </main>
  );
}
