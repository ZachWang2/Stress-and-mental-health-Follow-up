const fileInput = document.querySelector("#fileInput");
const demoButton = document.querySelector("#demoButton");
const audioName = document.querySelector("#audioName");
const durationEl = document.querySelector("#duration");
const sampleRateEl = document.querySelector("#sampleRate");
const rmsBadge = document.querySelector("#rmsBadge");
const pitchBadge = document.querySelector("#pitchBadge");
const emotionTitle = document.querySelector("#emotionTitle");
const emotionText = document.querySelector("#emotionText");
const rmsValue = document.querySelector("#rmsValue");
const pitchValue = document.querySelector("#pitchValue");
const pitchSpreadValue = document.querySelector("#pitchSpreadValue");
const zcrValue = document.querySelector("#zcrValue");

const waveformCanvas = document.querySelector("#waveformCanvas");
const spectrogramCanvas = document.querySelector("#spectrogramCanvas");
const pitchCanvas = document.querySelector("#pitchCanvas");

let audioContext;

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  setLoading(`正在分析 ${file.name} ...`);
  const bytes = await file.arrayBuffer();
  await ensureAudioContext();
  const buffer = await audioContext.decodeAudioData(bytes.slice(0));
  analyzeBuffer(buffer, file.name);
});

demoButton.addEventListener("click", async () => {
  await ensureAudioContext();
  const buffer = buildDemoBuffer(audioContext.sampleRate);
  analyzeBuffer(buffer, "demo-voice-like-tone.wav");
});

function setLoading(message) {
  audioName.textContent = message;
  emotionTitle.textContent = "分析中";
  emotionText.textContent = "正在把音频拆成波形、频谱和音高轨迹。较长音频会自动只取前 20 秒做可视化。";
}

async function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

function buildDemoBuffer(sampleRate) {
  const seconds = 4.6;
  const length = Math.floor(seconds * sampleRate);
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  let phase = 0;

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const pitch = 150 + 22 * Math.sin(2 * Math.PI * 0.7 * t) + 8 * Math.sin(2 * Math.PI * 2.1 * t);
    phase += (2 * Math.PI * pitch) / sampleRate;
    const envelope = Math.min(1, t / 0.12) * Math.min(1, (seconds - t) / 0.18);
    const syllable = 0.58 + 0.42 * Math.max(0, Math.sin(2 * Math.PI * 3.1 * t));
    const carrier =
      0.9 * Math.sin(phase) +
      0.12 * Math.sin(phase * 2) +
      0.05 * Math.sin(phase * 3);
    const shimmer = 0.015 * Math.sin(2 * Math.PI * 1300 * t) * Math.sin(2 * Math.PI * 5 * t);
    data[i] = envelope * syllable * (carrier + shimmer);
  }

  return buffer;
}

function analyzeBuffer(buffer, name) {
  const sampleRate = buffer.sampleRate;
  const raw = mixToMono(buffer);
  const maxSeconds = 20;
  const samples = raw.slice(0, Math.min(raw.length, Math.floor(maxSeconds * sampleRate)));
  const features = extractFeatures(samples, sampleRate);
  const pitchTrack = estimatePitchTrack(samples, sampleRate);

  audioName.textContent = name;
  durationEl.textContent = `${buffer.duration.toFixed(2)} 秒`;
  sampleRateEl.textContent = `${sampleRate.toLocaleString()} Hz`;

  drawWaveform(waveformCanvas, samples);
  drawSpectrogram(spectrogramCanvas, samples, sampleRate);
  drawPitch(pitchCanvas, pitchTrack);
  updateNumbers(features, pitchTrack);
  updateEmotion(features, pitchTrack);
}

function mixToMono(buffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i] / channels;
    }
  }

  return mono;
}

function extractFeatures(samples, sampleRate) {
  let sumSquares = 0;
  let crossings = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i];
    sumSquares += value * value;
    if (i > 0 && Math.sign(value) !== Math.sign(samples[i - 1])) {
      crossings += 1;
    }
  }

  return {
    rms: Math.sqrt(sumSquares / Math.max(1, samples.length)),
    zcr: crossings / Math.max(1, samples.length / sampleRate),
  };
}

