/**
 * CMR AI Module — Google Gemini Flash
 * Free tier: 15 req/min, 1M tokens/day — per USER (each person uses their own key)
 * Get your free key: https://aistudio.google.com/app/apikey
 */

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getApiKey() {
  return localStorage.getItem('cmr_gemini_key') || '';
}
function saveApiKey(key) {
  localStorage.setItem('cmr_gemini_key', key.trim());
}

// ── Status indicator ──────────────────────────────────────────────
function updateAIStatus(online) {
  const dot = document.getElementById('aiStatusDot');
  const label = document.getElementById('aiStatusLabel');
  if (dot) dot.style.background = online ? '#22c55e' : '#f59e0b';
  if (label) label.textContent = online ? 'AI Ready' : 'Enter API key to activate';
}

// ── API key setup dialog ──────────────────────────────────────────
function showApiKeyPrompt() {
  const existing = getApiKey();
  const msg = document.createElement('div');
  msg.className = 'ai-msg ai-msg-bot';
  msg.innerHTML = `
    <div style="background:#fff8e1;border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;font-size:0.85rem;">
      <strong>🔑 Free API Key Required</strong><br><br>
      CMR uses <strong>Google Gemini Flash</strong> — completely free, no credit card needed.<br><br>
      <strong>Get your key in 30 seconds:</strong><br>
      1. Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#2d8653;font-weight:600;">aistudio.google.com/app/apikey</a><br>
      2. Click "Create API Key" → copy it<br>
      3. Paste it below:<br><br>
      <input id="geminiKeyInput" type="text" placeholder="AIza..." value="${existing}"
        style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem;box-sizing:border-box;margin-bottom:8px;">
      <button onclick="saveGeminiKey()" style="background:#2d8653;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:0.85rem;cursor:pointer;width:100%;font-weight:600;">
        Save Key &amp; Start
      </button>
    </div>`;
  const messages = document.getElementById('aiMessages');
  if (messages) { messages.appendChild(msg); messages.scrollTop = messages.scrollHeight; }
}

window.saveGeminiKey = function() {
  const input = document.getElementById('geminiKeyInput');
  if (!input) return;
  const key = input.value.trim();
  if (!key || !key.startsWith('AIza')) {
    input.style.border = '1px solid #ef4444';
    return;
  }
  saveApiKey(key);
  updateAIStatus(true);
  const bubble = input.closest('.ai-msg');
  if (bubble) bubble.innerHTML = '<em style="color:#22c55e;font-size:0.85rem;">✅ API key saved! Ask me anything now.</em>';
};

