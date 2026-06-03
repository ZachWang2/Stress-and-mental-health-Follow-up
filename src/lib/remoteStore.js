import { supabase } from "./supabase.js";

const emptyState = () => ({ daily: [], weekly: [], vents: [], scared: [] });

export function hasRecords(state) {
  return Boolean(state?.daily?.length || state?.weekly?.length || state?.vents?.length || state?.scared?.length);
}

async function getUser() {
  if (!supabase) throw new Error("Supabase 尚未配置");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("尚未登录");
  return data.user;
}

function assertNoError(result) {
  if (result.error) throw result.error;
  return result.data;
}

function toDailyRow(record, userId) {
  return {
    user_id: userId,
    date: record.date,
    daily_score: record.dailyScore,
    sleep_hours: record.sleepHours,
    sleep_quality: record.sleepQuality,
    somatic_level: record.somaticLevel,
    recharge_ease: record.rechargeEase,
    short_video_minutes: record.shortVideoMinutes,
    payload: record,
  };
}

function fromDailyRow(row) {
  const payload = row.payload || {};
  return {
    ...payload,
    date: row.date,
    dailyScore: row.daily_score ?? payload.dailyScore,
    sleepHours: row.sleep_hours ?? payload.sleepHours,
    sleepQuality: row.sleep_quality ?? payload.sleepQuality,
    somaticLevel: row.somatic_level ?? payload.somaticLevel,
    rechargeEase: row.recharge_ease ?? payload.rechargeEase,
    shortVideoMinutes: row.short_video_minutes ?? payload.shortVideoMinutes,
    createdAt: payload.createdAt || row.created_at,
  };
}

function toWeeklyRow(record, userId) {
  return {
    user_id: userId,
    date: record.weekDate,
    score: record.score,
    risk_flag: record.riskFlag,
    payload: record,
  };
}

function fromWeeklyRow(row) {
  const payload = row.payload || {};
  return {
    ...payload,
    weekDate: row.date,
    score: row.score ?? payload.score,
    riskFlag: row.risk_flag ?? payload.riskFlag,
    createdAt: payload.createdAt || row.created_at,
  };
}

function toScaredRow(record, userId) {
  return {
    user_id: userId,
    date: record.date,
    respondent: record.respondent,
    total: record.total,
    total_elevated: record.totalElevated,
    subscales: record.subscales,
    answers: record.answers,
    payload: record,
  };
}

function fromScaredRow(row) {
  const payload = row.payload || {};
  return {
    ...payload,
    id: payload.id || row.id,
    date: row.date,
    respondent: row.respondent ?? payload.respondent,
    total: row.total ?? payload.total,
    totalElevated: row.total_elevated ?? payload.totalElevated,
    subscales: row.subscales ?? payload.subscales,
    answers: row.answers ?? payload.answers,
    createdAt: payload.createdAt || row.created_at,
  };
}

function toTreeholeRow(entry, userId) {
  const row = {
    user_id: userId,
    text: entry.text,
    ai_conversation_ready: entry.aiConversationReady,
    ai_draft: entry.aiDraft,
    payload: entry,
    created_at: entry.createdAt,
  };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id)) {
    row.id = entry.id;
  }
  return row;
}

function fromTreeholeRow(row) {
  const payload = row.payload || {};
  return {
    ...payload,
    id: row.id,
    createdAt: row.created_at,
    text: row.text ?? payload.text,
    aiConversationReady: row.ai_conversation_ready ?? payload.aiConversationReady,
    aiDraft: row.ai_draft ?? payload.aiDraft,
  };
}

export async function loadRemoteState() {
  await getUser();
  const [daily, weekly, vents, scared] = await Promise.all([
    supabase.from("daily_records").select("*").order("date", { ascending: true }),
    supabase.from("weekly_records").select("*").order("date", { ascending: true }),
    supabase.from("treehole_entries").select("*").order("created_at", { ascending: true }),
    supabase.from("scared_records").select("*").order("date", { ascending: true }),
  ]);

  return {
    daily: assertNoError(daily).map(fromDailyRow),
    weekly: assertNoError(weekly).map(fromWeeklyRow),
    vents: assertNoError(vents).map(fromTreeholeRow),
    scared: assertNoError(scared).map(fromScaredRow),
  };
}

export async function syncStateToRemote(state) {
  const user = await getUser();
  const tasks = [];

  if (state.daily?.length) {
    tasks.push(supabase.from("daily_records").upsert(state.daily.map((record) => toDailyRow(record, user.id)), { onConflict: "user_id,date" }));
  }
  if (state.weekly?.length) {
    tasks.push(supabase.from("weekly_records").upsert(state.weekly.map((record) => toWeeklyRow(record, user.id)), { onConflict: "user_id,date" }));
  }
  if (state.scared?.length) {
    tasks.push(supabase.from("scared_records").upsert(state.scared.map((record) => toScaredRow(record, user.id)), { onConflict: "user_id,date" }));
  }
  if (state.vents?.length) {
    tasks.push(supabase.from("treehole_entries").upsert(state.vents.map((entry) => toTreeholeRow(entry, user.id)), { onConflict: "id" }));
  }

  const results = await Promise.all(tasks);
  results.forEach(assertNoError);
  return true;
}

export async function clearRemoteState() {
  const user = await getUser();
  const results = await Promise.all([
    supabase.from("daily_records").delete().eq("user_id", user.id),
    supabase.from("weekly_records").delete().eq("user_id", user.id),
    supabase.from("scared_records").delete().eq("user_id", user.id),
    supabase.from("treehole_entries").delete().eq("user_id", user.id),
  ]);
  results.forEach(assertNoError);
  return emptyState();
}