function estimatePitchTrack(samples, sampleRate) {
  const frameSize = 2048;
  const hopSize = 1024;
  const minHz = 60;
  const maxHz = 520;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.floor(sampleRate / minHz);
  const points = [];

  for (let start = 0; start + frameSize < samples.length; start += hopSize) {
    let rms = 0;
    for (let i = 0; i < frameSize; i += 1) {
      rms += samples[start + i] * samples[start + i];
    }
    rms = Math.sqrt(rms / frameSize);

    if (rms < 0.012) {
      points.push({ time: start / sampleRate, hz: null, confidence: 0 });
      continue;
    }

    let bestLag = 0;
    let bestScore = 0;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let corr = 0;
      let energyA = 0;
      let energyB = 0;
      for (let i = 0; i < frameSize - lag; i += 1) {
        const a = samples[start + i];
        const b = samples[start + i + lag];
        corr += a * b;
        energyA += a * a;
        energyB += b * b;
      }
      const score = corr / Math.sqrt(Math.max(1e-12, energyA * energyB));
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    points.push({
      time: start / sampleRate,
      hz: bestScore > 0.42 ? sampleRate / bestLag : null,
      confidence: bestScore,
    });
  }

  return points;
}

function updateNumbers(features, pitchTrack) {
  const voiced = pitchTrack.filter((point) => point.hz);
  const meanPitch = mean(voiced.map((point) => point.hz));
  const spread = standardDeviation(voiced.map((point) => point.hz));

  rmsBadge.textContent = `能量 ${features.rms.toFixed(3)}`;
  pitchBadge.textContent = voiced.length ? `音高 ${Math.round(meanPitch)} Hz` : "音高 --";
  rmsValue.textContent = features.rms.toFixed(4);
  pitchValue.textContent = voiced.length ? `${Math.round(meanPitch)} Hz` : "--";
  pitchSpreadValue.textContent = voiced.length ? `${Math.round(spread)} Hz` : "--";
  zcrValue.textContent = `${Math.round(features.zcr)} / 秒`;
}

function updateEmotion(features, pitchTrack) {
  const voiced = pitchTrack.filter((point) => point.hz);
  const meanPitch = mean(voiced.map((point) => point.hz));
  const spread = standardDeviation(voiced.map((point) => point.hz));
  const voicedRatio = voiced.length / Math.max(1, pitchTrack.length);
  const energy = features.rms;

  let title = "中性或信息不足";
  let text = "可检测到的音高较少，或者整体特征不够鲜明。可以尝试上传更清晰、更靠近麦克风的语音片段。";

  if (voicedRatio > 0.2) {
    if (energy > 0.105 && spread > 38 && meanPitch > 165) {
      title = "高唤醒：兴奋、紧张或强调感";
      text = "能量较高，音高也更活跃，听感上可能更接近兴奋、紧张、激动或明显强调。";
    } else if (energy < 0.055 && spread < 30) {
      title = "低唤醒：平静或疲惫感";
      text = "整体能量偏低，音高变化较小，听感上可能更接近平静、克制、疲惫或低落。";
    } else if (energy > 0.1 && meanPitch < 155) {
      title = "强能量：坚定、严肃或压迫感";
      text = "能量较强但平均音高不高，可能呈现坚定、严肃、压迫或愤怒相关的听感。";
    } else {
      title = "中等唤醒：自然表达";
      text = "能量和音高变化都处在比较中间的位置，可能更接近日常说话或普通音乐片段。";
    }
  }

  emotionTitle.textContent = title;
  emotionText.textContent = `${text} 这是规则小实验，不等于真实情绪标签。`;
}

function drawWaveform(canvas, samples) {
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  drawAxes(ctx, canvas, "amplitude");

  const mid = canvas.height / 2;
  ctx.strokeStyle = "#0a7d76";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let x = 0; x < canvas.width; x += 1) {
    const start = Math.floor((x / canvas.width) * samples.length);
    const end = Math.floor(((x + 1) / canvas.width) * samples.length);
    let min = 1;
    let max = -1;
    for (let i = start; i < Math.max(start + 1, end); i += 1) {
      min = Math.min(min, samples[i] || 0);
      max = Math.max(max, samples[i] || 0);
    }
    ctx.moveTo(x, mid + min * mid * 0.88);
    ctx.lineTo(x, mid + max * mid * 0.88);
  }

  ctx.stroke();
}