// ── Core Gemini call ──────────────────────────────────────────────
async function callGemini(prompt) {
  const key = getApiKey();
  if (!key) { showApiKeyPrompt(); return ''; }

  const res = await fetch(`${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    if (msg.toLowerCase().includes('api_key_invalid') || msg.toLowerCase().includes('invalid')) {
      localStorage.removeItem('cmr_gemini_key');
      updateAIStatus(false);
      throw new Error('Invalid API key. Please enter a valid Gemini key.');
    }
    throw new Error(msg);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Resume fill ───────────────────────────────────────────────────
async function generateResumeFromAI(description, onChunk) {
  const prompt = `You are a professional resume writer. Generate a complete ATS-optimized resume as valid JSON only (no markdown, no extra text).

JSON format:
{"name":"","jobTitle":"","email":"","phone":"","location":"","linkedin":"","summary":"3-4 sentence professional summary with quantifiable achievements","experience":[{"title":"","company":"","startDate":"YYYY-MM","endDate":"YYYY-MM","description":"• bullet 1\\n• bullet 2"}],"education":[{"degree":"","school":"","startDate":"YYYY","endDate":"YYYY","description":""}],"skills":["skill1","skill2"],"projects":["Project — description"],"certifications":["Cert name"],"awards":["Award"],"languages":["English (Fluent)"]}

User: ${description}

Return ONLY the JSON object.`;

  const result = await callGemini(prompt);
  if (onChunk) onChunk(result);
  return result;
}

// ── Cover letter ──────────────────────────────────────────────────
async function generateAICover(data, onChunk) {
  const prompt = `Write a professional cover letter for ${data.name || 'the applicant'}, a ${data.jobTitle || 'professional'}. Background: ${data.summary || ''}. 3 paragraphs, 200-250 words, confident and specific. No generic openers.`;
  const result = await callGemini(prompt);
  if (onChunk) onChunk(result);
  return result;
}

// ── UI helpers ────────────────────────────────────────────────────
function addMessageToChat(role, content) {
  const messages = document.getElementById('aiMessages');
  if (!messages) return null;
  const div = document.createElement('div');
  div.className = `ai-msg ai-msg-${role}`;
  div.textContent = content;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function updateStreamingMessage(div, text) {
  if (!div) return;
  div.textContent = text;
  const messages = document.getElementById('aiMessages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

// ── Apply JSON to form ────────────────────────────────────────────
function applyAIResume(jsonStr) {
  let data;
  try {
    const clean = jsonStr.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    data = JSON.parse(clean);
  } catch(e) { return false; }

  function setField(id, val) {
    const el = document.getElementById(id);
    if (el && val) { el.value = val; el.dispatchEvent(new Event('input')); }
  }

  setField('fullName', data.name);
  setField('jobTitle', data.jobTitle);
  setField('email', data.email);
  setField('phone', data.phone);
  setField('location', data.location);
  setField('linkedin', data.linkedin);
  setField('summary', data.summary);

  if (Array.isArray(data.experience) && typeof addExperienceEntry === 'function') {
    const list = document.getElementById('experienceList');
    if (list) list.innerHTML = '';
    data.experience.forEach(exp => {
      addExperienceEntry();
      const items = document.querySelectorAll('#experienceList .experience-item');
      const last = items[items.length - 1];
      if (!last) return;
      const s = (sel, val) => { const el = last.querySelector(sel); if (el && val) { el.value = val; el.dispatchEvent(new Event('input')); }};
      s('[name="expTitle"]', exp.title); s('[name="expCompany"]', exp.company);
      s('[name="expStart"]', exp.startDate); s('[name="expEnd"]', exp.endDate);
      s('[name="expDesc"]', exp.description);
    });
  }

  if (Array.isArray(data.education) && typeof addEducationEntry === 'function') {
    const list = document.getElementById('educationList');
    if (list) list.innerHTML = '';
    data.education.forEach(edu => {
      addEducationEntry();
      const items = document.querySelectorAll('#educationList .education-item');
      const last = items[items.length - 1];
      if (!last) return;
      const s = (sel, val) => { const el = last.querySelector(sel); if (el && val) { el.value = val; el.dispatchEvent(new Event('input')); }};
      s('[name="eduDegree"]', edu.degree); s('[name="eduSchool"]', edu.school);
      s('[name="eduStart"]', edu.startDate); s('[name="eduEnd"]', edu.endDate);
      s('[name="eduDesc"]', edu.description);
    });
  }

  const skillsEl = document.getElementById('skills');
  if (skillsEl && Array.isArray(data.skills)) { skillsEl.value = data.skills.join(', '); skillsEl.dispatchEvent(new Event('input')); }

  ['projects','certifications','awards','languages'].forEach(key => {
    const el = document.getElementById(key);
    if (el && Array.isArray(data[key]) && data[key].length) { el.value = data[key].join('\n'); el.dispatchEvent(new Event('input')); }
  });

  if (typeof updatePreview === 'function') updatePreview();
  return true;
}

// ── Main send ─────────────────────────────────────────────────────
async function sendAIMessage() {
  const input = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  addMessageToChat('user', text);
  if (sendBtn) sendBtn.disabled = true;
  const bubble = addMessageToChat('bot', '...');

  try {
    const lower = text.toLowerCase();

    if (lower.includes('key') && (lower.includes('api') || lower.includes('gemini'))) {
      showApiKeyPrompt();
      if (bubble) bubble.remove();

    } else if (lower.includes('i am') || lower.includes("i'm") || lower.includes('fill') || lower.includes('generate') || lower.includes('create my resume')) {
      updateStreamingMessage(bubble, '⏳ Generating your resume with AI...');
      const json = await generateResumeFromAI(text);
      const ok = json ? applyAIResume(json) : false;
      updateStreamingMessage(bubble, ok
        ? '✅ Resume filled! Review the preview on the right — edit anything you want.'
        : '⚠️ Could not parse resume. Try: "I am a software engineer with 5 years experience at TCS, B.Tech from VIT"');

    } else if (lower.includes('improve') && lower.includes('summary') || lower.includes('rewrite summary')) {
      const sumEl = document.getElementById('summary');
      const jobEl = document.getElementById('jobTitle');
      updateStreamingMessage(bubble, '⏳ Rewriting your summary...');
      const improved = await callGemini(`Rewrite this professional summary to be more impactful and ATS-optimized. Keep 3-4 sentences, strong action verbs, quantifiable results. Return only the improved text.\n\nSummary: "${sumEl?.value || ''}"\nRole: "${jobEl?.value || ''}"`);
      if (improved && sumEl) { sumEl.value = improved.trim(); sumEl.dispatchEvent(new Event('input')); if (typeof updatePreview === 'function') updatePreview(); }
      updateStreamingMessage(bubble, improved ? '✅ Summary updated in your resume!' : '❌ Could not improve summary.');

    } else if (lower.includes('cover letter')) {
      updateStreamingMessage(bubble, '⏳ Writing your cover letter...');
      const name = document.getElementById('fullName')?.value || '';
      const title = document.getElementById('jobTitle')?.value || '';
      const sum = document.getElementById('summary')?.value || '';
      const letter = await callGemini(`Write a professional cover letter. Name: ${name}, Title: ${title}. Background: ${sum}. 3 paragraphs, 220 words, confident opening, specific achievements, strong close.`);
      updateStreamingMessage(bubble, letter || '❌ Could not write cover letter.');

    } else if (lower.includes('analyze') || lower.includes('ats') || lower.includes('feedback') || lower.includes('improve')) {
      updateStreamingMessage(bubble, '⏳ Analyzing your resume...');
      const preview = document.querySelector('.preview-content');
      const resumeText = preview ? (preview.innerText || '').slice(0, 3000) : 'No resume content.';
      const analysis = await callGemini(`You are an ATS expert. Give 5 specific actionable improvements for this resume:\n\n${resumeText}\n\nBe direct, practical, numbered list.`);
      updateStreamingMessage(bubble, analysis || '❌ Could not analyze.');

    } else {
      updateStreamingMessage(bubble, '⏳ Thinking...');
      const answer = await callGemini(`You are a professional resume and career expert. Answer helpfully and concisely.\n\nUser: ${text}`);
      updateStreamingMessage(bubble, answer || '❌ No response.');
    }
  } catch(err) {
    updateStreamingMessage(bubble, `❌ ${err.message}`);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ── Quick actions ─────────────────────────────────────────────────
window.aiQuickAction = function(type) {
  const input = document.getElementById('aiInput');
  if (!input) return;
  const actions = {
    fill:    'Fill my entire resume. I am a [describe yourself briefly here]',
    cover:   'Write me a professional cover letter',
    analyze: 'Analyze my resume and give me ATS improvement tips',
    improve: 'Improve and rewrite my professional summary'
  };
  input.value = actions[type] || '';
  input.focus();
};

// ── Toggle panel ──────────────────────────────────────────────────
window.toggleAIPanel = function() {
  const panel = document.getElementById('aiPanel');
  const fab = document.getElementById('aiFab');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (fab) fab.classList.toggle('panel-open', open);
  updateAIStatus(!!getApiKey());
};

// ── Keyboard shortcut ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'j') { e.preventDefault(); window.toggleAIPanel(); }
});

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateAIStatus(!!getApiKey());
});