function drawSpectrogram(canvas, samples, sampleRate) {
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);

  const frameSize = 1024;
  const frames = 120;
  const bins = canvas.height;
  const maxHz = 5000;
  const hop = Math.max(1, Math.floor((samples.length - frameSize) / frames));
  const image = ctx.createImageData(frames, bins);

  for (let frame = 0; frame < frames; frame += 1) {
    const start = frame * hop;
    for (let y = 0; y < bins; y += 1) {
      const hz = ((bins - y) / bins) * maxHz;
      const magnitude = dftMagnitude(samples, start, frameSize, sampleRate, hz);
      const color = spectrogramColor(Math.min(1, Math.log10(1 + magnitude * 42)));
      const index = (y * frames + frame) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 255;
    }
  }

  const temp = new OffscreenCanvas(frames, bins);
  temp.getContext("2d").putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(temp, 0, 0, canvas.width, canvas.height);
  drawFrequencyLabels(ctx, canvas, maxHz);
}

function dftMagnitude(samples, start, frameSize, sampleRate, hz) {
  const step = (2 * Math.PI * hz) / sampleRate;
  let real = 0;
  let imag = 0;
  for (let i = 0; i < frameSize; i += 1) {
    const sample = samples[start + i] || 0;
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
    real += sample * window * Math.cos(step * i);
    imag -= sample * window * Math.sin(step * i);
  }
  return Math.sqrt(real * real + imag * imag) / frameSize;
}

function spectrogramColor(value) {
  const stops = [
    [20, 31, 35],
    [24, 99, 112],
    [10, 125, 118],
    [221, 107, 77],
    [255, 222, 128],
  ];
  const scaled = value * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const t = scaled - index;
  return stops[index].map((channel, i) => Math.round(channel + (stops[index + 1][i] - channel) * t));
}

function drawPitch(canvas, pitchTrack) {
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  drawAxes(ctx, canvas, "Hz");

  const values = pitchTrack.filter((point) => point.hz).map((point) => point.hz);
  if (!values.length) {
    ctx.fillStyle = "#66757d";
    ctx.font = "18px system-ui";
    ctx.fillText("没有检测到稳定音高", 28, 56);
    return;
  }

  const minHz = Math.max(50, Math.floor(Math.min(...values) - 30));
  const maxHz = Math.min(560, Math.ceil(Math.max(...values) + 30));
  const maxTime = pitchTrack[pitchTrack.length - 1]?.time || 1;

  ctx.strokeStyle = "#dd6b4d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  let penDown = false;

  pitchTrack.forEach((point) => {
    if (!point.hz) {
      penDown = false;
      return;
    }
    const x = (point.time / maxTime) * canvas.width;
    const y = canvas.height - ((point.hz - minHz) / (maxHz - minHz)) * canvas.height;
    if (!penDown) {
      ctx.moveTo(x, y);
      penDown = true;
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
  ctx.fillStyle = "#172126";
  ctx.font = "14px system-ui";
  ctx.fillText(`${maxHz} Hz`, 12, 22);
  ctx.fillText(`${minHz} Hz`, 12, canvas.height - 12);
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fbfcfc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawAxes(ctx, canvas, label) {
  ctx.strokeStyle = "#d7e0df";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  ctx.fillStyle = "#66757d";
  ctx.font = "14px system-ui";
  ctx.fillText(label, 12, 22);
}

function drawFrequencyLabels(ctx, canvas, maxHz) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.fillRect(8, 8, 82, 52);
  ctx.fillStyle = "#172126";
  ctx.font = "13px system-ui";
  ctx.fillText(`${maxHz / 1000} kHz`, 18, 30);
  ctx.fillText("0 Hz", 18, 51);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

drawWaveform(waveformCanvas, new Float32Array(1200));
drawSpectrogram(spectrogramCanvas, new Float32Array(1200), 44100);
drawPitch(pitchCanvas, []);
